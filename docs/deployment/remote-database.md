# Remote database — use IceFlow from anywhere

IceFlow uses **PostgreSQL only** (no local SQLite). Prefer **Supabase** — full steps: [supabase.md](./supabase.md).

To open the app from your phone or another laptop when you are away, point `DATABASE_URL` / `DIRECT_URL` at Supabase (or Docker Postgres) and host the API so it can reach that database.

## Option A — Free cloud Postgres (recommended)

Works even when your home PC is off, if you also host the backend (Railway, Render, a VPS, etc.).

1. Create a free database at [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app).
2. Copy the connection string, e.g.  
   `postgresql://USER:PASSWORD@HOST/iceflow?sslmode=require`
3. On the machine (or host) that runs the API:

   ```bash
   # backend/.env
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/iceflow?sslmode=require"
   CORS_ORIGIN=https://your-frontend-domain
   ```

4. Switch Prisma to Postgres (one-time):

   In `backend/prisma/schema.prisma` change:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

5. Apply schema and seed:

   ```bash
   cd backend
   npx prisma generate
   npx prisma db push
   npm run seed
   ```

6. Restart API (`start-iceflow.bat` or `npm run dev`). Login with the same demo users after seed.

## Option B — Docker Postgres on your PC / NAS

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. From the project root:

   ```bash
   docker compose up -d
   ```

3. Set in `backend/.env`:

   ```env
   DATABASE_URL="postgresql://iceflow:iceflow_change_me@localhost:5432/iceflow"
   ```

4. Change Prisma `provider` to `"postgresql"` (same as Option A step 4).
5. Run `npx prisma generate`, `npx prisma db push`, `npm run seed` in `backend`.
6. Change the default password in `docker-compose.yml` before exposing the port outside your LAN.

To reach this from outside home, either:

- Put the **backend + frontend** on a VPS that uses the same Postgres URL, or  
- Use a secure tunnel (Cloudflare Tunnel / Tailscale) to your PC — do **not** expose port 5432 to the open internet.

## Option C — Keep SQLite, access PC remotely

If you only need occasional access while the PC is on:

- Use **Tailscale** or **Chrome Remote Desktop** to the PC, or  
- Run the API bound to your LAN IP and open `http://PC-IP:5173` on the same Wi‑Fi.

This does **not** replace a cloud database when the PC is off.

## After switching from SQLite → Postgres

- Old `data/iceflow.db` is left alone (backup). New data lives in Postgres.
- To copy old data later, export/import manually or keep using SQLite until you are ready to re-seed.
- Always change `JWT_*` secrets and admin passwords before production.

## Checklist

| Step | Done |
|------|------|
| Postgres running (cloud or Docker) | |
| `DATABASE_URL` points to Postgres | |
| `provider = "postgresql"` in schema | |
| `prisma generate` + `db push` + seed | |
| Backend reachable from your phone/laptop | |
| `CORS_ORIGIN` matches the UI URL | |
