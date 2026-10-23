# Push to GitHub → use on new laptop

## 1) This machine — push

```bash
cd "c:\Users\Golla.Gowtham\Desktop\naveen project"
git init
git add .
git status
# Confirm backend/.env is NOT listed (secrets stay local)
git commit -m "IceFlow Branch Manager — handoff ready"
```

Create empty repo on GitHub, then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 2) New laptop — clone & attach DB + AI

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
npm install
```

1. Run **`attach-supabase.bat`** → paste Supabase URI  
2. Run **`start-iceflow.bat`**  
3. Install Ollama → `ollama pull llama3.2` → **`check-ai.bat`**

## 3) Give context to the new AI

Open **`AI_HANDOFF.md`**, copy all, paste into Cursor chat, say:

> Follow AI_HANDOFF.md. Only change what I ask. Do not reinvent IceFlow.

Also open **`PASTE-ON-MY-LAPTOP.md`** for your own DB/AI steps.
