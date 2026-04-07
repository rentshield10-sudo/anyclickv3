import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import * as pw from '../engine/playwright';
import { extractPageState } from '../state/extractPageState';
import { generateFingerprint } from '../state/fingerprint';
import { resolveLocator } from '../locator/LocatorEngine';
import { getMemoryStore } from '../memory/MemoryStore';

const log = createLogger('query-routes');
const router = Router();

// ─── POST /browser/page-query ───────────────────────────────────────────────

router.post('/page-query', async (req: Request, res: Response) => {
  try {
    const { query } = req.body as { query: string };
    if (!query) {
      res.status(400).json({ ok: false, error: 'query is required' });
      return;
    }

    const page = await pw.getPage();
    const state = await extractPageState(page);
    const fingerprint = await generateFingerprint(page);

    const panelsAny = state.panels as any;
    const leftPanel = panelsAny.left || { heading: '', text: '' };

    const searchableParts = [
      state.title,
      state.panels.main.heading,
      state.panels.main.text,
      state.panels.right.heading,
      state.panels.right.text,
      leftPanel.heading,
      leftPanel.text,
      ...state.elements.map((e) =>
        [e.text, e.label, e.placeholder, e.role, e.region]
          .filter(Boolean)
          .join(' ')
      ),
    ].filter(Boolean);

    const fullText = searchableParts.join('\n').replace(/\s+/g, ' ').trim();

    const stopWords = new Set([
      'what',
      'visible',
      'text',
      'page',
      'include',
      'the',
      'and',
      'area',
      'on',
      'is',
      'far',
      'left',
    ]);

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !stopWords.has(t));

    const matchedTokens = tokens.filter((t) => fullText.toLowerCase().includes(t));
    const found = matchedTokens.length > 0;

    log.info(
      {
        query,
        found,
        matchCount: matchedTokens.length,
        title: state.title,
        panelLengths: {
          main: state.panels.main.text.length,
          right: state.panels.right.text.length,
          left: leftPanel.text.length,
        },
        topElements: state.elements.slice(0, 20).map((e) => ({
          id: e.id,
          text: e.text,
          label: e.label,
          role: e.role,
          region: e.region,
        })),
      },
      'TEMP DEBUG page-query'
    );

    res.json({
      ok: true,
      data: {
        url: state.url,
        title: state.title,
        pageType: fingerprint.pageType,
        query,
        found,
        matchCount: matchedTokens.length,
        matchedText: fullText.slice(0, 3000),
        matchedTokens,
        panels: {
          ...state.panels,
          left: leftPanel,
        },
        elements: state.elements.slice(0, 150),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /browser/scrape ───────────────────────────────────────────────────

router.post('/scrape', async (req: Request, res: Response) => {
  try {
    const { selector, fields, limit } = req.body as {
      selector?: string;          // Container selector
      fields?: { name: string; selector: string }[];  // Fields to extract per item
      limit?: number;
    };

    const page = await pw.getPage();
    const maxItems = limit || 50;

    if (fields && selector) {
      // Structured extraction: extract named fields from each matching container
      const items = await page.evaluate(
        ({ containerSel, fieldDefs, maxItems }: any) => {
          const containers = Array.from(document.querySelectorAll(containerSel)).slice(0, maxItems);
          return containers.map(container => {
            const item: Record<string, string> = {};
            for (const field of fieldDefs) {
              const el = container.querySelector(field.selector);
              item[field.name] = el ? (el.textContent || '').trim() : '';
            }
            return item;
          });
        },
        { containerSel: selector, fieldDefs: fields, maxItems }
      );

      res.json({ ok: true, data: { itemCount: items.length, items } });
    } else if (selector) {
      // Simple text extraction
      const texts = await page.evaluate(
        ({ sel, max }: any) => {
          return Array.from(document.querySelectorAll(sel))
            .slice(0, max)
            .map(el => (el.textContent || '').trim())
            .filter(t => t.length > 0);
        },
        { sel: selector, max: maxItems }
      );

      res.json({ ok: true, data: { itemCount: texts.length, items: texts } });
    } else {
      // Full page text extraction
      const state = await extractPageState(page);
      res.json({
        ok: true,
        data: {
          url: state.url,
          title: state.title,
          mainText: state.panels.main.text,
          rightText: state.panels.right.text,
          elementCount: state.elements.length,
        },
      });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /browser/paginated-extraction ─────────────────────────────────────

router.post('/paginated-extraction', async (req: Request, res: Response) => {
  try {
    const { itemSelector, fields, nextButton, maxPages } = req.body as {
      itemSelector: string;
      fields: { name: string; selector: string }[];
      nextButton: { text?: string; selector?: string };
      maxPages?: number;
    };

    if (!itemSelector || !fields || !nextButton) {
      res.status(400).json({ ok: false, error: 'itemSelector, fields, and nextButton are required' });
      return;
    }

    const page = await pw.getPage();
    const pageUrl = new URL(page.url());
    const memoryStore = getMemoryStore();
    const allItems: Record<string, string>[] = [];
    const pages = maxPages || 5;

    for (let p = 0; p < pages; p++) {
      // Extract current page items
      const items = await page.evaluate(
        ({ containerSel, fieldDefs }: any) => {
          const containers = Array.from(document.querySelectorAll(containerSel));
          return containers.map(container => {
            const item: Record<string, string> = {};
            for (const field of fieldDefs) {
              const el = container.querySelector(field.selector);
              item[field.name] = el ? (el.textContent || '').trim() : '';
            }
            return item;
          });
        },
        { containerSel: itemSelector, fieldDefs: fields }
      );

      allItems.push(...items);

      // Try to click next button
      if (p < pages - 1) {
        let nextSelector = nextButton.selector;
        
        if (!nextSelector && nextButton.text) {
          const locResult = await resolveLocator(page, {
            intent: 'click_next_page',
            action: 'click',
            target: { text: nextButton.text, role: 'button' },
            site: pageUrl.hostname,
          }, {
            lookup: (s, i, pt) => memoryStore.recipes.lookup(s, i, pt),
            markSuccess: (id) => memoryStore.recipes.markSuccess(id),
            markFailure: (id) => memoryStore.recipes.markFailure(id),
          });
          
          if (locResult.found) nextSelector = locResult.selector || undefined;
        }

        if (nextSelector) {
          const exists = await page.locator(nextSelector).count().catch(() => 0);
          if (exists === 0) break; // No more pages
          
          await page.locator(nextSelector).first().click({ timeout: 5000 });
          await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
          await new Promise(r => setTimeout(r, 1000));
        } else {
          break; // Can't find next button
        }
      }
    }

    res.json({
      ok: true,
      data: {
        totalItems: allItems.length,
        pagesScraped: Math.min(pages, allItems.length > 0 ? pages : 1),
        items: allItems,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
