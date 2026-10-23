# On YOUR laptop later — paste & go

Friend’s laptop: leave as-is. Copy this whole **naveen project** folder to your laptop (USB / Drive / zip).

Then do only these **2 pastes**.

---

## A) Database (Supabase) — 5 minutes

1. Open [supabase.com](https://supabase.com) → your project → **Connect**
2. Copy the **Session pooler** connection string (port `5432`, has `sslmode=require` or add it)
3. Double‑click **`attach-supabase.bat`** in this folder  
   — OR open `backend/.env` and replace the two lines:

```env
DATABASE_URL="PASTE_SUPABASE_URI_HERE"
DIRECT_URL="PASTE_SAME_URI_HERE"
```

4. Script will: save URLs → `prisma db push` → seed demo users  
5. Run **`start-iceflow.bat`**

Login (username **or** email):

| | |
|--|--|
| Main | `mainadmin` / `mainadmin@iceflow.app` · `IceFlow@Main2026` |
| Madhapur | `madhapur` / `madhapur@iceflow.app` · `Branch@007` |

---

## B) Built‑in AI (Ollama / Llama) — 5 minutes

1. Install [ollama.com](https://ollama.com)
2. Open a terminal:

```bash
ollama pull llama3.2
ollama serve
```

3. Double‑click **`check-ai.bat`** — should say **OK**
4. In IceFlow, open **Ashok** and ask about stock / payments / employees — it reads the **live database**

Already set in `.env` (no change needed):

```env
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
ASHOK_LLM_ENABLED=true
```

---

## Checklist

| Step | Done |
|------|------|
| Project folder on my laptop | |
| Node.js 20+ installed | |
| Supabase URL pasted (`attach-supabase.bat`) | |
| `start-iceflow.bat` runs | |
| Ollama + `llama3.2` installed | |
| `check-ai.bat` OK | |

More detail: `docs/deployment/supabase.md`
