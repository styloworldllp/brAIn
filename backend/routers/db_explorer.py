"""
DB Explorer — browse tables, detect PII, run live SQL queries.
Databases are queried directly — NO data is downloaded to local files.
"""
import uuid
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

from db import get_db, Dataset, Base, engine as main_engine, User
from sqlalchemy import Column, String, DateTime, JSON as SA_JSON, Text, Integer, Boolean
from services.pii_detector import detect_pii_columns, get_pii_summary
from routers.auth import require_brain_access

router = APIRouter()


class LiveConnection(Base):
    __tablename__ = "live_connections"
    __table_args__ = {"extend_existing": True}
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id   = Column(String, nullable=True, index=True)
    name              = Column(String, nullable=False)
    db_type           = Column(String, nullable=False)
    connection_string = Column(String, nullable=False)
    selected_tables   = Column(SA_JSON, default=list)
    excluded_columns  = Column(SA_JSON, default=dict)
    table_schemas     = Column(SA_JSON, default=dict)
    pii_report        = Column(SA_JSON, default=dict)
    created_at        = Column(DateTime, default=datetime.utcnow)


Base.metadata.create_all(bind=main_engine)


def _make_engine(conn_str: str):
    return create_engine(conn_str, pool_pre_ping=True, pool_recycle=3600)


def _validate_identifier(name: str) -> str:
    """Reject identifiers that contain characters outside a safe set."""
    import re
    if not re.match(r'^[A-Za-z0-9_$\. ]+$', name):
        raise HTTPException(400, f"Unsafe identifier: {name!r}")
    return name


def _quote(dialect: str, name: str) -> str:
    _validate_identifier(name)
    return f"`{name}`" if dialect == "mysql" else f'"{name}"'


@router.get("/connections")
def list_connections(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    conns = db.query(LiveConnection).filter(
        LiveConnection.organization_id == user.organization_id,
    ).order_by(LiveConnection.created_at.desc()).all()
    return [_ser(c) for c in conns]


def _ser(c: LiveConnection) -> dict:
    return {
        "id": c.id, "name": c.name, "db_type": c.db_type,
        "selected_tables": c.selected_tables or [],
        "excluded_columns": c.excluded_columns or {},
        "pii_report": c.pii_report or {},
        "created_at": c.created_at.isoformat(),
    }


class ConnectRequest(BaseModel):
    name: str; db_type: str; host: str; port: int
    database: str; username: str; password: str


@router.post("/test")
def test_connection(req: ConnectRequest, _: User = Depends(require_brain_access)):
    prefix   = "postgresql" if req.db_type == "postgres" else "mysql+pymysql"
    conn_str = f"{prefix}://{req.username}:{req.password}@{req.host}:{req.port}/{req.database}"
    try:
        eng    = _make_engine(conn_str)
        insp   = inspect(eng)
        tables = insp.get_table_names()
        views  = insp.get_view_names()
        return {"success": True, "tables": tables, "views": views}
    except Exception:
        return {"success": False, "error": "Connection failed — check host, port, credentials and firewall rules"}


@router.get("/schema")
def get_table_schema(
    table: str,
    conn_id: Optional[str] = None,
    conn_str: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_brain_access),
):
    """
    Get schema for a single table.
    Pass conn_id for a saved connection (secure, for re-inspection).
    Pass conn_str only during the initial setup wizard before a connection is saved.
    """
    if conn_id:
        lc = db.query(LiveConnection).filter(
            LiveConnection.id == conn_id,
            LiveConnection.organization_id == user.organization_id,
        ).first()
        if not lc:
            raise HTTPException(404, "Connection not found")
        resolved_conn_str = lc.connection_string
    elif conn_str:
        # Only allow well-formed postgres/mysql URIs during setup wizard
        import re as _re
        if not _re.match(r'^(postgresql|mysql\+pymysql)://', conn_str):
            raise HTTPException(400, "Invalid connection string format")
        resolved_conn_str = conn_str
    else:
        raise HTTPException(400, "Provide conn_id or conn_str")
    try:
        import pandas as pd
        eng     = _make_engine(resolved_conn_str)
        insp    = inspect(eng)
        dialect = eng.dialect.name
        q       = _quote(dialect, table)

        # Get column info from SQLAlchemy inspector
        cols     = insp.get_columns(table)
        col_names = [c["name"] for c in cols]

        # Run PII detection on ALL column names
        pii_results = detect_pii_columns(col_names)

        # Get row count
        row_count = 0
        try:
            with eng.connect() as conn:
                row_count = conn.execute(text(f"SELECT COUNT(*) FROM {q}")).scalar() or 0
        except Exception:
            pass

        # Get 3 sample rows (masked if PII)
        sample = []
        try:
            with eng.connect() as conn:
                df = pd.read_sql(text(f"SELECT * FROM {q} LIMIT 3"), conn)
            for _, row in df.iterrows():
                row_dict = {}
                for col in df.columns:
                    val = row[col]
                    pii_info = pii_results.get(col, {})
                    if pii_info.get("is_pii") and pii_info.get("severity") in ("high", "medium"):
                        row_dict[col] = "***"
                    else:
                        try:
                            import json as _json
                            _json.dumps(val)
                            row_dict[col] = val
                        except Exception:
                            row_dict[col] = str(val)
                sample.append(row_dict)
        except Exception:
            pass

        # Build schema dict
        schema_cols = {}
        for col in cols:
            name = col["name"]
            schema_cols[name] = {
                "dtype":    str(col["type"]),
                "nullable": col.get("nullable", True),
                "pii":      pii_results.get(name, {"is_pii": False, "category": None, "severity": None, "confidence": "high"}),
            }

        return {
            "table":       table,
            "row_count":   row_count,
            "columns":     schema_cols,
            "pii_summary": get_pii_summary(pii_results),
            "sample":      sample,
        }
    except Exception:
        raise HTTPException(400, "Schema fetch failed")


