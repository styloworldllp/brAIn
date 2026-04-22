from sqlalchemy import create_engine, Column, String, DateTime, Text, JSON, Integer, Boolean, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uuid
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class AppSettings(Base):
    __tablename__ = "app_settings"
    key   = Column(String, primary_key=True)
    value = Column(String, nullable=False)

class Dataset(Base):
    __tablename__ = "datasets"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name              = Column(String, nullable=False)
    source_type       = Column(String, nullable=False)
    file_path         = Column(String)
    connection_string = Column(String)
    table_or_query    = Column(String)
    sheets_url        = Column(String)
    row_count         = Column(Integer)
    schema_info       = Column(JSON)
    sample_data       = Column(JSON)
    created_at        = Column(DateTime, default=datetime.utcnow)

class Conversation(Base):
    __tablename__ = "conversations"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dataset_id = Column(String, nullable=False)
    title      = Column(String, default="New conversation")
    created_at = Column(DateTime, default=datetime.utcnow)

class Message(Base):
    __tablename__ = "messages"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(String, nullable=False)
    role            = Column(String, nullable=False)
    content         = Column(Text, nullable=False)
    executed_code   = Column(Text)
    code_output     = Column(Text)
    charts          = Column(JSON)
    created_at      = Column(DateTime, default=datetime.utcnow)

class SavedChart(Base):
    __tablename__ = "saved_charts"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title           = Column(String, nullable=False)
    dataset_id      = Column(String, nullable=False)
    conversation_id = Column(String, nullable=False)
    message_id      = Column(String)
    chart_json      = Column(JSON, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)

class Schedule(Base):
    __tablename__ = "schedules"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title           = Column(String, nullable=False)
    dataset_id      = Column(String, nullable=False)
    conversation_id = Column(String, nullable=False)
    question        = Column(Text, nullable=False)
    cron            = Column(String, nullable=False)
    email           = Column(String, nullable=False)
    active          = Column(Boolean, default=True)
    last_run        = Column(DateTime)
    created_at      = Column(DateTime, default=datetime.utcnow)

class DatasetPermission(Base):
    __tablename__ = "dataset_permissions"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String, nullable=False, index=True)
    dataset_id = Column(String, nullable=False, index=True)
    can_read   = Column(Boolean, default=True)
    granted_at = Column(DateTime, default=datetime.utcnow)

class Organization(Base):
    __tablename__ = "organizations"
    id            = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name          = Column(String, nullable=False)
    slug          = Column(String, unique=True, nullable=False, index=True)
    plan          = Column(String, default="trial")   # trial | starter | pro | enterprise
    status        = Column(String, default="trial")   # trial | active | suspended | cancelled
    contact_email = Column(String, nullable=True)
    query_limit   = Column(Integer, default=500)
    notes         = Column(Text, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "users"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email           = Column(String, unique=True, nullable=False, index=True)
    username        = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    role            = Column(String, default="user")  # "super_admin" | "admin" | "user" | "viewer"
    oauth_provider  = Column(String, nullable=True)
    oauth_id        = Column(String, nullable=True)
    avatar_url      = Column(String, nullable=True)
    is_active       = Column(Boolean, default=True)
    organization_id = Column(String, nullable=True, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_login      = Column(DateTime, nullable=True)
