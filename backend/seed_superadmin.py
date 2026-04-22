"""
Run once: python seed_superadmin.py
Creates the Stylo super admin account.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, Base, engine, User, Organization
from routers.auth import hash_password
from datetime import datetime

Base.metadata.create_all(bind=engine)

db = SessionLocal()

EMAIL    = "superadmin@stylo.ai"
USERNAME = "stylo_admin"
PASSWORD = "Stylo@2024!"

existing = db.query(User).filter(User.email == EMAIL).first()
if existing:
    existing.role = "super_admin"
    existing.is_active = True
    db.commit()
    print(f"✓ Updated existing user {EMAIL} → super_admin")
else:
    user = User(
        email=EMAIL, username=USERNAME,
        hashed_password=hash_password(PASSWORD),
        role="super_admin", is_active=True,
    )
    db.add(user)
    db.commit()
    print(f"✓ Created super admin: {EMAIL} / {PASSWORD}")

db.close()
print("Done. Navigate to http://localhost:3000/superadmin after login.")
