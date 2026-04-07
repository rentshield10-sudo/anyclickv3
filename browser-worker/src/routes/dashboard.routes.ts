import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { globalEvents } from '../utils/events';
import { getMemoryStore } from '../memory/MemoryStore';
import { getSessions } from './session.routes';
import { buildDashboardHtml } from '../ui/dashboard';

const log = createLogger('dashboard-routes');
const router = Router();

// ─── Dashboard UI ────────────────────────────────────────────────────────────

router.get('/', (_req: Request, res: Response) => {
  res.send(buildDashboardHtml());
});

// ─── GET /api/memory ─────────────────────────────────────────────────────────

router.get('/api/memory', (_req: Request, res: Response) => {
  try {
    const memoryStore = getMemoryStore();
    const recipes = memoryStore.recipes.getAll();
    const fingerprints = memoryStore.pages.getAll();
    const runs = memoryStore.runs.getRecent(10);

    res.json({
      ok: true,
      data: {
        recipes: {
          count: recipes.length,
          items: recipes,
        },
        fingerprints: {
          count: fingerprints.length,
          items: fingerprints,
        },
        recentRuns: {
          count: runs.length,
          items: runs,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/sessions ──────────────────────────────────────────────────────

router.get('/api/sessions', (_req: Request, res: Response) => {
  const sessions = getSessions();
  const sessionList = Array.from(sessions.values());
  res.json({ ok: true, data: { count: sessionList.length, sessions: sessionList } });
});

// ─── SSE Log Stream ──────────────────────────────────────────────────────────

router.get('/api/logs/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as any).flushHeaders?.();

  const onLog = (data: any) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  globalEvents.on('dashboard-log', onLog);
  req.on('close', () => globalEvents.off('dashboard-log', onLog));
});

// ─── Health check ────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  const sessions = getSessions();
  const memoryStore = getMemoryStore();
  
  res.json({
    ok: true,
    sessions: sessions.size,
    uptime: process.uptime(),
    memory: {
      recipes: memoryStore.recipes.getAll().length,
      fingerprints: memoryStore.pages.getAll().length,
    },
  });
});

export default router;
