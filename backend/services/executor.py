import subprocess
import tempfile
import os
import sys
import json
import ast
import re
from pathlib import Path

EXECUTION_TIMEOUT = int(os.getenv("EXECUTION_TIMEOUT", "30"))

PREAMBLE = '''
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
import json, sys, os, warnings
from sqlalchemy import create_engine, text as _text
warnings.filterwarnings("ignore")

# Chart capture
_CHARTS_DIR = r"{charts_dir}"
_chart_n = [0]

def _capture_show(self, *args, **kwargs):
    _chart_n[0] += 1
    p = os.path.join(_CHARTS_DIR, f"chart_{{_chart_n[0]}}.json")
    with open(p, "w") as f:
        f.write(self.to_json())

go.Figure.show = _capture_show

{data_setup}
'''


def _safe_identifier(name: str) -> str:
    """Validate a SQL identifier contains only safe characters."""
    if not re.match(r'^[A-Za-z0-9_$\. ]+$', name):
        raise ValueError(f"Unsafe SQL identifier: {name!r}")
    return name


def _quote_safe(dialect: str, name: str) -> str:
    """Quote a SQL identifier after validating it."""
    _safe_identifier(name)
    return f"`{name}`" if dialect == "mysql" else f'"{name}"'


def _apply_neurix_plan(base_script: str, dataset: dict, plan: dict) -> str:
    """
    Inject the Neurix query plan into the data-setup script so only the targeted
    subset is loaded into `df` — never the full table.
    """
    mode = plan.get("mode", "noop")
    src  = dataset.get("source_type", "")
    tq   = dataset.get("table_or_query", "")

    if mode == "sql" and tq == "__live__":
        sql = plan.get("sql", "").strip().replace('"', '\\"')
        if sql:
            # Replace the default first-table load with the targeted SQL query
            base_script += f'\n# Neurix targeted query\ndf = run_sql("{sql}")\n'

    elif mode == "pandas":
        pf = plan.get("pandas_filter", "").strip()
        if pf and not pf.startswith("df"):
            base_script += f"\n# Neurix targeted filter\ndf = df{pf}\n"
        elif pf and pf.startswith("df"):
            base_script += f"\n# Neurix targeted filter\n{pf}\n"

    return base_script


def _build_data_setup(dataset: dict, neurix_plan: dict | None = None) -> str:
    source      = dataset.get("source_type", "")
    table_query = dataset.get("table_or_query", "")
    file_path   = dataset.get("file_path", "")
    schema_info = dataset.get("schema_info", {})
    conn_str    = dataset.get("connection_string", "")

    # ── LIVE DB mode (no parquet) ──────────────────────────────────────────────
    if table_query == "__live__" and conn_str:
        selected   = schema_info.get("__tables__", [])
        excluded   = schema_info.get("__excluded__", {})
        safe_conn  = conn_str.replace('"', '\\"')
        first      = selected[0] if selected else ""
        excl_safe  = repr({t: list(v) for t, v in excluded.items() if v})
        sel_repr   = repr(selected)
        first_repr = repr(first)

        script = (
            f'_engine = create_engine("{safe_conn}", pool_pre_ping=True)\n'
            f"_TABLES   = {sel_repr}\n"
            f"_EXCLUDED = {excl_safe}\n\n"
            "def run_sql(query, limit=10000):\n"
            "    with _engine.connect() as c:\n"
            "        df = pd.read_sql(_text(query), c)\n"
            "    return df.head(limit)\n\n"
            "def load_table(t, limit=10000):\n"
            "    import re as _re\n"
            "    if not _re.match(r'^[A-Za-z0-9_$.]+$', t):\n"
            "        raise ValueError(f'Unsafe table name: {t!r}')\n"
            "    d = _engine.dialect.name\n"
            "    q = f'`{t}`' if d=='mysql' else f'\"{{t}}\"'\n"
            "    return run_sql(f'SELECT * FROM {{q}} LIMIT {{limit}}')\n\n"
        )
        if first:
            script += f"df = load_table({first_repr})\n"
        else:
            script += "df = pd.DataFrame()\n"
        script += f"print('Live DB ready. Tables:', _TABLES)\n"
        return script

    # ── Multi-table parquet (all tables downloaded) ───────────────────────────
    if table_query == "__all__":
        try:
            file_paths = ast.literal_eval(file_path) if file_path else {}
        except Exception:
            file_paths = {}
            print("Warning: could not parse extra dataset file paths", file=sys.stderr)
        lines = ["# All database tables loaded as DataFrames"]
        df_names = []
        for table, path in file_paths.items():
            if path:
                abs_path = os.path.abspath(path)
                safe = table.replace(" ", "_").replace("-", "_").replace(".", "_")
                lines.append(f'df_{safe} = pd.read_parquet(r"{abs_path}")')
                df_names.append((table, safe))
        if df_names:
            lines.append(f"df = df_{df_names[0][1]}")
        return "\n".join(lines)

    # ── Single file (CSV / Excel / Sheets) ────────────────────────────────────
    if file_path:
        abs_path = os.path.abspath(file_path)
        return f'df = pd.read_parquet(r"{abs_path}")'

    # ── Single-table DB (legacy) ──────────────────────────────────────────────
    if conn_str and table_query:
        query = table_query.strip()
        if not query.lower().startswith("select"):
            q = f"`{query}`" if "mysql" in conn_str else f'"{query}"'
            query = f"SELECT * FROM {q}"
        safe_conn = conn_str.replace('"', '\\"')
        return (
            f'_engine = create_engine("{safe_conn}")\n'
            f'with _engine.connect() as _conn:\n'
            f'    df = pd.read_sql(_text("{query}"), _conn)\n'
        )

    return "df = pd.DataFrame()  # No data source"


