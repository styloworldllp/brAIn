"""
Auth router — username/password + OAuth (Google, Microsoft, Apple, Yahoo)
JWT session tokens, user registration and login.
"""
import uuid, os, hashlib, hmac, secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import jwt as pyjwt
from db import get_db, Base, engine

router = APIRouter()

# ── Models ────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email           = Column(String, unique=True, nullable=False, index=True)
    username        = Column(String, unique=True, nullable=False, index=True, default="")
    hashed_password = Column(String, nullable=True)
    role            = Column(String, default="user")
    oauth_provider  = Column(String, nullable=True)
    oauth_id        = Column(String, nullable=True)
    avatar_url      = Column(String, nullable=True)
    is_active       = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_login      = Column(DateTime, nullable=True)

Base.metadata.create_all(bind=engine)

# ── JWT helpers ───────────────────────────────────────────────────────────────
JWT_SECRET  = os.getenv("JWT_SECRET", secrets.token_hex(32))
JWT_EXPIRY  = int(os.getenv("JWT_EXPIRY_HOURS", "720"))  # 30 days

def make_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY)}
    return pyjwt.encode(payload, JWT_SECRET, algorithm="HS256")

def verify_token(token: str) -> dict:
    try:
        return pyjwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

def check_password(plain: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(plain), hashed)

def user_to_dict(u: User) -> dict:
    return {
        "id": u.id, "email": u.email, "username": u.username,
        "avatar_url": u.avatar_url, "role": u.role,
        "is_active": u.is_active, "oauth_provider": u.oauth_provider,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
    }

