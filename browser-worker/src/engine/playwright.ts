import { chromium, BrowserContext, Page, Download } from 'playwright';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { retry } from '../utils/retry';
import { broadcastLog } from '../utils/events';

type DownloadConfig = import('../memory/RecipeMemory').DownloadConfig;

const RETRO_POINTER_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" style="display:block">
    <polygon fill="#ffffff" points="0,0 0,20 5,15 7,22 10,22 8,15 18,15" />
    <polyline fill="none" stroke="#000000" stroke-width="2" stroke-linejoin="miter"
      points="0,0 0,20 5,15 7,22 10,22 8,15 18,15" />
  </svg>
`;

const log = createLogger('playwright-engine');

let context: BrowserContext | null = null;
let page: Page | null = null;
let contextListenersAttached = false;
function attachPageListeners(p: Page) {
  if ((p as any).__anyclickPageListenersAttached) return;
  (p as any).__anyclickPageListenersAttached = true;

  p.on('download', (download) => {
    let suggested = '';
    try { suggested = download.suggestedFilename(); } catch {}
    broadcastLog('info', 'Download event detected', {
      pageUrl: safePageUrl(p),
      suggested,
    });
    log.info({ pageUrl: safePageUrl(p), suggested }, 'Download event detected');
  });

  p.on('popup', (popup) => {
    broadcastLog('info', 'Popup window opened', {
      openerUrl: safePageUrl(p),
    });
    log.info({ openerUrl: safePageUrl(p) }, 'Popup window opened');
    attachPageListeners(popup);

    autoCapturePdfFromPage(popup).catch((err) => {
      log.debug({ err: (err as Error).message }, 'Auto capture from popup rejected (listener)');
    });

  });

  p.on('framenavigated', (frame) => {
    if (frame === p.mainFrame()) {
      broadcastLog('info', 'Navigation detected', { url: frame.url() });
      log.info({ url: frame.url() }, 'Navigation detected');
    }
  });

  p.on('close', () => {
    broadcastLog('info', 'Page closed', { url: safePageUrl(p) });
    log.info({ url: safePageUrl(p) }, 'Page closed');
    delete (p as any).__anyclickPageListenersAttached;
  });
}

function ensureContextListeners(ctx: BrowserContext) {
  if (contextListenersAttached && (ctx as any).__anyclickContextListenersAttached) {
    ctx.pages().forEach(attachPageListeners);
    return;
  }

  contextListenersAttached = true;
  (ctx as any).__anyclickContextListenersAttached = true;

  ctx.on('page', (newPage) => {
    broadcastLog('info', 'New page created', { url: safePageUrl(newPage) });
    log.info({ url: safePageUrl(newPage) }, 'New page created');
    attachPageListeners(newPage);

    autoCapturePdfFromPage(newPage).catch(() => {});

  });

  ctx.on('close', () => {
    broadcastLog('warn', 'Browser context closed by Chrome');
    log.warn('Browser context closed by Chrome');
    contextListenersAttached = false;
  });

  ctx.pages().forEach(attachPageListeners);
}

function safePageUrl(p: Page | null | undefined): string {
  if (!p) return '(unknown)';
  try {
    return p.url();
  } catch {
    return '(unavailable)';
  }
}

async function autoCapturePdfFromPage(
  popup: Page,
  opts: { save_dir?: string; filename_template?: string } = {}
) {
  if ((popup as any).__anyclickAutoDownloadAttempted) return null;
  (popup as any).__anyclickAutoDownloadAttempted = true;

  try {
    await popup.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
    await popup.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});

    let popupUrl = safePageUrl(popup);
    if (!popupUrl || popupUrl === 'about:blank') {
      await popup.waitForEvent('framenavigated', { timeout: 5_000 }).catch(() => null);
      popupUrl = safePageUrl(popup);
    }

    if (!popupUrl || popupUrl === 'about:blank') {
      return null;
    }

    const response = await popup.context().request.get(popupUrl, {
      timeout: 30_000,
      failOnStatusCode: false,
    });

    const status = response.status();
    const headers = response.headers();
    const contentType = (headers['content-type'] || '').toLowerCase();
    const bytes = Buffer.from(await response.body());

    const looksPdf =
      contentType.includes('application/pdf') ||
      popupUrl.toLowerCase().includes('.pdf') ||
      popupUrl.toLowerCase().includes('download');

    if (status >= 200 && status < 300 && bytes.length > 0 && looksPdf) {
      const saved = saveBufferDownload(bytes, opts, popupUrl, 'popup_auto_pdf');
      broadcastLog('info', 'Popup PDF captured automatically', {
        url: popupUrl,
        saved_path: saved.saved_path,
      });
      log.info({ url: popupUrl, saved_path: saved.saved_path }, 'Popup PDF captured automatically');

      if (!popup.isClosed()) {
        await popup.close().catch(() => {});
      }

      return saved;
    }
  } catch (err) {
    log.debug({ err: (err as Error).message, url: safePageUrl(popup) }, 'Auto capture attempt failed');
  }

  return null;
}

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
      
      ensureContextListeners(context);
      attachPageListeners(page);
      return { context, page };
    } catch {
      log.warn('Browser or active page was closed externally. Attempting to recover existing context or rebooting...');
      
      try {
        if (context) {
           const pages = context.pages();
           if (pages.length > 0) {
               page = pages[0];
                ensureContextListeners(context);
                attachPageListeners(page);
                return { context, page };
           } else {
               page = await context.newPage();
                ensureContextListeners(context);
                attachPageListeners(page);
                return { context, page };
           }
        }
      } catch {
         // Context is totally dead
      }

      context = null;
      page = null;
      contextListenersAttached = false;
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

  ensureContextListeners(context);
  attachPageListeners(page);

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
    await locator.evaluate(
      async (
        el: HTMLElement,
        payload: { action: string; svg: string }
      ) => {
        const CURSOR_WIDTH = 24;
        const CURSOR_HEIGHT = 24;
        const HOTSPOT_X = 1.5;
        const HOTSPOT_Y = 2;

        let host = document.getElementById('anyclick-demo-cursor') as HTMLDivElement | null;
        let inner: HTMLDivElement;

        if (!host) {
          host = document.createElement('div');
          host.id = 'anyclick-demo-cursor';
          Object.assign(host.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '2147483647',
            width: `${CURSOR_WIDTH}px`,
            height: `${CURSOR_HEIGHT}px`,
            left: '0px',
            top: '0px'
          });

          inner = document.createElement('div');
          inner.className = 'anyclick-demo-cursor-inner';
          Object.assign(inner.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
            transformOrigin: `${HOTSPOT_X}px ${HOTSPOT_Y}px`
          });
          inner.innerHTML = payload.svg;
          host.appendChild(inner);
          (document.documentElement || document.body).appendChild(host);
        } else {
          inner = host.querySelector<HTMLDivElement>('.anyclick-demo-cursor-inner') || document.createElement('div');
          if (!inner.parentElement) {
            host.appendChild(inner);
          }
        }

        host.style.width = `${CURSOR_WIDTH}px`;
        host.style.height = `${CURSOR_HEIGHT}px`;

        Object.assign(inner.style, {
          position: 'absolute',
          top: '0',
          left: '0',
          width: '100%',
          height: '100%',
          filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))',
          transformOrigin: `${HOTSPOT_X}px ${HOTSPOT_Y}px`
        });
        if (inner.innerHTML !== payload.svg) {
          inner.innerHTML = payload.svg;
        }
        if (!host.parentElement) {
          (document.documentElement || document.body).appendChild(host);
        }

        // 2. Highlight target
        const originalOutline = el.style.outline;
        const originalOutlineOffset = el.style.outlineOffset;
        el.style.outline = '3px solid rgba(239, 68, 68, 0.6)';
        el.style.outlineOffset = '2px';

        // 3. Position host using hotspot offsets and clamp to viewport
        const rect = el.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth || CURSOR_WIDTH;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight || CURSOR_HEIGHT;

        let hostLeft = targetX - HOTSPOT_X;
        let hostTop = targetY - HOTSPOT_Y;
        hostLeft = Math.min(Math.max(0, hostLeft), Math.max(0, viewportWidth - CURSOR_WIDTH));
        hostTop = Math.min(Math.max(0, hostTop), Math.max(0, viewportHeight - CURSOR_HEIGHT));

        host.style.left = `${hostLeft}px`;
        host.style.top = `${hostTop}px`;
        host.style.transform = 'none';
        inner.style.transform = 'scale(1)';

        // 4. Wait for move to finish
        await new Promise(r => setTimeout(r, 300));

        // 5. Action specific visual (click ripple/squish)
        if (payload.action === 'click') {
          inner.getAnimations().forEach(a => a.cancel());
          inner.animate(
            [
              { transform: 'scale(1)' },
              { transform: 'scale(0.92)' },
              { transform: 'scale(1.05)' },
              { transform: 'scale(1)' }
            ],
            {
              duration: 200,
              easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
            }
          );
          await new Promise(r => setTimeout(r, 200));
        }

        // 6. Restore highlight
        setTimeout(() => {
          el.style.outline = originalOutline;
          el.style.outlineOffset = originalOutlineOffset;
        }, 300);

      },
      { action: actionType, svg: RETRO_POINTER_SVG }
    );
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

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim();
}

function hasExtension(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  const baseForExt = trimmed.split('?')[0].split('#')[0];
  const ext = path.extname(baseForExt);
  return !!(ext && ext.length > 1);
}

function parseContentDispositionFilename(disposition: string | undefined): string | null {
  if (!disposition) return null;

  const starMatch = disposition.match(/filename\*\s*=\s*(?:UTF-8''|"?)([^;]+)/i);
  if (starMatch && starMatch[1]) {
    const raw = starMatch[1].trim().replace(/^"|"$/g, '');
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  const match = disposition.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  return null;
}

function buildDefaultFilename(
  suggested: string | null | undefined,
  optsFilename: string | undefined,
  sourceUrl: string | null,
  source: string,
  contentType?: string
): string {
  if (optsFilename && optsFilename.trim()) {
    return sanitizeFilename(optsFilename);
  }

  if (suggested && suggested.trim()) {
    const trimmed = suggested.trim();
    const baseForExt = trimmed.split('?')[0].split('#')[0];
    const ext = path.extname(baseForExt);

    if (ext && ext.length > 1) {
      return sanitizeFilename(trimmed);
    }
  }

  const ts = Date.now();

  if (!hasExtension(suggested) && sourceUrl) {
    try {
      const sanitizedUrl = new URL(sourceUrl);
      const urlPath = sanitizedUrl.pathname.split('/').filter(Boolean).pop() || '';
      const ext = path.extname(urlPath);
      if (ext && ext.length > 1) {
        return sanitizeFilename(urlPath);
      }
    } catch {}
  }

  const lowerContentType = contentType?.toLowerCase() || '';
  const looksPdf =
    source === 'popup_pdf' ||
    source === 'direct_fetch_pdf' ||
    lowerContentType.includes('application/pdf') ||
    !!sourceUrl?.toLowerCase().includes('.pdf');

  if (looksPdf) {
    return `bill_${ts}.pdf`;
  }

  return `download_${ts}.bin`;
}

async function trySaveDownload(
  download: Download,
  opts: { save_dir?: string; filename_template?: string },
  popupUrl: string | null,
  source: string
) {
  let suggested = '';
  try { suggested = download.suggestedFilename(); } catch {}
  let downloadUrl: string | null = null;
  try { downloadUrl = download.url(); } catch {}
  let contentType = '';
  try {
    const response = await download.response();
    const headers = response?.headers() || {};
    contentType = headers['content-type'] || headers['Content-Type'] || '';
    if (!hasExtension(suggested)) {
      const dispositionName = parseContentDispositionFilename(
        headers['content-disposition'] || headers['Content-Disposition']
      );
      if (dispositionName) {
        suggested = dispositionName;
      }
    }
  } catch {}
  const filename = buildDefaultFilename(
    suggested,
    opts.filename_template,
    downloadUrl ?? popupUrl,
    source,
    contentType
  );

  const saveDir = path.resolve(process.cwd(), opts.save_dir || 'downloads');
  ensureDir(saveDir);

  const savedPath = path.join(saveDir, filename);
  await download.saveAs(savedPath);

  return {
    saved_path: path.relative(process.cwd(), savedPath),
    filename,
    source,
  };
}

function saveBufferDownload(
  buffer: Buffer,
  opts: { save_dir?: string; filename_template?: string },
  downloadUrl: string | null,
  source: string
) {
  const filename = buildDefaultFilename(
    null,
    opts.filename_template,
    downloadUrl,
    source,
    source.includes('pdf') ? 'application/pdf' : undefined
  );
  const saveDir = path.resolve(process.cwd(), opts.save_dir || 'downloads');
  ensureDir(saveDir);
  const savedPath = path.join(saveDir, filename);
  fs.writeFileSync(savedPath, buffer);

  return {
    saved_path: path.relative(process.cwd(), savedPath),
    filename,
    source,
  };
}

export async function download(
  selector: string,
  opts: DownloadConfig = {}
): Promise<{ saved_path: string; filename: string; source: string }> {
  await simulateCursor(selector, 'click');

  const p = await getPage();
  const timeoutMs = opts.timeout_ms || 30_000;
  const loc = p.locator(selector).first();

  await loc.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => {});

  await loc
    .evaluate((node: HTMLElement) => {
      if (node.hasAttribute('target')) {
        node.removeAttribute('target');
      }
    })
    .catch(() => {});

  let resolvedUrl: string | null = null;
  try {
    const href = await loc.getAttribute('href');
    if (href) {
      resolvedUrl = new URL(href, p.url()).toString();
    }
  } catch {}

  const directDownloadPromise = p.waitForEvent('download', { timeout: timeoutMs });
  const popupPromise = p.waitForEvent('popup', { timeout: timeoutMs });

  await loc.click({ timeout: 5_000 }).catch(async () => {
    await loc.click({ force: true, timeout: 2_000 }).catch(async () => {
      await loc.evaluate((node: HTMLElement) => node.click()).catch(() => {});
    });
  });

  try {
    const direct = await Promise.race([
      directDownloadPromise.then((d) => ({ kind: 'download' as const, d })),
      popupPromise.then((popup) => ({ kind: 'popup' as const, popup })),
    ]);

    if (direct.kind === 'download') {
      return await trySaveDownload(direct.d, opts, null, 'direct');
    }

    const popupPage = direct.popup as Page;
    const popupUrlBefore = popupPage.url() || null;

    try {
      await popupPage.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
      await popupPage.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    } catch {}

    const popupUrl = popupPage.url() || popupUrlBefore || null;
    let popupTitle = '';
    try {
      popupTitle = await popupPage.title();
    } catch {}
    const lowerUrl = (popupUrl || '').toLowerCase();
    const lowerTitle = popupTitle.toLowerCase();

    const isLikelyPdf =
      lowerUrl.includes('.pdf') ||
      lowerTitle.includes('pdf') ||
      lowerUrl.startsWith('blob:');

    const popupNaturalDownload = await popupPage
      .waitForEvent('download', { timeout: 2_500 })
      .catch(() => null);

    if (popupNaturalDownload) {
      const result = await trySaveDownload(popupNaturalDownload, opts, popupUrl, 'popup_pdf');
      if (opts.close_popup !== false) {
        await popupPage.close().catch(() => {});
      }
      return result;
    }

    if (isLikelyPdf && popupUrl && !popupUrl.startsWith('blob:')) {
      const autoCaptured = await autoCapturePdfFromPage(popupPage, opts);
      if (autoCaptured) {
        if (opts.close_popup !== false && !popupPage.isClosed()) {
          await popupPage.close().catch(() => {});
        }
        return autoCaptured;
      }
    }

    const viewerDownloadPromise = popupPage.waitForEvent('download', { timeout: 10_000 }).catch(() => null);

    const dlBtn = popupPage
      .locator('#download, cr-icon-button#download, button[aria-label*="download" i], a[download]')
      .first();

    if (await dlBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await dlBtn.click({ force: true }).catch(() => {});
      const viewerDownload = await viewerDownloadPromise;

      if (viewerDownload) {
        const result = await trySaveDownload(viewerDownload, opts, popupUrl, 'popup_pdf');
        if (opts.close_popup !== false) {
          await popupPage.close().catch(() => {});
        }
        return result;
      }
    }

    if (opts.close_popup !== false) {
      await popupPage.close().catch(() => {});
    }
    throw new Error('Popup opened, but no downloadable file could be captured automatically.');
  } catch (err: any) {
    if (resolvedUrl) {
      try {
        const response = await p.context().request.get(resolvedUrl, {
          timeout: timeoutMs,
          failOnStatusCode: false,
        });

        const status = response.status();
        const headers = response.headers();
        const contentType = (headers['content-type'] || '').toLowerCase();
        const bytes = Buffer.from(await response.body());

        if (
          status >= 200 && status < 300 &&
          bytes.length > 0 &&
          (contentType.includes('application/pdf') || resolvedUrl.toLowerCase().includes('.pdf'))
        ) {
          return saveBufferDownload(bytes, opts, resolvedUrl, 'direct_fetch_pdf');
        }
      } catch (fetchErr) {
        log.warn({ err: (fetchErr as Error).message, url: resolvedUrl }, 'Fallback direct download failed');
      }
    }

    throw new Error(`Download failed: ${err.message}`);
  }
}

// ─── Teardown ─────────────────────────────────────────────────────────────────

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
    page = null;
    contextListenersAttached = false;
    log.info('Browser closed');
  }
}
