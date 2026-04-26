from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from db import get_db, AccessRequest, Notification, Dataset, DatasetPermission, User
from routers.auth import require_brain_access

router = APIRouter()


class RequestAccessBody(BaseModel):
    dataset_id: str
    reason: str


def _ser(r: AccessRequest) -> dict:
    return {
        "id": r.id,
        "dataset_id": r.dataset_id,
        "user_id": r.user_id,
        "username": r.username,
        "reason": r.reason,
        "status": r.status,
        "reviewed_by": r.reviewed_by,
        "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
        "created_at": r.created_at.isoformat(),
    }


@router.post("/")
def request_access(body: RequestAccessBody, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    # Check if a pending request already exists
    existing = db.query(AccessRequest).filter(
        AccessRequest.dataset_id == body.dataset_id,
        AccessRequest.user_id == user.id,
        AccessRequest.status == "pending",
    ).first()
    if existing:
        raise HTTPException(400, "You already have a pending request for this dataset")

    req = AccessRequest(
        organization_id=user.organization_id,
        dataset_id=body.dataset_id,
        user_id=user.id,
        username=user.username,
        reason=body.reason,
    )
    db.add(req)

    # Notify all admins in the org
    ds = db.query(Dataset).filter(Dataset.id == body.dataset_id).first()
    ds_name = ds.name if ds else body.dataset_id
    admins = db.query(User).filter(User.organization_id == user.organization_id, User.role == "admin").all()
    for admin in admins:
        notif = Notification(
            organization_id=user.organization_id,
            user_id=admin.id,
            type="access_request",
            title=f"{user.username} requested access",
            body=f"Dataset: {ds_name}\nReason: {body.reason}",
            ref_id=req.id,
        )
        db.add(notif)

    db.commit()
    db.refresh(req)
    return _ser(req)


@router.get("/")
def list_requests(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    """Admin: all pending requests for their org. User: their own requests."""
    if user.role == "admin":
        reqs = db.query(AccessRequest).filter(
            AccessRequest.organization_id == user.organization_id
        ).order_by(AccessRequest.created_at.desc()).all()
    else:
        reqs = db.query(AccessRequest).filter(
            AccessRequest.user_id == user.id
        ).order_by(AccessRequest.created_at.desc()).all()

    # Enrich with dataset names
    result = []
    for r in reqs:
        s = _ser(r)
        ds = db.query(Dataset).filter(Dataset.id == r.dataset_id).first()
        s["dataset_name"] = ds.name if ds else r.dataset_id
        result.append(s)
    return result


@router.patch("/{request_id}/approve")
def approve_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Request not found")

    req.status = "approved"
    req.reviewed_by = user.username
    req.reviewed_at = datetime.utcnow()

    # Grant permission
    perm = db.query(DatasetPermission).filter(
        DatasetPermission.user_id == req.user_id,
        DatasetPermission.dataset_id == req.dataset_id
    ).first()
    if not perm:
        db.add(DatasetPermission(user_id=req.user_id, dataset_id=req.dataset_id, can_read=True))

    # Notify the requesting user
    ds = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    db.add(Notification(
        organization_id=req.organization_id,
        user_id=req.user_id,
        type="access_approved",
        title="Access request approved",
        body=f"Your request for '{ds.name if ds else req.dataset_id}' has been approved.",
        ref_id=req.id,
    ))
    db.commit()
    return _ser(req)


@router.patch("/{request_id}/reject")
def reject_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    if user.role != "admin":
        raise HTTPException(403, "Admin only")
    req = db.query(AccessRequest).filter(AccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(404, "Request not found")

    req.status = "rejected"
    req.reviewed_by = user.username
    req.reviewed_at = datetime.utcnow()

    ds = db.query(Dataset).filter(Dataset.id == req.dataset_id).first()
    db.add(Notification(
        organization_id=req.organization_id,
        user_id=req.user_id,
        type="access_rejected",
        title="Access request rejected",
        body=f"Your request for '{ds.name if ds else req.dataset_id}' was not approved.",
        ref_id=req.id,
    ))
    db.commit()
    return _ser(req)
