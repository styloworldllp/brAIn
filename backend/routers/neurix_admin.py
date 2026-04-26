"""
Neurix admin API — super admin manages instances and neuron balances.
Regular org admins can read their own balance/transactions.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from db import get_db, NeurixInstance, NeuronTransaction, Organization, User
from routers.auth import require_super_admin, require_brain_access

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_org(db: Session, org_id: str) -> Organization:
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    return org


def _deduct_neurons(db: Session, org: Organization, amount: int, reason: str, reference_id: str | None = None) -> tuple[bool, str]:
    """Deduct neurons from org balance. Returns (success, message)."""
    balance = org.neuron_balance or 0
    if balance < amount:
        return False, f"Insufficient neurons: {balance} available, {amount} required"
    org.neuron_balance = balance - amount
    tx = NeuronTransaction(
        organization_id=org.id,
        amount=-amount,
        balance_after=org.neuron_balance,
        reason=reason,
        reference_id=reference_id,
    )
    db.add(tx)
    db.commit()
    return True, "ok"


# ── Instance management (super admin only) ────────────────────────────────────

class InstanceBody(BaseModel):
    organization_id: str
    endpoint_url: str
    model_name: str = "llama3"
    is_active: bool = True
    notes: Optional[str] = None


@router.get("/instances")
def list_instances(db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    rows = db.query(NeurixInstance).order_by(NeurixInstance.created_at.desc()).all()
    orgs = {o.id: o.name for o in db.query(Organization).all()}
    return [
        {
            "id":              r.id,
            "organization_id": r.organization_id,
            "org_name":        orgs.get(r.organization_id, "—"),
            "endpoint_url":    r.endpoint_url,
            "model_name":      r.model_name,
            "is_active":       r.is_active,
            "notes":           r.notes,
            "created_at":      r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/instances")
def create_instance(body: InstanceBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    _get_org(db, body.organization_id)  # ensure org exists
    inst = NeurixInstance(**body.model_dump())
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return {"id": inst.id, "ok": True}


@router.patch("/instances/{instance_id}")
def update_instance(instance_id: str, body: dict, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    inst = db.query(NeurixInstance).filter(NeurixInstance.id == instance_id).first()
    if not inst:
        raise HTTPException(404, "Instance not found")
    for k, v in body.items():
        if hasattr(inst, k) and k not in ("id", "organization_id", "created_at"):
            setattr(inst, k, v)
    db.commit()
    return {"ok": True}


@router.delete("/instances/{instance_id}")
def delete_instance(instance_id: str, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    inst = db.query(NeurixInstance).filter(NeurixInstance.id == instance_id).first()
    if not inst:
        raise HTTPException(404, "Instance not found")
    db.delete(inst)
    db.commit()
    return {"ok": True}


# ── Neuron balance management (super admin) ───────────────────────────────────

class TopUpBody(BaseModel):
    amount: int
    reason: str = "topup"
    reference_id: Optional[str] = None


class AdjustCostBody(BaseModel):
    neuron_cost_per_query: int


@router.get("/orgs/{org_id}/neurons")
def get_neuron_info(org_id: str, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    org = _get_org(db, org_id)
    txs = (
        db.query(NeuronTransaction)
        .filter(NeuronTransaction.organization_id == org_id)
        .order_by(NeuronTransaction.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "org_id":            org.id,
        "org_name":          org.name,
        "neuron_balance":    org.neuron_balance or 0,
        "cost_per_query":    org.neuron_cost_per_query or 10,
        "transactions":      [
            {
                "id":           t.id,
                "amount":       t.amount,
                "balance_after": t.balance_after,
                "reason":       t.reason,
                "reference_id": t.reference_id,
                "created_at":   t.created_at.isoformat(),
            }
            for t in txs
        ],
    }


@router.post("/orgs/{org_id}/neurons/topup")
def topup_neurons(org_id: str, body: TopUpBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    if body.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    org = _get_org(db, org_id)
    org.neuron_balance = (org.neuron_balance or 0) + body.amount
    tx = NeuronTransaction(
        organization_id=org.id,
        amount=body.amount,
        balance_after=org.neuron_balance,
        reason=body.reason,
        reference_id=body.reference_id,
    )
    db.add(tx)
    db.commit()
    return {"ok": True, "new_balance": org.neuron_balance}


@router.patch("/orgs/{org_id}/neurons/cost")
def set_cost_per_query(org_id: str, body: AdjustCostBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    if body.neuron_cost_per_query < 1:
        raise HTTPException(400, "Cost must be at least 1")
    org = _get_org(db, org_id)
    org.neuron_cost_per_query = body.neuron_cost_per_query
    db.commit()
    return {"ok": True, "cost_per_query": org.neuron_cost_per_query}


# ── Test / dev utilities ──────────────────────────────────────────────────────

class TestSetupBody(BaseModel):
    org_id: str
    neurons: int = 1000


@router.post("/test-setup")
def setup_test_instance(body: TestSetupBody, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    """
    Provision a mock Neurix instance for an org and top up neurons.
    Safe to run multiple times — removes the old mock instance first.
    """
    from services.neurix_llm import MOCK_ENDPOINT
    org = _get_org(db, body.org_id)

    # Remove any existing mock instance for this org
    db.query(NeurixInstance).filter(
        NeurixInstance.organization_id == body.org_id,
        NeurixInstance.endpoint_url == MOCK_ENDPOINT,
    ).delete(synchronize_session=False)

    # Create fresh mock instance
    inst = NeurixInstance(
        organization_id=body.org_id,
        endpoint_url=MOCK_ENDPOINT,
        model_name="mock-llm",
        is_active=True,
        notes="Auto-provisioned mock instance for testing",
    )
    db.add(inst)

    # Top up neurons
    org.neuron_balance = (org.neuron_balance or 0) + body.neurons
    tx = NeuronTransaction(
        organization_id=body.org_id,
        amount=body.neurons,
        balance_after=org.neuron_balance,
        reason="test_topup",
        reference_id="test-setup",
    )
    db.add(tx)
    db.commit()
    return {
        "ok": True,
        "endpoint": MOCK_ENDPOINT,
        "model": "mock-llm",
        "neurons_added": body.neurons,
        "new_balance": org.neuron_balance,
    }


@router.get("/instances/{instance_id}/ping")
def ping_instance(instance_id: str, db: Session = Depends(get_db), _: User = Depends(require_super_admin)):
    """Check if a Neurix instance endpoint is reachable."""
    import time
    inst = db.query(NeurixInstance).filter(NeurixInstance.id == instance_id).first()
    if not inst:
        raise HTTPException(404, "Instance not found")

    from services.neurix_llm import _is_mock
    if _is_mock(inst.endpoint_url):
        return {"ok": True, "latency_ms": 0, "mock": True, "message": "Mock instance — always online"}

    import httpx
    base = inst.endpoint_url.rstrip("/")
    for path in ["/api/tags", "/v1/models", "/health"]:
        try:
            t0 = time.monotonic()
            resp = httpx.get(f"{base}{path}", timeout=5.0)
            ms = round((time.monotonic() - t0) * 1000)
            if resp.status_code < 500:
                return {"ok": True, "latency_ms": ms, "mock": False, "path": path}
        except Exception:
            pass
    return {"ok": False, "latency_ms": None, "mock": False,
            "message": "Could not reach endpoint. Make sure Ollama / vLLM is running."}


# ── Org admin — self-service ──────────────────────────────────────────────────

NEURON_PACKS = {
    "starter":    {"neurons": 500,   "label": "Starter",       "price": "$4.99",  "cents": 499},
    "pro":        {"neurons": 2000,  "label": "Professional",  "price": "$14.99", "cents": 1499},
    "enterprise": {"neurons": 10000, "label": "Enterprise",    "price": "$49.99", "cents": 4999},
}


class PurchaseBody(BaseModel):
    pack: str  # "starter" | "pro" | "enterprise"


@router.post("/purchase-neurons")
def purchase_neurons(body: PurchaseBody, db: Session = Depends(get_db), admin: User = Depends(require_brain_access)):
    """
    Grant neurons for the admin's org.
    Free during beta — Stripe integration replaces this endpoint later.
    """
    pack = NEURON_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(400, "Invalid pack. Use: starter, pro, enterprise")
    org_id = admin.organization_id
    if not org_id:
        raise HTTPException(400, "User has no organisation")
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(404, "Organisation not found")
    org.neuron_balance = (org.neuron_balance or 0) + pack["neurons"]
    db.add(NeuronTransaction(
        organization_id=org_id,
        amount=pack["neurons"],
        balance_after=org.neuron_balance,
        reason=f"purchase_{body.pack}",
    ))
    db.commit()
    return {"ok": True, "neurons_added": pack["neurons"], "new_balance": org.neuron_balance, "cost_per_query": org.neuron_cost_per_query or 10}


class CheckoutBody(BaseModel):
    pack: str
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


@router.post("/create-checkout-session")
def create_checkout_session(body: CheckoutBody, db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    """Create a Stripe Checkout session for a neuron pack purchase."""
    stripe_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not stripe_key or stripe_key.startswith("sk_test_..."):
        raise HTTPException(503, "Stripe not configured")

    pack = NEURON_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(400, "Invalid pack. Use: starter, pro, enterprise")

    org_id = user.organization_id
    if not org_id:
        raise HTTPException(400, "User has no organisation")

    try:
        import stripe as stripe_lib
        stripe_lib.api_key = stripe_key
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    success_url = body.success_url or f"{frontend_url}/?neurix=success&pack={body.pack}"
    cancel_url  = body.cancel_url  or f"{frontend_url}/?neurix=cancel"

    session = stripe_lib.checkout.Session.create(
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "product_data": {
                    "name": f"Neurix {pack['label']} — {pack['neurons']:,} neurons",
                    "description": f"~{pack['neurons'] // 10} AI analyses",
                },
                "unit_amount": pack["cents"],
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"org_id": org_id, "pack": body.pack, "user_id": user.id},
    )
    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Stripe webhook — no auth, verified by signature."""
    stripe_key    = os.getenv("STRIPE_SECRET_KEY", "")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    if not stripe_key or not webhook_secret:
        raise HTTPException(503, "Stripe not configured")

    try:
        import stripe as stripe_lib
        stripe_lib.api_key = stripe_key
    except ImportError:
        raise HTTPException(503, "stripe package not installed")

    payload   = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_lib.Webhook.construct_event(payload, sig_header, webhook_secret)
    except stripe_lib.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid Stripe signature")
    except Exception:
        raise HTTPException(400, "Webhook error")

    if event["type"] == "checkout.session.completed":
        session  = event["data"]["object"]
        metadata = session.get("metadata") or {}
        org_id   = metadata.get("org_id")
        pack_id  = metadata.get("pack")

        if org_id and pack_id:
            pack = NEURON_PACKS.get(pack_id)
            if pack:
                org = db.query(Organization).filter(Organization.id == org_id).first()
                if org:
                    org.neuron_balance = (org.neuron_balance or 0) + pack["neurons"]
                    db.add(NeuronTransaction(
                        organization_id=org_id,
                        amount=pack["neurons"],
                        balance_after=org.neuron_balance,
                        reason=f"stripe_{pack_id}",
                        reference_id=session.get("id"),
                    ))
                    db.commit()

    return {"ok": True}


