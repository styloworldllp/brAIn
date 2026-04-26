import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db import get_db, AppSettings, SecretKey, User
from routers.auth import require_admin

router = APIRouter()

DEFAULTS = {
    "provider":          "anthropic",
    "anthropic_model":   "claude-sonnet-4-6",
    "openai_model":      "gpt-4o",
    "anthropic_api_key": "",
    "openai_api_key":    "",
}


# ── Optional encryption for stored secrets ────────────────────────────────────
import logging
_log = logging.getLogger(__name__)
_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet
    try:
        from cryptography.fernet import Fernet
        key = os.getenv("ENCRYPTION_KEY", "")
        if key:
            _fernet = Fernet(key.encode())
            return _fernet
    except ImportError:
        pass
    _log.warning(
        "ENCRYPTION_KEY not set — API keys stored as plaintext. "
        "Set ENCRYPTION_KEY in .env to enable encryption."
    )
    return None


def _encrypt(value: str) -> str:
    f = _get_fernet()
    return f.encrypt(value.encode()).decode() if f else value


def _decrypt(value: str) -> str:
    f = _get_fernet()
    if f:
        try:
            return f.decrypt(value.encode()).decode()
        except Exception:
            return value  # legacy plaintext fallback
    return value


def normalize_provider(value: str) -> str:
    return value if value in ("anthropic", "openai", "neurix") else "anthropic"


def get_setting(db: Session, key: str, org_id: Optional[str] = None) -> str:
    row = db.query(AppSettings).filter(
        AppSettings.key == key,
        AppSettings.organization_id == org_id,
    ).first()
    if not row:
        return DEFAULTS.get(key, "")
    if key in ("anthropic_api_key", "openai_api_key"):
        return _decrypt(row.value)
    return row.value


def set_setting(db: Session, key: str, value: str, org_id: Optional[str] = None):
    stored = _encrypt(value) if key in ("anthropic_api_key", "openai_api_key") else value
    row = db.query(AppSettings).filter(
        AppSettings.key == key,
        AppSettings.organization_id == org_id,
    ).first()
    if row:
        row.value = stored
    else:
        db.add(AppSettings(key=key, value=stored, organization_id=org_id))
    db.commit()


@router.get("/")
def read_settings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    org_id   = admin.organization_id
    provider = normalize_provider(get_setting(db, "provider", org_id))
    return {
        "provider":          provider,
        "anthropic_model":   get_setting(db, "anthropic_model",   org_id),
        "openai_model":      get_setting(db, "openai_model",       org_id),
        "has_anthropic_key": bool(get_setting(db, "anthropic_api_key", org_id)),
        "has_openai_key":    bool(get_setting(db, "openai_api_key",    org_id)),
    }


class SettingsUpdate(BaseModel):
    provider:          Optional[str] = None
    anthropic_model:   Optional[str] = None
    openai_model:      Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key:    Optional[str] = None


@router.post("/")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if body.provider is not None and body.provider not in ("anthropic", "openai", "neurix"):
        raise HTTPException(400, "Unsupported provider")
    org_id = admin.organization_id
    for key, val in body.model_dump(exclude_none=True).items():
        set_setting(db, key, val, org_id)
    return {"ok": True}


def load_neurix_settings(db: Session) -> dict:
    """
    Global Neurix (intent engine) settings — set by super admin, org_id = None.
    Falls back to the fast model of the configured provider if not set separately.
    """
    provider = get_setting(db, "neurix_provider", None) or "anthropic"
    model    = get_setting(db, "neurix_model",    None) or (
        "claude-haiku-4-5-20251001" if provider == "anthropic" else "gpt-4o-mini"
    )
    api_key  = _decrypt(get_setting(db, "neurix_api_key", None) or "")
    return {"provider": provider, "model": model, "api_key": api_key}


def load_chat_settings(db: Session, org_id: Optional[str] = None) -> dict:
    """Return everything the chat endpoint needs for a given org."""
    provider = normalize_provider(get_setting(db, "provider", org_id))
    if provider == "neurix":
        return {"provider": "neurix", "api_key": "", "model": ""}
    return {
        "provider": provider,
        "api_key":  get_setting(db, "anthropic_api_key", org_id) if provider == "anthropic"
                    else get_setting(db, "openai_api_key", org_id),
        "model":    get_setting(db, "anthropic_model", org_id)   if provider == "anthropic"
                    else get_setting(db, "openai_model", org_id),
    }


# ── Secret key vault (per-org) ────────────────────────────────────────────────

@router.get("/secrets")
def list_secrets(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    rows = db.query(SecretKey).filter(
        SecretKey.organization_id == admin.organization_id,
    ).order_by(SecretKey.created_at.desc()).all()
    return [{"id": r.id, "name": r.name, "created_at": str(r.created_at), "has_value": bool(r.value)} for r in rows]


class SecretRequest(BaseModel):
    name:  str
    value: str


@router.post("/secrets")
def add_secret(req: SecretRequest, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    name = req.name.strip()
    if not name:
        raise HTTPException(400, "Secret name is required")
    encrypted_val = _encrypt(req.value)
    existing = db.query(SecretKey).filter(
        SecretKey.name == name,
        SecretKey.organization_id == admin.organization_id,
    ).first()
    if existing:
        existing.value = encrypted_val
        db.commit()
        db.refresh(existing)
        return {"id": existing.id, "name": existing.name, "created_at": str(existing.created_at), "has_value": True}
    s = SecretKey(name=name, value=encrypted_val, organization_id=admin.organization_id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "created_at": str(s.created_at), "has_value": True}


@router.delete("/secrets/{secret_id}")
def delete_secret(secret_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    s = db.query(SecretKey).filter(
        SecretKey.id == secret_id,
        SecretKey.organization_id == admin.organization_id,
    ).first()
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}
