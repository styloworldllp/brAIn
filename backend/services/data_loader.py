import pandas as pd
import numpy as np
import os
import json
from pathlib import Path
from sqlalchemy import create_engine, text, inspect
from services.pii_detector import detect_pii_columns

DATA_DIR = os.getenv("DATA_DIR", "./data")
MAX_ROWS = int(os.getenv("MAX_ROWS", "100000"))


def ensure_data_dir():
    Path(DATA_DIR).mkdir(parents=True, exist_ok=True)


def save_as_parquet(df: pd.DataFrame, dataset_id: str, table_name: str = "main") -> str:
    ensure_data_dir()
    safe = table_name.replace(" ", "_").replace("/", "_")
    path = os.path.join(DATA_DIR, f"{dataset_id}__{safe}.parquet")
    # Coerce object columns with mixed types to string so PyArrow doesn't reject them
    df = df.copy()
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].where(df[col].isnull(), df[col].astype(str))
    df.to_parquet(path, index=False)
    return path


def _make_serializable(val):
    if val is None: return None
    if isinstance(val, float) and np.isnan(val): return None
    if isinstance(val, pd.Timestamp): return val.isoformat()
    if isinstance(val, np.datetime64): return pd.Timestamp(val).isoformat()
    if isinstance(val, np.integer): return int(val)
    if isinstance(val, np.floating): return float(val)
    if isinstance(val, np.bool_): return bool(val)
    if isinstance(val, np.ndarray): return val.tolist()
    try:
        json.dumps(val); return val
    except (TypeError, ValueError): return str(val)


def get_schema_info(df: pd.DataFrame) -> dict:
    """Build schema_info with PII detection included on every column."""
    col_names = list(df.columns)
    pii_results = detect_pii_columns(col_names)
    schema = {}
    for col in col_names:
        schema[col] = {
            "dtype":         str(df[col].dtype),
            "null_count":    int(df[col].isnull().sum()),
            "sample_values": [_make_serializable(v) for v in df[col].dropna().head(3).tolist()],
            "pii":           pii_results.get(col, {"is_pii": False, "category": None, "severity": None, "confidence": "high"}),
        }
    return schema


def get_sample_data(df: pd.DataFrame, n: int = 5) -> list:
    """Return sample rows, masking high/medium PII column values."""
    col_names = list(df.columns)
    pii_results = detect_pii_columns(col_names)
    rows = []
    for _, row in df.head(n).iterrows():
        row_dict = {}
        for col, val in row.items():
            pii = pii_results.get(col, {})
            if pii.get("is_pii") and pii.get("severity") in ("high", "medium"):
                row_dict[col] = "***"
            else:
                row_dict[col] = _make_serializable(val)
        rows.append(row_dict)
    return rows


def load_csv(file_path: str) -> pd.DataFrame:
    return pd.read_csv(file_path, nrows=MAX_ROWS)


def load_excel(file_path: str) -> pd.DataFrame:
    return pd.read_excel(file_path, nrows=MAX_ROWS)


def load_from_db(connection_string: str, table_or_query: str) -> pd.DataFrame:
    engine = create_engine(connection_string)
    query  = table_or_query.strip()
    if not query.lower().startswith("select"):
        q = f"`{query}`" if "mysql" in connection_string else f'"{query}"'
        query = f"SELECT * FROM {q} LIMIT {MAX_ROWS}"
    with engine.connect() as conn:
        df = pd.read_sql(text(query), conn)
    return df


def test_db_connection(connection_string: str) -> dict:
    try:
        engine    = create_engine(connection_string)
        inspector = inspect(engine)
        tables    = inspector.get_table_names()
        return {"success": True, "tables": tables}
    except Exception as e:
        return {"success": False, "error": str(e)}


def load_google_sheet_public(sheet_url: str) -> pd.DataFrame:
    import re
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match: raise ValueError("Could not extract spreadsheet ID from URL.")
    sid = match.group(1)
    gid_match = re.search(r"gid=(\d+)", sheet_url)
    gid = gid_match.group(1) if gid_match else "0"
    url = f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}"
    return pd.read_csv(url, nrows=MAX_ROWS)


def load_google_sheet_service_account(sheet_url: str, creds_json: str) -> pd.DataFrame:
    import gspread, re
    from google.oauth2.service_account import Credentials
    creds_dict = json.loads(creds_json)
    scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly",
              "https://www.googleapis.com/auth/drive.readonly"]
    creds = Credentials.from_service_account_info(creds_dict, scopes=scopes)
    gc    = gspread.authorize(creds)
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match: raise ValueError("Invalid Google Sheets URL")
    sh        = gc.open_by_key(match.group(1))
    worksheet = sh.get_worksheet(0)
    return pd.DataFrame(worksheet.get_all_records()).head(MAX_ROWS)


def load_all_tables(connection_string: str, dataset_id: str) -> dict:
    """Load ALL tables from a database. Returns {table: {file_path, row_count, schema_info, sample_data}}"""
    from sqlalchemy import create_engine, inspect, text as sa_text
    engine    = create_engine(connection_string)
    inspector = inspect(engine)
    tables    = inspector.get_table_names()
    dialect   = engine.dialect.name
    quote     = "`" if dialect == "mysql" else '"'
    result    = {}

    with engine.connect() as conn:
        for table in tables:
            try:
                query = f"SELECT * FROM {quote}{table}{quote} LIMIT {MAX_ROWS}"
                df    = pd.read_sql(sa_text(query), conn)
                path  = save_as_parquet(df, dataset_id, table)
                result[table] = {
                    "file_path":   path,
                    "row_count":   len(df),
                    "schema_info": get_schema_info(df),
                    "sample_data": get_sample_data(df),
                }
            except Exception as e:
                result[table] = {"file_path": None, "row_count": 0,
                                 "schema_info": {}, "sample_data": [], "error": str(e)}
    return result
