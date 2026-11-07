#!/usr/bin/env bash
# One-click start for Mac / Linux: creates backend/.env if missing, installs packages once, starts both servers.
set -e
cd "$(dirname "$0")"
[ -f backend/.env ] || { cp .env.demo.example backend/.env; echo "Created backend/.env from .env.demo.example"; }
[ -d backend/node_modules ] || (cd backend && npm install --no-audit --no-fund --prefer-offline)
[ -d frontend/node_modules ] || (cd frontend && npm install --no-audit --no-fund --prefer-offline)
(cd backend && npm run dev) & BACK=$!
(cd frontend && npm run dev) & FRONT=$!
trap 'kill $BACK $FRONT 2>/dev/null' EXIT
sleep 8; echo "Open http://localhost:5173  (Ctrl+C stops both)"; wait
