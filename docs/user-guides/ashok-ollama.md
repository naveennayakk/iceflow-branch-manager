# Ashok + free LLM (Ollama)

Ashok answers using **live branch database context**.

## Modes

1. **Ollama (recommended, free, local)** — full natural language  
2. **Rules fallback** — keyword answers if Ollama is not running  

## Install Ollama (Windows)

1. Download from https://ollama.com  
2. Install and open a terminal:

```bash
ollama pull llama3.2
ollama serve
```

3. Restart IceFlow API (`npm run dev`)  
4. Open Ashok — header should show `LLM: Ollama · llama3.2 + live DB`

## Config (`backend/.env`)

```
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
ASHOK_LLM_ENABLED=true
```

## Privacy

Sub-branch Ashok only receives **that branch’s** stock, employees, sessions, and requests in the prompt.
