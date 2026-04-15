import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db import get_db, Dataset
from services.data_loader import (
    load_csv, load_excel, load_from_db, load_all_tables,
    test_db_connection, load_google_sheet_public,
    load_google_sheet_service_account,
    save_as_parquet, get_schema_info, get_sample_data,
)

router = APIRouter()

UPLOAD_DIR = os.path.join(os.getenv("DATA_DIR", "./data"), "uploads")
Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def _serialise(d: Dataset) -> dict:
    return {
        "id":          d.id,
        "name":        d.name,
        "source_type": d.source_type,
        "row_count":   d.row_count,
        "schema_info": d.schema_info,
        "sample_data": d.sample_data,
        "created_at":  d.created_at.isoformat(),
        # extra info for multi-table DBs
        "all_tables":  d.schema_info.get("__tables__") if isinstance(d.schema_info, dict) else None,
    }


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_datasets(db: Session = Depends(get_db)):
    return [_serialise(d) for d in db.query(Dataset).order_by(Dataset.created_at.desc()).all()]


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db)):
    d = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")
    # Remove parquet files
    data_dir = os.getenv("DATA_DIR", "./data")
    for f in Path(data_dir).glob(f"{dataset_id}*.parquet"):
        try:
            f.unlink()
        except Exception:
            pass
    db.delete(d)
    db.commit()
    return {"ok": True}


# ── Upload CSV / Excel ────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    ext = Path(file.filename).suffix.lower()
    if ext not in (".csv", ".xlsx", ".xls"):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported.")

    dataset_id  = str(uuid.uuid4())
    upload_path = os.path.join(UPLOAD_DIR, f"{dataset_id}{ext}")

    with open(upload_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        df = load_csv(upload_path) if ext == ".csv" else load_excel(upload_path)
    except Exception as exc:
        os.remove(upload_path)
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}")

    parquet_path = save_as_parquet(df, dataset_id)
    d = Dataset(
        id          = dataset_id,
        name        = file.filename,
        source_type = ext.lstrip("."),
        file_path   = parquet_path,
        row_count   = len(df),
        schema_info = get_schema_info(df),
        sample_data = get_sample_data(df),
    )
    db.add(d)
    db.commit()
    return _serialise(d)


# ── Connect Database — ALL TABLES ─────────────────────────────────────────────

class DBConnectRequest(BaseModel):
    name:     str
    db_type:  str       # postgres | mysql
    host:     str
    port:     int
    database: str
    username: str
    password: str


@router.post("/connect-db")
def connect_database(req: DBConnectRequest, db: Session = Depends(get_db)):
    prefix     = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str   = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"

    test = test_db_connection(conn_str)
    if not test["success"]:
        raise HTTPException(status_code=400, detail=test["error"])

    dataset_id = str(uuid.uuid4())

    try:
        tables_data = load_all_tables(conn_str, dataset_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Build combined schema: { "__tables__": [...], tableName: {col: info} }
    combined_schema = {"__tables__": list(tables_data.keys())}
    combined_sample = {}
    total_rows      = 0

    for table_name, info in tables_data.items():
        combined_schema[table_name] = info.get("schema_info", {})
        combined_sample[table_name] = info.get("sample_data", [])
        total_rows += info.get("row_count", 0)

    # Store file_path as JSON map: {table: path}
    file_paths = {t: info["file_path"] for t, info in tables_data.items() if info.get("file_path")}

    d = Dataset(
        id                = dataset_id,
        name              = req.name or req.database,
        source_type       = req.db_type,
        file_path         = str(file_paths),   # JSON-stringified map
        connection_string = conn_str,
        table_or_query    = "__all__",
        row_count         = total_rows,
        schema_info       = combined_schema,
        sample_data       = list(combined_sample.items())[:5],  # store first 5 table samples
    )
    db.add(d)
    db.commit()
    return _serialise(d)


@router.post("/test-db")
def test_db(req: DBConnectRequest):
    prefix   = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"
    return test_db_connection(conn_str)


# ── Connect Google Sheets ─────────────────────────────────────────────────────

class SheetsConnectRequest(BaseModel):
    name:                 str
    sheet_url:            str
    service_account_json: Optional[str] = None


@router.post("/connect-sheets")
def connect_sheets(req: SheetsConnectRequest, db: Session = Depends(get_db)):
    try:
        df = (
            load_google_sheet_service_account(req.sheet_url, req.service_account_json)
            if req.service_account_json
            else load_google_sheet_public(req.sheet_url)
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    dataset_id   = str(uuid.uuid4())
    parquet_path = save_as_parquet(df, dataset_id)

    d = Dataset(
        id          = dataset_id,
        name        = req.name,
        source_type = "sheets",
        sheets_url  = req.sheet_url,
        file_path   = parquet_path,
        row_count   = len(df),
        schema_info = get_schema_info(df),
        sample_data = get_sample_data(df),
    )
    db.add(d)
    db.commit()
    return _serialise(d)
