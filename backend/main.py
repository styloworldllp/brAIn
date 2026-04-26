import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()

from db import engine, Base, run_migrations
from routers import chat, datasets
from routers.auth       import router as auth_router
from routers.admin      import router as admin_router
from routers.superadmin import router as superadmin_router
from routers.settings   import router as settings_router
from routers.charts     import router as charts_router
from routers.schedules  import router as schedules_router, start_scheduler, stop_scheduler
from routers.notebooks  import router as notebooks_router
from routers.db_explorer import router as db_explorer_router
from routers.support          import router as support_router
from routers.audit            import router as audit_router
from routers.access_requests  import router as access_requests_router
from routers.notifications    import router as notifications_router
from routers.neurix_admin     import router as neurix_admin_router

Base.metadata.create_all(bind=engine)
run_migrations()

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="brAIn", version="4.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router,          prefix="/api/auth",       tags=["auth"])
app.include_router(admin_router,         prefix="/api/admin",      tags=["admin"])
app.include_router(superadmin_router,    prefix="/api/superadmin", tags=["superadmin"])
app.include_router(datasets.router,      prefix="/api/datasets",   tags=["datasets"])
app.include_router(chat.router,          prefix="/api/chat",       tags=["chat"])
app.include_router(settings_router,      prefix="/api/settings",   tags=["settings"])
app.include_router(charts_router,        prefix="/api/charts",     tags=["charts"])
app.include_router(schedules_router,     prefix="/api/schedules",  tags=["schedules"])
app.include_router(notebooks_router,     prefix="/api/notebooks",  tags=["notebooks"])
app.include_router(db_explorer_router,   prefix="/api/db",         tags=["db-explorer"])
app.include_router(support_router,           prefix="/api/support",         tags=["support"])
app.include_router(audit_router,             prefix="/api/audit",           tags=["audit"])
app.include_router(access_requests_router,   prefix="/api/access-requests", tags=["access-requests"])
app.include_router(notifications_router,     prefix="/api/notifications",   tags=["notifications"])
app.include_router(neurix_admin_router,      prefix="/api/neurix",          tags=["neurix"])


@app.get("/health")
def health():
    return {"status": "ok"}
