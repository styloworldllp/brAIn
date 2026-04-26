import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db import get_db, SavedChart, Dataset, Conversation, User
from routers.auth import require_brain_access

router = APIRouter()


def _serialise(c: SavedChart) -> dict:
    return {
        "id":              c.id,
        "title":           c.title,
        "dataset_id":      c.dataset_id,
        "conversation_id": c.conversation_id,
        "message_id":      c.message_id,
        "chart_json":      c.chart_json,
        "created_at":      c.created_at.isoformat(),
    }


def _get_or_404(db: Session, user: User, chart_id: str) -> SavedChart:
    c = db.query(SavedChart).filter(
        SavedChart.id == chart_id,
        SavedChart.organization_id == user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Chart not found")
    return c


@router.get("/")
def list_charts(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    charts = (
        db.query(SavedChart)
        .filter(SavedChart.organization_id == user.organization_id)
        .order_by(SavedChart.created_at.desc())
        .all()
    )
    return [_serialise(c) for c in charts]


class SaveChartRequest(BaseModel):
    title:           str
    dataset_id:      str
    conversation_id: str
    message_id:      Optional[str] = None
    chart_json:      dict


@router.post("/")
def save_chart(req: SaveChartRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    # Validate dataset and conversation belong to user's org
    dataset = db.query(Dataset).filter(
        Dataset.id == req.dataset_id,
        Dataset.organization_id == user.organization_id,
    ).first()
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    conv = db.query(Conversation).filter(
        Conversation.id == req.conversation_id,
        Conversation.organization_id == user.organization_id,
    ).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    c = SavedChart(
        id              = str(uuid.uuid4()),
        organization_id = user.organization_id,
        title           = req.title,
        dataset_id      = req.dataset_id,
        conversation_id = req.conversation_id,
        message_id      = req.message_id,
        chart_json      = req.chart_json,
    )
    db.add(c)
    db.commit()
    return _serialise(c)


@router.delete("/{chart_id}")
def delete_chart(chart_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    c = _get_or_404(db, user, chart_id)
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.patch("/{chart_id}/title")
def update_chart_title(chart_id: str, body: dict, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    c = _get_or_404(db, user, chart_id)
    c.title = body.get("title", c.title)
    db.commit()
    return _serialise(c)
