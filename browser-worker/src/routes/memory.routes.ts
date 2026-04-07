import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { getMemoryStore } from '../memory/MemoryStore';
import { generateFingerprint } from '../state/fingerprint';
import * as pw from '../engine/playwright';

const log = createLogger('memory-routes');
const router = Router();

// ─── POST /memory/lookup-recipe ──────────────────────────────────────────────

router.post('/lookup-recipe', async (req: Request, res: Response) => {
  try {
    const { site, intent, pageType } = req.body;
    if (!site || !intent) {
      res.status(400).json({ ok: false, error: 'site and intent are required' });
      return;
    }

    const memoryStore = getMemoryStore();
    const recipe = memoryStore.recipes.lookup(site, intent, pageType);

    if (recipe) {
      res.json({
        ok: true,
        data: {
          found: true,
          recipe,
        },
      });
    } else {
      res.json({
        ok: true,
        data: { found: false },
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /memory/save-recipe ────────────────────────────────────────────────

router.post('/save-recipe', async (req: Request, res: Response) => {
  try {
    const { recipe } = req.body;
    if (!recipe || !recipe.site || !recipe.intent) {
      res.status(400).json({ ok: false, error: 'recipe with site and intent is required' });
      return;
    }

    const memoryStore = getMemoryStore();
    const saved = memoryStore.recipes.save(recipe);
    res.json({ ok: true, data: { recipe: saved } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /memory/update-recipe ──────────────────────────────────────────────

router.post('/update-recipe', async (req: Request, res: Response) => {
  try {
    const { recipeId, recipe } = req.body;
    if (!recipeId) {
      res.status(400).json({ ok: false, error: 'recipeId is required' });
      return;
    }
    if (!recipe || !recipe.site || !recipe.intent) {
      res.status(400).json({ ok: false, error: 'recipe with site and intent is required' });
      return;
    }

    const memoryStore = getMemoryStore();
    const updated = memoryStore.recipes.update(recipeId, recipe);

    if (!updated) {
      res.status(404).json({ ok: false, error: 'recipe not found' });
      return;
    }

    res.json({ ok: true, data: { recipe: updated } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /memory/delete-recipe ──────────────────────────────────────────────

router.post('/delete-recipe', async (req: Request, res: Response) => {
  try {
    const { recipeId } = req.body;
    if (!recipeId) {
      res.status(400).json({ ok: false, error: 'recipeId is required' });
      return;
    }

    const memoryStore = getMemoryStore();
    const deleted = memoryStore.recipes.delete(recipeId);

    if (!deleted) {
      res.status(404).json({ ok: false, error: 'recipe not found' });
      return;
    }

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /memory/save-run ──────────────────────────────────────────────────

router.post('/save-run', async (req: Request, res: Response) => {
  try {
    const { run } = req.body;
    if (!run) {
      res.status(400).json({ ok: false, error: 'run record is required' });
      return;
    }

    const memoryStore = getMemoryStore();
    memoryStore.runs.save(run);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /memory/page-fingerprint-match ────────────────────────────────────

router.post('/page-fingerprint-match', async (_req: Request, res: Response) => {
  try {
    const page = await pw.getPage();
    const fingerprint = await generateFingerprint(page);

    const memoryStore = getMemoryStore();
    const match = memoryStore.pages.match(
      fingerprint.hostname,
      fingerprint.pathname,
      fingerprint.title,
      fingerprint.headings
    );

    res.json({
      ok: true,
      data: {
        current: {
          hostname: fingerprint.hostname,
          pathPattern: fingerprint.pathPattern,
          pageType: fingerprint.pageType,
          title: fingerprint.title,
        },
        match: match ? {
          found: true,
          score: match.score,
          fingerprint: match.fingerprint,
        } : {
          found: false,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /memory/recipes ────────────────────────────────────────────────────

router.get('/recipes', (req: Request, res: Response) => {
  try {
    const site = req.query.site as string | undefined;
    const memoryStore = getMemoryStore();
    const recipes = memoryStore.recipes.getAll(site);
    res.json({ ok: true, data: { count: recipes.length, recipes } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /memory/fingerprints ───────────────────────────────────────────────

router.get('/fingerprints', (req: Request, res: Response) => {
  try {
    const hostname = req.query.hostname as string | undefined;
    const memoryStore = getMemoryStore();
    const fps = memoryStore.pages.getAll(hostname);
    res.json({ ok: true, data: { count: fps.length, fingerprints: fps } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /memory/runs ───────────────────────────────────────────────────────

router.get('/runs', (req: Request, res: Response) => {
  try {
    const site = req.query.site as string | undefined;
    const limit = parseInt(req.query.limit as string) || 20;
    const memoryStore = getMemoryStore();
    const runs = memoryStore.runs.getRecent(limit, site);
    res.json({ ok: true, data: { count: runs.length, runs } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;