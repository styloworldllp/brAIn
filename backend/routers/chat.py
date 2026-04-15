import json
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db import get_db, Dataset, Conversation, Message
from services.ai_service import stream_chat
from routers.settings import load_chat_settings

router = APIRouter()


def _dataset_dict(d: Dataset) -> dict:
    """Convert to plain dict IMMEDIATELY — before any generator/thread boundary."""
    return {
        "id":                str(d.id),
        "name":              str(d.name),
        "source_type":       str(d.source_type),
        "file_path":         str(d.file_path) if d.file_path else None,
        "connection_string": str(d.connection_string) if d.connection_string else None,
        "table_or_query":    str(d.table_or_query) if d.table_or_query else None,
        "row_count":         int(d.row_count) if d.row_count else 0,
        "schema_info":       dict(d.schema_info) if d.schema_info else {},
        "sample_data":       list(d.sample_data) if d.sample_data else [],
    }


@router.get("/conversations")
def list_conversations(dataset_id: str, db: Session = Depends(get_db)):
    convs = (
        db.query(Conversation)
        .filter(Conversation.dataset_id == dataset_id)
        .order_by(Conversation.created_at.desc())
        .all()
    )
    return [{"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()} for c in convs]


@router.post("/conversations")
def create_conversation(dataset_id: str, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    conv = Conversation(id=str(uuid.uuid4()), dataset_id=dataset_id)
    db.add(conv)
    db.commit()
    return {"id": conv.id, "title": conv.title}


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, db: Session = Depends(get_db)):
    msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [
        {
            "id":            m.id,
            "role":          m.role,
            "content":       m.content,
            "executed_code": m.executed_code,
            "code_output":   m.code_output,
            "charts":        m.charts,
            "created_at":    m.created_at.isoformat(),
        }
        for m in msgs
    ]


class ChatRequest(BaseModel):
    conversation_id: str
    message: str


@router.post("/stream")
def chat_stream(req: ChatRequest, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == req.conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    dataset = db.query(Dataset).filter(Dataset.id == conv.dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # ── Convert to plain dict NOW before DB session closes ────────────────────
    dataset_data = _dataset_dict(dataset)
    ai_settings  = load_chat_settings(db)
    conv_id      = str(conv.id)
    conv_title   = str(conv.title) if conv.title else ""

    if not ai_settings["api_key"]:
        def no_key():
            yield f"data: {json.dumps({'type': 'text', 'content': 'No API key set. Click Settings & API keys in the sidebar and add your key.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(no_key(), media_type="text/event-stream")

    # ── Load history ──────────────────────────────────────────────────────────
    past = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content or ""} for m in past]

    # ── Save user message ─────────────────────────────────────────────────────
    db.add(Message(
        id=str(uuid.uuid4()),
        conversation_id=conv_id,
        role="user",
        content=req.message,
    ))
    if not past and not conv_title:
        conv.title = req.message[:60] + ("..." if len(req.message) > 60 else "")
    db.commit()

    # ── Streaming generator ───────────────────────────────────────────────────
    collected_text   = []
    collected_code   = []
    collected_output = []
    collected_charts = []

    def generate():
        try:
            for raw in stream_chat(
                dataset      = dataset_data,
                history      = history,
                user_message = req.message,
                provider     = ai_settings["provider"],
                api_key      = ai_settings["api_key"],
                model        = ai_settings["model"],
            ):
                yield raw
                if raw.startswith("data: "):
                    try:
                        ev = json.loads(raw[6:])
                        t  = ev.get("type")
                        if t == "text":
                            collected_text.append(ev.get("content", ""))
                        elif t == "code":
                            collected_code.append(ev.get("code", ""))
                        elif t == "code_output":
                            out = ev.get("output", "")
                            if ev.get("error"):
                                out += "\n" + ev["error"]
                            collected_output.append(out)
                        elif t == "chart":
                            collected_charts.append(ev.get("chart_json"))
                        elif t == "done":
                            _save_assistant(conv_id)
                    except Exception:
                        pass
        except Exception as e:
            yield f"data: {json.dumps({'type': 'text', 'content': f'Error: {str(e)}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    def _save_assistant(cid: str):
        # New db session for the save — the original is closed
        from db import SessionLocal
        save_db = SessionLocal()
        try:
            save_db.add(Message(
                id              = str(uuid.uuid4()),
                conversation_id = cid,
                role            = "assistant",
                content         = "".join(collected_text),
                executed_code   = "\n\n# ---\n\n".join(collected_code) or None,
                code_output     = "\n".join(collected_output) or None,
                charts          = collected_charts or None,
            ))
            save_db.commit()
        except Exception:
            save_db.rollback()
        finally:
            save_db.close()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
