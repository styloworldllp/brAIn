from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

from db import get_db, User, Dataset, DatasetPermission
from routers.auth import require_admin, user_to_dict, hash_password

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
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at).all()
    result = []
    for u in users:
        d = user_to_dict(u)
        perms = db.query(DatasetPermission).filter(DatasetPermission.user_id == u.id).all()
        d["dataset_permissions"] = [p.dataset_id for p in perms]
        result.append(d)
    return result


@router.post("/users")
def create_user(body: CreateUserBody, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    email = body.email.lower().strip()
    username = body.username.strip()
    if body.role not in ("admin", "user", "viewer"):
        raise HTTPException(400, "Invalid role")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == username).first():
        raise HTTPException(400, "Username taken")
    user = User(
        email=email, username=username,
        hashed_password=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_dict(user)


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UpdateUserBody, db: Session = Depends(get_db),
                admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(403, "Super admin users are managed from the super admin console")
    if body.role is not None:
        if body.role not in ("admin", "user", "viewer"):
            raise HTTPException(400, "Invalid role")
        user.role = body.role
    if body.is_active is not None:
        if user.id == admin.id:
            raise HTTPException(400, "Cannot deactivate yourself")
        user.is_active = body.is_active
    if body.username is not None:
        existing = db.query(User).filter(User.username == body.username, User.id != user_id).first()
        if existing:
            raise HTTPException(400, "Username taken")
        user.username = body.username
    if body.password is not None and body.password:
        user.hashed_password = hash_password(body.password)
    db.commit()
    return user_to_dict(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == "super_admin":
        raise HTTPException(403, "Super admin users are managed from the super admin console")
    if user.id == admin.id:
        raise HTTPException(400, "Cannot delete yourself")
    db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).delete()
    db.delete(user)
    db.commit()
    return {"ok": True}


# ── Dataset permissions ────────────────────────────────────────────────────────

@router.get("/users/{user_id}/permissions")
def get_permissions(user_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    perms = db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).all()
    return {"user_id": user_id, "dataset_ids": [p.dataset_id for p in perms]}


@router.put("/users/{user_id}/permissions")
def set_permissions(user_id: str, body: GrantPermissionBody, db: Session = Depends(get_db),
                    _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    # Replace all permissions
    db.query(DatasetPermission).filter(DatasetPermission.user_id == user_id).delete()
    for ds_id in body.dataset_ids:
        db.add(DatasetPermission(user_id=user_id, dataset_id=ds_id))
    db.commit()
    return {"user_id": user_id, "dataset_ids": body.dataset_ids}


# ── Stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
def stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    total = db.query(User).count()
    active = db.query(User).filter(User.is_active == True).count()
    admins = db.query(User).filter(User.role == "admin").count()
    datasets = db.query(Dataset).count()
    return {"total_users": total, "active_users": active, "admin_count": admins, "total_datasets": datasets}


# ── All datasets (for permission picker) ──────────────────────────────────────

@router.get("/datasets")
def list_datasets(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    datasets = db.query(Dataset).order_by(Dataset.created_at).all()
    return [{"id": d.id, "name": d.name, "source_type": d.source_type} for d in datasets]
