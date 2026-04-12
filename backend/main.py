from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from db import engine, Base
from routers import chat, datasets
from routers.settings import router as settings_router

Base.metadata.create_all(bind=engine)

app = FastAPI(title="brAIn — AI Data Analyst", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(datasets.router,  prefix="/api/datasets", tags=["datasets"])
app.include_router(chat.router,      prefix="/api/chat",     tags=["chat"])
app.include_router(settings_router,  prefix="/api/settings", tags=["settings"])


@app.get("/health")
def health():
    return {"status": "ok"}
