import { chromium, BrowserContext, Page } from 'playwright';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { retry } from '../utils/retry';

const log = createLogger('playwright-engine');

let context: BrowserContext | null = null;
let page: Page | null = null;

// ─── Launch / Reuse ───────────────────────────────────────────────────────────

/**
 * Launch or reuse a persistent Chrome context using the dedicated agent profile.
 * Always uses real Google Chrome Stable — never bundled Chromium.
 * Chrome 136+ requires a non-default --user-data-dir for remote debugging.
 */
export async function launchOrReuse(): Promise<{ context: BrowserContext; page: Page }> {
  if (context && page) {
    try {
      // Ping the page to ensure the browser wasn't closed by the user
      await page.title();
      return { context, page };
    } catch {
      log.warn('Browser was closed externally. Rebooting the context...');
      context = null;
      page = null;
    }
  }

  log.info({ profileDir: config.CHROME_PROFILE_DIR }, 'Launching Chrome with persistent profile');

  context = await chromium.launchPersistentContext(config.CHROME_PROFILE_DIR, {
    channel: 'chrome',
    executablePath: config.CHROME_EXECUTABLE_PATH,
    headless: false,
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled',
      '--test-type',
      '--disable-infobars'
    ],
    ignoreDefaultArgs: [
      '--enable-automation', 
      '--no-sandbox', 
      '--disable-extensions'
    ],
    viewport: null, // use full window size
  });

  // Use existing page or open a new one
  const pages = context.pages();
  if (pages.length > 0) {
    // Return the first valid page and optionally close extra empty ones created on launch
    page = pages[0];
    
    // Sometimes Chrome opens a "New Tab" alongside our requested tab
    if (pages.length > 1 && pages[1].url() === 'about:blank') {
      await pages[1].close().catch(() => {});
    }
  } else {
    page = await context.newPage();
  }

  log.info('Chrome launched successfully');
  return { context, page };
}

// ─── Navigate ─────────────────────────────────────────────────────────────────

export async function navigate(url: string): Promise<void> {
  const { page: p } = await launchOrReuse();
  log.info({ url }, 'Navigating');
  await retry(async () => {
    // Just navigate the existing page instead of making a new one
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await p.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
    await p.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await p.waitForTimeout(1200);
  }, {
    label: 'navigate',
  });
}

// ─── Get active page ──────────────────────────────────────────────────────────

export async function getPage(): Promise<Page> {
  const { page: p } = await launchOrReuse();
  return p;
}

// ─── Click ────────────────────────────────────────────────────────────────────

export async function simulateCursor(selector: string, actionType: string = 'click'): Promise<void> {
  if (!config.DEMO_MODE) return;

  const p = await getPage();
  try {
    await p.evaluate(async ({ sel, action }) => {
      // 1. Ensure fake cursor exists
      let cursor = document.getElementById('anyclick-demo-cursor');
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'anyclick-demo-cursor';
        Object.assign(cursor.style, {
          width: '20px',
          height: '20px',
          background: 'rgba(239, 68, 68, 0.8)',
          border: '2px solid white',
          borderRadius: '50%',
          position: 'fixed',
          top: '50%',
          left: '50%',
          pointerEvents: 'none',
          zIndex: '2147483647',
          transition: 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
        });
        document.body.appendChild(cursor);
      }

      // 2. Resolve target
      const el = document.querySelector(sel);
      if (!el) return;

      // 3. Highlight target
      const originalOutline = (el as HTMLElement).style.outline;
      const originalOutlineOffset = (el as HTMLElement).style.outlineOffset;
      (el as HTMLElement).style.outline = '3px solid rgba(239, 68, 68, 0.6)';
      (el as HTMLElement).style.outlineOffset = '2px';

      // 4. Move cursor to center of target
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2;
      const targetY = rect.top + rect.height / 2;

      cursor.style.transform = 'translate(-50%, -50%) scale(1)';
      cursor.style.left = `${targetX}px`;
      cursor.style.top = `${targetY}px`;

      // 5. Wait for move to finish
      await new Promise(r => setTimeout(r, 450));

      // 6. Action specific visual (click ripple/squish)
      if (action === 'click') {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.6)';
        cursor.style.background = 'rgba(220, 38, 38, 1)';
        await new Promise(r => setTimeout(r, 150));
        cursor.style.transform = 'translate(-50%, -50%) scale(1.2)';
        cursor.style.background = 'rgba(239, 68, 68, 0.4)';
        await new Promise(r => setTimeout(r, 100));
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.background = 'rgba(239, 68, 68, 0.8)';
      }

      // 7. Restore highlight
      setTimeout(() => {
        (el as HTMLElement).style.outline = originalOutline;
        (el as HTMLElement).style.outlineOffset = originalOutlineOffset;
      }, 300);

    }, { sel: selector, action: actionType });
  } catch (err) {
    log.debug({ err: (err as Error).message }, 'Demo cursor simulation failed (non-fatal)');
  }
}

