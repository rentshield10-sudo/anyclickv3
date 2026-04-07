import { Page } from 'playwright';
import { config } from '../config';
import { detectLogin } from './detectLogin';
import { createLogger } from '../utils/logger';
import type { PageState, Element } from '../utils/validation';
import type { Locator } from 'playwright';

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
    }).catch(() => { });
  }

  const url = page.url();
  const title = await page.title();
  const loginStatus = await detectLogin(page);

  const mainPanel = await extractPanel(
    page,
    'main, [role="main"], .main-content, #main, .content-container, article'
  );
  const rightPanel = await extractPanel(
    page,
    '.right-panel, .sidebar-right, aside, .details-panel, [role="complementary"]'
  );
  const leftPanel = await extractPanel(
    page,
    'nav, [role="navigation"], .left-panel, .left-nav, .sidebar, .sidebar-left, .sider'
  );

  const elements = await extractElements(page);
  const frames = await extractFrames(page);

  const spinnerVisible = await page
    .locator('[class*="spinner"], [class*="loading"], [aria-label*="loading" i]')
    .first()
    .isVisible()
    .catch(() => false);

  const state: PageState = {
    url,
    title,
    loginStatus,
    panels: { main: mainPanel, right: rightPanel, left: leftPanel } as any,
    elements,
    frames,
    loading: { networkBusy: false, spinnerVisible },
  };

  const bodyTextLen = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
  log.info(
    {
      url,
      bodyTextLen,
      mainTextLen: mainPanel.text.length,
      rightTextLen: rightPanel.text.length,
      leftTextLen: leftPanel.text.length,
      elementCount: elements.length,
    },
    'TEMP DEBUG extractPageState'
  );

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
        return best.id
          ? `#${best.id}`
          : best.className
            ? `.${best.className.split(' ')[0]}`
            : 'div';
      });

      if (bestSelector) {
        el = page.locator(bestSelector).first();
      }
    }

    if (!(await el.isVisible().catch(() => false))) {
      return { heading: '', text: '' };
    }

    const heading = await el.locator('h1, h2, h3').first().textContent().catch(() => '');
    const text = await el.textContent().catch(() => '');

    return {
      heading: (heading ?? '').trim().slice(0, 200),
      text: (text ?? '').trim().replace(/\s+/g, ' ').slice(0, 2500),
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
  'label',
  'tr',
  'td',
  'th',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="gridcell"]',
  '[role="row"]',
  '[role="switch"]',
  '[role="textbox"]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  '[aria-multiline="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  'li',
  '.row',
  '.list-item',
  '.item',
  '[class*="row" i]',
  '[class*="item" i]',
  '[class*="clickable" i]',
  '[class*="selectable" i]'
].join(', ');

