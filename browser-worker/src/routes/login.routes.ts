import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { broadcastLog } from '../utils/events';
import * as pw from '../engine/playwright';
import { detectLogin } from '../state/detectLogin';
import { requestLogin } from '../ui/loginPrompt';

const log = createLogger('login-routes');
const router = Router();

// ─── POST /browser/request-login ────────────────────────────────────────────

router.post('/request-login', async (req: Request, res: Response) => {
  try {
    const { site, message } = req.body;
    if (!site) {
      res.status(400).json({ ok: false, error: 'site is required' });
      return;
    }

    log.info({ site }, 'Login prompt requested');
    broadcastLog('info', `Login prompt triggered for ${site}`);

    requestLogin(site, message || `Please log in to ${site}, then click Continue.`)
      .catch((err: any) => log.error({ err }, 'Login prompt error'));

    res.json({ ok: true, message: `Login prompt opened for ${site}` });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /browser/check-login-status ────────────────────────────────────────

router.get('/check-login-status', async (req: Request, res: Response) => {
  try {
    const page = await pw.getPage();
    const status = await detectLogin(page);
    const url = page.url();

    res.json({
      ok: true,
      data: {
        loggedIn: status.loggedIn,
        evidence: status.evidence,
        currentUrl: url,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
