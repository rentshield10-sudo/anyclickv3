# AnyClick — Local AI Browser Automation Agent

AnyClick is a local browser automation system powered by **Google Gemini**, **Playwright**, and **n8n**. It lets you give a task in plain language and have a real Chrome browser execute it autonomously — with graceful login handling and intelligent fallback.

---

## Architecture

```
User Task → n8n (orchestrator) → Gemini (planner) → Browser Worker (executor)
                                                          ├── Playwright (primary)
                                                          └── Puppeteer (fallback)
```

---

## Prerequisites

- **Node.js 20+**
- **Google Chrome Stable** installed
- **n8n** running locally (`npx n8n` or Docker)
- **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

---

## Setup

### 1. Install dependencies

```bash
cd browser-worker
npm install
npx playwright install-deps
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```env
# Your actual Chrome path:
# Windows:
CHROME_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
# macOS:
# CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# Linux:
# CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome

# Dedicated profile dir (NOT your everyday profile):
CHROME_PROFILE_DIR=C:\Users\YourName\Documents\anyclick\browser-worker\profiles\chrome-agent-profile

# Gemini API key:
GEMINI_API_KEY=your-key-here
```

> ⚠️ **Important:** Use a dedicated Chrome profile directory, NOT your default everyday profile.  
> Chrome 136+ blocks remote debugging on the default profile.

### 3. Start the browser worker

```bash
npm run dev
```

Worker starts at: `http://localhost:3001`

### 4. Import the n8n workflow

1. Open n8n → Workflows → Import
2. Upload `n8n/workflow.json`
3. Set your Gemini credentials in the **Gemini node**
4. Activate the workflow

---

## API Reference

### `POST /start`
Start a new browser session.
```json
{ "taskId": "task-001", "url": "https://example.com", "engine": "playwright", "visible": true }
```

### `GET /state?sessionId=xxx`
Get the current structured page state (what Gemini sees).

### `POST /act`
Execute one Gemini-planned action.
```json
{
  "sessionId": "xxx",
  "action": {
    "action": "click",
    "target": { "elementId": 3, "description": "Login button" },
    "watch": { "region": "main_content", "change": "url_change" },
    "reason": "User needs to log in",
    "confidence": 0.91
  }
}
```

### `POST /request-login`
Open the login prompt helper UI.
```json
{ "sessionId": "xxx", "site": "example.com", "message": "Please log in to continue." }
```

### `POST /switch-engine`
Switch to `playwright` or `puppeteer`.
```json
{ "sessionId": "xxx", "engine": "puppeteer" }
```

### `GET /health`
Health check — returns uptime and session count.

---

## Supported Actions

| Action | Description |
|---|---|
| `goto` | Navigate to a URL |
| `click` | Click an element |
| `type` | Type text into a field |
| `press` | Press a key (e.g. `Enter`, `Tab`) |
| `scroll` | Scroll up or down |
| `select` | Select a dropdown option |
| `extract` | Extract text from element |
| `wait_for_change` | Wait for page to settle |
| `request_login` | Pause and prompt manual login |
| `switch_engine` | Switch to Puppeteer fallback |
| `done` | Task complete signal |

---

## Development Phases

| Phase | Status | Focus |
|---|---|---|
| Phase 1 | ✅ Done | Playwright + Chrome + Gemini + n8n loop + login prompt |
| Phase 2 | 🔲 Next | Iframes, element overlay, stronger heuristics |
| Phase 3 | 🔲 Planned | Puppeteer fallback, engine switching, history memory |
| Phase 4 | 🔲 Optional | Python desktop automation fallback |

---

## File Structure

```
anyclick/
├── browser-worker/
│   ├── src/
│   │   ├── server.ts           # Express API server
│   │   ├── config.ts           # Typed env config
│   │   ├── engines/
│   │   │   ├── playwright.ts   # Primary engine
│   │   │   └── puppeteer.ts    # Fallback engine
│   │   ├── state/
│   │   │   ├── extractPageState.ts
│   │   │   ├── detectLogin.ts
│   │   │   └── detectChanges.ts
│   │   ├── actions/
│   │   │   ├── executeAction.ts
│   │   │   └── resolveTarget.ts
│   │   ├── prompts/
│   │   │   └── planner.ts      # Gemini planner
│   │   ├── ui/
│   │   │   └── loginPrompt.ts  # Login helper UI
│   │   └── utils/
│   │       ├── logger.ts
│   │       ├── retry.ts
│   │       └── validation.ts
│   ├── profiles/
│   │   └── chrome-agent-profile/   # Persistent Chrome profile
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── n8n/
│   └── workflow.json
└── docs/
    ├── documentation.docx
    └── stack.docx
```
