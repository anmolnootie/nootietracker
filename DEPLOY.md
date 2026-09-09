# Deploying Nootie Control Tower (Railway + Supabase)

## Architecture
- **backend** (Railway service) - NestJS API, `PROCESS_ROLE=web`, cron jobs disabled
- **worker** (Railway service) - same image, `PROCESS_ROLE=worker`, runs the SLA/Risk/AVV-follow-up/stuck-stock cron jobs, no HTTP port
- **frontend** (Railway service) - Next.js UI
- **Postgres** - Supabase (external to Railway)
- **File storage** - Supabase Storage (S3-compatible)

All three Railway services build from this repo using the existing `Dockerfile.backend` / `Dockerfile.frontend` (backend and worker share `Dockerfile.backend`, differing only by the `PROCESS_ROLE` env var).

## 1. Supabase setup
1. In your Supabase project → **Project Settings → Database → Connection string**, copy the **Session pooler** or **Transaction pooler** URI (port 6543/5432). This becomes `DATABASE_HOST` / `DATABASE_PORT` / `DATABASE_USER` / `DATABASE_PASSWORD` / `DATABASE_NAME` below.
2. In **Storage**, create a bucket (e.g. `nootie-documents`).
3. In **Project Settings → Storage → S3 Connection** (Supabase exposes an S3-compatible endpoint), copy the endpoint URL, access key ID, and secret access key.

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
DATABASE_HOST=<supabase pooler host>
DATABASE_PORT=<supabase pooler port>
DATABASE_USER=<supabase user>
DATABASE_PASSWORD=<supabase password>
DATABASE_NAME=<supabase database>
DATABASE_SSL=true
JWT_SECRET=<generate a strong one - see below>
JWT_EXPIRATION=24h
FRONTEND_URL=https://<your-frontend-domain>
SPACES_KEY=<supabase storage access key id>
SPACES_SECRET=<supabase storage secret access key>
SPACES_ENDPOINT=<supabase storage s3 endpoint>
SPACES_BUCKET=nootie-documents
SPACES_REGION=auto
PARTNERSBIZ_API_KEY=<from Blinkit, once issued>
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
