"""
Support ticket system.
- Any authenticated user can create tickets and add messages.
- Staff / super_admin can see all tickets across all orgs and update status.
- Customers (admin/user) see only their own org's tickets.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from db import get_db, User, SupportTicket, TicketMessage, Organization
from routers.auth import require_auth, require_staff_access

router = APIRouter()

VALID_STATUSES   = {"open", "in_progress", "resolved", "closed"}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}


def _ticket_dict(t: SupportTicket, db: Session) -> dict:
    msgs = db.query(TicketMessage).filter(
        TicketMessage.ticket_id == t.id
    ).order_by(TicketMessage.created_at.asc()).all()

    org_name = None
    if t.organization_id:
        org = db.query(Organization).filter(Organization.id == t.organization_id).first()
        org_name = org.name if org else None

    return {
        "id":              t.id,
        "organization_id": t.organization_id,
        "org_name":        org_name,
        "user_id":         t.user_id,
        "subject":         t.subject,
        "description":     t.description,
        "status":          t.status,
        "priority":        t.priority,
        "created_at":      t.created_at.isoformat(),
        "updated_at":      t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
        "messages": [
            {
                "id":         m.id,
                "user_id":    m.user_id,
                "username":   m.username,
                "is_staff":   m.is_staff,
                "content":    m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in msgs
        ],
    }


def _ticket_summary(t: SupportTicket, db: Session) -> dict:
    msg_count = db.query(TicketMessage).filter(TicketMessage.ticket_id == t.id).count()
    org_name = None
    if t.organization_id:
        org = db.query(Organization).filter(Organization.id == t.organization_id).first()
        org_name = org.name if org else None
    return {
        "id":              t.id,
        "organization_id": t.organization_id,
        "org_name":        org_name,
        "user_id":         t.user_id,
        "subject":         t.subject,
        "status":          t.status,
        "priority":        t.priority,
        "message_count":   msg_count,
        "created_at":      t.created_at.isoformat(),
        "updated_at":      t.updated_at.isoformat() if t.updated_at else t.created_at.isoformat(),
    }


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_auth),
):
    q = db.query(SupportTicket)
    if user.role in ("staff", "super_admin"):
        pass  # see all tickets
    else:
        q = q.filter(SupportTicket.organization_id == user.organization_id)

    if status:
        q = q.filter(SupportTicket.status == status)
    if priority:
        q = q.filter(SupportTicket.priority == priority)

    tickets = q.order_by(SupportTicket.created_at.desc()).all()
    return [_ticket_summary(t, db) for t in tickets]


class CreateTicketRequest(BaseModel):
    subject:     str
    description: str
    priority:    Optional[str] = "medium"


@router.post("/tickets")
def create_ticket(
    req: CreateTicketRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_auth),
):
    if req.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Invalid priority. Choose from: {', '.join(VALID_PRIORITIES)}")
    t = SupportTicket(
        id              = str(uuid.uuid4()),
        organization_id = user.organization_id,
        user_id         = user.id,
        subject         = req.subject.strip(),
        description     = req.description.strip(),
        priority        = req.priority,
    )
    db.add(t)
    # Auto-add the description as the first message
    db.add(TicketMessage(
        id        = str(uuid.uuid4()),
        ticket_id = t.id,
        user_id   = user.id,
        username  = user.username,
        is_staff  = user.role in ("staff", "super_admin"),
        content   = req.description.strip(),
    ))
    db.commit()
    return _ticket_dict(t, db)


@router.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_auth),
):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    if user.role not in ("staff", "super_admin") and t.organization_id != user.organization_id:
        raise HTTPException(403, "Access denied")
    return _ticket_dict(t, db)


class AddMessageRequest(BaseModel):
    content: str


@router.post("/tickets/{ticket_id}/messages")
def add_message(
    ticket_id: str,
    req: AddMessageRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_auth),
):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    if user.role not in ("staff", "super_admin") and t.organization_id != user.organization_id:
        raise HTTPException(403, "Access denied")
    if t.status == "closed":
        raise HTTPException(400, "Cannot reply to a closed ticket")

    msg = TicketMessage(
        id        = str(uuid.uuid4()),
        ticket_id = ticket_id,
        user_id   = user.id,
        username  = user.username,
        is_staff  = user.role in ("staff", "super_admin"),
        content   = req.content.strip(),
    )
    db.add(msg)

    # Auto-move to in_progress when staff replies to an open ticket
    if user.role in ("staff", "super_admin") and t.status == "open":
        t.status = "in_progress"
    t.updated_at = datetime.utcnow()
    db.commit()
    return {
        "id":         msg.id,
        "user_id":    msg.user_id,
        "username":   msg.username,
        "is_staff":   msg.is_staff,
        "content":    msg.content,
        "created_at": msg.created_at.isoformat(),
    }


class UpdateTicketRequest(BaseModel):
    status:   Optional[str] = None
    priority: Optional[str] = None


@router.patch("/tickets/{ticket_id}")
def update_ticket(
    ticket_id: str,
    req: UpdateTicketRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff_access),
):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    if req.status:
        if req.status not in VALID_STATUSES:
            raise HTTPException(400, f"Invalid status. Choose from: {', '.join(VALID_STATUSES)}")
        t.status = req.status
    if req.priority:
        if req.priority not in VALID_PRIORITIES:
            raise HTTPException(400, f"Invalid priority. Choose from: {', '.join(VALID_PRIORITIES)}")
        t.priority = req.priority
    t.updated_at = datetime.utcnow()
    db.commit()
    return _ticket_dict(t, db)


@router.delete("/tickets/{ticket_id}")
def delete_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_staff_access),
):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(404, "Ticket not found")
    db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id).delete()
    db.delete(t)
    db.commit()
    return {"ok": True}
