import { Page } from 'playwright';
import type { Action, Element } from '../utils/validation';
import { createLogger } from '../utils/logger';

const log = createLogger('resolve-target');

/**
 * Resolve an action target to a Playwright CSS selector string.
 * Priority order (per spec):
 *   1. elementId from page state map
 *   2. role + accessible name
 *   3. label text
 *   4. placeholder text
 *   5. visible text content
 *   6. data-testid / test IDs
 *   7. CSS selector fallback (if stored on element)
 */
export async function resolveTarget(
  page: Page,
  action: Action,
  elementMap: Element[]
): Promise<string> {
  const target = action.target;
  if (!target) throw new Error('Action has no target defined');

  // 1. By elementId — look up from our extracted map
  if (target.elementId !== null && target.elementId !== undefined) {
    const el = elementMap.find((e) => e.id === target.elementId);
    if (el) {
      // Try stored selector first
      if (el.selector) {
        const exists = await page.locator(el.selector).count().catch(() => 0);
        if (exists > 0) {
          log.debug({ elementId: target.elementId, selector: el.selector }, 'Resolved by selector');
          return el.selector;
        }
      }

      // Try by role + text
      if (el.role && el.text) {
        const sel = `[role="${el.role}"]:has-text("${escapeText(el.text)}")`;
        const exists = await page.locator(sel).count().catch(() => 0);
        if (exists > 0) {
          log.debug({ elementId: target.elementId, sel }, 'Resolved by role+text');
          return sel;
        }
      }

      // Try by label
      if (el.label) {
        const sel = `[aria-label="${escapeText(el.label)}"]`;
        const exists = await page.locator(sel).count().catch(() => 0);
        if (exists > 0) {
          log.debug({ elementId: target.elementId, sel }, 'Resolved by aria-label');
          return sel;
        }
      }

      // Try by placeholder
      if (el.placeholder) {
        const sel = `[placeholder="${escapeText(el.placeholder)}"]`;
        const exists = await page.locator(sel).count().catch(() => 0);
        if (exists > 0) {
          log.debug({ elementId: target.elementId, sel }, 'Resolved by placeholder');
          return sel;
        }
      }

      // Try by visible text
      if (el.text) {
        const sel = `${el.tag}:has-text("${escapeText(el.text)}")`;
        const exists = await page.locator(sel).count().catch(() => 0);
        if (exists > 0) {
          log.debug({ elementId: target.elementId, sel }, 'Resolved by visible text');
          return sel;
        }
      }
    }
  }

  // 2. By description (Gemini natural language fallback)
  if (target.description) {
    const desc = target.description.toLowerCase();

    // Try data-testid
    const testId = await page
      .locator(`[data-testid*="${escapeText(desc)}"]`)
      .count()
      .catch(() => 0);
    if (testId > 0) {
      log.debug({ desc }, 'Resolved by data-testid');
      return `[data-testid*="${escapeText(desc)}"]`;
    }

    // Try button/link text
    for (const tag of ['button', 'a', '[role="button"]', '[role="link"]']) {
      const sel = `${tag}:has-text("${escapeText(target.description)}")`;
      const count = await page.locator(sel).count().catch(() => 0);
      if (count > 0) {
        log.debug({ desc, sel }, 'Resolved by description text');
        return sel;
      }
    }

    // 3. FUZZY TEXT FALLBACK (If exact description failed, try keywords)
    const words = target.description.split(' ').filter(w => w.length > 2 && !['button', 'link', 'inbox', 'text', 'input'].includes(w.toLowerCase()));
    if (words.length > 0) {
       for (const word of words) {
          const fuzzySel = `button:has-text("${escapeText(word)}"), a:has-text("${escapeText(word)}"), [role="button"]:has-text("${escapeText(word)}")`;
          const count = await page.locator(fuzzySel).count().catch(() => 0);
          if (count > 0) {
            log.info({ word, fuzzySel }, 'Resolved by fuzzy keyword fallback');
            return fuzzySel;
          }
       }
    }
  }

  throw new Error(
    `Could not resolve target: elementId=${target.elementId}, description="${target.description}"`
  );
}

function escapeText(text: string): string {
  return text.replace(/"/g, '\\"').slice(0, 80);
}
