import subprocess
import tempfile
import os
import sys
import json
from pathlib import Path


EXECUTION_TIMEOUT = int(os.getenv("EXECUTION_TIMEOUT", "30"))


PREAMBLE_TEMPLATE = '''
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
import plotly.io as pio
import json
import sys
import os
import warnings
warnings.filterwarnings("ignore")

# ── Chart capture ─────────────────────────────────────────────────────────────
_CHARTS_DIR = r"{charts_dir}"
_chart_count = [0]

def _capture_show(self, *args, **kwargs):
    _chart_count[0] += 1
    path = os.path.join(_CHARTS_DIR, f"chart_{{_chart_count[0]}}.json")
    with open(path, "w") as f:
        f.write(self.to_json())

go.Figure.show = _capture_show

# ── Load dataset ──────────────────────────────────────────────────────────────
{data_setup}

# ── User code ─────────────────────────────────────────────────────────────────
'''


def _build_data_setup(dataset) -> str:
    """Build the data loading code snippet for the executor preamble."""
    if dataset["source_type"] in ("csv", "excel", "sheets"):
        file_path = dataset["file_path"].replace("\\", "/")
        return f'df = pd.read_parquet(r"{file_path}")'
    
    elif dataset["source_type"] in ("postgres", "mysql"):
        conn_str = dataset["connection_string"]
        query = dataset["table_or_query"].strip()
        if not query.lower().startswith("select"):
            query = f"SELECT * FROM {query}"
        return (
            f'from sqlalchemy import create_engine, text\n'
            f'_engine = create_engine("{conn_str}")\n'
            f'with _engine.connect() as _conn:\n'
            f'    df = pd.read_sql(text("{query}"), _conn)\n'
        )
    
    return "df = pd.DataFrame()"  # fallback


def execute_python(code: str, dataset: dict) -> dict:
    """
    Execute Python code in an isolated subprocess.
    Returns: { success, output, error, charts }
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        charts_dir = os.path.join(tmpdir, "charts")
        os.makedirs(charts_dir)

        data_setup = _build_data_setup(dataset)
        preamble = PREAMBLE_TEMPLATE.format(
            charts_dir=charts_dir,
            data_setup=data_setup,
        )
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

            stdout = result.stdout.strip()
            stderr = result.stderr.strip()

            # Strip the long traceback preamble to show only the useful error
            if stderr and "UserCode" not in stderr:
                lines = stderr.split("\n")
                # Find the last 'File "script.py"' occurrence to trim traceback
                relevant = []
                capture = False
                for line in lines:
                    if "script.py" in line and "# ── User code" in open(script_path).read():
                        capture = True
                    if capture or line.startswith(("Traceback", "  File", "    ", "Error", "Name", "Type", "Value", "Index", "Key", "Attribute", "Zero", "Overflow", "Runtime", "Syntax")):
                        relevant.append(line)
                stderr = "\n".join(relevant) if relevant else stderr

            # Collect charts
            charts = []
            for chart_file in sorted(Path(charts_dir).glob("*.json")):
                with open(chart_file) as f:
                    charts.append(json.loads(f.read()))

            return {
                "success": result.returncode == 0,
                "output": stdout,
                "error": stderr if result.returncode != 0 else None,
                "charts": charts,
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "output": "",
                "error": f"Code execution timed out after {EXECUTION_TIMEOUT} seconds.",
                "charts": [],
            }
        except Exception as exc:
            return {
                "success": False,
                "output": "",
                "error": str(exc),
                "charts": [],
            }
