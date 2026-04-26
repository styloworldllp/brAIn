"""
Super Admin router — Stylo internal control plane for managing brAIn customers.
Only users with role="super_admin" can access these routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional
import re, uuid
from datetime import datetime

from db import get_db, Organization, User, Dataset, Conversation, Message, SavedChart, Schedule
from routers.auth import require_super_admin, require_staff_access, user_to_dict, hash_password

router = APIRouter()


# ── Helpers ────────────────────────────────────────────────────────────────────

def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def org_to_dict(org: Organization, db: Session) -> dict:
    user_count    = db.query(User).filter(User.organization_id == org.id).count()
    dataset_count = db.query(Dataset).filter(Dataset.organization_id == org.id).count()
    return {
        "id":            org.id,
        "name":          org.name,
        "slug":          org.slug,
        "plan":          org.plan,
        "status":        org.status,
        "contact_email": org.contact_email,
        "query_limit":   org.query_limit,
        "notes":         org.notes,
        "user_count":    user_count,
        "dataset_count": dataset_count,
        "created_at":    org.created_at.isoformat() if org.created_at else None,
    }


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class CreateOrgBody(BaseModel):
    name:          str
    contact_email: Optional[str] = None
    plan:          str = "trial"
    query_limit:   int = 500
    notes:         Optional[str] = None

class UpdateOrgBody(BaseModel):
    name:          Optional[str] = None
    contact_email: Optional[str] = None
    plan:          Optional[str] = None
    status:        Optional[str] = None
    query_limit:   Optional[int] = None
    notes:         Optional[str] = None

class CreateOrgUserBody(BaseModel):
    email:    str
    username: str
    password: str
    role:     str = "admin"


# ── Global stats ───────────────────────────────────────────────────────────────

@router.get("/stats")
def global_stats(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    total_orgs      = db.query(Organization).count()
    active_orgs     = db.query(Organization).filter(Organization.status == "active").count()
    trial_orgs      = db.query(Organization).filter(Organization.status == "trial").count()
    total_users     = db.query(User).filter(User.role != "super_admin").count()
    active_users    = db.query(User).filter(User.is_active == True, User.role != "super_admin").count()
    total_datasets  = db.query(Dataset).count()
    total_convs     = db.query(Conversation).count()
    total_messages  = db.query(Message).filter(Message.role == "user").count()
    total_charts    = db.query(SavedChart).count()
    return {
        "total_orgs":     total_orgs,
        "active_orgs":    active_orgs,
        "trial_orgs":     trial_orgs,
        "total_users":    total_users,
        "active_users":   active_users,
        "total_datasets": total_datasets,
        "total_convs":    total_convs,
        "total_queries":  total_messages,
        "total_charts":   total_charts,
    }


# ── Organizations ──────────────────────────────────────────────────────────────

@router.get("/orgs")
def list_orgs(db: Session = Depends(get_db), _: User = Depends(require_staff_access)):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    return [org_to_dict(o, db) for o in orgs]


@router.get("/organizations")
def list_orgs_alias(db: Session = Depends(get_db), _: User = Depends(require_staff_access)):
    """Alias used by the staff page frontend."""
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    return [org_to_dict(o, db) for o in orgs]


@router.post("/orgs")
def create_org(body: CreateOrgBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    slug = slugify(body.name)
    # ensure unique slug
    base, n = slug, 1
    while db.query(Organization).filter(Organization.slug == slug).first():
        slug = f"{base}-{n}"; n += 1

    org = Organization(
        name=body.name, slug=slug, plan=body.plan,
        status="trial" if body.plan == "trial" else "active",
        contact_email=body.contact_email,
        query_limit=body.query_limit, notes=body.notes,
    )
    db.add(org); db.commit(); db.refresh(org)
    return org_to_dict(org, db)


@router.patch("/orgs/{org_id}")
def update_org(org_id: str, body: UpdateOrgBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.name    is not None: org.name          = body.name
    if body.plan    is not None: org.plan           = body.plan
    if body.status  is not None: org.status         = body.status
    if body.contact_email is not None: org.contact_email = body.contact_email
    if body.query_limit   is not None: org.query_limit   = body.query_limit
    if body.notes   is not None: org.notes          = body.notes
    db.commit(); db.refresh(org)
    return org_to_dict(org, db)


@router.delete("/orgs/{org_id}")
def delete_org(org_id: str, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    # Stop APScheduler jobs for all active schedules in this org
    from routers.schedules import _remove_job
    active_schedules = db.query(Schedule).filter(Schedule.organization_id == org_id).all()
    for s in active_schedules:
        _remove_job(s.id)
    # Orphan/remove all org-scoped data rather than hard-deleting users
    db.query(Schedule).filter(Schedule.organization_id == org_id).delete()
    db.query(SavedChart).filter(SavedChart.organization_id == org_id).delete()
    db.query(Conversation).filter(Conversation.organization_id == org_id).update({"organization_id": None})
    db.query(Dataset).filter(Dataset.organization_id == org_id).update({"organization_id": None})
    db.query(User).filter(User.organization_id == org_id).update({"organization_id": None})
    db.delete(org); db.commit()
    return {"ok": True}


# ── Org users ──────────────────────────────────────────────────────────────────

@router.get("/orgs/{org_id}/users")
def list_org_users(org_id: str, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    users = db.query(User).filter(User.organization_id == org_id).order_by(User.created_at).all()
    return [user_to_dict(u) for u in users]


@router.post("/orgs/{org_id}/users")
def create_org_user(org_id: str, body: CreateOrgUserBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organization not found")
    if body.role not in ("admin", "user", "viewer"):
        raise HTTPException(400, "Invalid role")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(400, "Username taken")
    user = User(
        email=body.email, username=body.username,
        hashed_password=hash_password(body.password),
        role=body.role, organization_id=org_id,
    )
    db.add(user); db.commit(); db.refresh(user)
    return user_to_dict(user)


class MoveUserBody(BaseModel):
    org_id: Optional[str] = None


@router.patch("/users/{user_id}/org")
def move_user_to_org(user_id: str, body: MoveUserBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(400, "Super admin users cannot be assigned to a customer org")
    if body.org_id:
        org = db.query(Organization).filter(Organization.id == body.org_id).first()
        if not org:
            raise HTTPException(404, "Organization not found")
    old_org_id = user.organization_id
    user.organization_id = body.org_id
    # Reassign datasets that belong to the user's old org to the new org
    if old_org_id:
        db.query(Dataset).filter(
            Dataset.organization_id == old_org_id,
            Dataset.uploaded_by == user_id,
        ).update({"organization_id": body.org_id})
    db.commit()
    return user_to_dict(user)


# ── All users (global view) ────────────────────────────────────────────────────

@router.get("/users")
def list_all_users(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    users = db.query(User).filter(User.role != "super_admin").order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        d = user_to_dict(u)
        d["organization_id"] = u.organization_id
        if u.organization_id:
            org = db.query(Organization).filter(Organization.id == u.organization_id).first()
            d["org_name"] = org.name if org else None
        else:
            d["org_name"] = None
        result.append(d)
    return result


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: dict, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(400, "Super admin users cannot be modified here")
    if "is_active" in body:
        user.is_active = body["is_active"]
    if "role" in body and body["role"] in ("admin", "user", "viewer"):
        user.role = body["role"]
    db.commit()
    return user_to_dict(user)


# ── Recent activity ────────────────────────────────────────────────────────────

@router.get("/activity")
def recent_activity(limit: int = 30, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    messages = (db.query(Message, Conversation)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Message.role == "user")
        .order_by(Message.created_at.desc())
        .limit(limit)
        .all())

    result = []
    for msg, conv in messages:
        result.append({
            "type":       "query",
            "preview":    (msg.content[:80] + "…") if len(msg.content) > 80 else msg.content,
            "dataset_id": conv.dataset_id,
            "created_at": msg.created_at.isoformat() if msg.created_at else None,
        })
    return result
