# Deploying Nootie Control Tower (Railway + Supabase)

## Architecture
- **backend** (Railway service) - NestJS API, `PROCESS_ROLE=web`, cron jobs disabled
- **worker** (Railway service) - same image, `PROCESS_ROLE=worker`, runs the SLA/Risk/AVV-follow-up/stuck-stock cron jobs, no HTTP port
- **frontend** (Railway service) - Next.js UI
- **Postgres** - Supabase (external to Railway)
- **File storage** - Supabase Storage (S3-compatible)

All three Railway services build from this repo using the existing `Dockerfile.backend` / `Dockerfile.frontend` (backend and worker share `Dockerfile.backend`, differing only by the `PROCESS_ROLE` env var).

## 1. Supabase setup (done)
- Database: Session pooler, `aws-0-ap-south-1.pooler.supabase.com:5432`, database `postgres` - migrated and verified (29 tables).
- Storage bucket: `PO Files` (yes, with a space - the S3-compatible client uses path-style addressing so this works, verified with a live put/get/delete round trip).
- S3 endpoint: `https://xcjrvrnpfvstfpxskfmm.storage.supabase.co/storage/v1/s3`, region `ap-south-1`.
- Access key ID / secret: generated in Supabase → not written here, set directly in Railway's env var UI (see below).

## 2. Railway setup (per service)
Create a new Railway project from the `anmolnootie/nootietracker` GitHub repo, then add 3 services:

| Service | Dockerfile | Notes |
|---|---|---|
| backend | `Dockerfile.backend` | Set **Networking → Public Domain**, exposes port 8001 |
| worker | `Dockerfile.backend` (same file) | No public domain needed |
| frontend | `Dockerfile.frontend` | Set **Networking → Public Domain**, exposes port 8000 |

For each, set **Root Directory** to `/` (repo root) since the Dockerfiles expect the monorepo context.

### Env vars - backend
```
NODE_ENV=production
PORT=8001
PROCESS_ROLE=web
DATABASE_HOST=aws-0-ap-south-1.pooler.supabase.com
DATABASE_PORT=5432
DATABASE_USER=postgres.xcjrvrnpfvstfpxskfmm
DATABASE_PASSWORD=<supabase db password - shared in chat, not repeated here>
DATABASE_NAME=postgres
DATABASE_SSL=true
JWT_SECRET=<generate a strong one - see below>
JWT_EXPIRATION=24h
FRONTEND_URL=https://<your-frontend-domain>
SPACES_KEY=<supabase storage access key id - shared in chat, not repeated here>
SPACES_SECRET=<supabase storage secret access key - shared in chat, not repeated here>
SPACES_ENDPOINT=https://xcjrvrnpfvstfpxskfmm.storage.supabase.co/storage/v1/s3
SPACES_BUCKET=PO Files
SPACES_REGION=ap-south-1
PARTNERSBIZ_API_KEY=<from Blinkit, once issued>
SHEET_SYNC_KEY=<long random secret; same value goes in the Google Sheet's Apps Script - leave unset to disable the sync>
```

### Env vars - worker
Same as backend, except:
```
PROCESS_ROLE=worker
```
(no `PORT`/`FRONTEND_URL` needed)

### Env vars - frontend
```
NODE_ENV=production
NEXT_PUBLIC_API_URL=https://<your-backend-domain>
```

## 3. Database migrations
Migrations run automatically on backend boot (`migrationsRun: true` when `NODE_ENV=production` - see `apps/backend/src/database/database.module.ts`). No manual step needed after the first deploy.

## 4. Domain
Once services are live, point your domain's DNS (CNAME) at the Railway-provided domains for `frontend` and `backend`, or use Railway's custom domain UI directly.
