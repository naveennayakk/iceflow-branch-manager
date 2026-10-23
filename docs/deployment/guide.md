# Deployment Guide

## Local / laptop (default)

SQLite file at `data/iceflow.db`. Run `npm run setup` then `npm run dev`.

## Hardening for production

1. Change all secrets in `backend/.env`  
2. Set strong `MAIN_ADMIN_PASSWORD` before first seed, or rotate after  
3. Serve frontend build behind HTTPS  
4. Proxy `/api` to the Node process  
5. Restrict CORS_ORIGIN to your domain  
6. Schedule `npm run backup` (cron / Task Scheduler)  
7. Prefer PostgreSQL for multi-server / phone access — see **[remote-database.md](./remote-database.md)**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

```bash
docker compose up -d
# then set DATABASE_URL and switch provider as in remote-database.md
```

## Build

```bash
npm run build
npm run start -w backend
# serve frontend/dist with nginx or similar
```

## Restore / rollback

1. Main Admin → Backup  
2. Create backup before restore  
3. Restore selected file (auto pre-restore snapshot)  
4. Restart API process  

## HTTPS

Terminate TLS at nginx/Caddy/IIS. Forward to `localhost:4000`. Never expose SQLite file over the network.
