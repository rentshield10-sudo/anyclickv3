import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { broadcastLog } from '../utils/events';
import { config } from '../config';
import * as pw from '../engine/playwright';
import { extractPageState } from '../state/extractPageState';
import { detectLogin } from '../state/detectLogin';
import { generateFingerprint } from '../state/fingerprint';
import { getMemoryStore } from '../memory/MemoryStore';

const log = createLogger('session-routes');
const router = Router();

// ─── Session Store ───────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  taskId: string;
  startedAt: string;
  site: string;
  goal?: string;
  stepCount: number;
  aiCallCount: number;
  mode: 'execution' | 'discovery';
}

const sessions = new Map<string, Session>();

export function getSession(sessionId: string): Session {
  const s = sessions.get(sessionId);
  if (!s) throw new Error(`Session not found: ${sessionId}`);
  return s;
}

export function getSessions(): Map<string, Session> {
  return sessions;
}

// ─── POST /browser/session/start ──────────────────────────────────────────────

router.post('/start', async (req: Request, res: Response) => {
  try {
    const { taskId, url, goal } = req.body;
    if (!url) {
      res.status(400).json({ ok: false, error: 'url is required' });
      return;
    }

    const sessionId = uuidv4();
    const parsedUrl = new URL(url);
    const site = parsedUrl.hostname;

    log.info({ taskId, url, sessionId }, 'Starting session');
    broadcastLog('info', `Session starting for ${url}`, { sessionId });

    // Navigate
    await pw.navigate(url);
    const page = await pw.getPage();

    // Detect page state
    const loginStatus = await detectLogin(page);
    const fingerprint = await generateFingerprint(page);

    // Determine mode: execution if we have recipes, discovery otherwise
    const memoryStore = getMemoryStore();
    const hasKnowledge = memoryStore.hasRecipes(site, fingerprint.pageType);
    const mode = hasKnowledge ? 'execution' : 'discovery';

    // Save fingerprint
    memoryStore.pages.save({
      site,
      hostname: fingerprint.hostname,
      pathPattern: fingerprint.pathPattern,
      title: fingerprint.title,
      headings: fingerprint.headings,
      navLabels: fingerprint.navLabels,
      formLabels: fingerprint.formLabels,
      pageType: fingerprint.pageType,
    });

    const session: Session = {
      sessionId,
      taskId: taskId || sessionId,
      startedAt: new Date().toISOString(),
      site,
      goal,
      stepCount: 0,
      aiCallCount: 0,
      mode,
    };
    sessions.set(sessionId, session);

    broadcastLog('info', `Session started in ${mode.toUpperCase()} mode`, {
      pageType: fingerprint.pageType,
      hasRecipes: hasKnowledge,
    });

    res.json({
      ok: true,
      sessionId,
      mode,
      profileDir: config.CHROME_PROFILE_DIR,
      url: page.url(),
      loginStatus,
      fingerprint: {
        pageType: fingerprint.pageType,
        title: fingerprint.title,
        pathPattern: fingerprint.pathPattern,
      },
    });
  } catch (err: any) {
    log.error({ err: err.message }, 'Session start failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /browser/session/stop ───────────────────────────────────────────────

router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body;
    if (sessionId) {
      sessions.delete(sessionId);
    }
    await pw.closeBrowser();
    broadcastLog('info', 'Browser session stopped');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /browser/session/state ───────────────────────────────────────────────

router.get('/state', async (req: Request, res: Response) => {
  try {
    const page = await pw.getPage();
    const state = await extractPageState(page);
    const fingerprint = await generateFingerprint(page);

    res.json({
      ok: true,
      state,
      fingerprint: {
        pageType: fingerprint.pageType,
        title: fingerprint.title,
        pathPattern: fingerprint.pathPattern,
        headings: fingerprint.headings,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
