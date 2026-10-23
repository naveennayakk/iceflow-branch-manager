# IceFlow API Overview

Base URL: `http://localhost:4000/api`

Auth header: `Authorization: Bearer <accessToken>`

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | username, password, optional totp |
| POST | `/auth/refresh` | refreshToken |
| POST | `/auth/logout` | revoke refresh |
| POST | `/auth/change-password` | |
| POST | `/auth/pin` | set confirmation PIN |
| POST | `/auth/verify-pin` | |
| POST | `/auth/reset-sub-password` | Main only |

## Core resources

- `/branches` — CRUD (soft delete), Main creates sub + temp password  
- `/items` — catalog, categories, versioned rates  
- `/employees` — branch-scoped  
- `/sessions/open` — open daily session  
- `/sessions/:id/stock-out` — morning issue  
- `/sessions/:id/stock-in` — evening return + payments (`finalize`)  
- `/sessions/:id/bill-pdf` — generate PDF  
- `/stock/balances`, `/stock/movements`, `/stock/dispatches`, `/stock/requests`, `/stock/damage`  
- `/dashboard/main`, `/dashboard/sub`  
- `/reports/payments`, `/reports/profit`  
- `/expenses`, `/events`, `/holidays`  
- `/notifications`, `/audit`, `/fraud`  
- `/backups`, `/export`  
- `/ashok/parse`, `/ashok/chat`  
- `/sync/push`, `/sync/pull`  

## Conventions

- Responses: `{ success, data?, error?, code? }`  
- Soft deletes set `deletedAt`  
- Sensitive writes expect `reason` where applicable  
- Excess payment finalize returns `409 EXCESS_CONFIRM_REQUIRED` until confirmed  