@router.post("/auto-provision")
def auto_provision(db: Session = Depends(get_db), admin: User = Depends(require_brain_access)):
    """
    Any org admin can call this to auto-provision a mock Neurix instance for their org.
    Idempotent — safe to call multiple times.
    """
    from services.neurix_llm import MOCK_ENDPOINT
    org_id = admin.organization_id
    if not org_id:
        raise HTTPException(400, "User has no organisation")

    existing = (
        db.query(NeurixInstance)
        .filter(NeurixInstance.organization_id == org_id, NeurixInstance.is_active == True)
        .first()
    )
    if existing:
        org = db.query(Organization).filter(Organization.id == org_id).first()
        return {
            "ok": True, "already_existed": True,
            "neuron_balance": (org.neuron_balance or 0) if org else 0,
            "cost_per_query": (org.neuron_cost_per_query or 10) if org else 10,
            "endpoint_url": existing.endpoint_url,
            "model_name": existing.model_name,
        }

    inst = NeurixInstance(
        organization_id=org_id,
        endpoint_url=MOCK_ENDPOINT,
        model_name="mock-llm",
        is_active=True,
        notes="Auto-provisioned on first activation",
    )
    db.add(inst)

    DEMO_NEURONS = 50
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if org:
        org.neuron_balance = (org.neuron_balance or 0) + DEMO_NEURONS
        db.add(NeuronTransaction(
            organization_id=org_id,
            amount=DEMO_NEURONS,
            balance_after=org.neuron_balance,
            reason="demo_grant",
            reference_id="welcome",
        ))

    db.commit()
    return {
        "ok": True, "already_existed": False, "neurons_granted": DEMO_NEURONS,
        "neuron_balance": (org.neuron_balance or 0) if org else DEMO_NEURONS,
        "cost_per_query": (org.neuron_cost_per_query or 10) if org else 10,
        "endpoint_url": MOCK_ENDPOINT,
        "model_name": "mock-llm",
    }


# ── Org admin / user — read their own balance & instance ─────────────────────

@router.get("/my-status")
def my_neurix_status(db: Session = Depends(get_db), user: User = Depends(require_brain_access)):
    """Returns the Neurix status visible to the currently logged-in user."""
    org_id = user.organization_id
    if not org_id:
        return {"has_instance": False, "neuron_balance": 0, "cost_per_query": 10}

    inst = (
        db.query(NeurixInstance)
        .filter(NeurixInstance.organization_id == org_id, NeurixInstance.is_active == True)
        .first()
    )
    org = db.query(Organization).filter(Organization.id == org_id).first()
    return {
        "has_instance":    inst is not None,
        "endpoint_url":    inst.endpoint_url if inst else None,
        "model_name":      inst.model_name if inst else None,
        "neuron_balance":  (org.neuron_balance or 0) if org else 0,
        "cost_per_query":  (org.neuron_cost_per_query or 10) if org else 10,
    }
