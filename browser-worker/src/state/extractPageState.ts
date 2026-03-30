import { Page } from 'playwright';
import { config } from '../config';
import { detectLogin } from './detectLogin';
import { createLogger } from '../utils/logger';
import type { PageState, Element } from '../utils/validation';

const log = createLogger('extract-page-state');

let elementCounter = 0;

/**
 * Build a compact structured page-state object from the current page.
 * This is what Gemini receives — never raw HTML.
 */
export async function extractPageState(page: Page): Promise<PageState> {
  elementCounter = 0;

  if (config.DEBUG_OVERLAY) {
    await page.evaluate(() => {
      document.querySelectorAll('.anyclick-debug-badge').forEach((e) => e.remove());
    }).catch(() => {});
  }

  const url = page.url();
  const title = await page.title();
  const loginStatus = await detectLogin(page);

  // ── Extract panels (with greedy fallback) ──────────────────────────────────
  const mainPanel = await extractPanel(page, 'main, [role="main"], .main-content, #main, .content-container, article');
  const rightPanel = await extractPanel(page, '.right-panel, .sidebar-right, aside, .details-panel, [role="complementary"]');


  // ── Extract elements ────────────────────────────────────────────────────────
  const elements = await extractElements(page);

  // ── Extract iframes ─────────────────────────────────────────────────────────
  const frames = await extractFrames(page);

  // ── Loading indicators ──────────────────────────────────────────────────────
  const spinnerVisible = await page
    .locator('[class*="spinner"], [class*="loading"], [aria-label*="loading" i]')
    .first()
    .isVisible()
    .catch(() => false);

  const state: PageState = {
    url,
    title,
    loginStatus,
    panels: { main: mainPanel, right: rightPanel },
    elements,
    frames,
    loading: { networkBusy: false, spinnerVisible },
  };

  log.debug({ url, elementCount: elements.length }, 'Page state extracted');
  return state;
}

// ─── Panel extraction ─────────────────────────────────────────────────────────

async function extractPanel(
  page: Page,
  selector: string
): Promise<{ heading: string; text: string }> {
  try {
    let el = page.locator(selector).first();
    const isVisible = await el.isVisible().catch(() => false);
    
    // Fallback: If no semantic main panel, find the div with the most text
    if (!isVisible) {
      const bestSelector = await page.evaluate(() => {
        const candidates = Array.from(document.querySelectorAll('div, section'));
        let best: HTMLElement | null = null;
        let maxLen = 0;
        for (const c of candidates) {
          const text = (c.textContent || '').trim();
          if (text.length > maxLen && (c as HTMLElement).offsetHeight > 200) {
            maxLen = text.length;
            best = c as HTMLElement;
          }
        }
        if (!best) return null;
        // Generate a simple unique-ish selector or use id
        return best.id ? `#${best.id}` : (best.className ? `.${best.className.split(' ')[0]}` : 'div');
      });
      if (bestSelector) el = page.locator(bestSelector).first();
    }

    if (!(await el.isVisible().catch(() => false))) return { heading: '', text: '' };

    const heading = await el
      .locator('h1, h2, h3')
      .first()
      .textContent()
      .catch(() => '');
    const text = await el.textContent().catch(() => '');
    return {
      heading: (heading ?? '').trim().slice(0, 200),
      text: (text ?? '').trim().replace(/\s+/g, ' ').slice(0, 800), // increased length, cleaned whitespace
    };
  } catch {
    return { heading: '', text: '' };
  }
}

// ─── Element extraction ───────────────────────────────────────────────────────

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="switch"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