class SaveConnectionRequest(BaseModel):
    name: str; db_type: str; conn_str: str
    selected_tables:  List[str]
    excluded_columns: Dict[str, List[str]]
    table_schemas:    dict
    pii_report:       dict


@router.post("/connections")
def save_connection(req: SaveConnectionRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    lc = LiveConnection(
        id=str(uuid.uuid4()), organization_id=user.organization_id,
        name=req.name, db_type=req.db_type,
        connection_string=req.conn_str, selected_tables=req.selected_tables,
        excluded_columns=req.excluded_columns, table_schemas=req.table_schemas,
        pii_report=req.pii_report,
    )
    db.add(lc); db.commit()

    ds = Dataset(
        id=lc.id, organization_id=user.organization_id,
        name=req.name, source_type=req.db_type,
        connection_string=req.conn_str, table_or_query="__live__", row_count=0,
        schema_info=_build_schema_info(req.table_schemas, req.excluded_columns, req.selected_tables),
        sample_data=[],
    )
    db.add(ds); db.commit()
    return {"id": lc.id, "dataset_id": ds.id}


def _build_schema_info(schemas: dict, excluded: dict, selected: list) -> dict:
    result = {"__tables__": selected, "__live__": True, "__excluded__": excluded}
    for table in selected:
        tschema = schemas.get(table, {}).get("columns", {})
        excl    = set(excluded.get(table, []))
        result[table] = {col: info for col, info in tschema.items() if col not in excl}
    return result


@router.patch("/connections/{conn_id}")
def update_connection(conn_id: str, req: SaveConnectionRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    lc = db.query(LiveConnection).filter(LiveConnection.id == conn_id, LiveConnection.organization_id == user.organization_id).first()
    if not lc: raise HTTPException(404, "Not found")
    lc.selected_tables = req.selected_tables
    lc.excluded_columns = req.excluded_columns
    lc.table_schemas = req.table_schemas
    lc.pii_report = req.pii_report
    ds = db.query(Dataset).filter(Dataset.id == conn_id).first()
    if ds:
        ds.schema_info = _build_schema_info(req.table_schemas, req.excluded_columns, req.selected_tables)
    db.commit()
    return {"ok": True}


@router.delete("/connections/{conn_id}")
def delete_connection(conn_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    lc = db.query(LiveConnection).filter(LiveConnection.id == conn_id, LiveConnection.organization_id == user.organization_id).first()
    if lc: db.delete(lc); db.commit()
    ds = db.query(Dataset).filter(Dataset.id == conn_id, Dataset.organization_id == user.organization_id).first()
    if ds: db.delete(ds); db.commit()
    return {"ok": True}


class RunSQLRequest(BaseModel):
    conn_id: str; sql: str; max_rows: int = 10000


@router.post("/run-sql")
def run_sql(req: RunSQLRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    lc = db.query(LiveConnection).filter(
        LiveConnection.id == req.conn_id,
        LiveConnection.organization_id == user.organization_id,
    ).first()
    if not lc:
        raise HTTPException(404, "Connection not found")
    import pandas as pd
    try:
        eng = _make_engine(lc.connection_string)
        with eng.connect() as conn:
            df = pd.read_sql(text(req.sql), conn)
        if len(df) > req.max_rows:
            df = df.head(req.max_rows)
        return {"success": True, "row_count": len(df), "columns": df.columns.tolist(), "data": df.head(100).to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(400, "SQL execution failed")


class DetectPIIRequest(BaseModel):
    columns: List[str]


@router.post("/detect-pii")
def detect_pii(req: DetectPIIRequest, _: User = Depends(require_brain_access)):
    results = detect_pii_columns(req.columns)
    return {"pii_results": results, "summary": get_pii_summary(results)}
