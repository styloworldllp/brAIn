import json
import re
import os
from typing import Generator
from services.executor import execute_python
from services import neurix as _neurix

MAX_ITERATIONS   = 5
MAX_HISTORY_MSGS = 4
MAX_SCHEMA_COLS  = 30
MAX_SAMPLE_ROWS  = 2

# Fast models for cheap follow-up generation (uses the same API key)
_FAST_MODEL = {"anthropic": "claude-haiku-4-5-20251001", "openai": "gpt-4o-mini"}

TOOL_DESC = (
    "Execute Python code to analyse data and create visualisations. "
    "The dataframe is `df` (single file) or `df_tablename` (database). "
    "Use plotly for charts — call fig.show(). Use print() for text output."
)
TOOL_PARAMS = {
    "type": "object",
    "properties": {
        "code":        {"type": "string", "description": "Complete runnable Python code."},
        "explanation": {"type": "string", "description": "One-sentence description."},
    },
    "required": ["code"],
}
ANTHROPIC_TOOLS = [{"name": "execute_python", "description": TOOL_DESC, "input_schema": TOOL_PARAMS}]
OPENAI_TOOLS    = [{"type": "function", "function": {"name": "execute_python", "description": TOOL_DESC, "parameters": TOOL_PARAMS}}]


def _build_extra_block(extra_datasets: list) -> str:
    if not extra_datasets:
        return ""
    lines = ["\nAdditional datasets also loaded and available:"]
    for ds in extra_datasets:
        safe_name   = ds.get("name", "extra").replace(" ", "_").replace("-", "_").replace(".", "_").replace("/", "_")
        schema      = ds.get("schema_info", {})
        source_type = ds.get("source_type", "")
        row_count   = ds.get("row_count", "?")
        table_query = ds.get("table_or_query", "")

        if table_query == "__all__" or ("__tables__" in schema):
            tables = schema.get("__tables__", [])
            lines.append(f'- DB "{ds["name"]}" — use df_{safe_name}_<table> or load_table_{safe_name}("<table>") for tables: {", ".join(tables[:10])}')
        elif table_query == "__live__":
            tables = schema.get("__tables__", [])
            lines.append(f'- Live DB "{ds["name"]}" — use run_sql_{safe_name}("SELECT ...") or load_table_{safe_name}("<table>"). Tables: {", ".join(tables[:10])}')
        else:
            cols = {k: v for k, v in (schema or {}).items() if not k.startswith("__")}
            col_list = list(cols.keys())[:MAX_SCHEMA_COLS]
            lines.append(f'- df_{safe_name} — "{ds["name"]}" | {row_count} rows | cols: {", ".join(col_list)}{"..." if len(cols) > MAX_SCHEMA_COLS else ""}')
    return "\n".join(lines)


