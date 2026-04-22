import uuid
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db import get_db, Schedule, Dataset, Conversation, User
from routers.settings import get_setting
from routers.auth import require_brain_access

router = APIRouter()


def _serialise(s: Schedule) -> dict:
    return {
        "id":              s.id,
        "title":           s.title,
        "dataset_id":      s.dataset_id,
        "conversation_id": s.conversation_id,
        "question":        s.question,
        "cron":            s.cron,
        "email":           s.email,
        "active":          s.active,
        "last_run":        s.last_run.isoformat() if s.last_run else None,
        "created_at":      s.created_at.isoformat(),
    }


@router.get("/")
def list_schedules(db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    return [_serialise(s) for s in db.query(Schedule).order_by(Schedule.created_at.desc()).all()]


class CreateScheduleRequest(BaseModel):
    title:           str
    dataset_id:      str
    conversation_id: str
    question:        str
    cron:            str   # "daily" | "weekly" | "monthly"
    email:           str


@router.post("/")
def create_schedule(req: CreateScheduleRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    s = Schedule(
        id              = str(uuid.uuid4()),
        title           = req.title,
        dataset_id      = req.dataset_id,
        conversation_id = req.conversation_id,
        question        = req.question,
        cron            = req.cron,
        email           = req.email,
    )
    db.add(s)
    db.commit()
    return _serialise(s)


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.patch("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    s.active = not s.active
    db.commit()
    return _serialise(s)


class SendEmailRequest(BaseModel):
    to_email:    str
    subject:     str
    body:        str
    dataset_name: Optional[str] = ""
    question:    Optional[str] = ""


class UpdateScheduleRequest(BaseModel):
    title: Optional[str] = None
    question: Optional[str] = None
    cron: Optional[str] = None
    email: Optional[str] = None


@router.patch("/{schedule_id}")
def update_schedule(schedule_id: str, req: UpdateScheduleRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    if req.title is not None:
        s.title = req.title
    if req.question is not None:
        s.question = req.question
    if req.cron is not None:
        s.cron = req.cron
    if req.email is not None:
        s.email = req.email
    db.commit()
    db.refresh(s)
    return _serialise(s)


@router.post("/send-email")
def send_email(req: SendEmailRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    """Send an email with analysis results. Uses SMTP settings from env or falls back to a simple stub."""

    smtp_host = os.getenv("SMTP_HOST", "")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    html_body = f"""
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #7c3aed, #4f46e5); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">br<span style="opacity: 0.8">AI</span>n Report</h1>
      </div>
      <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px;">
        {"<p style='color:#6b7280; font-size:14px;'>Dataset: <strong>" + req.dataset_name + "</strong></p>" if req.dataset_name else ""}
        {"<p style='color:#6b7280; font-size:14px;'>Question: <em>" + req.question + "</em></p>" if req.question else ""}
        <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
{req.body}
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px; text-align: center;">
          Sent by brAIn AI Data Analyst
        </p>
      </div>
    </div>
    """

    if not smtp_host or not smtp_user:
        # No SMTP configured — return instructions
        return {
            "ok": False,
            "message": "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to your backend/.env file.",
            "env_needed": {
                "SMTP_HOST": "smtp.gmail.com (for Gmail)",
                "SMTP_PORT": "587",
                "SMTP_USER": "your@email.com",
                "SMTP_PASS": "your-app-password",
            }
        }

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = req.subject
        msg["From"]    = smtp_user
        msg["To"]      = req.to_email
        msg.attach(MIMEText(req.body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, req.to_email, msg.as_string())

        return {"ok": True, "message": f"Email sent to {req.to_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
