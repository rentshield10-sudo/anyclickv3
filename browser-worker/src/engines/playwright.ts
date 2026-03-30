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
      '--disable-blink-features=AutomationControlled'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    viewport: null, // use full window size
  });

  // Use existing page or open a new one
  const pages = context.pages();
  page = pages.length > 0 ? pages[0] : await context.newPage();

  log.info('Chrome launched successfully');
  return { context, page };
}

// ─── Navigate ─────────────────────────────────────────────────────────────────

export async function navigate(url: string): Promise<void> {
  const { page: p } = await launchOrReuse();
  log.info({ url }, 'Navigating');
  await retry(() => p.goto(url, { waitUntil: 'load', timeout: 30_000 }), {
    label: 'navigate',
  });
}

// ─── Get active page ──────────────────────────────────────────────────────────

export async function getPage(): Promise<Page> {
  const { page: p } = await launchOrReuse();
  return p;
}

// ─── Click ────────────────────────────────────────────────────────────────────

export async function click(selector: string): Promise<void> {
  const p = await getPage();
  log.debug({ selector }, 'click');
  await retry(() => p.locator(selector).first().click({ timeout: 8_000 }), { label: 'click' });
}

// ─── Type ─────────────────────────────────────────────────────────────────────

export async function type(selector: string, text: string): Promise<void> {
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

// ─── Scroll ───────────────────────────────────────────────────────────────────

export async function scroll(direction: 'up' | 'down' = 'down', amount = 500): Promise<void> {
  const p = await getPage();
  const deltaY = direction === 'down' ? amount : -amount;
  await p.mouse.wheel(0, deltaY);
}

// ─── Select ───────────────────────────────────────────────────────────────────

export async function select(selector: string, value: string): Promise<void> {
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

// ─── Wait for change ──────────────────────────────────────────────────────────

export async function waitForChange(timeoutMs = 3_000): Promise<void> {
  const p = await getPage();
  // Instead of networkidle (which hangs on chat apps), we just wait for the main 'load' state
  await p.waitForLoadState('load', { timeout: timeoutMs }).catch(() => {});
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
