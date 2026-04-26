"""
Audit log router.

Access:
  - super_admin / staff  → all logs across all orgs
  - admin                → their own org's logs only
  - user / viewer        → 403

Compliance:
  - No endpoints expose DELETE or UPDATE on audit records (21 CFR Part 11 immutability).
  - GDPR anonymisation replaces PII with a pseudonym; the log record is kept.
  - Integrity verification re-computes SHA-256 hashes so tampering is detectable.
"""
import csv
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db import get_db, AuditLog, User, Organization
from routers.auth import require_auth
from services.audit_logger import verify_record, anonymize_user_logs, log_event, A, _compute_hash

router = APIRouter()

PAGE_SIZE = 100


def _require_audit_access(db: Session = Depends(get_db), user: User = Depends(require_auth)) -> User:
    if user.role not in ("admin", "staff", "super_admin"):
        raise HTTPException(403, "Audit log access requires admin or higher role")
    return user


def _is_platform_scope(user: User) -> bool:
    """super_admin and staff see the whole platform; admins are org-scoped."""
    return user.role in ("super_admin", "staff")


def _assert_org_access(db: Session, user: User, target_user_id: str):
    """
    For admin callers, verify the target user belongs to the same org.
    Raises 403 if the target user is outside the admin's org.
    Platform-scope roles (staff/super_admin) are always allowed.
    """
    if _is_platform_scope(user):
        return
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target:
        raise HTTPException(404, "User not found")
    if target.organization_id != user.organization_id:
        raise HTTPException(403, "Access denied — user belongs to a different organisation")


def _build_query(db: Session, user: User, **filters):
    q = db.query(AuditLog)

    # Org scoping — admins see only their own org; staff/super_admin see everything
    if not _is_platform_scope(user):
        q = q.filter(AuditLog.organization_id == user.organization_id)

    if filters.get("category"):
        q = q.filter(AuditLog.category == filters["category"])
    if filters.get("action"):
        q = q.filter(AuditLog.action == filters["action"])
    if filters.get("status"):
        q = q.filter(AuditLog.status == filters["status"])
    if filters.get("user_id"):
        q = q.filter(AuditLog.user_id == filters["user_id"])
    if filters.get("resource_type"):
        q = q.filter(AuditLog.resource_type == filters["resource_type"])
    if filters.get("date_from"):
        q = q.filter(AuditLog.timestamp >= filters["date_from"])
    if filters.get("date_to"):
        q = q.filter(AuditLog.timestamp <= filters["date_to"])
    if filters.get("search"):
        like = f"%{filters['search']}%"
        q = q.filter(
            AuditLog.username.ilike(like) |
            AuditLog.action.ilike(like) |
            AuditLog.resource_name.ilike(like)
        )

    return q.order_by(AuditLog.timestamp.desc())


def _serialise(r: AuditLog) -> dict:
    return {
        "id":              r.id,
        "timestamp":       r.timestamp.isoformat(),
        "user_id":         r.user_id,
        "username":        r.username,
        "user_role":       r.user_role,
        "organization_id": r.organization_id,
        "ip_address":      r.ip_address,
        "action":          r.action,
        "category":        r.category,
        "resource_type":   r.resource_type,
        "resource_id":     r.resource_id,
        "resource_name":   r.resource_name,
        "details":         r.details,
        "status":          r.status,
        "anonymized":      r.anonymized,
        "integrity_ok":    verify_record(r),
    }


# ── List logs ──────────────────────────────────────────────────────────────────

