# Supabase + email — access IceFlow from anywhere

IceFlow no longer uses local SQLite. All data is stored in **PostgreSQL** (Supabase recommended). Log in with **username or email**. Ashok reads the **live database** (via Ollama/Llama when available).

## 1. Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) → New project  
2. Set a strong database password and save it  
3. Project → **Connect** → copy:
   - **Session pooler** URI (port `5432`) → use as `DATABASE_URL` and `DIRECT_URL` for a long-running Node API  
   - Or Transaction pooler (`6543` + `?pgbouncer=true`) as `DATABASE_URL` and Session/Direct as `DIRECT_URL`

## 2. Configure `backend/.env`

```env
# Paste your Supabase URIs (sslmode=require)
DATABASE_URL="postgresql://postgres.XXXX:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres.XXXX:YOUR_PASSWORD@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

# Optional labels (not required for Prisma)
SUPABASE_URL="https://XXXX.supabase.co"
SUPABASE_ANON_KEY="eyJ..."

MAIN_ADMIN_EMAIL=mainadmin@iceflow.app
CORS_ORIGIN=http://localhost:5173

OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
ASHOK_LLM_ENABLED=true
```

> Keep `JWT_*` and `ENCRYPTION_KEY` secrets strong in production.

## 3. Push schema + seed

```bash
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

Demo logins (username **or** email):

| Role | Username / email | Password |
|------|------------------|----------|
| Main | `mainadmin` / `mainadmin@iceflow.app` | `IceFlow@Main2026` |
| Madhapur | `madhapur` / `madhapur@iceflow.app` | `Branch@007` |

## 4. Run the app

```bash
# from project root
npm run dev
# or start-iceflow.bat
```

Host the API + frontend (Railway, Render, VPS) pointed at the same Supabase `DATABASE_URL` so phones/laptops work when your PC is off.

## 5. Ashok AI (Ollama / Llama)

1. Install [Ollama](https://ollama.com)  
2. `ollama pull llama3.2` (or set `OLLAMA_MODEL` to another local model)  
3. Keep `ASHOK_LLM_ENABLED=true`  

Ashok loads **live** stock, employees, payments (Grand total / PhonePe / Cash), expenses, and requests from Postgres — it does **not** invent numbers from a fixed prompt.

If Ollama is offline, Ashok still answers from the **database snapshot** (not canned scripts).

## Temporary Docker Postgres (no Supabase yet)

```bash
docker compose up -d
```

```env
DATABASE_URL="postgresql://iceflow:iceflow_change_me@localhost:5432/iceflow"
DIRECT_URL="postgresql://iceflow:iceflow_change_me@localhost:5432/iceflow"
```

Then `prisma db push` + seed. Switch `DATABASE_URL` to Supabase when ready — no SQLite.
