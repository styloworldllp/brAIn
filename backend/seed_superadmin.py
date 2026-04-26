"""
Run once to create the brAIn super admin account.

Usage:
  SUPER_ADMIN_EMAIL=admin@yourdomain.com \
  SUPER_ADMIN_PASSWORD=YourSecurePassword123! \
  python seed_superadmin.py

Optional:
  SUPER_ADMIN_USERNAME=superadmin  (defaults to "superadmin")
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from db import SessionLocal, Base, engine, User
from routers.auth import hash_password

Base.metadata.create_all(bind=engine)

EMAIL    = os.environ.get("SUPER_ADMIN_EMAIL")
USERNAME = os.environ.get("SUPER_ADMIN_USERNAME", "superadmin")
PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD")

if not EMAIL or not PASSWORD:
    print("ERROR: SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set.")
    print()
    print("  export SUPER_ADMIN_EMAIL=admin@yourdomain.com")
    print("  export SUPER_ADMIN_PASSWORD=YourSecurePassword123!")
    print("  python seed_superadmin.py")
    sys.exit(1)

db = SessionLocal()

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
    print(f"✓ Created super admin: {EMAIL}")

db.close()
print("Done. Navigate to /superadmin after login.")
