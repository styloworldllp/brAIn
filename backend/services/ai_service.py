import json
import os
from typing import Generator
from services.executor import execute_python

MAX_ITERATIONS = 5

TOOL_DESC = (
    "Execute Python code to analyse data and create visualisations. "
    "For single-file datasets the dataframe is `df`. "
    "For database connections ALL tables are pre-loaded as `df_tablename` (e.g. df_orders, df_customers). "
    "Use plotly (px or go) for charts — call fig.show() to display. "
    "Use print() for text output. You can JOIN multiple DataFrames using pandas merge."
)

TOOL_PARAMS = {
    "type": "object",
    "properties": {
        "code":        {"type": "string", "description": "Complete runnable Python code."},
        "explanation": {"type": "string", "description": "One-sentence description of what this code does."},
    },
    "required": ["code"],
}

ANTHROPIC_TOOLS = [{"name": "execute_python", "description": TOOL_DESC, "input_schema": TOOL_PARAMS}]
OPENAI_TOOLS    = [{"type": "function", "function": {"name": "execute_python", "description": TOOL_DESC, "parameters": TOOL_PARAMS}}]


def _build_system(dataset: dict) -> str:
    schema      = dataset.get("schema_info", {})
    is_multi    = isinstance(schema, dict) and "__tables__" in schema
    source_type = dataset.get("source_type", "")

    if is_multi:
        tables = schema.get("__tables__", [])
        table_lines = []
        for table in tables:
            table_schema = schema.get(table, {})
            cols = ", ".join(
                f"{col} ({info.get('dtype','?')})"
                for col, info in table_schema.items()
            ) if table_schema else "(no columns)"
            table_lines.append(f"  • df_{table.replace(' ','_').replace('-','_')}: [{cols}]")

        tables_block = "\n".join(table_lines)
        data_section = f"""## Database: {dataset['name']}
- Type: {source_type}
- Tables ({len(tables)} total — all pre-loaded as DataFrames):
{tables_block}

## How to use:
- Each table is available as `df_tablename` (e.g. `df_orders`, `df_customers`)
- `df` points to the first table for convenience
- You can JOIN tables: `pd.merge(df_orders, df_customers, on='customer_id')`
- Print df_tablename.head() to explore any table
"""
    else:
        schema_lines = [
            f"  - {col} ({info.get('dtype','?')})"
            for col, info in (schema.items() if isinstance(schema, dict) else {}.items())
            if not col.startswith("__")
        ]
        sample = json.dumps(dataset.get("sample_data") or [], indent=2)
        data_section = f"""## Dataset: {dataset['name']}
- Source: {source_type}
- Rows: {dataset.get('row_count', 'unknown')}
- Columns:
{chr(10).join(schema_lines)}

## Sample data (first 5 rows):
```json
{sample}
```
"""

    return f"""You are an expert AI data analyst inside brAIn.

{data_section}
## Rules:
1. Always call `execute_python` to run analysis — never guess results.
2. Use plotly for all charts. Call `fig.show()` to display them.
3. For database datasets, use the `df_tablename` variables.
4. You can call the tool multiple times — explore first, then visualise.
5. Keep explanations concise, data-driven and actionable.
"""


def _format_result(r: dict) -> str:
    parts = []
    if r.get("output"):  parts.append(f"Output:\n{r['output']}")
    if r.get("error"):   parts.append(f"Error:\n{r['error']}")
    if r.get("charts"):  parts.append(f"Charts generated: {len(r['charts'])}")
    return "\n\n".join(parts) or "Code executed successfully (no output)."


def _sse(t: str, p: dict) -> str:
    return f"data: {json.dumps({'type': t, **p})}\n\n"


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _stream_anthropic(api_key, model, dataset, history, user_message):
    import anthropic
    client   = anthropic.Anthropic(api_key=api_key)
    system   = _build_system(dataset)
    messages = list(history) + [{"role": "user", "content": user_message}]

    for _ in range(MAX_ITERATIONS):
        response   = client.messages.create(model=model, max_tokens=8096, system=system, tools=ANTHROPIC_TOOLS, messages=messages)
        tool_calls = []
        exec_cache = {}

        for block in response.content:
            if block.type == "text":
                yield _sse("text", {"content": block.text})
            elif block.type == "tool_use":
                code        = block.input.get("code", "")
                explanation = block.input.get("explanation", "")
                tool_calls.append(block)
                yield _sse("code", {"tool_use_id": block.id, "code": code, "explanation": explanation})
                result             = execute_python(code, dataset)
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

    yield _sse("done", {})


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _stream_openai(api_key, model, dataset, history, user_message):
    import openai
    client   = openai.OpenAI(api_key=api_key)
    system   = _build_system(dataset)
    messages = [{"role": "system", "content": system}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"] or ""})
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_ITERATIONS):
        response      = client.chat.completions.create(model=model, max_tokens=8096, tools=OPENAI_TOOLS, messages=messages)
        choice        = response.choices[0]
        msg           = choice.message
        finish_reason = choice.finish_reason

        if msg.content:
            yield _sse("text", {"content": msg.content})

        if not msg.tool_calls or finish_reason == "stop":
            break

        messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
            {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
            for tc in msg.tool_calls
        ]})

        for tc in msg.tool_calls:
            args        = json.loads(tc.function.arguments)
            code        = args.get("code", "")
            explanation = args.get("explanation", "")
            yield _sse("code", {"tool_use_id": tc.id, "code": code, "explanation": explanation})
            result = execute_python(code, dataset)
            yield _sse("code_output", {"tool_use_id": tc.id, "output": result["output"], "error": result.get("error"), "success": result["success"], "chart_count": len(result["charts"])})
            for chart in result["charts"]:
                yield _sse("chart", {"chart_json": chart})
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": _format_result(result)})

    yield _sse("done", {})


# ── Public ────────────────────────────────────────────────────────────────────

def stream_chat(dataset, history, user_message, provider="anthropic", api_key="", model="") -> Generator[str, None, None]:
    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "") if provider == "anthropic" else os.getenv("OPENAI_API_KEY", "")
    if not model:
        model = "claude-opus-4-6" if provider == "anthropic" else "gpt-4o"

    if provider == "openai":
        return _stream_openai(api_key, model, dataset, history, user_message)
    return _stream_anthropic(api_key, model, dataset, history, user_message)
