# PO Control Tower — Local Development

This repository contains a full-stack PO Control Tower application (Phase 1 scaffold).

Quick start (uses Docker Compose):

```bash
# build and start Postgres + backend + frontend
docker-compose up --build

# open in browser:
# Frontend: http://localhost:3000
# Backend API: http://localhost:3001
```

Seed demo data (dev only):

```bash
# after services are up, call the seed endpoint once
curl http://localhost:3001/scripts/seed
```

Notes:
- Backend runs on port `3001` and uses TypeORM `synchronize: true` for development.
- Change secrets in `.env.local` for local development; do NOT use these values in production.
- This scaffolding provides basic auth, PO CRUD, status & risk engines, and a simple frontend.

Next steps:
- Implement background jobs (BullMQ), notification integration (WhatsApp/SendGrid), and migrations for production.
