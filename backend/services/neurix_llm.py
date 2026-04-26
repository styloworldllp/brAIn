"""
Neurix local-LLM client.

Connects to any OpenAI-compatible endpoint (Ollama, vLLM, LM Studio, llama.cpp server).
Used for two purposes:
  1. Intent / query planning  — always FREE, no neuron cost
  2. Final analysis           — costs neurons (only when org selects Neurix as their AI provider)
"""

import json
import re
from typing import Generator

# Ollama / local LLMs don't check the API key, but the client requires a non-empty string
_DUMMY_KEY = "neurix-local"

# Special mock endpoint for testing without a real Ollama instance
MOCK_ENDPOINT = "mock://neurix-test"


def _is_mock(endpoint_url: str) -> bool:
    return (endpoint_url or "").startswith("mock://")


def _client(endpoint_url: str):
    import openai
    base = endpoint_url.rstrip("/")
    # Ensure it ends with /v1 so the openai client resolves paths correctly
    if not base.endswith("/v1"):
        base = base + "/v1"
    return openai.OpenAI(base_url=base, api_key=_DUMMY_KEY)


# ── Intent planning (free, called by services/neurix.py) ──────────────────────

def plan_with_local(
    user_question: str,
    schema_summary: str,
    endpoint_url: str,
    model_name: str,
) -> "dict | None":
    """
    Ask the local LLM to produce a query plan (same contract as services/neurix.py).
    Returns dict with keys: tables_needed, mode, sql, pandas_filter, explanation
    or None on failure.
    """
    system = (
        "You are a data query planner. Given a schema and a user question, "
        "output ONLY a JSON object — no markdown, no commentary.\n"
        'Schema:\n' + schema_summary
    )
    prompt = (
        f'User question: "{user_question}"\n\n'
        "Output a JSON object with:\n"
        '  "tables_needed": list of table/column names required\n'
        '  "mode": "sql" | "pandas" | "noop"\n'
        '  "sql": SQL SELECT string (if mode=sql, else "")\n'
        '  "pandas_filter": pandas expression (if mode=pandas, else "")\n'
        '  "explanation": one-sentence description of what you are targeting\n'
    )
    if _is_mock(endpoint_url):
        return {
            "tables_needed": [],
            "mode": "pandas",
            "sql": "",
            "pandas_filter": ".head(100)",
            "explanation": f"[Mock] Targeting data for: {user_question[:60]}",
        }

    try:
        client = _client(endpoint_url)
        resp = client.chat.completions.create(
            model=model_name,
            max_tokens=400,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": prompt},
            ],
        )
        text = resp.choices[0].message.content or ""
        m = re.search(r"\{[\s\S]+\}", text)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return None


# ── Final analysis stream (costs neurons) ─────────────────────────────────────

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
OPENAI_TOOLS = [{"type": "function", "function": {
    "name": "execute_python", "description": TOOL_DESC, "parameters": TOOL_PARAMS,
}}]


def stream_analysis(
    endpoint_url: str,
    model_name: str,
    system_prompt: str,
    history: list,
    user_message: str,
    execute_fn,          # callable(code, dataset, extra_datasets, neurix_plan) → dict
    dataset: dict,
    extra_datasets: list | None = None,
    neurix_plan: dict | None = None,
    max_iterations: int = 5,
) -> Generator[str, None, None]:
    """
    Streaming analysis using the local LLM with tool-use (execute_python).
    Yields SSE strings identical to the Anthropic/OpenAI streams.
    """
    import openai

    def _sse(t: str, p: dict) -> str:
        return f"data: {json.dumps({'type': t, **p})}\n\n"

    if _is_mock(endpoint_url):
        yield from _mock_stream(user_message, dataset, extra_datasets, execute_fn, neurix_plan, _sse)
        return

    client = _client(endpoint_url)
    messages = [{"role": "system", "content": system_prompt}]
    for m in (history[-4:] if len(history) > 4 else history):
        messages.append({"role": m["role"], "content": (m.get("content") or "")[:1000]})
    messages.append({"role": "user", "content": user_message})

    text_sent = False
    text_buf  = []

    for _ in range(max_iterations):
        try:
            response = client.chat.completions.create(
                model=model_name,
                max_tokens=2048,
                tools=OPENAI_TOOLS,
                messages=messages,
            )
        except openai.APIConnectionError as exc:
            yield _sse("text", {"content": f"**Neurix connection failed:** {exc}\n\nPlease check the Neurix instance is running and the endpoint URL is correct."})
            yield _sse("done", {})
            return

        choice = response.choices[0]
        msg    = choice.message

        if msg.content:
            if msg.content.strip():
                text_sent = True
            text_buf.append(msg.content)
            yield _sse("text", {"content": msg.content})

        if not msg.tool_calls or choice.finish_reason == "stop":
            break

        messages.append({
            "role": "assistant",
            "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function", "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                }}
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except Exception:
                args = {}
            code = args.get("code", "")
            yield _sse("code", {"tool_use_id": tc.id, "code": code, "explanation": args.get("explanation", "")})
            result = execute_fn(code, dataset, extra_datasets, neurix_plan=neurix_plan)
            yield _sse("code_output", {
                "tool_use_id": tc.id,
                "output":      result["output"],
                "error":       result.get("error"),
                "success":     result["success"],
                "chart_count": len(result["charts"]),
            })
            for chart in result["charts"]:
                yield _sse("chart", {"chart_json": chart})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result["output"] or "OK"})

    if not text_sent:
        yield _sse("text", {"content": (
            "**I need more information to answer this:**\n"
            "- Please clarify what specific data, columns, or context you need analysed.\n"
            "- If your question references data not in this dataset, let me know what to look for."
        )})

    # Follow-up suggestions (best-effort — local LLMs may not follow JSON format perfectly)
    follow_ups = _generate_follow_ups_local(user_message, "".join(text_buf), endpoint_url, model_name)
    if follow_ups:
        yield _sse("follow_up_questions", {"questions": follow_ups})

    yield _sse("done", {})


