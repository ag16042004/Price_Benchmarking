# CASPER
Centralized Automated Solution for Price Estimation & Reasonability (PS-10, NTRO). Specs and status live in `docs/` (start with `docs/AI.md`).

## Quick start (no database, no Redis, mock results)
```bash
cp .env.example backend/.env       # then set DATA_STORE=memory, ADMIN_EMAIL, ADMIN_PASSWORD
cd backend && npm install && npm run dev      # API on :4000
cd frontend && npm install && npm run dev     # UI on :5173
```
Sign in with the admin you configured, or register an officer. Without a search provider the engine returns flagged **mock** results (use Make `nodata` to see the no-data screen).

## Live scraping
1. In `backend/.env`: `SEARCH_PROVIDER=brave` + `BRAVE_API_KEY`, or `SEARCH_PROVIDER=searxng` + `SEARXNG_URL`. Also set `SCRAPER_USER_AGENT` with your contact address.
2. Review `docs/SOURCES.md`; only active allow-listed sources are scraped.
3. Restart. Results are real (`isMock: false`).

## With PostgreSQL and Redis
```bash
docker compose up -d
# backend/.env: DATA_STORE=prisma, QUEUE=bull
cd backend && npm install && npx prisma db push && ADMIN_EMAIL=you@example.gov.in ADMIN_PASSWORD='a-long-password' npm run db:seed
npm run dev          # API
npm run worker       # scrape worker (separate terminal)
```

## Tests and checks
```bash
cd backend  && npm run lint && npm test          # REDIS_URL / DATABASE_URL enable the Redis and Postgres tests
cd frontend && npm run lint && npm test && npm run build    # UI tests start the real API in memory mode
node backend/scripts/smoke.js <url> --expect-results        # against a running deployment
```

## Deploy, demo, viva
`docs/DEPLOY.md` (Render) · `docs/Demo_Runbook.md` · `docs/QA_Prep.md` · `CHANGELOG.md`

## What is not verified
Live websites, the Prisma layer on real Postgres (CI will do it), the Docker build and the Render deployment, and a real browser. See `docs/AI.md` section 7.

Presenting to mentors: see `docs/Mentor_Demo_Guide.md` (search keys, demo setup, how to frame what is left).

## Run it with demo accounts and sample data
See `docs/RUN_GUIDE.md` (copy `.env.demo.example` to `backend/.env`, add your search key, `npm run dev` in `backend` and `frontend`). `npm run doctor` in `backend` checks every setting and endpoint. The code-review fixes are listed in `docs/Code_Review_Response.md`.