async function extractElements(page: Page): Promise<Element[]> {
  const elements: Element[] = [];

  try {
    const locators = await page.locator(INTERACTIVE_SELECTOR).all();

    const elementProps = await page.evaluate((selector) => {
      const nodes = Array.from(document.querySelectorAll(selector));
      return nodes.map((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0';
        
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || tag;
        const text = (el.textContent || '').trim().slice(0, 100);
        const label = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const type = el.getAttribute('type') || tag;
        const enabled = !(el as HTMLButtonElement).disabled;
        const idStr = el.id ? `#${el.id}` : '';

        // Semantic & Visual Scoring
        let score = 0;
        if (visible) score += 100;
        if (!enabled) score -= 50;
        if (text || label || placeholder) score += 30; // meaningful interactions
        if (rect.top >= 0 && rect.top <= window.innerHeight && rect.left >= 0 && rect.left <= window.innerWidth) score += 50; // Above the fold
        if (tag === 'button' || tag === 'input' || tag === 'a' || role === 'button' || role === 'link') score += 20;

        // Detect basic region purely in DOM to avoid extra CDP calls
        let region = 'unknown';
        let node: HTMLElement | null = el as HTMLElement;
        while (node) {
          const cls = (node.className || '').toString().toLowerCase();
          const id = (node.id || '').toLowerCase();
          if (cls.includes('left') || cls.includes('sidebar') || id.includes('nav') || cls.includes('nav')) { region = 'left_nav'; break; }
          if (cls.includes('right') || cls.includes('detail') || cls.includes('panel')) { region = 'right_panel'; break; }
          if (node.tagName === 'HEADER' || cls.includes('header') || id.includes('header')) { region = 'header'; break; }
          if (node.tagName === 'FOOTER' || cls.includes('footer')) { region = 'footer'; break; }
          if (node.tagName === 'MAIN' || cls.includes('main') || cls.includes('content')) { region = 'main_content'; break; }
          node = node.parentElement;
        }

        return {
          index, score, tag, type, role, text, label, placeholder, region, visible, enabled, idStr,
          rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        };
      });
    }, INTERACTIVE_SELECTOR).catch(() => []);

    // Sort descending by score, take top 80
    elementProps.sort((a, b) => b.score - a.score);
    const topElements = elementProps.slice(0, 80);
    
    // Build final elements list
    const badgePayloads: any[] = [];

    for (const prop of topElements) {
      if (!prop.visible) continue;

      elementCounter++;
      elements.push({
        id: elementCounter,
        tag: prop.tag,
        type: prop.type,
        role: prop.role,
        text: prop.text,
        label: prop.label,
        placeholder: prop.placeholder,
        region: prop.region as any,
        visible: prop.visible,
        enabled: prop.enabled,
        ...(prop.idStr ? { selector: prop.idStr } : {}),
      });

      if (config.DEBUG_OVERLAY) {
        badgePayloads.push({
          id: elementCounter,
          top: prop.rect.top,
          left: prop.rect.left,
          width: prop.rect.width,
          height: prop.rect.height,
        });
      }
    }

    // Inject all badges in one single fast CDP call to prevent blocking/timeouts
    if (config.DEBUG_OVERLAY && badgePayloads.length > 0) {
      await page.evaluate((payloads: any[]) => {
        const colors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];
        for (const p of payloads) {
          const color = colors[p.id % colors.length];

          // The main bounding box
          const box = document.createElement('div');
          box.className = 'anyclick-debug-badge';
          box.style.position = 'absolute';
          box.style.border = `2px solid ${color}`;
          box.style.zIndex = '2147483647';
          box.style.pointerEvents = 'none';
          box.style.top = (p.top + window.scrollY) + 'px'; 
          box.style.left = (p.left + window.scrollX) + 'px';
          box.style.width = p.width + 'px';
          box.style.height = p.height + 'px';
          box.style.boxSizing = 'border-box';
          
          // The little floating number tag
          const label = document.createElement('div');
          label.textContent = p.id.toString();
          label.style.position = 'absolute';
          label.style.top = '-10px'; // Pop out over the top-right corner
          label.style.right = '-10px';
          label.style.background = color;
          label.style.color = '#fff';
          label.style.fontSize = '12px';
          label.style.fontWeight = 'bold';
          label.style.padding = '1px 5px';
          label.style.borderRadius = '4px';
          label.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
          label.style.fontFamily = 'system-ui, sans-serif';

          box.appendChild(label);
          document.body.appendChild(box);
        }
      }, badgePayloads).catch((err) => console.log('Badge injection failed:', err));
    }

  } catch (err) {
    log.warn({ err }, 'Element extraction encountered an error');
  }

  return elements;
}

// ─── Region detection ─────────────────────────────────────────────────────────

import type { Locator } from 'playwright';

async function detectRegion(
  loc: Locator
): Promise<'left_nav' | 'main_content' | 'right_panel' | 'header' | 'footer' | 'unknown'> {
  try {
    return await loc.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node) {
        const cls = (node.className || '').toLowerCase();
        const id = (node.id || '').toLowerCase();
        if (cls.includes('left') || cls.includes('sidebar') || id.includes('nav') || cls.includes('nav')) return 'left_nav';
        if (cls.includes('right') || cls.includes('detail') || cls.includes('panel')) return 'right_panel';
        if (node.tagName === 'HEADER' || cls.includes('header') || id.includes('header')) return 'header';
        if (node.tagName === 'FOOTER' || cls.includes('footer')) return 'footer';
        if (node.tagName === 'MAIN' || cls.includes('main') || cls.includes('content')) return 'main_content';
        node = node.parentElement;
      }
      return 'unknown';
    });
  } catch {
    return 'unknown';
  }
}

// ─── Frame extraction ─────────────────────────────────────────────────────────

async function extractFrames(page: Page): Promise<{ name: string; url: string }[]> {
  return page.frames()
    .filter((f) => f !== page.mainFrame())
    .map((f) => ({ name: f.name() || 'unnamed', url: f.url() }));
}
