import anthropic
import json
import os
from typing import Generator
from services.executor import execute_python

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

MODEL = "claude-opus-4-6"
MAX_TOKENS = 8096
MAX_TOOL_ITERATIONS = 5

TOOLS = [
    {
        "name": "execute_python",
        "description": (
            "Execute Python code to analyse data and create visualisations. "
            "The dataframe is pre-loaded as `df`. "
            "Use plotly (px or go) for charts and call fig.show() to display them. "
            "Use print() for text output. "
            "Always produce at least one visual when the question is analytical."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "Complete, runnable Python code for the analysis.",
                },
                "explanation": {
                    "type": "string",
                    "description": "One-sentence description of what this code does.",
                },
            },
            "required": ["code"],
        },
    }
]


def _build_system_prompt(dataset: dict) -> str:
    schema_lines = []
    for col, info in (dataset.get("schema_info") or {}).items():
        schema_lines.append(f"  - {col} ({info['dtype']})")

    sample_json = json.dumps(dataset.get("sample_data") or [], indent=2)

    return f"""You are an expert AI data analyst embedded in a web application.

## Dataset: {dataset['name']}
- Source: {dataset['source_type']}
- Rows: {dataset.get('row_count', 'unknown')}
- Columns:
{chr(10).join(schema_lines)}

## Sample data (first 5 rows):
```json
{sample_json}
```

## How to work:
1. Understand the user's question in the context of this dataset.
2. Call `execute_python` to write and run code. The dataframe is ready as `df`.
3. After seeing the output, explain the findings clearly and concisely.
4. For visualisations use **plotly** (`import plotly.express as px` or `plotly.graph_objects as go`) and call `fig.show()`.
5. You can call the tool multiple times if needed (e.g., first explore, then visualise).

## Rules:
- Always use `df` as the main dataframe variable – it is already loaded.
- For multiple charts, call `fig.show()` on each one.
- Keep explanations concise, data-driven, and actionable.
- If the user's question is ambiguous, make a reasonable assumption and state it.
- Prefer plotly over matplotlib for all charts.
"""


def _format_tool_result(result: dict) -> str:
    parts = []
    if result["output"]:
        parts.append(f"Output:\n{result['output']}")
    if result.get("error"):
        parts.append(f"Error:\n{result['error']}")
    if result["charts"]:
        parts.append(f"Charts generated: {len(result['charts'])}")
    if not parts:
        parts.append("Code executed successfully (no output).")
    return "\n\n".join(parts)


def stream_chat(
    dataset: dict,
    conversation_history: list,
    user_message: str,
) -> Generator[str, None, None]:
    """
    Run the agentic loop and yield SSE-formatted strings.
    Event types: text | thinking | code | code_output | chart | error | done
    """

    def sse(event_type: str, payload: dict) -> str:
        return f"data: {json.dumps({'type': event_type, **payload})}\n\n"

    system = _build_system_prompt(dataset)

    messages = list(conversation_history)
    messages.append({"role": "user", "content": user_message})

    all_charts = []
    final_text_parts = []

    for iteration in range(MAX_TOOL_ITERATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=system,
            tools=TOOLS,
            messages=messages,
        )

        # Process response blocks
        tool_calls = []
        for block in response.content:
            if block.type == "text":
                final_text_parts.append(block.text)
                yield sse("text", {"content": block.text})

            elif block.type == "tool_use":
                code = block.input.get("code", "")
                explanation = block.input.get("explanation", "")
                tool_calls.append(block)

                yield sse("code", {
                    "tool_use_id": block.id,
                    "code": code,
                    "explanation": explanation,
                })

                # Execute the code
                exec_result = execute_python(code, dataset)
                all_charts.extend(exec_result["charts"])

                yield sse("code_output", {
                    "tool_use_id": block.id,
                    "output": exec_result["output"],
                    "error": exec_result.get("error"),
                    "success": exec_result["success"],
                    "chart_count": len(exec_result["charts"]),
                })

                for chart in exec_result["charts"]:
                    yield sse("chart", {"chart_json": chart})

        # If Claude finished (no tool calls), we are done
        if response.stop_reason == "end_turn":
            break

        # Otherwise append assistant + tool results and loop
        if tool_calls:
            messages.append({"role": "assistant", "content": response.content})
            tool_results = []
            for block in tool_calls:
                code = block.input.get("code", "")
                exec_result = execute_python(code, dataset)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": _format_tool_result(exec_result),
                })
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    yield sse("done", {"chart_count": len(all_charts)})
