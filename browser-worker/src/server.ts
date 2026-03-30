import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config';
import { createLogger } from './utils/logger';
import {
  StartRequestSchema,
  ActRequestSchema,
  LoginRequestSchema,
  type PageState,
  type Action,
  type Element,
} from './utils/validation';
import * as pw from './engines/playwright';
import { extractPageState } from './state/extractPageState';
import { executeAction } from './actions/executeAction';
import { requestLogin } from './ui/loginPrompt';
import { planNextAction } from './prompts/planner';
import { loadMemory, recordSuccessfulRun, getMemoryData, renameMemory } from './state/memory';
import { buildDashboardHtml } from './ui/dashboard';
import { globalEvents, broadcastLog } from './utils/events';

const log = createLogger('server');
const app = express();
app.use(express.json());

loadMemory();

// ─── Dashboard UI ─────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send(buildDashboardHtml()));
app.get('/api/memory', (_req, res) => res.json({ memory: getMemoryData() }));
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const onLog = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  globalEvents.on('dashboard-log', onLog);
  req.on('close', () => globalEvents.off('dashboard-log', onLog));
});
app.post('/api/memory/rename', (req, res) => {
  const { oldGoal, newGoal } = req.body;
  if (!oldGoal || !newGoal) return res.status(400).json({ ok: false, error: 'Missing oldGoal or newGoal' });
  const success = renameMemory(oldGoal, newGoal);
  res.json({ ok: success });
});