def _build_extra_datasets_setup(extra_datasets: list) -> str:
    lines = []
    for ds in extra_datasets:
        safe_name   = ds.get("name", "extra").replace(" ", "_").replace("-", "_").replace(".", "_").replace("/", "_")
        file_path   = ds.get("file_path", "")
        table_query = ds.get("table_or_query", "")
        conn_str    = ds.get("connection_string", "")
        schema_info = ds.get("schema_info", {})

        if table_query == "__live__" and conn_str:
            selected  = schema_info.get("__tables__", [])
            safe_conn = conn_str.replace('"', '\\"')
            sel_repr  = repr(selected)
            lines.append(f'# Extra dataset: {ds.get("name")}')
            lines.append(f'_engine_{safe_name} = create_engine("{safe_conn}", pool_pre_ping=True)')
            lines.append(f'_TABLES_{safe_name} = {sel_repr}')
            lines.append(f'def run_sql_{safe_name}(query, limit=10000):')
            lines.append(f'    with _engine_{safe_name}.connect() as c:')
            lines.append(f'        return pd.read_sql(_text(query), c).head(limit)')
            lines.append(f'def load_table_{safe_name}(t, limit=10000):')
            lines.append(f'    import re as _re_{safe_name}')
            lines.append(f'    if not _re_{safe_name}.match(r\'\'\'[A-Za-z0-9_$.]+\'\'\', t):')
            lines.append(f'        raise ValueError(f\'Unsafe table name: {{t!r}}\')')
            lines.append(f'    d = _engine_{safe_name}.dialect.name')
            lines.append(f'    q = f"`{{t}}`" if d=="mysql" else f\'"{{t}}"\'')
            lines.append(f'    return run_sql_{safe_name}(f"SELECT * FROM {{q}} LIMIT {{limit}}")')
            if selected:
                first_repr = repr(selected[0])
                lines.append(f'df_{safe_name} = load_table_{safe_name}({first_repr})')
        elif table_query == "__all__":
            try:
                file_paths = ast.literal_eval(file_path) if file_path else {}
            except Exception:
                file_paths = {}
            lines.append(f'# Extra dataset: {ds.get("name")}')
            for table, path in file_paths.items():
                if path:
                    abs_path  = os.path.abspath(path)
                    tbl_safe  = table.replace(" ", "_").replace("-", "_").replace(".", "_")
                    lines.append(f'df_{safe_name}_{tbl_safe} = pd.read_parquet(r"{abs_path}")')
        elif file_path:
            abs_path = os.path.abspath(file_path)
            lines.append(f'# Extra dataset: {ds.get("name")}')
            lines.append(f'df_{safe_name} = pd.read_parquet(r"{abs_path}")')
        elif conn_str and table_query:
            query     = table_query.strip()
            safe_conn = conn_str.replace('"', '\\"')
            if not query.lower().startswith("select"):
                q     = f"`{query}`" if "mysql" in conn_str else f'"{query}"'
                query = f"SELECT * FROM {q}"
            lines.append(f'# Extra dataset: {ds.get("name")}')
            lines.append(f'_engine_{safe_name} = create_engine("{safe_conn}")')
            lines.append(f'with _engine_{safe_name}.connect() as _c_{safe_name}:')
            lines.append(f'    df_{safe_name} = pd.read_sql(_text("{query}"), _c_{safe_name})')
    return "\n".join(lines)


def execute_python(
    code: str,
    dataset: dict,
    extra_datasets: list | None = None,
    neurix_plan: dict | None = None,
) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        charts_dir = os.path.join(tmpdir, "charts")
        os.makedirs(charts_dir)

        data_setup = _build_data_setup(dataset, neurix_plan)
        if neurix_plan and neurix_plan.get("mode") not in (None, "noop"):
            data_setup = _apply_neurix_plan(data_setup, dataset, neurix_plan)
        if extra_datasets:
            data_setup += "\n" + _build_extra_datasets_setup(extra_datasets)
        preamble  = PREAMBLE.format(charts_dir=charts_dir, data_setup=data_setup)
        full_code = preamble + "\n" + code

        script_path = os.path.join(tmpdir, "script.py")
        with open(script_path, "w") as f:
            f.write(full_code)

        # Strip all secret env vars so user code cannot exfiltrate API keys
        _SECRET_KEYS = {
            "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ENCRYPTION_KEY",
            "JWT_SECRET", "SMTP_PASS", "GOOGLE_CLIENT_SECRET",
            "MICROSOFT_CLIENT_SECRET", "YAHOO_CLIENT_SECRET", "APPLE_CLIENT_SECRET",
            "DATABASE_URL", "SMTP_USER",
        }
        sandbox_env = {k: v for k, v in os.environ.items() if k not in _SECRET_KEYS}

        try:
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True, text=True,
                timeout=EXECUTION_TIMEOUT, cwd=tmpdir,
                env=sandbox_env,
            )
            charts = []
            for cf in sorted(Path(charts_dir).glob("*.json")):
                with open(cf) as f:
                    charts.append(json.loads(f.read()))
            return {
                "success": result.returncode == 0,
                "output":  result.stdout.strip(),
                "error":   result.stderr.strip() if result.returncode != 0 else None,
                "charts":  charts,
            }
        except subprocess.TimeoutExpired:
            return {"success": False, "output": "", "error": f"Timed out after {EXECUTION_TIMEOUT}s.", "charts": []}
        except Exception as exc:
            return {"success": False, "output": "", "error": str(exc), "charts": []}
