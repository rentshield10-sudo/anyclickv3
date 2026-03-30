import * as pw from '../engines/playwright';
import { extractPageState } from '../state/extractPageState';
import { detectChanges, PanelDiff } from '../state/detectChanges';
import { resolveTarget } from './resolveTarget';
import { createLogger } from '../utils/logger';
import { sleep } from '../utils/retry';
import type { Action, PageState, Element } from '../utils/validation';

const log = createLogger('execute-action');

export type Engine = 'playwright';

export interface ActionResult {
  ok: boolean;
  executed: boolean;
  changed: boolean;
  state: PageState;
  diff: PanelDiff;
  error?: string;
}

/**
 * Execute a single Gemini-planned action on the active engine.
 * Captures before/after state and computes a structured diff.
 */
export async function executeAction(
  action: Action,
  elementMap: Element[],
  engine: Engine = 'playwright'
): Promise<ActionResult> {
  log.info({ action: action.action, engine: 'playwright', reason: action.reason }, 'Executing action');

  const page = await pw.getPage();

  // ── Capture state before ────────────────────────────────────────────────────
  const stateBefore = await extractPageState(page);

  try {
    switch (action.action) {

      case 'goto': {
        const url = action.value ?? action.target?.description ?? '';
        if (!url) throw new Error('goto action requires a value (URL)');
        await pw.navigate(url);
        break;
      }

      case 'click': {
        const selector = await resolveTarget(page, action, elementMap);
        await pw.click(selector);
        break;
      }

      case 'type': {
        const selector = await resolveTarget(page, action, elementMap);
        const value = action.value ?? '';
        await pw.type(selector, value);
        break;
      }

      case 'press': {
        const selector = await resolveTarget(page, action, elementMap);
        const key = action.value ?? 'Enter';
        await pw.press(selector, key);
        break;
      }

      case 'scroll': {
        const direction = (action.value === 'up' ? 'up' : 'down') as 'up' | 'down';
        await pw.scroll(direction);
        break;
      }

      case 'select': {
        const selector = await resolveTarget(page, action, elementMap);
        const value = action.value ?? '';
        await pw.select(selector, value);
        break;
      }

      case 'extract': {
        // Extract is read-only — just return current state, no action needed
        break;
      }

      case 'wait_for_change': {
        await sleep(3_000);
        await pw.waitForChange();
        break;
      }

      case 'done':
      case 'request_login': {
        // These are control signals — handled by the caller (server.ts / n8n)
        const stateAfterSignal = await extractPageState(page);
        return {
          ok: true,
          executed: false,
          changed: false,
          state: stateAfterSignal,
          diff: detectChanges(stateBefore, stateAfterSignal),
        };
      }
    }

    // ── Wait for page to settle ─────────────────────────────────────────────
    await sleep(300);
    await pw.waitForChange(1200);

    // ── Capture state after ─────────────────────────────────────────────────
    const stateAfter = await extractPageState(page);
    const diff = detectChanges(stateBefore, stateAfter);

    log.info({ changed: diff.changed, region: diff.region }, 'Action completed');

    return { ok: true, executed: true, changed: diff.changed, state: stateAfter, diff };

  } catch (err: any) {
    log.error({ err: err?.message, action: action.action }, 'Action failed');
    
    // Save screenshot of failure
    let screenshotPath = undefined;
    if (page) {
      try {
        const timestamp = Date.now();
        const filename = `failure-${timestamp}.png`;
        const dir = require('path').join(process.cwd(), 'profiles', 'failures');
        require('fs').mkdirSync(dir, { recursive: true });
        screenshotPath = require('path').join(dir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        log.info({ screenshot: screenshotPath }, 'Saved failure screenshot');
      } catch (screenshotErr) {
        log.warn({ err: screenshotErr }, 'Failed to capture failure screenshot');
      }
    }

    const stateAfter = await extractPageState(page).catch(() => stateBefore);
    return {
      ok: false,
      executed: false,
      changed: false,
      state: stateAfter,
      diff: detectChanges(stateBefore, stateAfter),
      error: screenshotPath ? `${err?.message} (Screenshot: ${screenshotPath})` : err?.message ?? 'Unknown error',
    };
  }
}
