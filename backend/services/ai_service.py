import json
import os
from typing import Generator
from services.executor import execute_python

MAX_ITERATIONS = 5

# ── Tool definitions ──────────────────────────────────────────────────────────

TOOL_DESC = (
    "Execute Python code to analyse data and create visualisations. "
    "The dataframe is pre-loaded as `df`. "
    "Use plotly (px or go) for charts and call fig.show() to display them. "
    "Use print() for text output. Always produce at least one chart for analytical questions."
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


# ── System prompt ─────────────────────────────────────────────────────────────

def _build_system(dataset: dict) -> str:
    schema_lines = [
        f"  - {col} ({info['dtype']})"
        for col, info in (dataset.get("schema_info") or {}).items()
    ]
    sample = json.dumps(dataset.get("sample_data") or [], indent=2)
    return f"""You are an expert AI data analyst embedded in brAIn, a data analytics platform.

## Active dataset: {dataset['name']}
- Source: {dataset['source_type']}
- Rows: {dataset.get('row_count', 'unknown')}
- Columns:
{chr(10).join(schema_lines)}

## Sample data (first 5 rows):
```json
{sample}
```

## Instructions:
1. Understand the user's question in the context of this dataset.
2. Call `execute_python` to write and run analysis code. `df` is already loaded — do NOT re-load it.
3. After seeing execution results, explain findings clearly and concisely.
4. For visualisations use **plotly** (`import plotly.express as px` or `plotly.graph_objects as go`) and call `fig.show()`.
5. You may call the tool multiple times if needed.
6. Keep explanations concise, data-driven, and actionable.
"""


def _format_result(result: dict) -> str:
    parts = []
    if result.get("output"):
        parts.append(f"Output:\n{result['output']}")
    if result.get("error"):
        parts.append(f"Error:\n{result['error']}")
    if result.get("charts"):
        parts.append(f"Charts generated: {len(result['charts'])}")
    return "\n\n".join(parts) or "Code executed successfully (no output)."


def _sse(event_type: str, payload: dict) -> str:
    return f"data: {json.dumps({'type': event_type, **payload})}\n\n"


# ── Anthropic ─────────────────────────────────────────────────────────────────

def _stream_anthropic(api_key: str, model: str, dataset: dict, history: list, user_message: str):
    import anthropic
    client   = anthropic.Anthropic(api_key=api_key)
    system   = _build_system(dataset)
    messages = list(history) + [{"role": "user", "content": user_message}]

    for _ in range(MAX_ITERATIONS):
        response = client.messages.create(
            model=model,
            max_tokens=8096,
            system=system,
            tools=ANTHROPIC_TOOLS,
            messages=messages,
        )

        tool_calls = []
        exec_results = {}   # tool_use_id -> result (to avoid double execution)

        for block in response.content:
            if block.type == "text":
                yield _sse("text", {"content": block.text})

            elif block.type == "tool_use":
                code        = block.input.get("code", "")
                explanation = block.input.get("explanation", "")
                tool_calls.append(block)

                yield _sse("code", {"tool_use_id": block.id, "code": code, "explanation": explanation})

                result = execute_python(code, dataset)
                exec_results[block.id] = result

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
        messages.append({
            "role": "user",
            "content": [
                {
                    "type":        "tool_result",
                    "tool_use_id": block.id,
                    "content":     _format_result(exec_results[block.id]),
                }
                for block in tool_calls
            ],
        })

    yield _sse("done", {})


# ── OpenAI ────────────────────────────────────────────────────────────────────

def _stream_openai(api_key: str, model: str, dataset: dict, history: list, user_message: str):
    import openai
    client   = openai.OpenAI(api_key=api_key)
    system   = _build_system(dataset)

    messages = [{"role": "system", "content": system}]
    for m in history:
        messages.append({"role": m["role"], "content": m["content"] or ""})
    messages.append({"role": "user", "content": user_message})

    for _ in range(MAX_ITERATIONS):
        response      = client.chat.completions.create(
            model=model, max_tokens=8096, tools=OPENAI_TOOLS, messages=messages
        )
        choice        = response.choices[0]
        msg           = choice.message
        finish_reason = choice.finish_reason

        if msg.content:
            yield _sse("text", {"content": msg.content})

        if not msg.tool_calls or finish_reason == "stop":
            break

        # Append assistant message with tool calls
        messages.append({
            "role":       "assistant",
            "content":    msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls
            ],
        })

        for tc in msg.tool_calls:
            args        = json.loads(tc.function.arguments)
            code        = args.get("code", "")
            explanation = args.get("explanation", "")

            yield _sse("code", {"tool_use_id": tc.id, "code": code, "explanation": explanation})

            result = execute_python(code, dataset)

            yield _sse("code_output", {
                "tool_use_id": tc.id,
                "output":      result["output"],
                "error":       result.get("error"),
                "success":     result["success"],
                "chart_count": len(result["charts"]),
            })
            for chart in result["charts"]:
                yield _sse("chart", {"chart_json": chart})

            messages.append({
                "role":         "tool",
                "tool_call_id": tc.id,
                "content":      _format_result(result),
            })

    yield _sse("done", {})


# ── Public entry point ────────────────────────────────────────────────────────

def stream_chat(
    dataset:      dict,
    history:      list,
    user_message: str,
    provider:     str = "anthropic",
    api_key:      str = "",
    model:        str = "",
) -> Generator[str, None, None]:
    if not api_key:
        api_key = (
            os.getenv("ANTHROPIC_API_KEY", "")
            if provider == "anthropic"
            else os.getenv("OPENAI_API_KEY", "")
        )
    if not model:
        model = "claude-opus-4-6" if provider == "anthropic" else "gpt-4o"

    if provider == "openai":
        return _stream_openai(api_key, model, dataset, history, user_message)
    else:
        return _stream_anthropic(api_key, model, dataset, history, user_message)