def require_auth(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = verify_token(token)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found or disabled")
    return user

def require_admin(request: Request, db: Session = Depends(get_db)) -> User:
    user = require_auth(request, db)
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user

def require_brain_access(request: Request, db: Session = Depends(get_db)) -> User:
    user = require_auth(request, db)
    if user.role == "super_admin":
        raise HTTPException(403, "Super admin accounts do not have brAIn workspace access")
    return user

def require_super_admin(request: Request, db: Session = Depends(get_db)) -> User:
    user = require_auth(request, db)
    if user.role != "super_admin":
        raise HTTPException(403, "Super admin access required")
    return user

# ── OAuth config ──────────────────────────────────────────────────────────────
FRONTEND   = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND    = os.getenv("BACKEND_URL",  "http://localhost:8000")

OAUTH_CFG = {
    "google": {
        "client_id":     os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "auth_url":      "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url":     "https://oauth2.googleapis.com/token",
        "userinfo_url":  "https://www.googleapis.com/oauth2/v3/userinfo",
        "scope":         "openid email profile",
    },
    "microsoft": {
        "client_id":     os.getenv("MICROSOFT_CLIENT_ID", ""),
        "client_secret": os.getenv("MICROSOFT_CLIENT_SECRET", ""),
        "auth_url":      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url":     "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "userinfo_url":  "https://graph.microsoft.com/v1.0/me",
        "scope":         "openid email profile User.Read",
    },
    "yahoo": {
        "client_id":     os.getenv("YAHOO_CLIENT_ID", ""),
        "client_secret": os.getenv("YAHOO_CLIENT_SECRET", ""),
        "auth_url":      "https://api.login.yahoo.com/oauth2/request_auth",
        "token_url":     "https://api.login.yahoo.com/oauth2/get_token",
        "userinfo_url":  "https://api.login.yahoo.com/openid/v1/userinfo",
        "scope":         "openid email profile",
    },
    "apple": {
        "client_id":     os.getenv("APPLE_CLIENT_ID", ""),
        "client_secret": os.getenv("APPLE_CLIENT_SECRET", ""),
        "auth_url":      "https://appleid.apple.com/auth/authorize",
        "token_url":     "https://appleid.apple.com/auth/token",
        "userinfo_url":  "",
        "scope":         "name email",
    },
}

# ── Email/password ─────────────────────────────────────────────────────────────
class RegisterReq(BaseModel):
    email: str; password: str; username: str = ""

class LoginReq(BaseModel):
    email: str; password: str

@router.post("/register")
def register(req: RegisterReq, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email.lower()).first():
        raise HTTPException(400, "Email already registered")
    uname = req.username or req.email.split("@")[0]
    user = User(email=req.email.lower(), username=uname,
                oauth_provider="password", hashed_password=hash_password(req.password))
    db.add(user); db.commit()
    return {"token": make_token(user.id, user.email), "user": user_to_dict(user)}

@router.post("/login")
def login(req: LoginReq, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not user.hashed_password or not check_password(req.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    return {"token": make_token(user.id, user.email), "user": user_to_dict(user)}

@router.get("/me")
def me(user: User = Depends(require_auth)):
    return user_to_dict(user)

@router.patch("/me/profile")
async def update_profile(request: Request, db: Session = Depends(get_db)):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not token: raise HTTPException(401, "Not authenticated")
    payload = verify_token(token)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user: raise HTTPException(401, "User not found")
    body = await request.json()
    if "username" in body and body["username"]:
        existing = db.query(User).filter(User.username == body["username"], User.id != user.id).first()
        if existing: raise HTTPException(400, "Username already taken")
        user.username = body["username"]
    if "password" in body and body["password"]:
        user.hashed_password = hash_password(body["password"])
    db.commit()
    return user_to_dict(user)

# ── OAuth initiate ─────────────────────────────────────────────────────────────
@router.get("/oauth/{provider}")
def oauth_start(provider: str):
    cfg = OAUTH_CFG.get(provider)
    if not cfg: raise HTTPException(404, f"Provider '{provider}' not supported")
    if not cfg["client_id"]:
        raise HTTPException(503, f"{provider.title()} OAuth not configured — add {provider.upper()}_CLIENT_ID to backend/.env")
    import urllib.parse
    state   = secrets.token_urlsafe(16)
    redirect = f"{BACKEND}/api/auth/oauth/{provider}/callback"
    params  = {"client_id": cfg["client_id"], "redirect_uri": redirect,
               "response_type": "code", "scope": cfg["scope"], "state": state}
    if provider == "apple":
        params["response_mode"] = "form_post"
    url = cfg["auth_url"] + "?" + urllib.parse.urlencode(params)
    return RedirectResponse(url)

# ── OAuth callback ─────────────────────────────────────────────────────────────
@router.get("/oauth/{provider}/callback")
@router.post("/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, db: Session = Depends(get_db)):
    import httpx, urllib.parse
    cfg = OAUTH_CFG.get(provider)
    if not cfg: raise HTTPException(404, "Unknown provider")

    # Get code from query or form
    if request.method == "POST":
        form = await request.form()
        code = form.get("code", "")
    else:
        code = request.query_params.get("code", "")

    if not code:
        return RedirectResponse(f"{FRONTEND}/login?error=oauth_denied")

    redirect = f"{BACKEND}/api/auth/oauth/{provider}/callback"

    # Exchange code for token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(cfg["token_url"], data={
            "client_id": cfg["client_id"], "client_secret": cfg["client_secret"],
            "code": code, "redirect_uri": redirect, "grant_type": "authorization_code",
        }, headers={"Accept": "application/json"})

        if token_resp.status_code != 200:
            return RedirectResponse(f"{FRONTEND}/login?error=token_exchange_failed")

        token_data = token_resp.json()
        access_token = token_data.get("access_token", "")
        id_token_str = token_data.get("id_token", "")

        # Get user info
        email, name, avatar, provider_id = "", "", "", ""
        if provider == "apple" and id_token_str:
            parts = id_token_str.split(".")
            import base64, json
            pad = len(parts[1]) % 4
            claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (4 - pad) if pad else parts[1]))
            email = claims.get("email", "")
            provider_id = claims.get("sub", "")
            name = (await request.form()).get("user", "")
            if name:
                try: user_obj = json.loads(name); name = f"{user_obj.get('name',{}).get('firstName','')} {user_obj.get('name',{}).get('lastName','')}".strip()
                except: name = ""
        elif cfg["userinfo_url"] and access_token:
            info_resp = await client.get(cfg["userinfo_url"], headers={"Authorization": f"Bearer {access_token}"})
            info = info_resp.json()
            if provider == "microsoft":
                email = info.get("mail") or info.get("userPrincipalName", "")
                name = info.get("displayName", "")
                provider_id = info.get("id", "")
            else:
                email = info.get("email", "")
                name = info.get("name", "") or f"{info.get('given_name','')} {info.get('family_name','')}".strip()
                avatar = info.get("picture", "")
                provider_id = info.get("sub", "") or info.get("id", "")

    if not email:
        return RedirectResponse(f"{FRONTEND}/login?error=no_email")

    # Upsert user
    user = db.query(User).filter(User.email == email.lower()).first()
    if user:
        user.oauth_provider = provider
        user.oauth_id = provider_id
        if not user.avatar_url and avatar: user.avatar_url = avatar
    else:
        uname = (name or email.split("@")[0]).replace(" ", "_").lower()
        user = User(email=email.lower(), username=uname,
                    avatar_url=avatar or None, oauth_provider=provider, oauth_id=provider_id)
        db.add(user)
    db.commit()

    token = make_token(user.id, user.email)
    return RedirectResponse(f"{FRONTEND}/login?token={token}")
