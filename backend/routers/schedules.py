import uuid
import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db import get_db, Schedule, Dataset, SessionLocal, User
from routers.settings import get_setting, load_chat_settings
from routers.auth import require_brain_access

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Cron validation ────────────────────────────────────────────────────────────
CRON_ALIASES = {"daily": "0 8 * * *", "weekly": "0 8 * * 1", "monthly": "0 8 1 * *"}

_CRON_RANGES = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]


def _resolve_cron(expr: str) -> str:
    """Convert alias or raw cron expression. Returns standard 5-field cron."""
    if expr in CRON_ALIASES:
        return CRON_ALIASES[expr]
    parts = expr.strip().split()
    if len(parts) != 5:
        raise HTTPException(400, "Invalid cron: must be 5 fields (min hour dom month dow) or one of: daily, weekly, monthly")
    for i, (part, (lo, hi)) in enumerate(zip(parts, _CRON_RANGES)):
        if part == "*":
            continue
        try:
            val = int(part)
            if not (lo <= val <= hi):
                raise ValueError
        except ValueError:
            raise HTTPException(400, f"Cron field {i+1} value '{part}' out of range {lo}-{hi}")
    return expr.strip()


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


def _get_or_404(db: Session, user: User, schedule_id: str) -> Schedule:
    s = db.query(Schedule).filter(
        Schedule.id == schedule_id,
        Schedule.organization_id == user.organization_id,
    ).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    return s


