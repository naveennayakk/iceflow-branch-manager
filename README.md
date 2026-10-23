# IceFlow Branch Manager

Production-oriented, offline-capable multi-branch ice-cream distribution and employee collection system with **Ashok** AI voice assistant.

## Stack

| Layer | Technology |
|--------|------------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, PWA, i18next (8 languages) |
| Backend | Node.js, Express, Zod, Argon2, JWT |
| Database | PostgreSQL (Supabase or Docker) via Prisma — no local SQLite |
| Offline | Service Worker + IndexedDB sync queue |
| Voice AI | Web Speech API + Ashok wake-word workflow |
| Docs | `/docs` |

## On your laptop later (recommended)

Copy this folder to **your** laptop, then:

1. Double‑click **`attach-supabase.bat`** → paste your Supabase URI  
2. Double‑click **`start-iceflow.bat`**  
3. Install [Ollama](https://ollama.com) → `ollama pull llama3.2` → **`check-ai.bat`**

Full checklist: **[PASTE-ON-MY-LAPTOP.md](./PASTE-ON-MY-LAPTOP.md)**  

**Paste to any AI on the new laptop:** **[AI_HANDOFF.md](./AI_HANDOFF.md)** (full product + rules so the AI does not reinvent the app).

## Quick start (dev)

```bash
# Prefer Supabase on your machine. Docker is optional for local Postgres only.
# attach-supabase.bat   OR   set DATABASE_URL in backend/.env

npm install
npm run setup
npm run dev
```

- Web UI: http://localhost:5173  
- API: http://localhost:4000/api/health  

### Demo logins (username **or** email)

| Role | Username / email | Password |
|------|------------------|----------|
| Main Branch Admin | `mainadmin` / `mainadmin@iceflow.app` | `IceFlow@Main2026` |
| Madhapur Sub-branch | `madhapur` / `madhapur@iceflow.app` | `Branch@007` |
| Vijayawada Sub-branch | `vijayawada` / `vijayawada@iceflow.app` | `Branch@003` |

Sensitive action PIN (seeded): `1234`

## Business model

- **Main Branch** → full authority over sub-branches, rates, approvals, audit, fraud, backups  
- **Sub-branch** → own employees, stock-out/in, payments, expenses, events, reports  
- **Employees** → no login; morning stock-out, evening stock-in, cash/PhonePe, outstanding carry-forward  

Two rate systems (versioned, never rewrite past bills):

1. Main → Sub cost rate  
2. Sub → Employee selling rate  

## Ashok AI

- Floating button (bottom-right, draggable) on every authenticated page  
- Voice Mode defaults **OFF** after login/refresh  
- When ON, listens only after wake word **Ashok**  
- Creates **draft** actions; saves only after Confirm/Save  
- Role-scoped: sub-branch Ashok never sees other branches  

Example: `Ashok Sai cups stock-in 10` → draft preview → `Save` / `Edit` / `Cancel`

## Languages

English, Telugu, Hindi, Malayalam, Kannada, Tamil, Odia, Marathi — UI, Ashok text/voice labels, and command parsing hooks.

## Security highlights

- Argon2id password hashing  
- JWT access + refresh tokens  
- Server-side RBAC (never trust UI alone)  
- Rate-limited login  
- Soft-delete for financial/stock records  
- Mandatory reasons for sensitive edits  
- Audit trail + fraud anomaly detection  
- Optional Main Admin 2FA hook  
- PIN for sensitive confirmations  

## Remote access (phone / away from PC)

Use **Supabase Postgres** + host the API/UI. Login with email or username. Guide: [Supabase setup](docs/deployment/supabase.md).

Ashok answers from the **live database** (Ollama/Llama when running; otherwise direct DB snapshot).

## Documentation

- [Architecture](docs/architecture/overview.md)  
- [API](docs/api/overview.md)  
- [User guide](docs/user-guides/daily-operations.md)  
- [Deployment](docs/deployment/guide.md)  
- [Supabase + email](docs/deployment/supabase.md)  
- [Remote database](docs/deployment/remote-database.md)  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | API + Web |
| `npm run db:seed` | Reseed demo data |
| `npm run backup` | CLI database backup |
| `npm run build` | Production build |

## License

Proprietary — IceFlow Branch Manager