async function extractElements(page: Page): Promise<Element[]> {
  const elements: Element[] = [];

  try {
    const elementProps = await page.evaluate((selector) => {
      function getVisibleText(el: globalThis.Element): string {
        return ((el.textContent || '').trim().replace(/\s+/g, ' ')).slice(0, 100);
      }

      function getBestLabel(el: HTMLElement): string {
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();

        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim() || '')
            .filter(Boolean)
            .join(' ')
            .trim();

          if (text) return text.slice(0, 120);
        }

        const id = el.getAttribute('id');
        if (id) {
          const labelEl = document.querySelector(`label[for="${CSS.escape(id)}"]`) as HTMLElement | null;
          const labelText = labelEl?.textContent?.trim();
          if (labelText) return labelText.slice(0, 120);
        }

        const closestLabel = el.closest('label') as HTMLElement | null;
        if (closestLabel) {
          const labelText = closestLabel.textContent?.trim();
          if (labelText) return labelText.slice(0, 120);
        }

        return '';
      }

      function getBestPlaceholder(el: HTMLElement): string {
        const candidates = [
          el.getAttribute('placeholder'),
          el.getAttribute('data-placeholder'),
          el.getAttribute('aria-placeholder'),
          el.getAttribute('title'),
        ];

        for (const candidate of candidates) {
          if (candidate && candidate.trim()) {
            return candidate.trim().slice(0, 120);
          }
        }

        const descendantPlaceholder =
          el.querySelector('[data-placeholder]')?.getAttribute('data-placeholder') ||
          el.querySelector('[placeholder]')?.getAttribute('placeholder') ||
          '';

        return descendantPlaceholder.trim().slice(0, 120);
      }

      function getBestType(el: HTMLElement, tag: string, role: string): string {
        if (tag === 'input') return (el.getAttribute('type') || 'input').toLowerCase();
        if (tag === 'textarea') return 'textarea';
        if (tag === 'select') return 'select';
        if (el.getAttribute('contenteditable') === 'true' || el.getAttribute('contenteditable') === 'plaintext-only') {
          return 'contenteditable';
        }
        if (role === 'textbox') return 'textbox';
        return tag;
      }

      function buildSelector(el: HTMLElement, tag: string): string {
        // 1. id — best possible
        if (el.id) return `#${el.id}`;

        // 2. data-testid
        const testId = el.getAttribute('data-testid');
        if (testId) return `[data-testid="${testId}"]`;

        // 3. name attribute (inputs)
        const name = el.getAttribute('name');
        if (name) return `${tag}[name="${name}"]`;

        // 4. aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return `${tag}[aria-label="${ariaLabel}"]`;

        // 5. role + unique text (short text only)
        const role = el.getAttribute('role');
        const innerText = (el.textContent || '').trim().slice(0, 50);
        if (role && innerText && innerText.length <= 40) {
          return `[role="${role}"]:has-text("${innerText.replace(/"/g, '\\"')}")`;
        }

        // 6. tag + nth-of-type (always works)
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
          const nth = siblings.indexOf(el) + 1;
          if (parent.id) {
            return `#${parent.id} > ${tag}:nth-of-type(${nth})`;
          }
          // use parent tag + child position
          const parentTag = parent.tagName.toLowerCase();
          const parentClass = (parent.className || '').toString().trim().split(/\s+/)[0];
          if (parentClass) {
            return `${parentTag}.${parentClass} > ${tag}:nth-of-type(${nth})`;
          }
          return `${tag}:nth-of-type(${nth})`;
        }

        return tag;
      }

      function isActuallyVisible(el: HTMLElement, rect: DOMRect, style: CSSStyleDeclaration): boolean {
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0'
        );
      }

      const rawNodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
      const seen = new Set<HTMLElement>();
      const nodes: HTMLElement[] = [];

      for (const node of rawNodes) {
        if (seen.has(node)) continue;
        seen.add(node);
        nodes.push(node);
      }

      return nodes.map((el, index) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const visible = isActuallyVisible(el, rect, style);

        const tag = el.tagName.toLowerCase();
        const role = (el.getAttribute('role') || tag).toLowerCase();
        const text = getVisibleText(el);
        const label = getBestLabel(el);
        const placeholder = getBestPlaceholder(el);
        const type = getBestType(el, tag, role);
        const enabled = !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
        const idStr = buildSelector(el, tag);

        let score = 0;
        if (visible) score += 100;
        if (!enabled) score -= 50;
        if (text || label || placeholder) score += 30;
        if (
          rect.top >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left >= 0 &&
          rect.left <= window.innerWidth
        ) score += 50;
        if (
          tag === 'button' ||
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          tag === 'a' ||
          tag === 'tr' ||
          tag === 'label' ||
          role === 'button' ||
          role === 'link' ||
          role === 'textbox' ||
          role === 'row' ||
          role === 'option' ||
          role === 'radio' ||
          role === 'checkbox' ||
          el.getAttribute('contenteditable') === 'true' ||
          el.getAttribute('contenteditable') === 'plaintext-only'
        ) score += 20;

        if (type === 'contenteditable' || role === 'textbox') score += 25;
        if (placeholder) score += 15;
        if (style.cursor === 'pointer') score += 25;

        let region = 'unknown';
        let node: HTMLElement | null = el;

        while (node) {
          const cls = (node.className || '').toString().toLowerCase();
          const id = (node.id || '').toLowerCase();

          if (cls.includes('left') || cls.includes('sidebar') || id.includes('nav') || cls.includes('nav')) {
            region = 'left_nav';
            break;
          }
          if (cls.includes('right') || cls.includes('detail') || cls.includes('panel')) {
            region = 'right_panel';
            break;
          }
          if (node.tagName === 'HEADER' || cls.includes('header') || id.includes('header')) {
            region = 'header';
            break;
          }
          if (node.tagName === 'FOOTER' || cls.includes('footer')) {
            region = 'footer';
            break;
          }
          if (node.tagName === 'MAIN' || cls.includes('main') || cls.includes('content')) {
            region = 'main_content';
            break;
          }

          node = node.parentElement;
        }

        return {
          index,
          score,
          tag,
          type,
          role,
          text,
          label,
          placeholder,
          region,
          visible,
          enabled,
          idStr,
          rect: {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
          },
        };
      });
    }, INTERACTIVE_SELECTOR).catch(() => []);

    elementProps.sort((a, b) => b.score - a.score);
    const topElements = elementProps.slice(0, 250);

    const badgePayloads: Array<{
      id: number;
      top: number;
      left: number;
      width: number;
      height: number;
    }> = [];

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
        selector: prop.idStr,
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

    if (config.DEBUG_OVERLAY && badgePayloads.length > 0) {
      await page.evaluate((payloads: Array<{
        id: number;
        top: number;
        left: number;
        width: number;
        height: number;
      }>) => {
        const colors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

        for (const p of payloads) {
          const color = colors[p.id % colors.length];

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

          const label = document.createElement('div');
          label.textContent = p.id.toString();
          label.style.position = 'absolute';
          label.style.top = '-10px';
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