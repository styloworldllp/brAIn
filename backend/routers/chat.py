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
    return {
        "id":                d.id,
        "name":              d.name,
        "source_type":       d.source_type,
        "file_path":         d.file_path,
        "connection_string": d.connection_string,
        "table_or_query":    d.table_or_query,
        "row_count":         d.row_count,
        "schema_info":       d.schema_info,
        "sample_data":       d.sample_data,
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

    ai_settings = load_chat_settings(db)

    if not ai_settings["api_key"]:
        def no_key():
            yield f"data: {json.dumps({'type': 'text', 'content': 'No API key configured. Open Settings (gear icon) and add your API key.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(no_key(), media_type="text/event-stream")

    past = (
        db.query(Message)
        .filter(Message.conversation_id == req.conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content} for m in past]

    user_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=req.conversation_id,
        role="user",
        content=req.message,
    )
    db.add(user_msg)
    if not past:
        conv.title = req.message[:60] + ("..." if len(req.message) > 60 else "")
    db.commit()

    collected_text   = []
    collected_code   = []
    collected_output = []
    collected_charts = []
    dataset_data = _dataset_dict(dataset)
    def generate():
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
                        _save(db, req.conversation_id)
                except Exception:
                    pass

    def _save(db, conv_id):
        db.add(Message(
            id              = str(uuid.uuid4()),
            conversation_id = conv_id,
            role            = "assistant",
            content         = "".join(collected_text),
            executed_code   = "\n\n# ---\n\n".join(collected_code) or None,
            code_output     = "\n".join(collected_output) or None,
            charts          = collected_charts or None,
        ))
        db.commit()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
