# IceFlow Branch Manager — AI HANDOFF BRIEF

> **Copy this entire file** into Cursor / ChatGPT / Claude on the new laptop.  
> Tell the AI: *“Follow AI_HANDOFF.md. Do not reinvent architecture. Only change what I ask.”*

---

## 0) One-line product

**IceFlow** = multi-branch ice-cream distribution + employee stock-out/in + cash/PhonePe collection, with **Main** vs **Sub** roles, pack-based stock requests, expense approvals, and **Ashok** AI that answers from the **live PostgreSQL database** (Ollama/Llama when available).

---

## 1) How to set up on a NEW laptop (DB + AI)

### After `git clone`

```bash
cd "naveen project"   # or your clone folder
npm install
```

### A) Database — Supabase Postgres (required)

**No SQLite.** Prisma provider is `postgresql`.

1. Create project at https://supabase.com  
2. **Connect** → copy **Session pooler** URI (port `5432`)  
3. Either:
   - Double-click **`attach-supabase.bat`** and paste the URI, **or**
   - Copy `backend/.env.paste-template` → `backend/.env` and set:

```env
DATABASE_URL="postgresql://...?sslmode=require"
DIRECT_URL="postgresql://...?sslmode=require"   # same URI is fine for Node API
```

4. Then:

```bash
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

Or from root: **`start-iceflow.bat`** (after attach).

**Never commit** `backend/.env` (secrets). Commit only `.env.example` / `.env.paste-template`.

### B) Built-in AI — Ollama / Llama (optional but intended)

```bash
# Install https://ollama.com then:
ollama pull llama3.2
# keep Ollama running
```

In `backend/.env` (already defaults):

```env
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
ASHOK_LLM_ENABLED=true
```

Verify: **`check-ai.bat`**

Ashok logic:
- Chat → `POST /api/ashok/chat` → `backend/src/ai/ollama.service.ts`
- Builds **live DB snapshot** (stock, employees, today’s sessions, PhonePe/cash/grand total, expenses, requests)
- If Ollama up → Llama answers using that context only (no inventing numbers)
- If Ollama down → still answers from DB snapshot (not canned marketing prompts)
- Voice stock-out/in still uses `ashok.service.ts` parse → draft → confirm Save
- Sub-admin: own branch only. Main: all branches.

Docs: `PASTE-ON-MY-LAPTOP.md`, `docs/deployment/supabase.md`

---

## 2) Stack & monorepo layout

| Path | Role |
|------|------|
| `frontend/` | React 19 + Vite + TS + Tailwind + i18next + PWA |
| `backend/` | Express + Prisma + Zod + Argon2 + JWT |
| `shared/` | Shared package |
| `backend/prisma/schema.prisma` | **Source of truth for DB** |
| `start-iceflow.bat` / `stop-iceflow.bat` | Windows start/stop |
| `attach-supabase.bat` / `check-ai.bat` | Paste DB / verify AI |

Scripts (root `package.json`): `npm run dev`, `db:generate`, `db:push`, `db:seed`, `setup`

Ports: UI `5173`, API `4000` (`/api/...`).

---

## 3) Roles & routing

| Role | Base path | Scope |
|------|-----------|--------|
| `MAIN_ADMIN` | `/main` | All branches, approvals, items/rates/packs, audit, fraud, backup |
| `SUB_ADMIN` | `/sub` | Own branch only |
| Main viewing a sub | `/main/workspace/:branchId/...` | Same UX as sub for that branch |

**Login:** username **or** email (`auth.service.ts`). Seeded demos:

| User / email | Password | Role |
|--------------|----------|------|
| `mainadmin` / `mainadmin@iceflow.app` | `IceFlow@Main2026` | MAIN |
| `madhapur` / `madhapur@iceflow.app` | `Branch@007` | SUB |
| `vijayawada` / `vijayawada@iceflow.app` | `Branch@003` | SUB |

PIN for sensitive actions (seed): `1234`

Hook: `frontend/src/hooks/useBranchScope.ts` — resolves branch from sub login, workspace route, or `?branchId=`.

---

## 4) What the product handles (features)

### Employees (daily board)
- File: `frontend/src/pages/sub/SubEmployeesBoard.tsx`
- **All catalog items** listed (no “Add item” for lines)
- Columns: Out / In / amount; **Enter moves down same column** then PhonePe
- Right stack: **Grand total → PhonePe → Cash to collect**
- Borrow money separate from day collection
- Save / Finalize day; date picker for working date
- Main: `/main/employees` = branch tabs + same board
- Voice save dispatches `iceflow:board-refresh` event

### Stock requests (pack / set wise)
- Sub: `SubStockRequests.tsx` — enter **boxes/packs**; pieces = boxes × `Item.packSize`
- Enter key → next item
- Pack sizes editable by Main on **Items** (`packSize`, `packLabel`) e.g. Cups 24, Candy 50
- Main Requests + Stock show **requested vs dispatch**, rates, **amounts**

### Dispatches
- Main creates / approve+dispatch from requests
- Click dispatch → lines, boxes, pcs, Main→Sub rate, **amount**, linked original request
- Status: approved → packed → sent → received (sub confirms)

### Payments
- Sub: Grand total / PhonePe / Cash to collect + daily income + expenses with bill upload
- Main: `/main/payments` branch-wise same metrics (`reports/payments-by-branch`)

### Expenses
- Sub uploads **photo/PDF** → status `pending`
- Main approves/rejects (`/expenses/:id/review`)
- Only **approved** expenses count in profit
- Files under uploads; view via auth fetch blob

### Items & rates
- Versioned rates: `MAIN_TO_SUB`, `SUB_TO_EMPLOYEE` (never rewrite past bills)
- Pack size for ordering UX

### Events, reports, audit, fraud, backup, notifications, settings
- Present under Main (and sub where scoped)
- Do not strip security/audit when editing finance flows

### Ashok UI
- `frontend/src/ai/AshokAssistant.tsx` — floating, draggable, voice off by default, wake word **Ashok**
- Text chat → live DB AI; unknown voice intents → chat endpoint

### Languages
- en, te, hi, ml, kn, ta, or, mr via i18next

---

## 5) Backend API map (do not renumber casually)

| Mount | Purpose |
|-------|---------|
| `/api/auth` | login (user/email), refresh, logout, password |
| `/api/branches` | branch CRUD |
| `/api/items` | items, packSize, rates |
| `/api/employees` | employees + `/board/today` |
| `/api/sessions` | stock-out / stock-in / finalize / bill PDF |
| `/api/stock` | requests, dispatches, balances, damage |
| `/api/dashboard` | dashboards |
| `/api/reports` | daily-income, payments, payments-by-branch, profit |
| `/api` (misc) | expenses (+ upload + review), events, holidays, notifications, audit, fraud, backup, settings, **ashok/chat**, ashok/parse, sync |

RBAC: `authenticate`, `requireRole`, `assertBranchAccess` — **always enforce on server**.

---

## 6) Important Prisma models (mental model)

- `User` — username, **email**, role, branchId  
- `Branch` — isMain, code, name  
- `Item` — packSize, packLabel  
- `RateHistory` — versioned rates  
- `Employee` — outstanding (borrow), no login  
- `EmployeeSession` + `SessionLine` — daily out/in, totalBill, cashPaid, phonePePaid  
- `StockRequest` / `StockRequestLine` — asked/approved qty  
- `StockDispatch` / `DispatchLine` — quantity, **costRate** (amount = qty × rate)  
- `Expense` — receiptUrl, **status** pending|approved|rejected  

Schema: `backend/prisma/schema.prisma`  
After schema edits: `npx prisma db push` (and migrate carefully on prod Supabase).

---

## 7) Rules for AI assistants (DO / DON’T)

### DO
- Read existing files before editing; match patterns (Tailwind classes `btn-primary`, `card-panel`, `page-title`)
- Keep Main/Sub scoping and `useBranchScope`
- Keep Grand total → PhonePe → Cash to collect UX consistent
- Keep pack-based requests; Main edits pack sizes on Items
- Keep Ashok answers tied to **live DB** (`ollama.service.ts`)
- Prefer small, focused diffs; update seed only when needed
- After Prisma changes: generate + push

### DON’T
- Do **not** switch back to SQLite
- Do **not** invent a second employee board UX or remove Enter-to-next-field
- Do **not** replace Ashok with generic chatbot prompts that ignore DB
- Do **not** let sub-admins see other branches’ data
- Do **not** rewrite historical bills when rates change (use RateHistory)
- Do **not** commit `.env`, secrets, or upload binaries
- Do **not** force-push or destroy git history unless user asks
- Do **not** “simplify” by deleting audit/fraud/expense approval without asking

---

## 8) GitHub push checklist (this machine → GitHub → new laptop)

```bash
# On current machine (project root)
git status
# Ensure backend/.env is NOT staged (.gitignore)
git add .
git commit -m "IceFlow Branch Manager — full app handoff"
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git   # if new
git push -u origin main   # or master
```

On **new laptop**:

```bash
git clone https://github.com/YOUR_USER/YOUR_REPO.git
cd YOUR_REPO
npm install
# then attach-supabase.bat  →  start-iceflow.bat  →  Ollama + check-ai.bat
```

Paste **this file (`AI_HANDOFF.md`)** into the new AI chat and say:

> Continue IceFlow from AI_HANDOFF.md. Only modify what I request. Preserve DB/AI setup, board UX, pack requests, dispatch amounts, expense approval, and Ashok live-DB behavior.

---

## 9) Key file index (start here when changing something)

| Change | Open first |
|--------|------------|
| Employee Out/In UI | `frontend/src/pages/sub/SubEmployeesBoard.tsx` |
| Stock request / Enter | `frontend/src/pages/sub/SubStockRequests.tsx` |
| Dispatch detail UI | `frontend/src/pages/ModulePages.tsx` → `StockPage` |
| Main payments by branch | `frontend/src/pages/main/MainPaymentsPage.tsx` |
| Expenses upload/approve | `frontend/src/pages/ExpensesPage.tsx`, `backend/src/routes/misc.routes.ts` |
| Pack sizes | `ItemsPage` + `backend/src/routes/items.routes.ts` |
| Ashok DB AI | `backend/src/ai/ollama.service.ts`, `AshokAssistant.tsx` |
| Auth email login | `backend/src/services/auth.service.ts` |
| Schema | `backend/prisma/schema.prisma` |
| Seed users/items | `backend/prisma/seed.ts` |
| Routes tree | `frontend/src/App.tsx` |

---

## 10) Known intent / product decisions (already built)

1. Totals on the **right**: Grand total, PhonePe, Cash to collect  
2. No per-line “Add item” on employee board — show **all items**  
3. Enter navigates fields (employees + stock request)  
4. Pack sizes change over time — Main edits Items  
5. Sub uploads expense proof; Main approves  
6. Remote data = **Supabase Postgres**, not laptop SQLite file  
7. Ashok must **query/use application DB**, not only hard-coded phrases  

---

*End of handoff. Prefer updating this file when you add major modules so the next AI stays aligned.*