export async function click(selector: string): Promise<void> {
  await simulateCursor(selector, 'click');
  const p = await getPage();
  log.debug({ selector }, 'click');
  await retry(async () => {
    const locator = p.locator(selector).filter({ visible: true }).first();
    await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await locator.click({ timeout: 8_000 });
  }, { label: 'click' });
}

// ─── Type ─────────────────────────────────────────────────────────────────────

export async function type(selector: string, text: string): Promise<void> {
  await simulateCursor(selector, 'type');
  const p = await getPage();
  log.debug({ selector, text }, 'type');
  const locator = p.locator(selector).first();
  await retry(async () => {
    await locator.click({ timeout: 5_000 });
    await locator.fill(text, { timeout: 5_000 });
  }, { label: 'type' });
}

// ─── Press key ────────────────────────────────────────────────────────────────

export async function press(selector: string, key: string): Promise<void> {
  const p = await getPage();
  log.debug({ selector, key }, 'press');
  await retry(() => p.locator(selector).first().press(key, { timeout: 5_000 }), { label: 'press' });
}

// ─── Hover ────────────────────────────────────────────────────────────────────

export async function hover(selector: string): Promise<void> {
  const p = await getPage();
  log.debug({ selector }, 'hover');
  await retry(() => p.locator(selector).first().hover({ timeout: 5_000 }), { label: 'hover' });
}

// ─── Scroll ───────────────────────────────────────────────────────────────────

export async function scroll(direction: 'up' | 'down' = 'down', amount = 500): Promise<void> {
  const p = await getPage();
  const deltaY = direction === 'down' ? amount : -amount;
  await p.mouse.wheel(0, deltaY);
}

// ─── Select ───────────────────────────────────────────────────────────────────

export async function select(selector: string, value: string): Promise<void> {
  await simulateCursor(selector, 'select');
  const p = await getPage();
  log.debug({ selector, value }, 'select');
  await retry(() => p.locator(selector).first().selectOption(value, { timeout: 5_000 }), {
    label: 'select',
  });
}

// ─── Extract text ─────────────────────────────────────────────────────────────

export async function extract(selector: string): Promise<string> {
  const p = await getPage();
  return (await p.locator(selector).first().textContent({ timeout: 5_000 })) ?? '';
}

// ─── Form Fill (multiple fields) ──────────────────────────────────────────────

export async function formFill(fields: { selector: string; value: string }[]): Promise<void> {
  const p = await getPage();
  for (const field of fields) {
    log.debug({ selector: field.selector, value: field.value }, 'form-fill');
    const locator = p.locator(field.selector).first();
    await locator.click({ timeout: 5_000 }).catch(() => {});
    await locator.fill(field.value, { timeout: 5_000 });
  }
}

// ─── Wait for change ──────────────────────────────────────────────────────────

export async function waitForChange(timeoutMs = 1_500): Promise<void> {
  const p = await getPage();
  // Wrap network idle in a race so it strictly aborts at the timeout
  // instead of stacking multiple timeout waits sequentially.
  await Promise.race([
    p.waitForLoadState('networkidle'),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]).catch(() => {});
  
  // Short mandatory settle for React/Vue DOM updates
  await p.waitForTimeout(300);
}

// ─── Screenshot ───────────────────────────────────────────────────────────────

export async function screenshot(path?: string): Promise<Buffer> {
  const p = await getPage();
  return await p.screenshot({ path, fullPage: false });
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
    log.info('Browser closed');
  }
}