@router.get("/logs")
def list_logs(
    category:      Optional[str] = None,
    action:        Optional[str] = None,
    status:        Optional[str] = None,
    user_id:       Optional[str] = None,
    resource_type: Optional[str] = None,
    date_from:     Optional[str] = None,
    date_to:       Optional[str] = None,
    search:        Optional[str] = None,
    page:          int = Query(1, ge=1),
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    dt_from = datetime.fromisoformat(date_from) if date_from else None
    dt_to   = (datetime.fromisoformat(date_to) + timedelta(days=1)) if date_to else None

    q     = _build_query(db, user, category=category, action=action, status=status,
                          user_id=user_id, resource_type=resource_type,
                          date_from=dt_from, date_to=dt_to, search=search)
    total = q.count()
    rows  = q.offset((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).all()

    return {
        "total": total,
        "page":  page,
        "pages": (total + PAGE_SIZE - 1) // PAGE_SIZE,
        "logs":  [_serialise(r) for r in rows],
    }


# ── Summary / stats ────────────────────────────────────────────────────────────

@router.get("/summary")
def summary(
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    q_all = db.query(AuditLog)
    platform = _is_platform_scope(user)
    if not platform:
        q_all = q_all.filter(AuditLog.organization_id == user.organization_id)

    total         = q_all.count()
    today_count   = q_all.filter(AuditLog.timestamp >= today).count()
    failure_count = q_all.filter(AuditLog.status == "failure").count()

    week_ago = datetime.utcnow() - timedelta(days=7)
    recent   = q_all.filter(AuditLog.timestamp >= week_ago).all()
    cats: dict[str, int] = {}
    for r in recent:
        cats[r.category] = cats.get(r.category, 0) + 1

    # Resolve org name for scoped admins
    org_name = None
    if not platform and user.organization_id:
        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        org_name = org.name if org else None

    return {
        "total_events":        total,
        "today_events":        today_count,
        "failure_events":      failure_count,
        "category_breakdown":  cats,
        "scope":               "platform" if platform else "organization",
        "organization_id":     user.organization_id if not platform else None,
        "organization_name":   org_name,
    }


# ── Export CSV ─────────────────────────────────────────────────────────────────

@router.get("/export.csv")
def export_csv(
    category:      Optional[str] = None,
    action:        Optional[str] = None,
    status:        Optional[str] = None,
    date_from:     Optional[str] = None,
    date_to:       Optional[str] = None,
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    dt_from = datetime.fromisoformat(date_from) if date_from else None
    dt_to   = (datetime.fromisoformat(date_to) + timedelta(days=1)) if date_to else None

    rows = _build_query(db, user, category=category, action=action, status=status,
                        date_from=dt_from, date_to=dt_to).limit(100_000).all()

    log_event(db, A.AUDIT_EXPORT, user=user, details={"rows": len(rows)})

    buf = io.StringIO()
    w   = csv.writer(buf)
    w.writerow(["timestamp","user_id","username","role","org_id","ip","action",
                "category","resource_type","resource_id","resource_name","status",
                "details","integrity_ok","anonymized"])
    for r in rows:
        w.writerow([
            r.timestamp.isoformat(), r.user_id, r.username, r.user_role,
            r.organization_id, r.ip_address, r.action, r.category,
            r.resource_type, r.resource_id, r.resource_name, r.status,
            str(r.details or {}), verify_record(r), r.anonymized,
        ])

    buf.seek(0)
    filename = f"audit_log_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Integrity verification ─────────────────────────────────────────────────────

@router.get("/verify")
def verify_integrity(
    limit: int = Query(1000, le=10000),
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    """
    Re-compute SHA-256 hash for each record and report tampered ones.
    21 CFR Part 11 compliance check.
    """
    q = db.query(AuditLog)
    if not _is_platform_scope(user):
        q = q.filter(AuditLog.organization_id == user.organization_id)
    records = q.order_by(AuditLog.timestamp.desc()).limit(limit).all()

    tampered = []
    ok_count = 0
    for r in records:
        if verify_record(r):
            ok_count += 1
        else:
            tampered.append({"id": r.id, "timestamp": r.timestamp.isoformat(), "action": r.action})

    log_event(db, A.INTEGRITY_CHECK, user=user,
              details={"checked": len(records), "tampered": len(tampered)})

    return {
        "checked":  len(records),
        "ok":       ok_count,
        "tampered": tampered,
        "passed":   len(tampered) == 0,
    }


# ── GDPR — data subject access ─────────────────────────────────────────────────

@router.get("/gdpr/user/{target_user_id}")
def gdpr_user_export(
    target_user_id: str,
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    """
    GDPR Article 15 — Subject Access Request.
    Admin: only users within their own organisation.
    Staff / super_admin: any user on the platform.
    """
    _assert_org_access(db, user, target_user_id)

    q = db.query(AuditLog).filter(AuditLog.user_id == target_user_id)
    if not _is_platform_scope(user):
        q = q.filter(AuditLog.organization_id == user.organization_id)
    records = q.order_by(AuditLog.timestamp.asc()).all()

    log_event(db, A.AUDIT_EXPORT, user=user,
              resource_type="user", resource_id=target_user_id,
              details={"gdpr_sar": True, "records": len(records)})

    return {"user_id": target_user_id, "records": [_serialise(r) for r in records]}


class GdprAnonymizeBody(BaseModel):
    user_id: str


@router.post("/gdpr/anonymize")
def gdpr_anonymize(
    body: GdprAnonymizeBody,
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    """
    GDPR Article 17 — Right to Erasure (pseudonymisation).
    Admin: can only anonymize users within their own organisation.
    Staff / super_admin: any user on the platform.
    PII fields (username, IP) are replaced with a stable pseudonym.
    Audit records themselves are retained for regulatory obligations.
    """
    import hashlib
    _assert_org_access(db, user, body.user_id)

    pseudonym = "ERASED_" + hashlib.sha256(body.user_id.encode()).hexdigest()[:12]

    # For org-scoped admins, only anonymize records within their org
    from services.audit_logger import _compute_hash
    from db import AuditLog as AL
    import json as _json
    if not _is_platform_scope(user):
        import json as _json
        records = db.query(AL).filter(
            AL.user_id == body.user_id,
            AL.organization_id == user.organization_id,
            AL.anonymized == False,
        ).all()
        count = 0
        for r in records:
            r.username   = pseudonym
            r.ip_address = None
            r.user_agent = None
            r.anonymized = True
            details_str  = _json.dumps(r.details or {}, default=str)
            r.integrity_hash = _compute_hash(
                str(r.id), r.timestamp.isoformat(), str(r.user_id),
                r.action, r.resource_type or "", r.resource_id or "", details_str,
            )
            count += 1
        db.commit()
    else:
        count = anonymize_user_logs(db, body.user_id, pseudonym)

    log_event(db, A.GDPR_ANONYMIZE, user=user,
              resource_type="user", resource_id=body.user_id,
              details={"records_anonymized": count, "pseudonym": pseudonym,
                       "scope": "platform" if _is_platform_scope(user) else "organization"})

    return {"ok": True, "records_anonymized": count, "pseudonym": pseudonym}


# ── Filter options (for UI dropdowns) ─────────────────────────────────────────

@router.get("/meta")
def audit_meta(
    db:   Session = Depends(get_db),
    user: User    = Depends(_require_audit_access),
):
    """Return distinct categories and actions available for filter dropdowns."""
    q = db.query(AuditLog)
    if not _is_platform_scope(user):
        q = q.filter(AuditLog.organization_id == user.organization_id)

    cats    = [r[0] for r in q.with_entities(AuditLog.category).distinct().all() if r[0]]
    actions = [r[0] for r in q.with_entities(AuditLog.action).distinct().all() if r[0]]
    return {"categories": sorted(cats), "actions": sorted(actions)}