app.post('/api/memory/run', async (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ ok: false, error: 'Missing goal' });
  
  const memoryData = getMemoryData();
  const entry = memoryData[goal.toLowerCase().trim()];
  if (!entry) return res.status(404).json({ ok: false, error: 'Goal not found in memory' });

  res.json({ ok: true, status: 'started' });

  // Asynchronous deterministic FAST REPLAY runner loop (No AI logic!)
  setTimeout(async () => {
    try {
      broadcastLog('info', `🚀 Fast Native Replay Started (Bypassing AI): ${goal}`);
      const { getPage, navigate } = await import('./engines/playwright');
      const { extractPageState } = await import('./state/extractPageState');

      let page = await getPage();
      
      // Navigate to base URL if we are not there (e.g., brand new browser window)
      if (page.url() === 'about:blank' || !page.url().includes(new URL(entry.url).hostname)) {
        broadcastLog('info', `Navigating to starting point: ${entry.url}`);
        await navigate(entry.url);
        page = await getPage();
      }
      
      let aiTakeover = false;
      const actionHistory: any[] = [];
      const failures: any[] = [];

      let stepLimit = entry.steps.length + 5; // Allow extra room if AI needs it
      
      for (let i = 0; i < stepLimit; i++) {
        let currentAction: any;
        const state = await extractPageState(await getPage());

        if (!aiTakeover) {
          if (i >= entry.steps.length) {
            broadcastLog('info', `✅ Fast Replay Processed All Saved Steps Successfully!`);
            return;
          }

          const action = entry.steps[i];
          if (action.action === 'done') {
            broadcastLog('info', `✅ Fast Replay Completed Successfully!`);
            return;
          }

          // Skip redundant 'goto' step if we already navigated during init
          const pageRef = await getPage();
          if (action.action === 'goto' && pageRef.url().includes(new URL(action.value || entry.url).hostname)) {
             broadcastLog('info', `⏭️ Skipping redundant navigation step (already at target url)`);
             continue;
          }
          
          currentAction = { 
            ...action, 
            target: action.target ? { ...action.target, elementId: null } : undefined 
          };
          broadcastLog('info', `⚡ Executing Fast Replay Step: ${currentAction.action}`, { 
            target: currentAction.target?.description 
          });
        } else {
          // AI Reasoner Takeover!
          aiTakeover = true;
          currentAction = await planNextAction(goal, 'playwright', state, actionHistory, failures);
          
          if (currentAction.action === 'done') {
            broadcastLog('info', `✅ AI Recovery Completed Workflow Successfully!`);
            return;
          }
          broadcastLog('info', `🧠 AI Fallback Planning: ${currentAction.action}`, { 
            target: currentAction.target?.description 
          });
        }

        try {
          const res = await executeAction(currentAction, state.elements, 'playwright');
          if (!res.ok) throw new Error(res.error || 'Execution engine indicated failure');
          actionHistory.push(currentAction);
          await new Promise(r => setTimeout(r, 800)); // Render buffer
        } catch (err: any) {
          if (!aiTakeover) {
            broadcastLog('warn', `Fast replay interrupted — Handing completely over to AI logic...`, { reason: err.message });
            aiTakeover = true;
            stepLimit = 20; // Extend loop to give AI room to recover
            i--; // Retry the logic on this iteration using the AI model
          } else {
            failures.push({ step: currentAction, error: err.message });
            broadcastLog('warn', `AI Execution Step Failed: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      broadcastLog('error', `Native run fatally crashed: ${err.message}`);
    }
  }, 50);
});

// ─── Session store ────────────────────────────────────────────────────────────

interface Session {
  sessionId: string;
  taskId: string;
  engine: 'playwright';
  lastState: PageState | null;
  elementMap: Element[];
  actionHistory: Action[];
  failures: string[];
  goal?: string;
}

const sessions = new Map<string, Session>();

function getSession(sessionId: string): Session {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  return s;
}

// ─── Middleware: error wrapper ────────────────────────────────────────────────

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

// ─── POST /start ──────────────────────────────────────────────────────────────

app.post('/start', asyncHandler(async (req, res) => {
  const parsed = StartRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { taskId, url, engine } = parsed.data;
  const sessionId = uuidv4();

  log.info({ taskId, url, engine, sessionId }, 'Starting session');
  broadcastLog('info', `Workflow requested for URL: ${url}`, { sessionId });

  // Launch the engine
  await pw.navigate(url);


  const page = await pw.getPage();
  const state = await extractPageState(page);

  const session: Session = {
    sessionId,
    taskId,
    engine: 'playwright',
    lastState: state,
    elementMap: state.elements,
    actionHistory: [],
    failures: [],
  };
  sessions.set(sessionId, session);

  log.info({ sessionId, url: state.url, loggedIn: state.loginStatus.loggedIn }, 'Session started');

  res.json({
    ok: true,
    sessionId,
    engine: 'playwright',
    profileDir: config.CHROME_PROFILE_DIR,
    url: state.url,
    loginStatus: state.loginStatus,
  });
}));

// ─── GET /state ───────────────────────────────────────────────────────────────

app.get('/state', asyncHandler(async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) { res.status(400).json({ ok: false, error: 'sessionId required' }); return; }

  const session = getSession(sessionId);
  const page = await pw.getPage();
  const state = await extractPageState(page);

  session.lastState = state;
  session.elementMap = state.elements;

  res.json({ ok: true, sessionId, state });
}));

// ─── POST /plan ───────────────────────────────────────────────────────────────

app.post('/plan', asyncHandler(async (req, res) => {
  const { sessionId, goal } = req.body;
  if (!sessionId || !goal) {
    res.status(400).json({ ok: false, error: 'sessionId and goal are required' });
    return;
  }

  const session = getSession(sessionId);
  if (!session.lastState) {
    res.status(400).json({ ok: false, error: 'No page state collected. Call /state first.' });
    return;
  }

  log.info({ sessionId, goal }, 'Planning next action');
  session.goal = goal;
  
  const action = await planNextAction(
    goal,
    session.engine,
    session.lastState,
    session.actionHistory,
    session.failures
  );

  // If the AI decides we are done, n8n will immediately terminate. 
  // We MUST proactively save the memory run history right here before the connection closes!
  if (action.action === 'done') {
    recordSuccessfulRun(goal, session.lastState.url, session.actionHistory);
    broadcastLog('info', 'Workflow completed successfully — sequence saved to memory cache', { stepCount: session.actionHistory.length });
  }

  res.json({ ok: true, sessionId, action });
}));

// ─── POST /act ────────────────────────────────────────────────────────────────

app.post('/act', asyncHandler(async (req, res) => {
  const parsed = ActRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { sessionId, action } = parsed.data;
  const session = getSession(sessionId);

  log.info({ action: action.action, confidence: action.confidence }, 'Executing action');
  broadcastLog('info', `Executor firing action: ${action.action}`, { 
    target: action.target?.description || 'none',
    value: action.value
  });

  // Handle control signals before hitting the engine
  if (action.action === 'done') {
    if (session.goal && session.lastState) {
      recordSuccessfulRun(session.goal, session.lastState.url, session.actionHistory);
    }
    res.json({ ok: true, sessionId, executed: false, action: 'done', state: session.lastState });
    return;
  }

  if (action.action === 'request_login') {
    const site = session.lastState?.url ?? 'the website';
    log.info({ site }, 'Triggering login prompt');
    requestLogin(site).catch((err) => log.error({ err }, 'Login failed or aborted'));
    res.json({ ok: true, sessionId, action: 'request_login', message: `Login prompt opened for ${site}` });
    return;
  }

  // Execute the action
  const result = await executeAction(action, session.elementMap, 'playwright');

  // Update session state
  session.lastState = result.state;
  session.elementMap = result.state.elements;
  session.actionHistory.push(action);

  if (!result.ok && result.error) {
    session.failures.push(`[${action.action}] ${result.error}`);
  }

  // Trim histories to last 10
  if (session.actionHistory.length > 10) session.actionHistory = session.actionHistory.slice(-10);
  if (session.failures.length > 10) session.failures = session.failures.slice(-10);

  res.json({
    ok: result.ok,
    sessionId: session.sessionId,
    executed: result.executed,
    changed: result.changed,
    state: result.state,
    diff: result.diff,
    error: result.error,
  });
}));

// ─── POST /request-login ──────────────────────────────────────────────────────

app.post('/request-login', asyncHandler(async (req, res) => {
  const parsed = LoginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }

  const { site, message } = parsed.data;
  log.info({ site }, 'Login prompt requested via API');

  requestLogin(site, message).catch((err) => log.error({ err }, 'Login prompt error'));

  res.json({ ok: true, message: `Login prompt opened for ${site}` });
}));



// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size, uptime: process.uptime() });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  log.error({ err: err.message }, 'Unhandled error');
  res.status(500).json({ ok: false, error: err.message });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(config.WORKER_PORT, () => {
  log.info(
    {
      port: config.WORKER_PORT,
      chrome: config.CHROME_EXECUTABLE_PATH,
      profile: config.CHROME_PROFILE_DIR,
    },
    `🚀 AnyClick browser worker running on http://localhost:${config.WORKER_PORT}`
  );
});

export default app;
