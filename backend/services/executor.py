import subprocess
import tempfile
import os
import sys
import json
import ast
from pathlib import Path

EXECUTION_TIMEOUT = int(os.getenv("EXECUTION_TIMEOUT", "30"))

# ── Preamble template ─────────────────────────────────────────────────────────

PREAMBLE = '''
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
import plotly.io as pio
import json, sys, os, warnings
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


def _build_data_setup(dataset: dict) -> str:
    source      = dataset.get("source_type", "")
    table_query = dataset.get("table_or_query", "")
    file_path   = dataset.get("file_path", "")

    # ── Multi-table DB (all tables loaded) ────────────────────────────────────
    if table_query == "__all__":
        try:
            file_paths = ast.literal_eval(file_path) if file_path else {}
        except Exception:
            file_paths = {}

        lines = ["# All database tables loaded as DataFrames"]
        df_names = []
        for table, path in file_paths.items():
            if path and os.path.exists(path):
                safe = table.replace(" ", "_").replace("-", "_").replace(".", "_")
                lines.append(f'df_{safe} = pd.read_parquet(r"{path}")')
                df_names.append((table, safe))

        # Also set df = first table for convenience
        if df_names:
            first_safe = df_names[0][1]
            lines.append(f"\n# 'df' points to the first table ({df_names[0][0]}) for convenience")
            lines.append(f"df = df_{first_safe}")

        # Print available tables on load
        lines.append(f"\n_available_tables = {[t for t, _ in df_names]}")
        lines.append("print('Available tables:', _available_tables)")
        return "\n".join(lines)

    # ── Single file (CSV/Excel/Sheets) ────────────────────────────────────────
    if file_path and os.path.exists(file_path):
        return f'df = pd.read_parquet(r"{file_path}")'

    # ── Single-table DB (legacy) ──────────────────────────────────────────────
    if dataset.get("connection_string") and table_query:
        conn_str = dataset["connection_string"]
        query    = table_query.strip()
        if not query.lower().startswith("select"):
            query = f"SELECT * FROM `{query}`" if "mysql" in conn_str else f'SELECT * FROM "{query}"'
        return (
            f'from sqlalchemy import create_engine, text\n'
            f'_engine = create_engine("{conn_str}")\n'
            f'with _engine.connect() as _conn:\n'
            f'    df = pd.read_sql(text("{query}"), _conn)\n'
        )

    return "df = pd.DataFrame()  # No data source found"


def execute_python(code: str, dataset: dict) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        charts_dir = os.path.join(tmpdir, "charts")
        os.makedirs(charts_dir)

        preamble  = PREAMBLE.format(charts_dir=charts_dir, data_setup=_build_data_setup(dataset))
        full_code = preamble + "\n" + code

        script_path = os.path.join(tmpdir, "script.py")
        with open(script_path, "w") as f:
            f.write(full_code)

        try:
            result = subprocess.run(
                [sys.executable, script_path],
                capture_output=True,
                text=True,
                timeout=EXECUTION_TIMEOUT,
                cwd=tmpdir,
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
