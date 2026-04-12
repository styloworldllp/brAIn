#!/bin/bash
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ── Preflight ─────────────────────────────────────────────────────────────────
if [ ! -d backend/venv ]; then
  echo -e "${RED}✗ Not set up yet. Run ./setup.sh first.${NC}"
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo -e "${RED}✗ Node modules missing. Run ./setup.sh first.${NC}"
  exit 1
fi
if [ ! -f backend/.env ]; then
  echo -e "${RED}✗ backend/.env missing. Run ./setup.sh first.${NC}"
  exit 1
fi

mkdir -p logs

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down…${NC}"
  [ -n "$BACKEND_PID" ]  && kill "$BACKEND_PID"  2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      brAIn — Starting up…              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# ── Kill anything already on ports 8000 / 3000 ───────────────────────────────
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1

# ── Backend ───────────────────────────────────────────────────────────────────
cd backend
source venv/bin/activate
./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload \
  > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo -ne "${YELLOW}  Backend starting${NC}"
for i in $(seq 1 20); do
  curl -s http://localhost:8000/health &>/dev/null && break
  echo -n "."
  sleep 1
done
echo -e " ${GREEN}✓${NC}"
echo -e "  ${GREEN}Backend  → http://localhost:8000${NC}"

# ── Frontend ──────────────────────────────────────────────────────────────────
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo -ne "${YELLOW}  Frontend starting${NC}"
for i in $(seq 1 40); do
  curl -s http://localhost:3000 &>/dev/null && break
  echo -n "."
  sleep 1
done
echo -e " ${GREEN}✓${NC}"
echo -e "  ${GREEN}Frontend → http://localhost:3000${NC}"

echo ""
echo -e "  ${BLUE}Open http://localhost:3000 in your browser${NC}"
echo ""
echo -e "  Logs: tail -f logs/backend.log"
echo -e "        tail -f logs/frontend.log"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop."
echo ""

wait
