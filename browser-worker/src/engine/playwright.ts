import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
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
      
      // Secondary check: verify context pages array isn't empty (browser might be in a weird detached state)
      const pages = context.pages();
      if (pages.length === 0) {
          throw new Error('No pages left in context');
      }
      
      return { context, page };
    } catch {
      log.warn('Browser or active page was closed externally. Attempting to recover existing context or rebooting...');
      
      try {
        if (context) {
           const pages = context.pages();
           if (pages.length > 0) {
               page = pages[0];
               return { context, page };
           } else {
               page = await context.newPage();
               return { context, page };
           }
        }
      } catch {
         // Context is totally dead
      }

      context = null;
      page = null;
    }
  }

  log.info({ profileDir: config.CHROME_PROFILE_DIR }, 'Launching Chrome with persistent profile');

  context = await chromium.launchPersistentContext(config.CHROME_PROFILE_DIR, {
    channel: 'chrome',
    executablePath: config.CHROME_EXECUTABLE_PATH,
    headless: false,
    acceptDownloads: true,
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
    // Return the first valid page
    page = pages[0];
    
    // Close any *additional* empty tabs that spawned during launch to prevent bloat
    for (let i = 1; i < pages.length; i++) {
        if (pages[i].url() === 'about:blank' || pages[i].url() === 'chrome://newtab/') {
            await pages[i].close().catch(() => {});
        }
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
    // Rely on Playwright's robust locator rather than document.querySelector
    // to bypass pseudo-class limitations (e.g. :has-text)
    const locator = p.locator(selector).first();
    
    // Attempt evaluation with a short timeout. If element is not attached yet, just skip demo cursor gracefully.
    await locator.evaluate(async (el: HTMLElement, action: string) => {
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
          pointerEvents: 'none',
          zIndex: '2147483647',
          transition: 'all 0.4s cubic-bezier(0.25, 1, 0.5, 1)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          left: `${window.innerWidth / 2}px`,
          top: `${window.innerHeight / 2}px`
        });
        document.body.appendChild(cursor);
        
        // Force reflow
        void cursor.offsetHeight;
      }

      // 2. Highlight target
      const originalOutline = el.style.outline;
      const originalOutlineOffset = el.style.outlineOffset;
      el.style.outline = '3px solid rgba(239, 68, 68, 0.6)';
      el.style.outlineOffset = '2px';

      // 3. Move cursor to center of target
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + rect.width / 2;
      const targetY = rect.top + rect.height / 2;

      cursor.style.transform = 'translate(-50%, -50%) scale(1)';
      cursor.style.left = `${targetX}px`;
      cursor.style.top = `${targetY}px`;

      // 4. Wait for move to finish
      await new Promise(r => setTimeout(r, 450));

      // 5. Action specific visual (click ripple/squish)
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

      // 6. Restore highlight
      setTimeout(() => {
        el.style.outline = originalOutline;
        el.style.outlineOffset = originalOutlineOffset;
      }, 300);

    }, actionType, { timeout: 1500 });
  } catch (err) {
    log.trace({ err: (err as Error).message }, 'Demo cursor simulation skipped or failed (non-fatal)');
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

export async function download(selector: string, opts: import('../memory/RecipeMemory').DownloadConfig = {}): Promise<{ saved_path: string; filename: string; source: string }> {
  await simulateCursor(selector, 'click');
  const p = await getPage();
  const timeoutMs = opts.timeout_ms || 30000;

  log.info({ selector, opts }, 'Preparing to trigger download');

  // Set up raw promises without immediate catch, so they don't resolve to null prematurely
  const downloadPromise = p.waitForEvent('download', { timeout: timeoutMs }).then(d => ({ type: 'download', payload: d }));
  const popupPromise = p.waitForEvent('popup', { timeout: timeoutMs }).then(popup => ({ type: 'popup', payload: popup }));

  const loc = p.locator(selector).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
  await loc.click({ timeout: 5000 }).catch(async () => {
     await loc.click({ force: true, timeout: 2000 }).catch(async () => {
         await loc.evaluate((node: HTMLElement) => node.click()).catch(() => {});
     });
  });

  let raceResult: any = null;
  try {
     raceResult = await Promise.race([
        downloadPromise,
        popupPromise
     ]);
  } catch (err: any) {
     throw new Error(`Click on selector did not trigger a download or a popup within ${timeoutMs}ms.`);
  }

  let finalDownload = null;
  let source = 'direct';
  let popupPage = null;

  if (raceResult.type === 'download' && raceResult.payload) {
     finalDownload = raceResult.payload;
  } else if (raceResult.type === 'popup' && raceResult.payload) {
     popupPage = raceResult.payload as Page;
     source = 'popup_pdf';
     log.info('Click opened a new tab/popup. Checking for PDF/viewer download...');
     
     try {
       await popupPage.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
       
       // Heuristic: Some viewers (like Chrome's native PDF) have a download button in shadow DOM we can trigger
       const url = popupPage.url().toLowerCase();
       const title = (await popupPage.title().catch(() => '')).toLowerCase();
       const isPDF = url.endsWith('.pdf') || title.includes('pdf');
       
       if (isPDF) {
          log.info('Popup appears to be a PDF. Looking for native viewer download button...');
          // Chrome's PDF viewer has a download button with id "download" inside its shadow root
          const dlBtn = popupPage.locator('#download, cr-icon-button#download, button[aria-label*="download" i], a[download]').first();
          if (await dlBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
             const popupDownloadPromise = popupPage.waitForEvent('download', { timeout: 15000 });
             await dlBtn.click({ force: true }).catch(() => {});
             finalDownload = await popupDownloadPromise.catch(() => null);
          }
       }
       
       if (!finalDownload) {
           throw new Error('Popup opened but no download event was captured from it.');
       }
     } catch (err: any) {
       if (opts.close_popup && popupPage) {
           await popupPage.close().catch(() => {});
       }
       throw new Error(`Failed to capture download from popup: ${err.message}`);
     }
  }

  if (!finalDownload) {
     throw new Error('Failed to resolve download object.');
  }

  // Handle the save
  const suggestedFilename = finalDownload.suggestedFilename() || `download_${Date.now()}.bin`;
  let filename = opts.filename_template || suggestedFilename;
  
  // Clean filename to prevent path traversal
  filename = filename.replace(/[/\\?%*:|"<>]/g, '_');
  
  const saveDir = path.resolve(process.cwd(), opts.save_dir || 'downloads');
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  const savedPath = path.join(saveDir, filename);
  await finalDownload.saveAs(savedPath);

  if (opts.close_popup && popupPage) {
      await popupPage.close().catch(() => {});
  }

  log.info({ savedPath, filename, source }, 'Download completed successfully');

  return {
    saved_path: path.relative(process.cwd(), savedPath),
    filename,
    source
  };
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
