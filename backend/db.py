from sqlalchemy import create_engine, Column, String, DateTime, Text, JSON, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import uuid
from datetime import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
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
    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id= Column(String, nullable=False)
    role           = Column(String, nullable=False)
    content        = Column(Text, nullable=False)
    executed_code  = Column(Text)
    code_output    = Column(Text)
    charts         = Column(JSON)
    created_at     = Column(DateTime, default=datetime.utcnow)
