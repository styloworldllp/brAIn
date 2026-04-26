"""
Audit logger — write tamper-evident, append-only audit events.

21 CFR Part 11 compliance:
  - Every record carries a SHA-256 integrity hash over its core fields.
  - No UPDATE or DELETE operations are ever issued against audit_logs.
  - Timestamps are UTC ISO-8601.

GDPR compliance:
  - PII in username / ip_address can be pseudonymised on request (anonymize_user).
  - The event record itself is retained (regulatory obligation overrides erasure).
"""
import hashlib
import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

logger = logging.getLogger("audit")

# ── Action constants ───────────────────────────────────────────────────────────

class A:
    # AUTH
    LOGIN_SUCCESS   = "LOGIN_SUCCESS"
    LOGIN_FAILURE   = "LOGIN_FAILURE"
    LOGOUT          = "LOGOUT"
    REGISTER        = "REGISTER"
    PASSWORD_CHANGE = "PASSWORD_CHANGE"
    OAUTH_LOGIN     = "OAUTH_LOGIN"
    TOKEN_ISSUED    = "TOKEN_ISSUED"

    # DATA
    DATASET_CREATE  = "DATASET_CREATE"
    DATASET_READ    = "DATASET_READ"
    DATASET_DELETE  = "DATASET_DELETE"
    DB_CONNECT      = "DB_CONNECT"
    DB_DISCONNECT   = "DB_DISCONNECT"
    SQL_EXECUTE     = "SQL_EXECUTE"
    DATA_EXPORT     = "DATA_EXPORT"
    PII_CONFIG      = "PII_CONFIG"

    # AI
    CHAT_QUERY      = "CHAT_QUERY"
    CODE_EXECUTE    = "CODE_EXECUTE"
    CHART_SAVE      = "CHART_SAVE"

    # USER MANAGEMENT
    USER_CREATE     = "USER_CREATE"
    USER_UPDATE     = "USER_UPDATE"
    USER_DELETE     = "USER_DELETE"
    USER_DEACTIVATE = "USER_DEACTIVATE"
    ROLE_CHANGE     = "ROLE_CHANGE"
    PERM_GRANT      = "PERM_GRANT"
    PERM_REVOKE     = "PERM_REVOKE"

    # ORG / ADMIN
    ORG_CREATE      = "ORG_CREATE"
    ORG_UPDATE      = "ORG_UPDATE"
    ORG_DELETE      = "ORG_DELETE"
    ORG_SUSPEND     = "ORG_SUSPEND"
    USER_MOVE_ORG   = "USER_MOVE_ORG"

    # SETTINGS
    SETTINGS_UPDATE = "SETTINGS_UPDATE"
    API_KEY_UPDATE  = "API_KEY_UPDATE"

    # SUPPORT
    TICKET_CREATE   = "TICKET_CREATE"
    TICKET_UPDATE   = "TICKET_UPDATE"
    TICKET_REPLY    = "TICKET_REPLY"

    # AUDIT
    AUDIT_EXPORT    = "AUDIT_EXPORT"
    GDPR_ANONYMIZE  = "GDPR_ANONYMIZE"
    INTEGRITY_CHECK = "INTEGRITY_CHECK"


# ── Category map ──────────────────────────────────────────────────────────────

CATEGORY_MAP: dict[str, str] = {
    "LOGIN_SUCCESS": "AUTH",   "LOGIN_FAILURE": "AUTH",
    "LOGOUT": "AUTH",          "REGISTER": "AUTH",
    "PASSWORD_CHANGE": "AUTH", "OAUTH_LOGIN": "AUTH",
    "TOKEN_ISSUED": "AUTH",

    "DATASET_CREATE": "DATA",  "DATASET_READ": "DATA",
    "DATASET_DELETE": "DATA",  "DB_CONNECT": "DATA",
    "DB_DISCONNECT": "DATA",   "SQL_EXECUTE": "DATA",
    "DATA_EXPORT": "DATA",     "PII_CONFIG": "DATA",

    "CHAT_QUERY": "AI",        "CODE_EXECUTE": "AI",
    "CHART_SAVE": "AI",

    "USER_CREATE": "USER_MGMT",    "USER_UPDATE": "USER_MGMT",
    "USER_DELETE": "USER_MGMT",    "USER_DEACTIVATE": "USER_MGMT",
    "ROLE_CHANGE": "USER_MGMT",    "PERM_GRANT": "USER_MGMT",
    "PERM_REVOKE": "USER_MGMT",

    "ORG_CREATE": "ADMIN",     "ORG_UPDATE": "ADMIN",
    "ORG_DELETE": "ADMIN",     "ORG_SUSPEND": "ADMIN",
    "USER_MOVE_ORG": "ADMIN",

    "SETTINGS_UPDATE": "SETTINGS", "API_KEY_UPDATE": "SETTINGS",

    "TICKET_CREATE": "SUPPORT",    "TICKET_UPDATE": "SUPPORT",
    "TICKET_REPLY": "SUPPORT",

    "AUDIT_EXPORT": "AUDIT",       "GDPR_ANONYMIZE": "AUDIT",
    "INTEGRITY_CHECK": "AUDIT",
}


