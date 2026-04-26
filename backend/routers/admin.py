from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List

from db import get_db, User, Dataset, DatasetPermission
from routers.auth import require_admin, user_to_dict, hash_password
from services.audit_logger import log_event, A

router = APIRouter()


class UpdateUserBody(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    username: Optional[str] = None
    password: Optional[str] = None


class CreateUserBody(BaseModel):
    email: str
    username: str
    password: str
    role: str = "user"


class GrantPermissionBody(BaseModel):
    dataset_ids: List[str]


# ── Users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
def list_users(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(User)
    if admin.role != "super_admin":
        q = q.filter(User.organization_id == admin.organization_id)
    users = q.order_by(User.created_at).all()
    if not users:
        return []
    user_ids = [u.id for u in users]
    # Fetch all permissions in one query instead of N+1
    all_perms = db.query(DatasetPermission).filter(DatasetPermission.user_id.in_(user_ids)).all()
    perms_by_user: dict[str, list[str]] = {}
    for p in all_perms:
        perms_by_user.setdefault(p.user_id, []).append(p.dataset_id)
    result = []
    for u in users:
        d = user_to_dict(u)
        d["dataset_permissions"] = perms_by_user.get(u.id, [])
        result.append(d)
    return result


@router.post("/users")
def create_user(body: CreateUserBody, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    email = body.email.lower().strip()
    username = body.username.strip()
    if body.role not in ("admin", "user", "viewer", "staff"):
        raise HTTPException(400, "Invalid role")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username taken")
    user = User(
        email=email, username=username,
        hashed_password=hash_password(body.password),
        role=body.role,
        organization_id=admin.organization_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_event(db, A.USER_CREATE, user=admin, resource_type="user",
              resource_id=user.id, resource_name=user.username,
              details={"role": user.role, "email": user.email})
    return user_to_dict(user)


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UpdateUserBody, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    q = db.query(User).filter(User.id == user_id)
    if admin.role != "super_admin":
        q = q.filter(User.organization_id == admin.organization_id)
    user = q.first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(403, "Super admin users are managed from the super admin console")
    changes: dict = {}
    if body.role is not None:
        if body.role not in ("admin", "user", "viewer", "staff"):
            raise HTTPException(400, "Invalid role")
        changes["role_from"] = user.role; changes["role_to"] = body.role
        user.role = body.role
    if body.is_active is not None:
        if user.id == admin.id:
            raise HTTPException(400, "Cannot deactivate yourself")
        changes["is_active"] = body.is_active
        user.is_active = body.is_active
    if body.username is not None:
        existing = db.query(User).filter(User.username == body.username, User.id != user_id).first()
        if existing:
            raise HTTPException(400, "Username taken")
        changes["username_to"] = body.username
        user.username = body.username
    if body.password is not None and body.password:
        changes["password_changed"] = True
        user.hashed_password = hash_password(body.password)
    db.commit()
    action = A.ROLE_CHANGE if "role_from" in changes else (A.USER_DEACTIVATE if "is_active" in changes else A.USER_UPDATE)
    log_event(db, action, user=admin, resource_type="user",
              resource_id=user.id, resource_name=user.username, details=changes)
    return user_to_dict(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(User).filter(User.id == user_id)
    if admin.role != "super_admin":
        q = q.filter(User.organization_id == admin.organization_id)
    user = q.first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(403, "Super admin users are managed from the super admin console")
    if user.id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    log_event(db, A.USER_DELETE, user=admin, resource_type="user",
              resource_id=user.id, resource_name=user.username,
              details={"email": user.email, "role": user.role})
    db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


# ── Dataset permissions ────────────────────────────────────────────────────────

@router.get("/users/{user_id}/permissions")
def get_permissions(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(User).filter(User.id == user_id)
    if admin.role != "super_admin":
        q = q.filter(User.organization_id == admin.organization_id)
    user = q.first()
    if not user:
        raise HTTPException(404, "User not found")
    perms = db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).all()
    return {"user_id": user_id, "dataset_ids": [p.dataset_id for p in perms]}


@router.put("/users/{user_id}/permissions")
def set_permissions(user_id: str, body: GrantPermissionBody, db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)):
    q = db.query(User).filter(User.id == user_id)
    if admin.role != "super_admin":
        q = q.filter(User.organization_id == admin.organization_id)
    user = q.first()
    if not user:
        raise HTTPException(404, "User not found")
    # Validate all dataset_ids belong to admin's org
    for ds_id in body.dataset_ids:
        ds_q = db.query(Dataset).filter(Dataset.id == ds_id)
        if admin.role != "super_admin":
            ds_q = ds_q.filter(Dataset.organization_id == admin.organization_id)
        if not ds_q.first():
            raise HTTPException(400, f"Dataset {ds_id} not found")
    # Replace all permissions
    db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).delete()
    for ds_id in body.dataset_ids:
        db.add(DatasetPermission(user_id=user_id, dataset_id=ds_id))
    db.commit()
    return {"user_id": user_id, "dataset_ids": body.dataset_ids}


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
def stats(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q_users    = db.query(User)
    q_datasets = db.query(Dataset)
    if admin.role != "super_admin":
        q_users    = q_users.filter(User.organization_id == admin.organization_id)
        q_datasets = q_datasets.filter(Dataset.organization_id == admin.organization_id)
    total    = q_users.count()
    active   = q_users.filter(User.is_active == True).count()
    admins   = q_users.filter(User.role == "admin").count()
    datasets = q_datasets.count()
    return {"total_users": total, "active_users": active, "admin_count": admins, "total_datasets": datasets}


# ── All datasets (for permission picker) ──────────────────────────────────────

@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    q = db.query(Dataset)
    if admin.role != "super_admin":
        q = q.filter(Dataset.organization_id == admin.organization_id)
    datasets = q.order_by(Dataset.created_at).all()
    return [{"id": d.id, "name": d.name, "source_type": d.source_type} for d in datasets]
