"""
Neurix — brAIn's intent engine.

Reads only schema metadata, plans the minimal targeted query to answer the
user's question.  Never accesses row data.  Configured globally by super admin.
"""
import json
import re
from typing import Optional

# Default fast/cheap models — schema planning only, never touches user data
_FAST = {"anthropic": "claude-haiku-4-5-20251001", "openai": "gpt-4o-mini"}

NEURIX_SYSTEM = """You are Neurix, the query planning engine inside brAIn.

Your sole job: examine schema metadata and plan the MINIMAL query to answer the user question.

Input you receive:
- User question
- Schema: table names, column names, data types, sample values (NO actual row data)

Output: a single JSON object only — no markdown, no explanation outside JSON.

{
  "tables_needed": ["table1"],
  "mode": "sql" | "pandas" | "noop",
  "sql": "SELECT col1, SUM(col2) AS total FROM table1 WHERE condition GROUP BY col1 ORDER BY total DESC LIMIT 500",
  "pandas_filter": "[['col1','col2']].query(\"year == 2024\").head(500)",
  "columns_needed": {"table1": ["col1", "col2"]},
  "explanation": "Fetching 2024 revenue by category (aggregated, top 20)"
}

Rules:
1. NEVER SELECT * — list only the columns required to answer the question
2. Aggregation queries: LIMIT ≤ 500;  detail queries: LIMIT ≤ 1000
3. Use WHERE / .query() filters to minimise row transfer
4. Use GROUP BY + SUM/COUNT/AVG when the question asks for totals or trends
5. For multi-table questions: include JOINs in sql
6. mode "sql"    → live database connection (PostgreSQL/MySQL)
7. mode "pandas" → file-based dataset (CSV/Excel/parquet already loaded as df)
8. mode "noop"   → only if no useful filter can be determined
9. pandas_filter is APPENDED to `df`, e.g. df + pandas_filter gives the result
10. Output ONLY the JSON object
"""


def _schema_summary(dataset: dict, extra_datasets: list) -> str:
    lines = []

    def _describe(ds: dict) -> list[str]:
        schema = ds.get("schema_info") or {}
        out = []
        if "__tables__" in schema:
            tables = schema.get("__tables__", [])
            out.append(
                f"Source: {ds['name']}  type={ds.get('source_type', 'db')}  tables={len(tables)}"
            )
            for t in tables[:20]:
                tschema = schema.get(t, {})
                col_parts = []
                for col, meta in list(tschema.items())[:30]:
                    if col.startswith("__"):
                        continue
                    dtype   = meta.get("dtype", "?") if isinstance(meta, dict) else "?"
                    samples = meta.get("sample_values", [])[:2] if isinstance(meta, dict) else []
                    col_parts.append(
                        f"{col}:{dtype}(e.g.{samples})" if samples else f"{col}:{dtype}"
                    )
                out.append(f"  table={t}: {', '.join(col_parts)}")
        else:
            cols = {k: v for k, v in schema.items() if not k.startswith("__")}
            out.append(
                f"Source: {ds['name']}  type={ds.get('source_type','file')}  rows={ds.get('row_count','?')}"
            )
            col_parts = []
            for col, meta in list(cols.items())[:50]:
                dtype   = meta.get("dtype", "?") if isinstance(meta, dict) else "?"
                samples = meta.get("sample_values", [])[:2] if isinstance(meta, dict) else []
                col_parts.append(
                    f"{col}:{dtype}(e.g.{samples})" if samples else f"{col}:{dtype}"
                )
            out.append(f"  columns: {', '.join(col_parts)}")
        return out

    lines.extend(_describe(dataset))
    for eds in (extra_datasets or []):
        lines.append("")
        lines.extend(_describe(eds))
    return "\n".join(lines)


def plan_query(
    user_question: str,
    dataset: dict,
    extra_datasets: list,
    provider: str,
    api_key: str,
    model: str,
    neurix_endpoint: str | None = None,
) -> Optional[dict]:
    """
    Plan a targeted query from schema metadata only.
    If provider == "neurix" and neurix_endpoint is given, uses the local LLM.
    Returns a plan dict or None on any failure (caller falls back to full-table mode).
    """
    schema_text = _schema_summary(dataset, extra_datasets)

    # Local LLM path (always free)
    if provider == "neurix" and neurix_endpoint:
        from services.neurix_llm import plan_with_local
        return plan_with_local(user_question, schema_text, neurix_endpoint, model or "llama3")

    if not api_key:
        return None
    model = model or _FAST.get(provider, "claude-haiku-4-5-20251001")
    user_content = f"User question: {user_question}\n\n{schema_text}"
    try:
        if provider == "openai":
            return _call_openai(api_key, model, user_content)
        return _call_anthropic(api_key, model, user_content)
    except Exception:
        return None


def _call_anthropic(api_key: str, model: str, user_content: str) -> Optional[dict]:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    resp   = client.messages.create(
        model=model, max_tokens=512,
        system=NEURIX_SYSTEM,
        messages=[{"role": "user", "content": user_content}],
    )
    text = resp.content[0].text if resp.content else ""
    return _parse_json(text)


def _call_openai(api_key: str, model: str, user_content: str) -> Optional[dict]:
    import openai
    client = openai.OpenAI(api_key=api_key)
    resp   = client.chat.completions.create(
        model=model, max_tokens=512,
        messages=[
            {"role": "system",  "content": NEURIX_SYSTEM},
            {"role": "user",    "content": user_content},
        ],
    )
    text = resp.choices[0].message.content or ""
    return _parse_json(text)


def _parse_json(text: str) -> Optional[dict]:
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]+\}", text)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    return None
