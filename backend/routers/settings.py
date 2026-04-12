from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from db import get_db, AppSettings

router = APIRouter()

DEFAULTS = {
    "provider":          "anthropic",
    "anthropic_model":   "claude-opus-4-6",
    "openai_model":      "gpt-4o",
    "anthropic_api_key": "",
    "openai_api_key":    "",
}


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
def read_settings(db: Session = Depends(get_db)):
    return {
        "provider":          get_setting(db, "provider"),
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
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db)):
    for key, val in body.model_dump(exclude_none=True).items():
        set_setting(db, key, val)
    return {"ok": True}


def load_chat_settings(db: Session) -> dict:
    """Return everything the chat endpoint needs."""
    return {
        "provider":  get_setting(db, "provider"),
        "api_key":   get_setting(db, "anthropic_api_key")
                     if get_setting(db, "provider") == "anthropic"
                     else get_setting(db, "openai_api_key"),
        "model":     get_setting(db, "anthropic_model")
                     if get_setting(db, "provider") == "anthropic"
                     else get_setting(db, "openai_model"),
    }
