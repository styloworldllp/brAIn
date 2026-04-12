# AI Data Analyst

BrAIn by Stylo is a data analysis platform built with Next.js + FastAPI + Claude AI.
Upload your data, ask questions in plain English, and get Python-powered insights and charts.

## Features

- **CSV & Excel** file upload with drag-and-drop
- **PostgreSQL & MySQL** database connector
- **Google Sheets** integration (public or private)
- **Streaming chat** — see Claude's responses token by token
- **Python code execution** — Claude writes and runs analysis code
- **Interactive Plotly charts** embedded in chat
- **Conversation history** — multiple chats per dataset

## Quick start (Mac)

### 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| Anthropic API key | — | https://console.anthropic.com |

### 2. Install & run

```bash
# Clone or unzip this project
cd ai-analyst

# Run setup (installs Python venv + Node packages, creates .env)
chmod +x setup.sh start.sh
./setup.sh

# Start both servers
./start.sh
```

Open **http://localhost:3000** in your browser.

---

## Manual setup (if you prefer)

```bash
# Backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install --legacy-peer-deps
npm run dev
```

---

## Connecting data sources

### CSV / Excel
Click **Upload** in the sidebar → drag your file → it's ready instantly.

### PostgreSQL / MySQL
Click **Connect** → Database tab → fill in host, port, database, credentials, and either a table name or a `SELECT` query.

### Google Sheets

**Public sheet** (easiest):
1. In Google Sheets: Share → Anyone with the link → Viewer
2. Click Connect → Google Sheets tab → paste the URL
3. Leave the JSON field empty

**Private sheet** (requires a service account):
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable the Google Sheets API and Google Drive API
3. Create a Service Account → Download the JSON key
4. In your Google Sheet: Share → add the service account email as a Viewer
5. Paste the full JSON content into the "Service account JSON" field

---

## Project structure

```
ai-analyst/
├── backend/
│   ├── main.py                  # FastAPI app + CORS
│   ├── db.py                    # SQLite models (datasets, conversations, messages)
│   ├── requirements.txt
│   ├── .env.example
│   ├── routers/
│   │   ├── chat.py              # SSE streaming + conversation endpoints
│   │   └── datasets.py          # Upload, DB connect, Sheets connect
│   └── services/
│       ├── claude_service.py    # Agentic loop with tool use
│       ├── executor.py          # Subprocess code sandbox
│       └── data_loader.py       # pandas loaders for all sources
└── frontend/
    ├── app/
    │   ├── layout.tsx
    │   └── page.tsx             # Root page (sidebar + chat)
    ├── components/
    │   ├── DataSidebar.tsx      # Dataset list + conversation list
    │   ├── ChatInterface.tsx    # Main chat UI + streaming
    │   ├── MessageBubble.tsx    # Renders text, code, output, charts
    │   ├── ChartDisplay.tsx     # Plotly chart wrapper
    │   ├── UploadModal.tsx      # Drag-and-drop file upload
    │   └── ConnectModal.tsx     # DB + Google Sheets forms
    └── lib/
        └── api.ts               # All API calls + stream reader
```

---

## How it works

1. **You upload data** → parsed to pandas → stored as Parquet + SQLite metadata
2. **You ask a question** → sent to Claude with your dataset schema + sample rows
3. **Claude writes Python** → executed in an isolated subprocess (30s timeout)
4. **Results stream back** → text + code + output + Plotly charts appear in real time
5. **Everything is saved** → conversation history persists across sessions

---

## Extending the app

### Add a new data source
1. Add a loader function in `backend/services/data_loader.py`
2. Add a route in `backend/routers/datasets.py`
3. Add a form in `frontend/components/ConnectModal.tsx`

### Change the LLM model
Edit `MODEL` in `backend/services/claude_service.py`.

### Increase row limit
Edit `MAX_ROWS` in `backend/.env` (default: 100,000).

### Production deployment
- Backend: Docker + Gunicorn on any VPS or AWS ECS
- Frontend: Vercel (free tier works great)
- Database: Replace SQLite with PostgreSQL (RDS)
- Code sandbox: Replace subprocess with E2B for better isolation