def _build_system(dataset: dict, extra_datasets: list | None = None, neurix_plan: dict | None = None) -> str:
    schema      = dataset.get("schema_info", {})
    is_multi    = isinstance(schema, dict) and "__tables__" in schema
    row_count   = dataset.get("row_count", "?")

    if is_multi:
        tables = schema.get("__tables__", [])
        lines  = []
        for table in tables:
            tschema   = schema.get(table, {})
            col_names = list(tschema.keys())[:25]
            safe      = table.replace(" ", "_").replace("-", "_")
            lines.append(f"df_{safe}: {', '.join(col_names)}{' ...' if len(tschema) > 25 else ''}")
        data_block = f"DB: {dataset['name']} ({len(tables)} tables)\n" + "\n".join(lines)
    else:
        cols  = {k: v for k, v in (schema or {}).items() if not k.startswith("__")}
        total = len(cols)
        if total <= MAX_SCHEMA_COLS:
            col_lines = [f"{c}({v.get('dtype','?') if isinstance(v,dict) else '?'})" for c, v in cols.items()]
        else:
            col_lines = list(cols.keys())
        col_str    = ", ".join(col_lines)
        sample     = dataset.get("sample_data") or []
        sample_str = ""
        if sample and total <= MAX_SCHEMA_COLS:
            sample_str = f"\nSample: {json.dumps(sample[:MAX_SAMPLE_ROWS])}"
        data_block = f"Dataset: {dataset['name']} | {row_count} rows | {total} cols\nCols: {col_str}{sample_str}"

    neurix_note = ""
    if neurix_plan and neurix_plan.get("mode") != "noop":
        explanation = neurix_plan.get("explanation", "")
        tables_used = ", ".join(neurix_plan.get("tables_needed", []))
        neurix_note = (
            f"\n\nNEURIX QUERY PLAN ACTIVE: The data in `df` has already been pre-filtered "
            f"and targeted by Neurix.\n"
            f"  Scope: {explanation}\n"
            f"  Tables used: {tables_used or 'primary dataset'}\n"
            "You are working with a lean, relevant subset — not the full table.\n"
        )

    extra_block = _build_extra_block(extra_datasets or [])
    return f"""You are an expert data analyst and strategic advisor inside brAIn.

{data_block}{extra_block}{neurix_note}

RULES (follow strictly):
1. Always call execute_python — never guess or estimate results.
2. NEVER generate charts unless user explicitly asks for "chart", "plot", or "graph".
3. For LIVE DB connections: use run_sql("SELECT ...") or load_table("tablename").
4. For file datasets: use the `df` variable.
5. Format responses as clean markdown:
   - Use | markdown tables | when showing data rows
   - Use **bold** for key numbers and insights
   - Use ## headings for sections
   - Lead with the key answer, then support with data
6. Format numbers nicely: f"{{value:,.2f}}" for decimals, f"{{value:,}}" for integers.
7. To print a DataFrame as markdown table:
   cols = df.columns.tolist()
   print("| " + " | ".join(cols) + " |")
   print("|" + "|".join(["---"] * len(cols)) + "|")
   for _, row in df.iterrows():
       print("| " + " | ".join(str(v) for v in row) + " |")
8. NEVER return a blank or empty response. If you cannot answer, explain what is missing.
9. ALWAYS end your response with a ## Recommended Action section — give the user a clear,
   actionable recommendation based on the data findings. Be specific and direct."""


def _format_result(r: dict) -> str:
    parts = []
    if r.get("output"): parts.append(r["output"][:2000])
    if r.get("error"):  parts.append(f"Error: {r['error'][:500]}")
    if r.get("charts"): parts.append(f"Charts: {len(r['charts'])}")
    return "\n".join(parts) or "OK"


def _trim_history(history: list) -> list:
    return history[-MAX_HISTORY_MSGS:] if len(history) > MAX_HISTORY_MSGS else history


def _sse(t: str, p: dict) -> str:
    return f"data: {json.dumps({'type': t, **p})}\n\n"


