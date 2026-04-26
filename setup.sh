#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        brAIn — AI Data Analyst         ║${NC}"
echo -e "${BLUE}║              Setup v6                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ── Find Python 3.11 ──────────────────────────────────────────────────────────
echo -e "${YELLOW}Looking for Python 3.11…${NC}"

if command -v python3.11 &>/dev/null; then
  PYTHON=python3.11
elif [ -f /opt/homebrew/bin/python3.11 ]; then
  PYTHON=/opt/homebrew/bin/python3.11
elif [ -f /usr/local/bin/python3.11 ]; then
  PYTHON=/usr/local/bin/python3.11
else
  echo -e "${RED}✗ Python 3.11 not found.${NC}"
  echo ""
  echo "Install it with:"
  echo "  brew install python@3.11"
  exit 1
fi

echo -e "${GREEN}✓ $($PYTHON --version) found${NC}"

# ── Check Node ────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js not found. Install from https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Node $(node --version) found${NC}"

# ── API key ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Setting up environment…${NC}"

if [ ! -f backend/.env ]; then
  echo ""
  echo -e "${YELLOW}You can add your API key now, or set it later in the app's Settings panel.${NC}"
  echo -e "Press Enter to skip, or paste your Anthropic API key:"
  read -r -s API_KEY
  echo ""
  cp backend/.env.example backend/.env
  if [ -n "$API_KEY" ]; then
    sed -i '' "s|sk-ant-your-key-here|${API_KEY}|" backend/.env
    echo -e "${GREEN}✓ API key saved to .env${NC}"
  else
    echo -e "${GREEN}✓ .env created (add your key via Settings in the app)${NC}"
  fi
else
  echo -e "${GREEN}✓ .env already exists${NC}"
fi

# ── Backend ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Setting up Python environment…${NC}"
cd backend

# Recreate venv if it's not Python 3.11
if [ -d "venv" ]; then
  VENV_VER=$(venv/bin/python --version 2>&1 || echo "unknown")
  if [[ "$VENV_VER" != *"3.11"* ]]; then
    echo -e "${YELLOW}Removing old venv ($VENV_VER) → recreating with Python 3.11…${NC}"
    rm -rf venv
  fi
fi

if [ ! -d "venv" ]; then
  $PYTHON -m venv venv
  echo -e "${GREEN}✓ Virtual environment created (Python 3.11)${NC}"
else
  echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

source venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo -e "${GREEN}✓ All Python packages installed${NC}"

# Remove stale database so new tables are created cleanly
if [ -f app.db ]; then
  rm app.db
  echo -e "${GREEN}✓ Old database removed (will be recreated on first run)${NC}"
fi

mkdir -p data/uploads
cd ..

# ── Frontend ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Installing Node.js dependencies…${NC}"
cd frontend
npm install --registry https://registry.npmmirror.com --legacy-peer-deps --silent
echo -e "${GREEN}✓ Node packages installed${NC}"
cd ..

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Setup complete! ✓             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "Start the app:  ${BLUE}./start.sh${NC}"
echo -e "Then open:      ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  → Click ${YELLOW}Settings & API keys${NC} in the sidebar"
echo -e "  → Choose Anthropic or OpenAI and paste your key"
echo -e "  → Upload a CSV or connect a database"
echo ""
