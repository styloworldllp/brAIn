import json
import uuid
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db import get_db, Dataset, Conversation, Message, Organization, NeurixInstance, NeuronTransaction, User
from services.ai_service import stream_chat
from routers.settings import load_chat_settings, load_neurix_settings
from routers.auth import require_brain_access

_chat_rate: dict[str, list[float]] = defaultdict(list)
_CHAT_LIMIT  = int(__import__("os").getenv("CHAT_RATE_LIMIT", "30"))
_CHAT_WINDOW = int(__import__("os").getenv("CHAT_RATE_WINDOW", "60"))


def _check_chat_rate(user_id: str) -> None:
    now = time.time()
    _chat_rate[user_id] = [t for t in _chat_rate[user_id] if now - t < _CHAT_WINDOW]
    if len(_chat_rate[user_id]) >= _CHAT_LIMIT:
        raise HTTPException(429, f"Rate limit exceeded — max {_CHAT_LIMIT} queries per minute")
    _chat_rate[user_id].append(now)

router = APIRouter()


def _dataset_dict(d: Dataset) -> dict:
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


def _get_dataset(db: Session, user: User, dataset_id: str) -> Dataset:
    """Fetch a dataset that belongs to the user's org."""
    d = db.query(Dataset).filter(
        Dataset.id == dataset_id,
        Dataset.organization_id == user.organization_id,
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return d


def _get_conversation(db: Session, user: User, conversation_id: str) -> Conversation:
    """Fetch a conversation that belongs to the user's org."""
    c = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.organization_id == user.organization_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return c


@router.get("/conversations")
def list_conversations(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    convs = (
        db.query(Conversation)
        .filter(
            Conversation.dataset_id == dataset_id,
            Conversation.organization_id == user.organization_id,
        )
        .order_by(Conversation.created_at.desc())
        .all()
    )
    return [{"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()} for c in convs]


@router.post("/conversations")
def create_conversation(dataset_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    _get_dataset(db, user, dataset_id)  # verify ownership
    conv = Conversation(
        id=str(uuid.uuid4()),
        organization_id=user.organization_id,
        dataset_id=dataset_id,
    )
    db.add(conv)
    db.commit()
    return {"id": conv.id, "title": conv.title}


@router.get("/conversations/{conversation_id}/messages")
def get_messages(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    _get_conversation(db, user, conversation_id)  # verify ownership
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


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    conv = _get_conversation(db, user, conversation_id)
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.delete(conv)
    db.commit()
    return {"ok": True}


@router.patch("/conversations/{conversation_id}/title")
def update_conversation_title(conversation_id: str, body: dict, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    conv = _get_conversation(db, user, conversation_id)
    conv.title = body.get("title", conv.title)[:80]
    db.commit()
    return {"id": conv.id, "title": conv.title}


class ChatRequest(BaseModel):
    conversation_id:  str
    message:          str
    extra_dataset_ids: list[str] = []


@router.post("/stream")
def chat_stream(req: ChatRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    _check_chat_rate(str(user.id))
    conv = _get_conversation(db, user, req.conversation_id)

    # Dataset must belong to same org
    dataset = _get_dataset(db, user, conv.dataset_id)

    dataset_data   = _dataset_dict(dataset)
    extra_datasets = []
    for eid in req.extra_dataset_ids:
        # Only allow extra datasets from the same org
        ed = db.query(Dataset).filter(
            Dataset.id == eid,
            Dataset.organization_id == user.organization_id,
        ).first()
        if ed:
            extra_datasets.append(_dataset_dict(ed))

    org_id          = user.organization_id
    ai_settings     = load_chat_settings(db, org_id)
    neurix_settings = load_neurix_settings(db)
    conv_id         = str(conv.id)
    conv_title      = str(conv.title) if conv.title else ""

    provider = ai_settings.get("provider", "anthropic")

    # ── Neurix provider: load org instance + set up neuron deduction ──────────
    neurix_provider_settings = None
    deduct_neuron_fn = None
    if provider == "neurix":
        inst = db.query(NeurixInstance).filter(
            NeurixInstance.organization_id == org_id,
            NeurixInstance.is_active == True,
        ).first()
        if inst:
            neurix_provider_settings = {
                "endpoint_url": inst.endpoint_url,
                "model": inst.model_name,
            }
        org = db.query(Organization).filter(Organization.id == org_id).first()
        cost = (org.neuron_cost_per_query or 10) if org else 10

        def deduct_neuron_fn(_org_id=org_id, _cost=cost):
            from db import SessionLocal
            _db = SessionLocal()
            try:
                _org = _db.query(Organization).filter(Organization.id == _org_id).first()
                if not _org:
                    return False, "Organisation not found"
                balance = _org.neuron_balance or 0
                if balance < _cost:
                    return False, f"Insufficient neurons ({balance} available, {_cost} required)"
                _org.neuron_balance = balance - _cost
                tx = NeuronTransaction(
                    organization_id=_org_id,
                    amount=-_cost,
                    balance_after=_org.neuron_balance,
                    reason="query",
                    reference_id=conv_id,
                )
                _db.add(tx)
                _db.commit()
                return True, "ok"
            except Exception as exc:
                _db.rollback()
                return False, str(exc)
            finally:
                _db.close()
    else:
        if not ai_settings["api_key"]:
            def no_key():
                yield f"data: {json.dumps({'type': 'text', 'content': 'No API key set. Click Settings & API keys in the sidebar and add your key.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return StreamingResponse(no_key(), media_type="text/event-stream")

    past = (
        db.query(Message)
        .filter(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    history = [{"role": m.role, "content": m.content or ""} for m in past]

    db.add(Message(
        id=str(uuid.uuid4()),
        conversation_id=conv_id,
        role="user",
        content=req.message,
    ))
    new_title = None
    if not past and not conv_title:
        new_title  = req.message[:60] + ("…" if len(req.message) > 60 else "")
        conv.title = new_title
    db.commit()

    collected_text      = []
    collected_code      = []
    collected_output    = []
    collected_charts    = []
    collected_follow_ups: list[str] = []

    def generate():
        try:
            if new_title:
                yield f"data: {json.dumps({'type': 'conversation_title', 'title': new_title, 'conversation_id': conv_id})}\n\n"
            for raw in stream_chat(
                dataset           = dataset_data,
                history           = history,
                user_message      = req.message,
                provider          = provider,
                api_key           = ai_settings.get("api_key", ""),
                model             = ai_settings.get("model", ""),
                extra_datasets    = extra_datasets,
                neurix_settings   = neurix_provider_settings if provider == "neurix"
                                    else (neurix_settings if neurix_settings.get("api_key") else None),
                deduct_neuron_fn  = deduct_neuron_fn,
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
                            if ev.get("error"): out += "\n" + ev["error"]
                            collected_output.append(out)
                        elif t == "chart":
                            collected_charts.append(ev.get("chart_json"))
                        elif t == "follow_up_questions":
                            collected_follow_ups.extend(ev.get("questions", []))
                        elif t == "done":
                            _save_assistant(conv_id, org_id)
                    except Exception:
                        pass
        except Exception as e:
            yield f"data: {json.dumps({'type': 'text', 'content': f'Error: {str(e)}'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    def _save_assistant(cid: str, _org_id: str):
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


class RunCellRequest(BaseModel):
    code:       str
    dataset_id: str


@router.post("/run-cell")
def run_cell(req: RunCellRequest, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    from services.executor import execute_python
    dataset      = _get_dataset(db, user, req.dataset_id)
    dataset_data = _dataset_dict(dataset)
    result       = execute_python(req.code, dataset_data)
    return {
        "success": result["success"],
        "output":  result["output"],
        "error":   result.get("error"),
        "charts":  result["charts"],
    }
