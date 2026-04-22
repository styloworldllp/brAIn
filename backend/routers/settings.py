from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db import get_db, AppSettings, User
from routers.auth import require_admin

router = APIRouter()

DEFAULTS = {
    "provider":          "anthropic",
    "anthropic_model":   "claude-opus-4-6",
    "openai_model":      "gpt-4o",
    "anthropic_api_key": "",
    "openai_api_key":    "",
}


def normalize_provider(value: str) -> str:
    return value if value in ("anthropic", "openai") else "anthropic"


def get_setting(db: Session, key: str) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row else DEFAULTS.get(key, "")


def set_setting(db: Session, key: str, value: str):
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AppSettings(key=key, value=value))
    db.commit()


@router.get("/")
def read_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    provider = normalize_provider(get_setting(db, "provider"))
    return {
        "provider":          provider,
        "anthropic_model":   get_setting(db, "anthropic_model"),
        "openai_model":      get_setting(db, "openai_model"),
        "has_anthropic_key": bool(get_setting(db, "anthropic_api_key")),
        "has_openai_key":    bool(get_setting(db, "openai_api_key")),
    }


class SettingsUpdate(BaseModel):
    provider:          Optional[str] = None
    anthropic_model:   Optional[str] = None
    openai_model:      Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key:    Optional[str] = None


@router.post("/")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if body.provider is not None and body.provider not in ("anthropic", "openai"):
        raise HTTPException(400, "Unsupported provider")
    for key, val in body.model_dump(exclude_none=True).items():
        set_setting(db, key, val)
    return {"ok": True}


def load_chat_settings(db: Session) -> dict:
    """Return everything the chat endpoint needs."""
    provider = normalize_provider(get_setting(db, "provider"))
    return {
        "provider":  provider,
        "api_key":   get_setting(db, "anthropic_api_key")
                     if provider == "anthropic"
                     else get_setting(db, "openai_api_key"),
        "model":     get_setting(db, "anthropic_model")
                     if provider == "anthropic"
                     else get_setting(db, "openai_model"),
    }


# ── Secret key vault ──────────────────────────────────────────────────────────

import uuid as _uuid
from sqlalchemy import Column, String, DateTime as _DT
from db import Base as _Base, engine as _engine
from datetime import datetime as _dt

class SecretKey(_Base):
    __tablename__ = "secret_keys"
    id         = Column(String, primary_key=True, default=lambda: str(_uuid.uuid4()))
    name       = Column(String, nullable=False, unique=True)
    value      = Column(String, nullable=False)
    created_at = Column(_DT, default=_dt.utcnow)

_Base.metadata.create_all(bind=_engine)


@router.get("/secrets")
def list_secrets(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from sqlalchemy import text
    try:
        secrets = db.execute(text("SELECT id, name, value, created_at FROM secret_keys ORDER BY created_at DESC")).fetchall()
        return [{"id": s[0], "name": s[1], "created_at": str(s[3]), "has_value": bool(s[2])} for s in secrets]
    except Exception:
        return []


class SecretRequest(BaseModel):
    name:  str
    value: str


@router.post("/secrets")
def add_secret(req: SecretRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Secret name is required")
    existing = db.query(SecretKey).filter(SecretKey.name == name).first()
    if existing:
        existing.value = req.value
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "name": existing.name, "created_at": str(existing.created_at), "has_value": True}
    s = SecretKey(name=name, value=req.value)
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "created_at": str(s.created_at), "has_value": True}


@router.delete("/secrets/{secret_id}")
def delete_secret(secret_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    s = db.query(SecretKey).filter(SecretKey.id == secret_id).first()
    if s:
        db.delete(s); db.commit()
    return {"ok": True}
