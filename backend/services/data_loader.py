import pandas as pd
import numpy as np
import os
import json
from pathlib import Path
from sqlalchemy import create_engine, text

DATA_DIR = os.getenv("DATA_DIR", "./data")
MAX_ROWS = int(os.getenv("MAX_ROWS", "100000"))


def ensure_data_dir():
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def save_as_parquet(df: pd.DataFrame, dataset_id: str) -> str:
    ensure_data_dir()
    path = os.path.join(DATA_DIR, f"{dataset_id}.parquet")
    df.to_parquet(path, index=False)
    return path


def _make_serializable(val):
    """Convert any value to a JSON-safe Python type."""
    if val is None:
        return None
    if isinstance(val, float) and np.isnan(val):
        return None
    if isinstance(val, (pd.Timestamp,)):
        return val.isoformat()
    if isinstance(val, np.datetime64):
        return pd.Timestamp(val).isoformat()
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.floating,)):
        return float(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, (np.ndarray,)):
        return val.tolist()
    if isinstance(val, (pd.NaT.__class__,)):
        return None
    try:
        json.dumps(val)
        return val
    except (TypeError, ValueError):
        return str(val)


def get_schema_info(df: pd.DataFrame) -> dict:
    schema = {}
    for col in df.columns:
        null_count = int(df[col].isnull().sum())
        sample_values = [_make_serializable(v) for v in df[col].dropna().head(3).tolist()]
        schema[col] = {
            "dtype":         str(df[col].dtype),
            "null_count":    null_count,
            "sample_values": sample_values,
        }
    return schema


def get_sample_data(df: pd.DataFrame, n: int = 5) -> list:
    rows = []
    for _, row in df.head(n).iterrows():
        rows.append({col: _make_serializable(val) for col, val in row.items()})
    return rows


# ── CSV / Excel ───────────────────────────────────────────────────────────────

def load_csv(file_path: str) -> pd.DataFrame:
    return pd.read_csv(file_path, nrows=MAX_ROWS)


def load_excel(file_path: str) -> pd.DataFrame:
    return pd.read_excel(file_path, nrows=MAX_ROWS)


# ── Databases ─────────────────────────────────────────────────────────────────

def load_from_db(connection_string: str, table_or_query: str) -> pd.DataFrame:
    engine = create_engine(connection_string)
    query  = table_or_query.strip()
    if not query.lower().startswith("select"):
        query = f"SELECT * FROM {query} LIMIT {MAX_ROWS}"
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)
    return df


def test_db_connection(connection_string: str) -> dict:
    try:
        engine = create_engine(connection_string)
        with engine.connect() as conn:
            dialect = engine.dialect.name
            if dialect == "postgresql":
                result = conn.execute(text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                ))
            elif dialect == "mysql":
                result = conn.execute(text("SHOW TABLES"))
            else:
                result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            tables = [row[0] for row in result]
        return {"success": True, "tables": tables}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ── Google Sheets ─────────────────────────────────────────────────────────────

def load_google_sheet_public(sheet_url: str) -> pd.DataFrame:
    import re
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise ValueError("Could not extract spreadsheet ID from URL.")
    spreadsheet_id = match.group(1)
    gid_match      = re.search(r"gid=(\d+)", sheet_url)
    gid            = gid_match.group(1) if gid_match else "0"
    export_url     = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=csv&gid={gid}"
    )
    return pd.read_csv(export_url, nrows=MAX_ROWS)


def load_google_sheet_service_account(sheet_url: str, creds_json: str) -> pd.DataFrame:
    import gspread, re
    from google.oauth2.service_account import Credentials
    creds_dict = json.loads(creds_json)
    scopes     = [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
    ]
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc    = gspread.authorize(creds)
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise ValueError("Invalid Google Sheets URL")
    sh        = gc.open_by_key(match.group(1))
    worksheet = sh.get_worksheet(0)
    return pd.DataFrame(worksheet.get_all_records()).head(MAX_ROWS)
