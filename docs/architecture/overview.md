# IceFlow Architecture

## Goals

Laptop-first UX, offline resilience, financial safety, multi-branch isolation, and future cloud deployment without rewriting domain logic.

## High-level diagram

```
┌──────────────────┐     HTTPS/JWT      ┌──────────────────┐
│  React PWA UI    │◄──────────────────►│  Express API     │
│  Ashok Voice     │   Offline queue    │  RBAC + Audit    │
│  IndexedDB sync  │───────────────────►│  Ashok parser    │
└──────────────────┘                    └────────┬─────────┘
                                                 │
                                        ┌────────▼─────────┐
                                        │  SQLite (Prisma) │
                                        │  Stock ledger    │
                                        │  Sessions/Rates  │
                                        └──────────────────┘
```

## Bounded contexts

1. **Identity** — Main/Sub admin users, tokens, PIN, optional 2FA  
2. **Catalog & Rates** — Items, versioned MAIN_TO_SUB / SUB_TO_EMPLOYEE rates  
3. **Inventory** — Stock balances derived from immutable movements  
4. **Workforce** — Employees, daily sessions, payments, outstanding  
5. **Logistics** — Requests → Dispatch → Receive workflow  
6. **Governance** — Audit, fraud, notifications, backups  
7. **Assistant** — Ashok parse/confirm/save pipeline  

## Branch isolation

Every sub-admin JWT embeds `branchId`. Services call `assertBranchAccess` before reads/writes. Ashok queries inherit the same actor context.

## Offline sync

1. Mutations while offline are stored in IndexedDB  
2. On reconnect, queue flushes to API  
3. Server records `SyncEvent` for auditability  
4. Conflicts surface as failed queue items (manual retry)

## Future cloud path

- Swap Prisma datasource to PostgreSQL  
- Put API behind HTTPS reverse proxy  
- Keep same REST contracts and JWT claims  
- Optionally add object storage for bill PDFs/photos  