def _generate_follow_ups(
    user_question: str,
    response_text: str,
    provider: str,
    api_key: str,
) -> list[str]:
    """
    Generate 3 short follow-up questions using the fast model.
    Uses the same provider/api_key as the main chat to avoid extra config.
    """
    model   = _FAST_MODEL.get(provider, "claude-haiku-4-5-20251001")
    summary = response_text[:800].replace("\n", " ")
    prompt  = (
        f'The user asked: "{user_question}"\n\n'
        f"The analysis found: {summary}\n\n"
        "Suggest exactly 3 short follow-up questions (each under 12 words) the user might ask next. "
        'Output ONLY a JSON array: ["question 1", "question 2", "question 3"]'
    )
    try:
        if provider == "openai":
            import openai
            resp = openai.OpenAI(api_key=api_key).chat.completions.create(
                model=model, max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.choices[0].message.content or ""
        else:
            import anthropic
            resp = anthropic.Anthropic(api_key=api_key).messages.create(
                model=model, max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            )
            text = resp.content[0].text if resp.content else ""

        m = re.search(r"\[[\s\S]+?\]", text)
        if m:
            questions = json.loads(m.group())
            return [str(q) for q in questions[:3]]
    except Exception:
        pass
    return []


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _stream_anthropic(
    api_key, model, dataset, history, user_message, extra_datasets=None, neurix_settings=None
):
    import anthropic

    # ── Stage 1: Neurix query planning ────────────────────────────────────────
    neurix_plan = None
    if neurix_settings and neurix_settings.get("api_key"):
        yield _sse("neurix_plan", {"status": "planning", "message": "Neurix is analysing your schema…"})
        neurix_plan = _neurix.plan_query(
            user_message, dataset, extra_datasets or [],
            neurix_settings["provider"],
            neurix_settings["api_key"],
            neurix_settings["model"],
        )
        if neurix_plan and neurix_plan.get("mode") not in (None, "noop"):
            yield _sse("neurix_plan", {
                "status":      "ready",
                "explanation": neurix_plan.get("explanation", ""),
                "tables":      neurix_plan.get("tables_needed", []),
            })
        else:
            neurix_plan = None  # fall back to full-table mode

    # ── Stage 2: Client AI response ───────────────────────────────────────────
    client    = anthropic.Anthropic(api_key=api_key)
    system    = _build_system(dataset, extra_datasets, neurix_plan)
    messages  = _trim_history(history) + [{"role": "user", "content": user_message}]
    text_sent = False
    text_buf  = []

    for _ in range(MAX_ITERATIONS):
        response   = client.messages.create(
            model=model, max_tokens=2048,
            system=system, tools=ANTHROPIC_TOOLS, messages=messages,
        )
        tool_calls = []
        exec_cache = {}

        for block in response.content:
            if block.type == "text":
                if block.text.strip():
                    text_sent = True
                text_buf.append(block.text)
                yield _sse("text", {"content": block.text})
            elif block.type == "tool_use":
                code = block.input.get("code", "")
                tool_calls.append(block)
                yield _sse("code", {
                    "tool_use_id": block.id,
                    "code":        code,
                    "explanation": block.input.get("explanation", ""),
                })
                result = execute_python(code, dataset, extra_datasets, neurix_plan=neurix_plan)
                exec_cache[block.id] = result
                yield _sse("code_output", {
                    "tool_use_id": block.id,
                    "output":      result["output"],
                    "error":       result.get("error"),
                    "success":     result["success"],
                    "chart_count": len(result["charts"]),
                })
                for chart in result["charts"]:
                    yield _sse("chart", {"chart_json": chart})

        if response.stop_reason == "end_turn" or not tool_calls:
            break

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id,
             "content": _format_result(exec_cache[b.id])}
            for b in tool_calls
        ]})

    if not text_sent:
        yield _sse("text", {"content": (
            "**I need more information to answer this:**\n"
            "- Please clarify what specific data, columns, or context you need analysed.\n"
            "- If your question references data not in this dataset, let me know what to look for."
        )})

    # ── Stage 3: Follow-up question suggestions ───────────────────────────────
    follow_ups = _generate_follow_ups(
        user_message, "".join(text_buf), "anthropic", api_key
    )
    if follow_ups:
        yield _sse("follow_up_questions", {"questions": follow_ups})

    yield _sse("done", {})


# ── OpenAI ────────────────────────────────────────────────────────────────────

_OPENAI_TIMEOUT = int(os.getenv("OPENAI_TIMEOUT", "120"))


def _stream_openai(
    api_key, model, dataset, history, user_message, extra_datasets=None, neurix_settings=None
):
    import openai

    # ── Stage 1: Neurix query planning ────────────────────────────────────────
    neurix_plan = None
    if neurix_settings and neurix_settings.get("api_key"):
        yield _sse("neurix_plan", {"status": "planning", "message": "Neurix is analysing your schema…"})
        neurix_plan = _neurix.plan_query(
            user_message, dataset, extra_datasets or [],
            neurix_settings["provider"],
            neurix_settings["api_key"],
            neurix_settings["model"],
        )
        if neurix_plan and neurix_plan.get("mode") not in (None, "noop"):
            yield _sse("neurix_plan", {
                "status":      "ready",
                "explanation": neurix_plan.get("explanation", ""),
                "tables":      neurix_plan.get("tables_needed", []),
            })
        else:
            neurix_plan = None

    # ── Stage 2: Client AI response ───────────────────────────────────────────
    client    = openai.OpenAI(api_key=api_key, timeout=_OPENAI_TIMEOUT)
    system    = _build_system(dataset, extra_datasets, neurix_plan)
    messages  = [{"role": "system", "content": system}]
    text_sent = False
    text_buf  = []
    for m in _trim_history(history):
        messages.append({"role": m["role"], "content": (m["content"] or "")[:1000]})
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_ITERATIONS):
        response = client.chat.completions.create(
            model=model, max_tokens=2048, tools=OPENAI_TOOLS, messages=messages,
        )
        choice = response.choices[0]
        msg    = choice.message

        if msg.content:
            if msg.content.strip():
                text_sent = True
            text_buf.append(msg.content)
            yield _sse("text", {"content": msg.content})

        if not msg.tool_calls or choice.finish_reason == "stop":
            break

        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {"id": tc.id, "type": "function", "function": {
                "name": tc.function.name, "arguments": tc.function.arguments,
            }}
            for tc in msg.tool_calls
        ]})

        for tc in msg.tool_calls:
            args   = json.loads(tc.function.arguments)
            code   = args.get("code", "")
            yield _sse("code", {"tool_use_id": tc.id, "code": code, "explanation": args.get("explanation", "")})
            result = execute_python(code, dataset, extra_datasets, neurix_plan=neurix_plan)
            yield _sse("code_output", {
                "tool_use_id": tc.id,
                "output":      result["output"],
                "error":       result.get("error"),
                "success":     result["success"],
                "chart_count": len(result["charts"]),
            })
            for chart in result["charts"]:
                yield _sse("chart", {"chart_json": chart})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": _format_result(result)})

    if not text_sent:
        yield _sse("text", {"content": (
            "**I need more information to answer this:**\n"
            "- Please clarify what specific data, columns, or context you need analysed.\n"
            "- If your question references data not in this dataset, let me know what to look for."
        )})

    # ── Stage 3: Follow-up question suggestions ───────────────────────────────
    follow_ups = _generate_follow_ups(
        user_message, "".join(text_buf), "openai", api_key
    )
    if follow_ups:
        yield _sse("follow_up_questions", {"questions": follow_ups})

    yield _sse("done", {})


