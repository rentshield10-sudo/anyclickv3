import express from 'express';
import { createServer } from 'http';
import open from 'open';
import { createLogger } from '../utils/logger';
import { detectLogin } from '../state/detectLogin';
import * as pw from '../engines/playwright';
import { sleep } from '../utils/retry';

const log = createLogger('login-prompt');

let loginPromptServer: ReturnType<typeof createServer> | null = null;
let loginResolve: (() => void) | null = null;
let loginAbort: ((reason: string) => void) | null = null;

const PROMPT_PORT = 3002;

/**
 * Open a local helper page asking the user to log in manually in Chrome,
 * then click "Continue". Polls Chrome until login is confirmed, then resolves.
 */
export async function requestLogin(site: string, message?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    loginResolve = resolve;
    loginAbort = reject;

    startPromptServer(site, message ?? `Please log in to ${site}, then click Continue.`);
  });
}

function startPromptServer(site: string, message: string): void {
  if (loginPromptServer) {
    log.warn('Login prompt server already running');
    return;
  }

  const app = express();

  app.get('/', (_req, res) => {
    res.send(buildHtmlPrompt(site, message));
  });

  app.post('/continue', (_req, res) => {
    log.info('User manually confirmed login — resuming');
    res.json({ ok: true, message: 'Resuming automation...' });
    stopPromptServer();
    if (loginResolve) loginResolve();
  });

  app.post('/abort', (_req, res) => {
    log.info('User aborted login');
    res.json({ ok: true });
    stopPromptServer();
    if (loginAbort) loginAbort('User aborted login');
  });

  loginPromptServer = createServer(app);
  loginPromptServer.listen(PROMPT_PORT, () => {
    log.info({ port: PROMPT_PORT }, 'Login prompt server started');
    open(`http://localhost:${PROMPT_PORT}`).catch(() => {
      log.warn('Could not open browser for login prompt — open manually: http://localhost:3002');
    });
  });
}

async function pollUntilLoggedIn(site: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const page = await pw.getPage();
      const status = await detectLogin(page);
      if (status.loggedIn) {
        log.info({ site, evidence: status.evidence }, 'Login confirmed — resuming');
        stopPromptServer();
        if (loginResolve) loginResolve();
        return;
      }
    } catch (err) {
      log.warn({ err }, 'Poll error during login check');
    }
    await sleep(3_000);
  }

  stopPromptServer();
  if (loginAbort) loginAbort('Login timed out after polling');
}

function stopPromptServer(): void {
  if (loginPromptServer) {
    loginPromptServer.close();
    loginPromptServer = null;
    log.info('Login prompt server stopped');
  }
}

function buildHtmlPrompt(site: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AnyClick — Login Required</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f13;
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1a1a24;
      border: 1px solid #2d2d3d;
      border-radius: 16px;
      padding: 40px 48px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #fff; }
    .site { color: #818cf8; font-weight: 600; font-size: 15px; margin-bottom: 16px; }
    p { color: #94a3b8; font-size: 15px; line-height: 1.6; margin-bottom: 32px; }
    .btn {
      display: inline-block;
      padding: 12px 32px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: #6366f1; color: #fff; margin-right: 12px; }
    .btn-abort { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
    .status { margin-top: 20px; font-size: 13px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔐</div>
    <h1>Login Required</h1>
    <div class="site">${site}</div>
    <p>${message}</p>
    <button class="btn btn-primary" onclick="continueAutomation()">✅ I've Logged In — Continue</button>
    <button class="btn btn-abort" onclick="abortTask()">✖ Abort Task</button>
    <div class="status" id="status"></div>
  </div>
  <script>
    async function continueAutomation() {
      document.getElementById('status').textContent = 'Checking login status...';
      const res = await fetch('/continue', { method: 'POST' });
      const data = await res.json();
      document.getElementById('status').textContent = data.message ?? 'Resuming...';
    }
    async function abortTask() {
      await fetch('/abort', { method: 'POST' });
      document.getElementById('status').textContent = 'Task aborted.';
    }
  </script>
</body>
</html>`;
}
