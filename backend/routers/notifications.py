from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db import get_db, Notification, User
from routers.auth import require_brain_access

router = APIRouter()


def _ser(n: Notification) -> dict:
    return {
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "ref_id": n.ref_id,
        "is_read": n.is_read,
        "created_at": n.created_at.isoformat(),
    }


@router.get("/")
def get_notifications(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    notifs = db.query(Notification).filter(
        Notification.user_id == user.id
    ).order_by(Notification.created_at.desc()).limit(50).all()
    return [_ser(n) for n in notifs]


@router.patch("/{notif_id}/read")
def mark_read(notif_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    n = db.query(Notification).filter(Notification.id == notif_id, Notification.user_id == user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read == False).update({"is_read": True})
    db.commit()
    return {"ok": True}