# ── Neurix local LLM ──────────────────────────────────────────────────────────

def _stream_neurix(
    endpoint_url, model_name, dataset, history, user_message,
    extra_datasets=None, neurix_settings=None,
    deduct_neuron_fn=None,
):
    from services.neurix_llm import stream_analysis
    from services.executor import execute_python

    # Intent planning is always free — no neuron cost for this stage
    neurix_plan = None
    if neurix_settings and neurix_settings.get("endpoint_url"):
        yield _sse("neurix_plan", {"status": "planning", "message": "Neurix is analysing your schema…"})
        neurix_plan = _neurix.plan_query(
            user_message, dataset, extra_datasets or [],
            provider="neurix",
            api_key="",
            model=neurix_settings.get("model", "llama3"),
            neurix_endpoint=neurix_settings["endpoint_url"],
        )
        if neurix_plan and neurix_plan.get("mode") not in (None, "noop"):
            yield _sse("neurix_plan", {
                "status":      "ready",
                "explanation": neurix_plan.get("explanation", ""),
                "tables":      neurix_plan.get("tables_needed", []),
            })
        else:
            neurix_plan = None

    system = _build_system(dataset, extra_datasets, neurix_plan)

    # Deduct neurons BEFORE starting (fail fast if balance is insufficient)
    if deduct_neuron_fn:
        ok, msg = deduct_neuron_fn()
        if not ok:
            yield _sse("text", {"content": f"**Insufficient neurons:** {msg}\n\nPlease contact your administrator to top up your Neurix neuron balance."})
            yield _sse("done", {})
            return

    yield from stream_analysis(
        endpoint_url=endpoint_url,
        model_name=model_name,
        system_prompt=system,
        history=history,
        user_message=user_message,
        execute_fn=execute_python,
        dataset=dataset,
        extra_datasets=extra_datasets,
        neurix_plan=neurix_plan,
    )


# ── Public ────────────────────────────────────────────────────────────────────

def stream_chat(
    dataset,
    history,
    user_message,
    provider         = "anthropic",
    api_key          = "",
    model            = "",
    extra_datasets   = None,
    neurix_settings  = None,
    deduct_neuron_fn = None,   # callable() → (bool, str) — injected by router
) -> Generator[str, None, None]:
    if provider == "neurix":
        endpoint = neurix_settings.get("endpoint_url", "") if neurix_settings else ""
        model_name = neurix_settings.get("model", "llama3") if neurix_settings else "llama3"
        if not endpoint:
            def _no_instance():
                yield _sse("text", {"content": "**Neurix not configured:** No instance has been provisioned for your organisation. Contact your administrator."})
                yield _sse("done", {})
            return _no_instance()
        return _stream_neurix(endpoint, model_name, dataset, history, user_message, extra_datasets, neurix_settings, deduct_neuron_fn)

    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "") if provider == "anthropic" \
                  else os.getenv("OPENAI_API_KEY", "")
    if not model:
        model = "claude-sonnet-4-6" if provider == "anthropic" else "gpt-4o"
    if provider == "openai":
        return _stream_openai(api_key, model, dataset, history, user_message, extra_datasets, neurix_settings)
    return _stream_anthropic(api_key, model, dataset, history, user_message, extra_datasets, neurix_settings)