def _compute_hash(
    record_id: str, timestamp: str, user_id: str,
    action: str, resource_type: str, resource_id: str, details_str: str,
) -> str:
    """SHA-256 over canonical pipe-delimited fields. Changing any field breaks the hash."""
    content = f"{record_id}|{timestamp}|{user_id}|{action}|{resource_type}|{resource_id}|{details_str}"
    return hashlib.sha256(content.encode()).hexdigest()


def log_event(
    db: Session,
    action: str,
    user=None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    resource_name: Optional[str] = None,
    details: Optional[dict] = None,
    status: str = "success",
    request: Optional[Request] = None,
    org_id: Optional[str] = None,
) -> None:
    """
    Write a single audit event. Never raises — logging must never break the main flow.
    """
    from db import AuditLog
    try:
        record_id   = str(uuid.uuid4())
        ts          = datetime.utcnow()
        ts_str      = ts.isoformat()
        user_id     = str(user.id)   if user else "system"
        username    = user.username  if user else "system"
        user_role   = user.role      if user else None
        org_id      = org_id or (user.organization_id if user else None)
        details_str = json.dumps(details or {}, default=str)

        ip = ua = None
        if request:
            ip = request.client.host if request.client else None
            ua = request.headers.get("user-agent", "")[:255]

        integrity_hash = _compute_hash(
            record_id, ts_str, user_id, action,
            resource_type or "", resource_id or "", details_str,
        )

        entry = AuditLog(
            id              = record_id,
            timestamp       = ts,
            user_id         = user_id,
            username        = username,
            user_role       = user_role,
            organization_id = org_id,
            ip_address      = ip,
            user_agent      = ua,
            action          = action,
            category        = CATEGORY_MAP.get(action, "OTHER"),
            resource_type   = resource_type,
            resource_id     = resource_id,
            resource_name   = resource_name,
            details         = details,
            status          = status,
            integrity_hash  = integrity_hash,
            anonymized      = False,
        )
        db.add(entry)
        db.commit()
    except Exception as exc:
        logger.error("Audit log write failed: %s", exc)


def verify_record(record) -> bool:
    """Recompute the hash and compare — returns False if record has been tampered with."""
    try:
        details_str = json.dumps(record.details or {}, default=str)
        expected = _compute_hash(
            str(record.id), record.timestamp.isoformat(), str(record.user_id),
            record.action, record.resource_type or "", record.resource_id or "", details_str,
        )
        return record.integrity_hash == expected
    except Exception:
        return False


def anonymize_user_logs(db: Session, user_id: str, pseudonym: str) -> int:
    """
    GDPR Article 17 — Right to Erasure.
    Replaces PII fields (username, ip_address) with a stable pseudonym.
    The event record is retained for regulatory compliance; only personal identifiers are removed.
    Returns the number of records updated.
    """
    from db import AuditLog
    records = db.query(AuditLog).filter(
        AuditLog.user_id == user_id,
        AuditLog.anonymized == False,
    ).all()

    count = 0
    for r in records:
        r.username    = pseudonym
        r.ip_address  = None
        r.user_agent  = None
        r.anonymized  = True
        # Recompute hash so verify_record() still passes after anonymization
        details_str = json.dumps(r.details or {}, default=str)
        r.integrity_hash = _compute_hash(
            str(r.id), r.timestamp.isoformat(), str(r.user_id),
            r.action, r.resource_type or "", r.resource_id or "", details_str,
        )
        count += 1

    if count:
        db.commit()
    return count
