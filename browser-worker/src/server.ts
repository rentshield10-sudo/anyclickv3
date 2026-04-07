import 'dotenv/config';
import express from 'express';
import { config } from './config';
import { createLogger } from './utils/logger';
import { getMemoryStore } from './memory/MemoryStore';

// ─── Route imports ───────────────────────────────────────────────────────────
import sessionRoutes from './routes/session.routes';
import actionRoutes from './routes/action.routes';
import queryRoutes from './routes/query.routes';
import memoryRoutes from './routes/memory.routes';
import loginRoutes from './routes/login.routes';
import dashboardRoutes from './routes/dashboard.routes';
import flowRoutes from './routes/flow.routes';

const log = createLogger('server');
const app = express();
app.use(express.json());

// ─── Initialize memory store ─────────────────────────────────────────────────
getMemoryStore();

// ─── Mount routes ────────────────────────────────────────────────────────────

// Dashboard & monitoring (must be first for / route)
app.use(dashboardRoutes);

// Session management
app.use('/browser/session', sessionRoutes);

// Browser capability actions
app.use('/browser', actionRoutes);

// Query & scraping
app.use('/browser', queryRoutes);

// Login management
app.use('/browser', loginRoutes);

// Memory management
app.use('/memory', memoryRoutes);

// Flow execution & registry API
app.use('/flows', flowRoutes);

// ─── Legacy compatibility endpoints ──────────────────────────────────────────
// Keep old /start, /state, /act for backward compatibility during migration

import * as pw from './engine/playwright';
import { extractPageState } from './state/extractPageState';
import { detectLogin } from './state/detectLogin';
import { v4 as uuidv4 } from 'uuid';

app.post('/start', async (req, res) => {
  try {
    const { taskId, url } = req.body;
    await pw.navigate(url);
    const page = await pw.getPage();
    const state = await extractPageState(page);
    const sessionId = uuidv4();
    
    res.json({
      ok: true,
      sessionId,
      engine: 'playwright',
      profileDir: config.CHROME_PROFILE_DIR,
      url: state.url,
      loginStatus: state.loginStatus,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/state', async (req, res) => {
  try {
    const page = await pw.getPage();
    const state = await extractPageState(page);
    res.json({ ok: true, state });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  log.error({ err: err.message }, 'Unhandled error');
  res.status(500).json({ ok: false, error: err.message });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(config.WORKER_PORT, () => {
  const memoryStore = getMemoryStore();
  log.info(
    {
      port: config.WORKER_PORT,
      chrome: config.CHROME_EXECUTABLE_PATH,
      profile: config.CHROME_PROFILE_DIR,
      recipes: memoryStore.recipes.getAll().length,
      fingerprints: memoryStore.pages.getAll().length,
    },
    `🚀 AnyClick v2 browser worker running on http://localhost:${config.WORKER_PORT}`
  );
});

export default app;
