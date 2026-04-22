import json
import os
from typing import Generator
from services.executor import execute_python

MAX_ITERATIONS   = 5
MAX_HISTORY_MSGS = 4    # only last 4 messages of history
MAX_SCHEMA_COLS  = 30   # above this: names only, no types or samples
MAX_SAMPLE_ROWS  = 2    # max sample rows in prompt

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


def _build_system(dataset: dict, extra_datasets: list | None = None) -> str:
    schema      = dataset.get("schema_info", {})
    is_multi    = isinstance(schema, dict) and "__tables__" in schema
    source_type = dataset.get("source_type", "")
    row_count   = dataset.get("row_count", "?")

    if is_multi:
        tables = schema.get("__tables__", [])
        lines  = []
        for table in tables:
            tschema  = schema.get(table, {})
            col_names = list(tschema.keys())[:25]
            safe     = table.replace(" ", "_").replace("-", "_")
            lines.append(f"df_{safe}: {', '.join(col_names)}{' ...' if len(tschema) > 25 else ''}")
        data_block = f"DB: {dataset['name']} ({len(tables)} tables)\n" + "\n".join(lines)
    else:
        cols = {k: v for k, v in (schema or {}).items() if not k.startswith("__")}
        total = len(cols)
        if total <= MAX_SCHEMA_COLS:
            col_lines = [f"{c}({v.get('dtype','?') if isinstance(v,dict) else '?'})" for c, v in cols.items()]
        else:
            col_lines = list(cols.keys())   # names only when many columns
        col_str    = ", ".join(col_lines)
        sample     = dataset.get("sample_data") or []
        sample_str = ""
        if sample and total <= MAX_SCHEMA_COLS:
            sample_str = f"\nSample: {json.dumps(sample[:MAX_SAMPLE_ROWS])}"
        data_block = f"Dataset: {dataset['name']} | {row_count} rows | {total} cols\nCols: {col_str}{sample_str}"

    extra_block = _build_extra_block(extra_datasets or [])
    return f"""You are an expert data analyst inside brAIn.

{data_block}{extra_block}

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
8. NEVER return a blank or empty response. If you cannot answer the question with the available data, respond with a clear explanation of what is missing. Use this format:
   **I need more information to answer this:**
   - List each missing piece of data, column, or context as a bullet point
   - Be specific about what values, columns, or datasets would be required
   - Suggest how the user could provide the missing information"""


def _format_result(r: dict) -> str:
    parts = []
    if r.get("output"): parts.append(r["output"][:2000])   # cap output size
    if r.get("error"):  parts.append(f"Error: {r['error'][:500]}")
    if r.get("charts"): parts.append(f"Charts: {len(r['charts'])}")
    return "\n".join(parts) or "OK"


def _trim_history(history: list) -> list:
    """Keep only last N messages to reduce token usage."""
    return history[-MAX_HISTORY_MSGS:] if len(history) > MAX_HISTORY_MSGS else history


def _sse(t: str, p: dict) -> str:
    return f"data: {json.dumps({'type': t, **p})}\n\n"


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _stream_anthropic(api_key, model, dataset, history, user_message, extra_datasets=None):
    import anthropic
    client     = anthropic.Anthropic(api_key=api_key)
    system     = _build_system(dataset, extra_datasets)
    messages   = _trim_history(history) + [{"role": "user", "content": user_message}]
    text_sent  = False

    for _ in range(MAX_ITERATIONS):
        response   = client.messages.create(
            model=model, max_tokens=2048,
            system=system, tools=ANTHROPIC_TOOLS, messages=messages
        )
        tool_calls = []
        exec_cache = {}

        for block in response.content:
            if block.type == "text":
                if block.text.strip():
                    text_sent = True
                yield _sse("text", {"content": block.text})
            elif block.type == "tool_use":
                code = block.input.get("code", "")
                tool_calls.append(block)
                yield _sse("code", {"tool_use_id": block.id, "code": code, "explanation": block.input.get("explanation", "")})
                result = execute_python(code, dataset, extra_datasets)
                exec_cache[block.id] = result
                yield _sse("code_output", {"tool_use_id": block.id, "output": result["output"], "error": result.get("error"), "success": result["success"], "chart_count": len(result["charts"])})
                for chart in result["charts"]:
                    yield _sse("chart", {"chart_json": chart})

        if response.stop_reason == "end_turn" or not tool_calls:
            break

        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": b.id, "content": _format_result(exec_cache[b.id])}
            for b in tool_calls
        ]})

    if not text_sent:
        yield _sse("text", {"content": "**I need more information to answer this:**\n- Please clarify what specific data, columns, or context you need analysed.\n- If your question references data not present in this dataset, let me know what to look for or upload the relevant file."})
    yield _sse("done", {})


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _stream_openai(api_key, model, dataset, history, user_message, extra_datasets=None):
    import openai
    client    = openai.OpenAI(api_key=api_key)
    system    = _build_system(dataset, extra_datasets)
    messages  = [{"role": "system", "content": system}]
    text_sent = False
    for m in _trim_history(history):
        messages.append({"role": m["role"], "content": (m["content"] or "")[:1000]})
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_ITERATIONS):
        response = client.chat.completions.create(
            model=model, max_tokens=2048, tools=OPENAI_TOOLS, messages=messages
        )
        choice = response.choices[0]
        msg    = choice.message

        if msg.content:
            if msg.content.strip():
                text_sent = True
            yield _sse("text", {"content": msg.content})

        if not msg.tool_calls or choice.finish_reason == "stop":
            break

        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in msg.tool_calls
        ]})

        for tc in msg.tool_calls:
            args   = json.loads(tc.function.arguments)
            code   = args.get("code", "")
            yield _sse("code", {"tool_use_id": tc.id, "code": code, "explanation": args.get("explanation", "")})
            result = execute_python(code, dataset, extra_datasets)
            yield _sse("code_output", {"tool_use_id": tc.id, "output": result["output"], "error": result.get("error"), "success": result["success"], "chart_count": len(result["charts"])})
            for chart in result["charts"]:
                yield _sse("chart", {"chart_json": chart})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": _format_result(result)})

    if not text_sent:
        yield _sse("text", {"content": "**I need more information to answer this:**\n- Please clarify what specific data, columns, or context you need analysed.\n- If your question references data not present in this dataset, let me know what to look for or upload the relevant file."})
    yield _sse("done", {})


# ── Public ────────────────────────────────────────────────────────────────────

def stream_chat(dataset, history, user_message, provider="anthropic", api_key="", model="", extra_datasets=None) -> Generator[str, None, None]:
    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "") if provider == "anthropic" else os.getenv("OPENAI_API_KEY", "")
    if not model:
        model = "claude-sonnet-4-6" if provider == "anthropic" else "gpt-4o"
    if provider == "openai":
        return _stream_openai(api_key, model, dataset, history, user_message, extra_datasets)
    return _stream_anthropic(api_key, model, dataset, history, user_message, extra_datasets)
