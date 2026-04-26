"""
Seed demo users for all three roles: super_admin, admin, and member.

Usage:
  cd backend
  python seed_demo_users.py
"""
import sys, os, uuid
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, Base, engine, User, Organization
from routers.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

# ── Create or reuse a demo organisation ────────────────────────────────────────
org = db.query(Organization).filter(Organization.slug == "demo-org").first()
if not org:
    org = Organization(
        id=str(uuid.uuid4()),
        name="Demo Organisation",
        slug="demo-org",
        plan="pro",
        status="active",
        contact_email="admin@demo.com",
    )
    db.add(org)
    db.commit()
    print(f"✓ Created organisation: {org.name} (id={org.id})")
else:
    print(f"✓ Using existing organisation: {org.name} (id={org.id})")

USERS = [
    {
        "email":    "superadmin@demo.com",
        "username": "superadmin",
        "password": "SuperAdmin@123",
        "role":     "super_admin",
        "org":      None,           # super_admin has no org
    },
    {
        "email":    "admin@demo.com",
        "username": "orgadmin",
        "password": "Admin@123",
        "role":     "admin",
        "org":      org.id,
    },
    {
        "email":    "member@demo.com",
        "username": "member",
        "password": "Member@123",
        "role":     "user",
        "org":      org.id,
    },
]

print()
print("=" * 52)
print(f"{'Role':<14} {'Email':<26} {'Password'}")
print("=" * 52)

for u in USERS:
    existing = db.query(User).filter(User.email == u["email"]).first()
    if existing:
        existing.hashed_password = hash_password(u["password"])
        existing.role            = u["role"]
        existing.is_active       = True
        existing.organization_id = u["org"]
        db.commit()
        tag = "updated"
    else:
        new_user = User(
            id=str(uuid.uuid4()),
            email=u["email"],
            username=u["username"],
            hashed_password=hash_password(u["password"]),
            role=u["role"],
            is_active=True,
            organization_id=u["org"],
        )
        db.add(new_user)
        db.commit()
        tag = "created"

    print(f"{u['role']:<14} {u['email']:<26} {u['password']}  [{tag}]")

print("=" * 52)
print()
print("Login at: http://localhost:3000/login")
print()
print("  super_admin → /superadmin  (platform management)")
print("  admin       → /            (full org admin)")
print("  member/user → /            (standard analyst access)")
print()

db.close()
