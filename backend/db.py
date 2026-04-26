from sqlalchemy import create_engine, Column, String, DateTime, Text, JSON, Integer, Boolean, Enum, UniqueConstraint
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


def run_migrations():
    """Idempotent column additions — safe to run on every startup."""
    from sqlalchemy import text
    cols = [
        ("datasets",        "organization_id", "VARCHAR"),
        ("conversations",   "organization_id", "VARCHAR"),
        ("saved_charts",    "organization_id", "VARCHAR"),
        ("schedules",       "organization_id", "VARCHAR"),
        ("notebooks",       "organization_id", "VARCHAR"),
        ("live_connections","organization_id", "VARCHAR"),
        ("users",           "organization_id", "VARCHAR"),
        ("audit_logs",      "anonymized",      "BOOLEAN DEFAULT 0"),
        ("app_settings",    "organization_id", "VARCHAR"),
        ("secret_keys",     "organization_id", "VARCHAR"),
        ("datasets",        "is_restricted",   "BOOLEAN DEFAULT 0"),
        ("datasets",        "is_deleted",      "BOOLEAN DEFAULT 0"),
        ("datasets",        "deleted_at",      "DATETIME"),
        ("organizations",   "neuron_balance",  "INTEGER DEFAULT 0"),
        ("organizations",   "neuron_cost_per_query", "INTEGER DEFAULT 10"),
    ]
    with engine.connect() as conn:
        for table, col, typ in cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {typ}"))
                conn.commit()
            except Exception:
                pass  # column already exists


class AppSettings(Base):
    __tablename__ = "app_settings"
    key             = Column(String, primary_key=True)
    organization_id = Column(String, nullable=True, index=True)
    value           = Column(String, nullable=False)


class SecretKey(Base):
    """Generic secret vault — values are stored encrypted when ENCRYPTION_KEY is set."""
    __tablename__ = "secret_keys"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
    name            = Column(String, nullable=False)
    value           = Column(String, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Dataset(Base):
    __tablename__ = "datasets"
    id                = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id   = Column(String, nullable=True, index=True)
    name              = Column(String, nullable=False)
    source_type       = Column(String, nullable=False)
    file_path         = Column(String)
    connection_string = Column(String)
    table_or_query    = Column(String)
    sheets_url        = Column(String)
    row_count         = Column(Integer)
    schema_info       = Column(JSON)
    sample_data       = Column(JSON)
    is_restricted     = Column(Boolean, default=False)
    is_deleted        = Column(Boolean, default=False)
    deleted_at        = Column(DateTime, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow)


class Conversation(Base):
    __tablename__ = "conversations"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
    dataset_id      = Column(String, nullable=False)
    title           = Column(String, default="New conversation")
    created_at      = Column(DateTime, default=datetime.utcnow)


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
    organization_id = Column(String, nullable=True, index=True)
    title           = Column(String, nullable=False)
    dataset_id      = Column(String, nullable=False)
    conversation_id = Column(String, nullable=False)
    message_id      = Column(String)
    chart_json      = Column(JSON, nullable=False)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Schedule(Base):
    __tablename__ = "schedules"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
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
    __table_args__ = (
        UniqueConstraint("user_id", "dataset_id", name="uq_user_dataset"),
    )
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
    notes               = Column(Text, nullable=True)
    neuron_balance      = Column(Integer, default=0)
    neuron_cost_per_query = Column(Integer, default=10)
    created_at          = Column(DateTime, default=datetime.utcnow)


class NeurixInstance(Base):
    """One local-LLM instance per organization. Super admin provisions these."""
    __tablename__ = "neurix_instances"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=False, index=True)
    endpoint_url    = Column(String, nullable=False)   # e.g. http://10.0.0.5:11434/v1
    model_name      = Column(String, nullable=False, default="llama3")
    is_active       = Column(Boolean, default=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class NeuronTransaction(Base):
    """Ledger of neuron credits. Positive = top-up, negative = spend."""
    __tablename__ = "neuron_transactions"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=False, index=True)
    amount          = Column(Integer, nullable=False)   # +N topup, -N spend
    balance_after   = Column(Integer, nullable=False)
    reason          = Column(String, nullable=False)    # "topup" | "query" | "manual_adjust"
    reference_id    = Column(String, nullable=True)     # conversation_id or stripe payment_intent
    created_at      = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email           = Column(String, unique=True, nullable=False, index=True)
    username        = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=True)
    role            = Column(String, default="user")  # "super_admin" | "staff" | "admin" | "user"
    oauth_provider  = Column(String, nullable=True)
    oauth_id        = Column(String, nullable=True)
    avatar_url      = Column(String, nullable=True)
    is_active       = Column(Boolean, default=True)
    organization_id = Column(String, nullable=True, index=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_login      = Column(DateTime, nullable=True)


class AuditLog(Base):
    """
    Append-only audit log.
    - Never update or delete rows — immutability is required for 21 CFR Part 11.
    - integrity_hash is a SHA-256 over the core fields so tampering is detectable.
    - anonymized flag is set when GDPR erasure is requested; PII fields are overwritten.
    """
    __tablename__ = "audit_logs"
    id              = Column(String, primary_key=True)
    timestamp       = Column(DateTime, nullable=False, index=True)
    user_id         = Column(String, nullable=True, index=True)
    username        = Column(String, nullable=True)
    user_role       = Column(String, nullable=True)
    organization_id = Column(String, nullable=True, index=True)
    ip_address      = Column(String, nullable=True)
    user_agent      = Column(String, nullable=True)
    action          = Column(String, nullable=False, index=True)
    category        = Column(String, nullable=False, index=True)
    resource_type   = Column(String, nullable=True)
    resource_id     = Column(String, nullable=True, index=True)
    resource_name   = Column(String, nullable=True)
    details         = Column(JSON, nullable=True)
    status          = Column(String, default="success")   # success | failure | warning
    integrity_hash  = Column(String, nullable=False)       # SHA-256 — tamper detection
    anonymized      = Column(Boolean, default=False)       # GDPR erasure applied


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
    user_id         = Column(String, nullable=False, index=True)
    subject         = Column(String, nullable=False)
    description     = Column(Text, nullable=False)
    status          = Column(String, default="open")    # open | in_progress | resolved | closed
    priority        = Column(String, default="medium")  # low | medium | high | urgent
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TicketMessage(Base):
    __tablename__ = "ticket_messages"
    id         = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id  = Column(String, nullable=False, index=True)
    user_id    = Column(String, nullable=False)
    username   = Column(String, nullable=True)
    is_staff   = Column(Boolean, default=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AccessRequest(Base):
    __tablename__ = "access_requests"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
    dataset_id      = Column(String, nullable=False, index=True)
    user_id         = Column(String, nullable=False, index=True)
    username        = Column(String, nullable=True)
    reason          = Column(Text, nullable=False)
    status          = Column(String, default="pending")  # pending | approved | rejected
    reviewed_by     = Column(String, nullable=True)
    reviewed_at     = Column(DateTime, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id = Column(String, nullable=True, index=True)
    user_id         = Column(String, nullable=False, index=True)
    type            = Column(String, nullable=False)   # access_request | access_approved | access_rejected | schedule_ran
    title           = Column(String, nullable=False)
    body            = Column(Text, nullable=True)
    ref_id          = Column(String, nullable=True)    # access_request id or schedule id
    is_read         = Column(Boolean, default=False)
    created_at      = Column(DateTime, default=datetime.utcnow)
