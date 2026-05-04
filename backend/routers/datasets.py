import os
import uuid
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db import get_db, Dataset, DatasetPermission, SavedChart, Schedule, User
from routers.auth import require_brain_access
from services.audit_logger import log_event, A
from services.data_loader import (
    load_csv, load_excel, load_from_db,
    test_db_connection, load_google_sheet_public,
    load_google_sheet_service_account,
    save_as_parquet, get_schema_info, get_sample_data, load_all_tables,
)

router = APIRouter()

UPLOAD_DIR = os.path.join(os.getenv("DATA_DIR", "./data"), "uploads")
Path(UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def _serialise(d: Dataset) -> dict:
    deleted = bool(d.is_deleted)
    return {
        "id":            d.id,
        "name":          d.name,
        "source_type":   d.source_type,
        "row_count":     d.row_count if not deleted else None,
        "schema_info":   d.schema_info if not deleted else None,
        "sample_data":   d.sample_data if not deleted else None,
        "is_restricted": d.is_restricted or False,
        "is_deleted":    deleted,
        "deleted_at":    d.deleted_at.isoformat() if d.deleted_at else None,
        "created_at":    d.created_at.isoformat(),
        "all_tables":    d.schema_info.get("__tables__") if isinstance(d.schema_info, dict) and not deleted else None,
    }


def _org_q(db: Session, user: User):
    """Base query scoped to the user's organisation."""
    return db.query(Dataset).filter(Dataset.organization_id == user.organization_id)


def _get_or_404(db: Session, user: User, dataset_id: str, allow_deleted: bool = False) -> Dataset:
    q = _org_q(db, user).filter(Dataset.id == dataset_id)
    if not allow_deleted:
        q = q.filter(Dataset.is_deleted != True)
    d = q.first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return d


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("/")
def list_datasets(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    all_ds = _org_q(db, user).filter(Dataset.is_deleted != True).order_by(Dataset.created_at.desc()).all()
    if user.role == "admin":
        return [{**_serialise(d), "has_access": True} for d in all_ds]
    permitted_ids = {
        p.dataset_id for p in db.query(DatasetPermission)
        .filter(DatasetPermission.user_id == user.id).all()
    }
    result = []
    for d in all_ds:
        s = _serialise(d)
        s["has_access"] = (not d.is_restricted) or (d.id in permitted_ids)
        result.append(s)
    return result


@router.get("/archived")
def list_archived_datasets(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    """Returns soft-deleted datasets (name + id only) so the sidebar can still show their conversations."""
    archived = _org_q(db, user).filter(Dataset.is_deleted == True).order_by(Dataset.deleted_at.desc()).all()
    return [{"id": d.id, "name": d.name, "source_type": d.source_type, "is_deleted": True, "deleted_at": d.deleted_at.isoformat() if d.deleted_at else None} for d in archived]


@router.get("/{dataset_id}")
def get_dataset(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    return _serialise(_get_or_404(db, user, dataset_id))


@router.patch("/{dataset_id}/restrict")
def toggle_restrict(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    d = _get_or_404(db, user, dataset_id)
    d.is_restricted = not bool(d.is_restricted)
    db.commit()
    return {"is_restricted": d.is_restricted}


@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    d = _get_or_404(db, user, dataset_id, allow_deleted=True)

    # 1. Delete physical files (parquet / uploads)
    data_dir = os.getenv("DATA_DIR", "./data")
    for f in Path(data_dir).glob(f"{dataset_id}*"):
        try: f.unlink()
        except Exception: pass

    # 2. Cascade-delete dependent records (charts, schedules, permissions) —
    #    but KEEP conversations & messages so chat history stays visible.
    db.query(SavedChart).filter(SavedChart.dataset_id == dataset_id).delete(synchronize_session=False)
    db.query(Schedule).filter(Schedule.dataset_id == dataset_id).delete(synchronize_session=False)
    db.query(DatasetPermission).filter(DatasetPermission.dataset_id == dataset_id).delete(synchronize_session=False)

    # 3. Audit log before we wipe the fields
    log_event(db, A.DATASET_DELETE, user=user, resource_type="dataset",
              resource_id=d.id, resource_name=d.name,
              details={"source_type": d.source_type, "row_count": d.row_count})

    # 4. Soft-delete: null out all heavy/sensitive fields, keep the row for conversation navigation
    d.schema_info       = None
    d.sample_data       = None
    d.file_path         = None
    d.connection_string = None
    d.table_or_query    = None
    d.sheets_url        = None
    d.row_count         = None
    d.is_deleted        = True
    d.deleted_at        = __import__("datetime").datetime.utcnow()

    db.commit()
    return {"ok": True}


# ── Upload CSV / Excel ────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
_ALLOWED_EXTS    = {".csv", ".xlsx", ".xls"}
_ALLOWED_MIME    = {"text/csv", "application/vnd.ms-excel",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "application/octet-stream", "text/plain", "application/csv"}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    ext = Path(file.filename).suffix.lower()
    if ext not in _ALLOWED_EXTS:
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are supported.")
    if file.content_type and file.content_type not in _ALLOWED_MIME:
        raise HTTPException(status_code=400, detail="Invalid file type.")

    dataset_id  = str(uuid.uuid4())
    upload_path = os.path.join(UPLOAD_DIR, f"{dataset_id}{ext}")

    size = 0
    with open(upload_path, "wb") as f:
        while True:
            chunk = file.file.read(1024 * 256)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                f.close()
                os.remove(upload_path)
                raise HTTPException(400, f"File exceeds {MAX_UPLOAD_BYTES // 1024 // 1024} MB limit")
            f.write(chunk)

    try:
        df = load_csv(upload_path) if ext == ".csv" else load_excel(upload_path)
    except Exception as exc:
        os.remove(upload_path)
        raise HTTPException(status_code=400, detail=f"Could not parse file: {exc}")

    parquet_path = save_as_parquet(df, dataset_id)
    d = Dataset(
        id              = dataset_id,
        organization_id = user.organization_id,
        name            = file.filename,
        source_type     = ext.lstrip("."),
        file_path       = parquet_path,
        row_count       = len(df),
        schema_info     = get_schema_info(df),
        sample_data     = get_sample_data(df),
    )
    db.add(d)
    db.commit()
    log_event(db, A.DATASET_CREATE, user=user, resource_type="dataset",
              resource_id=d.id, resource_name=d.name,
              details={"source_type": ext.lstrip("."), "row_count": len(df), "filename": file.filename})
    return _serialise(d)


# ── Connect Database — ALL TABLES ─────────────────────────────────────────────

class DBConnectRequest(BaseModel):
    name:     str
    db_type:  str
    host:     str
    port:     int
    database: str
    username: str
    password: str


@router.post("/connect-db")
def connect_database(req: DBConnectRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    prefix   = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"

    test = test_db_connection(conn_str)
    if not test["success"]:
        raise HTTPException(status_code=400, detail=test["error"])

    dataset_id = str(uuid.uuid4())
    try:
        tables_data = load_all_tables(conn_str, dataset_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    combined_schema = {"__tables__": list(tables_data.keys())}
    combined_sample = {}
    total_rows      = 0
    for table_name, info in tables_data.items():
        combined_schema[table_name] = info.get("schema_info", {})
        combined_sample[table_name] = info.get("sample_data", [])
        total_rows += info.get("row_count", 0)

    file_paths = {t: info["file_path"] for t, info in tables_data.items() if info.get("file_path")}

    d = Dataset(
        id                = dataset_id,
        organization_id   = user.organization_id,
        name              = req.name or req.database,
        source_type       = req.db_type,
        file_path         = str(file_paths),
        connection_string = conn_str,
        table_or_query    = "__all__",
        row_count         = total_rows,
        schema_info       = combined_schema,
        sample_data       = list(combined_sample.items())[:5],
    )
    db.add(d)
    db.commit()
    return _serialise(d)


@router.post("/test-db")
def test_db(req: DBConnectRequest, _: User = Depends(require_brain_access)):
    prefix   = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"
    return test_db_connection(conn_str)


# ── Connect Google Sheets ─────────────────────────────────────────────────────

class SheetsConnectRequest(BaseModel):
    name:                 str
    sheet_url:            str
    service_account_json: Optional[str] = None


@router.post("/connect-sheets")
def connect_sheets(req: SheetsConnectRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
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
        id              = dataset_id,
        organization_id = user.organization_id,
        name            = req.name,
        source_type     = "sheets",
        sheets_url      = req.sheet_url,
        file_path       = parquet_path,
        row_count       = len(df),
        schema_info     = get_schema_info(df),
        sample_data     = get_sample_data(df),
    )
    db.add(d)
    db.commit()
    return _serialise(d)


# ── PII config ────────────────────────────────────────────────────────────────

@router.post("/{dataset_id}/pii-config")
def save_pii_config(dataset_id: str, body: dict, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    d = _get_or_404(db, user, dataset_id)
    excluded   = body.get("excluded_columns", [])
    manual_pii = body.get("manual_pii", {})
    schema     = d.schema_info or {}
    if isinstance(schema, dict):
        schema["__excluded_flat__"] = excluded
        if isinstance(manual_pii, dict) and manual_pii:
            schema["__manual_pii__"] = manual_pii
            for col, info in manual_pii.items():
                if col in schema and isinstance(schema[col], dict):
                    schema[col]["pii"] = {
                        "is_pii": True,
                        "category": info.get("category"),
                        "severity": info.get("severity"),
                        "confidence": "manual",
                    }
        if schema.get("__live__") and schema.get("__tables__"):
            excl_map = {}
            for table in schema["__tables__"]:
                table_cols = list(schema.get(table, {}).keys())
                excl_map[table] = [c for c in excluded if c in table_cols]
                if isinstance(manual_pii, dict):
                    for col, info in manual_pii.items():
                        if col in schema.get(table, {}) and isinstance(schema[table][col], dict):
                            schema[table][col]["pii"] = {
                                "is_pii": True,
                                "category": info.get("category"),
                                "severity": info.get("severity"),
                                "confidence": "manual",
                            }
            schema["__excluded__"] = excl_map
    d.schema_info = schema
    db.commit()
    log_event(db, A.PII_CONFIG, user=user, resource_type="dataset",
              resource_id=dataset_id, resource_name=d.name,
              details={"excluded_count": len(excluded), "manual_pii_cols": list(manual_pii.keys()) if manual_pii else []})
    return {"ok": True, "excluded": excluded}


# ── Connect Database — SINGLE TABLE ──────────────────────────────────────────

class DBTableRequest(BaseModel):
    name:           str
    db_type:        str
    host:           str
    port:           int
    database:       str
    username:       str
    password:       str
    table_or_query: str


@router.post("/connect-db-table")
def connect_database_table(req: DBTableRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    prefix   = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"

    test = test_db_connection(conn_str)
    if not test["success"]:
        raise HTTPException(status_code=400, detail=test["error"])

    try:
        df = load_from_db(conn_str, req.table_or_query)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    dataset_id   = str(uuid.uuid4())
    parquet_path = save_as_parquet(df, dataset_id)

    d = Dataset(
        id                = dataset_id,
        organization_id   = user.organization_id,
        name              = req.name,
        source_type       = req.db_type,
        connection_string = conn_str,
        table_or_query    = req.table_or_query,
        file_path         = parquet_path,
        row_count         = len(df),
        schema_info       = get_schema_info(df),
        sample_data       = get_sample_data(df),
    )
    db.add(d)
    db.commit()
    return _serialise(d)


# ── Gmail connector ────────────────────────────────────────────────────────────

class GmailConnectRequest(BaseModel):
    name:         str
    access_token: str
    gmail_email:  str
    max_emails:   int = 200
    label:        str = "INBOX"
    query:        str = ""


@router.post("/connect-gmail")
async def connect_gmail(
    req:  GmailConnectRequest,
    db:   Session = Depends(get_db),
    user: User    = Depends(require_brain_access),
):
    """Fetch emails via Gmail API and store as a parquet dataset."""
    import httpx
    import pandas as pd

    hdrs = {"Authorization": f"Bearer {req.access_token}"}

    parts = []
    if req.label and req.label.upper() != "ALL":
        parts.append(f"label:{req.label}")
    if req.query.strip():
        parts.append(req.query.strip())
    search_q = " ".join(parts)

    async with httpx.AsyncClient(timeout=30) as client:
        list_resp = await client.get(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages",
            headers=hdrs,
            params={"maxResults": min(req.max_emails, 500), "q": search_q},
        )
        if list_resp.status_code == 401:
            raise HTTPException(401, "Gmail token expired — please reconnect")
        if list_resp.status_code != 200:
            raise HTTPException(400, f"Gmail API error: {list_resp.text[:200]}")

        message_ids = [m["id"] for m in list_resp.json().get("messages", [])]
        if not message_ids:
            raise HTTPException(400, "No emails found matching your criteria")

        rows = []
        for msg_id in message_ids[: req.max_emails]:
            r = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}",
                headers=hdrs,
                params={"format": "metadata",
                        "metadataHeaders": ["From", "To", "Subject", "Date", "Cc"]},
            )
            if r.status_code != 200:
                continue
            msg  = r.json()
            mhdr = {h["name"]: h["value"] for h in msg.get("payload", {}).get("headers", [])}
            rows.append({
                "id":        msg_id,
                "thread_id": msg.get("threadId", ""),
                "date":      mhdr.get("Date", ""),
                "from":      mhdr.get("From", ""),
                "to":        mhdr.get("To", ""),
                "cc":        mhdr.get("Cc", ""),
                "subject":   mhdr.get("Subject", ""),
                "snippet":   msg.get("snippet", ""),
                "labels":    ", ".join(msg.get("labelIds", [])),
            })

    if not rows:
        raise HTTPException(400, "Could not fetch any email metadata")

    df           = pd.DataFrame(rows)
    dataset_id   = str(uuid.uuid4())
    parquet_path = save_as_parquet(df, dataset_id)

    ds = Dataset(
        id              = dataset_id,
        organization_id = user.organization_id,
        name            = req.name or f"Gmail — {req.gmail_email}",
        source_type     = "gmail",
        file_path       = parquet_path,
        row_count       = len(df),
        schema_info     = get_schema_info(df),
        sample_data     = get_sample_data(df),
    )
    db.add(ds)
    db.commit()
    return _serialise(ds)