@router.get("/")
def list_schedules(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    return [_serialise(s) for s in db.query(Schedule).filter(
        Schedule.organization_id == user.organization_id,
    ).order_by(Schedule.created_at.desc()).all()]


class CreateScheduleRequest(BaseModel):
    title:           str
    dataset_id:      str
    conversation_id: str
    question:        str
    cron:            str   # "daily" | "weekly" | "monthly" | "min hour dom month dow"
    email:           str


@router.post("/")
def create_schedule(req: CreateScheduleRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    resolved = _resolve_cron(req.cron)
    s = Schedule(
        id              = str(uuid.uuid4()),
        organization_id = user.organization_id,
        title           = req.title,
        dataset_id      = req.dataset_id,
        conversation_id = req.conversation_id,
        question        = req.question,
        cron            = resolved,
        email           = req.email,
    )
    db.add(s)
    db.commit()
    _register_job(s)
    return _serialise(s)


@router.delete("/{schedule_id}")
def delete_schedule(schedule_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    s = _get_or_404(db, user, schedule_id)
    _remove_job(schedule_id)
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.patch("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    s = _get_or_404(db, user, schedule_id)
    s.active = not s.active
    db.commit()
    if s.active:
        _register_job(s)
    else:
        _remove_job(schedule_id)
    return _serialise(s)


class UpdateScheduleRequest(BaseModel):
    title:    Optional[str] = None
    question: Optional[str] = None
    cron:     Optional[str] = None
    email:    Optional[str] = None


@router.patch("/{schedule_id}")
def update_schedule(schedule_id: str, req: UpdateScheduleRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    s = _get_or_404(db, user, schedule_id)
    if req.title    is not None: s.title    = req.title
    if req.question is not None: s.question = req.question
    if req.email    is not None: s.email    = req.email
    if req.cron     is not None:
        s.cron = _resolve_cron(req.cron)
    db.commit()
    db.refresh(s)
    if s.active:
        _remove_job(schedule_id)
        _register_job(s)
    return _serialise(s)


# ── Email sender ───────────────────────────────────────────────────────────────

class SendEmailRequest(BaseModel):
    to_email:     str
    subject:      str
    body:         str
    dataset_name: Optional[str] = ""
    question:     Optional[str] = ""


def _html_escape(s: str) -> str:
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;").replace("'", "&#x27;"))


def _do_send_email(to_email: str, subject: str, body: str, dataset_name: str = "", question: str = "") -> dict:
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
        {"<p style='color:#6b7280; font-size:14px;'>Dataset: <strong>" + _html_escape(dataset_name) + "</strong></p>" if dataset_name else ""}
        {"<p style='color:#6b7280; font-size:14px;'>Question: <em>" + _html_escape(question) + "</em></p>" if question else ""}
        <div style="background: white; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">
{body}
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px; text-align: center;">
          Sent by brAIn AI Data Analyst
        </p>
      </div>
    </div>
    """

    if not smtp_host or not smtp_user:
        return {
            "ok": False,
            "message": "SMTP not configured. Add SMTP_HOST, SMTP_USER, SMTP_PASS to your backend/.env file.",
            "env_needed": {
                "SMTP_HOST": "smtp.gmail.com (for Gmail)",
                "SMTP_PORT": "587",
                "SMTP_USER": "your@email.com",
                "SMTP_PASS": "your-app-password",
            },
        }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = smtp_user
    msg["To"]      = to_email
    msg.attach(MIMEText(body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, to_email, msg.as_string())

    return {"ok": True, "message": f"Email sent to {to_email}"}


@router.post("/send-email")
def send_email(req: SendEmailRequest, db: Session = Depends(get_db), _: User = Depends(require_brain_access)):
    try:
        return _do_send_email(req.to_email, req.subject, req.body, req.dataset_name or "", req.question or "")
    except Exception as e:
        logger.error("send_email failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to send email. Check SMTP configuration.")


# ── APScheduler integration ────────────────────────────────────────────────────

_scheduler = None


def _run_schedule(schedule_id: str):
    """Execute a scheduled question and email the result."""
    db = SessionLocal()
    try:
        s = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not s or not s.active:
            return

        dataset = db.query(Dataset).filter(Dataset.id == s.dataset_id).first()
        if not dataset:
            logger.warning("Schedule %s: dataset %s not found", schedule_id, s.dataset_id)
            return

        ai_cfg = load_chat_settings(db, s.organization_id)
        if not ai_cfg["api_key"]:
            logger.warning("Schedule %s: no API key configured", schedule_id)
            return

        # Build dataset dict (same as chat router)
        dataset_data = {
            "id": str(dataset.id), "name": str(dataset.name),
            "source_type": str(dataset.source_type),
            "file_path": str(dataset.file_path) if dataset.file_path else None,
            "connection_string": str(dataset.connection_string) if dataset.connection_string else None,
            "table_or_query": str(dataset.table_or_query) if dataset.table_or_query else None,
            "row_count": int(dataset.row_count) if dataset.row_count else 0,
            "schema_info": dict(dataset.schema_info) if dataset.schema_info else {},
            "sample_data": list(dataset.sample_data) if dataset.sample_data else [],
        }

        from services.ai_service import stream_chat
        chunks = []
        for event in stream_chat(
            dataset=dataset_data, history=[], user_message=s.question,
            provider=ai_cfg["provider"], api_key=ai_cfg["api_key"], model=ai_cfg["model"],
        ):
            if event.startswith("data: "):
                import json
                try:
                    ev = json.loads(event[6:])
                    if ev.get("type") == "text":
                        chunks.append(ev.get("content", ""))
                except Exception:
                    pass

        answer = "".join(chunks).strip() or "No answer generated."

        try:
            _do_send_email(
                to_email=s.email,
                subject=f"brAIn Report: {s.title}",
                body=answer,
                dataset_name=dataset.name,
                question=s.question,
            )
        except Exception as e:
            logger.error("Schedule %s: email failed: %s", schedule_id, e)

        s.last_run = datetime.utcnow()
        db.commit()
        logger.info("Schedule %s ran successfully", schedule_id)

    except Exception as e:
        logger.error("Schedule %s: error: %s", schedule_id, e)
    finally:
        db.close()


def _register_job(schedule: Schedule):
    if _scheduler is None:
        return
    try:
        from apscheduler.triggers.cron import CronTrigger
        parts = schedule.cron.split()
        trigger = CronTrigger(
            minute=parts[0], hour=parts[1],
            day=parts[2], month=parts[3], day_of_week=parts[4],
        )
        _scheduler.add_job(
            _run_schedule, trigger,
            id=schedule.id, args=[schedule.id],
            replace_existing=True,
        )
        logger.info("Registered cron job %s: %s", schedule.id, schedule.cron)
    except Exception as e:
        logger.error("Could not register job %s: %s", schedule.id, e)


def _remove_job(schedule_id: str):
    if _scheduler is None:
        return
    try:
        if _scheduler.get_job(schedule_id):
            _scheduler.remove_job(schedule_id)
    except Exception:
        pass


def start_scheduler():
    global _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        _scheduler = BackgroundScheduler(timezone="UTC")
        _scheduler.start()

        # Re-register all active schedules from DB
        db = SessionLocal()
        try:
            active = db.query(Schedule).filter(Schedule.active == True).all()
            for s in active:
                _register_job(s)
            logger.info("Scheduler started — %d active jobs registered", len(active))
        finally:
            db.close()
    except ImportError:
        logger.warning(
            "apscheduler not installed — scheduled reports will not run automatically. "
            "Run: pip install apscheduler"
        )
    except Exception as e:
        logger.error("Scheduler startup failed: %s", e)


def stop_scheduler():
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler stopped")