def _mock_stream(user_message, dataset, extra_datasets, execute_fn, neurix_plan, sse_fn):
    """Mock stream for testing without a real Ollama instance."""
    schema = dataset.get("schema_info", {}) or {}
    is_multi = "__tables__" in schema
    ds_name = dataset.get("name", "dataset")

    yield sse_fn("text", {"content": f"**[Neurix Mock Mode]** Analysing: *{user_message}*\n\n"})

    if is_multi:
        tables = schema.get("__tables__", [])
        code = (
            "import pandas as pd\n"
            f"print('Database: {ds_name}')\n"
            f"print('Tables: {', '.join(str(t) for t in tables[:10])}')\n"
            f"print('Total tables:', {len(tables)})\n"
        )
    else:
        cols = [k for k in schema.keys() if not k.startswith("__")]
        num_cols = [
            k for k, v in schema.items()
            if not k.startswith("__") and isinstance(v, dict)
            and any(t in str(v.get("dtype", "")) for t in ("float", "int"))
        ]
        code = "import pandas as pd\nimport plotly.express as px\n\n"
        code += "print('## Dataset Overview')\n"
        code += f"print(f'Rows: {{len(df)}}  Columns: {len(cols)}')\n"
        if cols:
            code += "print('\\n## Summary Statistics')\n"
            code += "print(df.describe(include='all').to_string())\n"
        if num_cols:
            col = num_cols[0]
            code += f"\nfig = px.histogram(df, x='{col}', title='Distribution of {col} — Neurix Mock')\nfig.show()\n"

    yield sse_fn("code", {"tool_use_id": "mock-1", "code": code, "explanation": "Mock analysis — dataset overview"})
    result = execute_fn(code, dataset, extra_datasets or [])
    yield sse_fn("code_output", {
        "tool_use_id": "mock-1",
        "output":      result["output"],
        "error":       result.get("error"),
        "success":     result["success"],
        "chart_count": len(result["charts"]),
    })
    for chart in result["charts"]:
        yield sse_fn("chart", {"chart_json": chart})

    yield sse_fn("text", {"content": (
        "\n\n---\n## Recommended Action\n"
        "This response was generated by **Neurix Mock Mode** — the full pipeline is working correctly "
        "(intent planning → code execution → chart rendering). "
        "To switch to a real local LLM, point your Neurix instance to a running Ollama or vLLM endpoint."
    )})
    yield sse_fn("follow_up_questions", {"questions": [
        "Show the top 10 rows",
        "What columns have missing values?",
        "Plot a trend over time",
    ]})
    yield sse_fn("done", {})


def _generate_follow_ups_local(user_question: str, response_text: str, endpoint_url: str, model_name: str) -> list[str]:
    summary = response_text[:600].replace("\n", " ")
    prompt = (
        f'User asked: "{user_question}"\nAnalysis: {summary}\n\n'
        'Suggest 3 short follow-up questions (each under 12 words). '
        'Output ONLY a JSON array: ["q1", "q2", "q3"]'
    )
    try:
        client = _client(endpoint_url)
        resp = client.chat.completions.create(
            model=model_name, max_tokens=150,
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.choices[0].message.content or ""
        m = re.search(r"\[[\s\S]+?\]", text)
        if m:
            qs = json.loads(m.group())
            return [str(q) for q in qs[:3]]
    except Exception:
        pass
    return []
