import { Page } from 'playwright';
import { createLogger } from '../utils/logger';

const log = createLogger('deterministic-locator');

interface MatchResult {
  selector: string;
  strategy: string;
  confidence: number;
}

/**
 * Attempt to resolve a target element using purely deterministic (code-based) strategies.
 * No AI calls. Returns ranked candidates ordered by confidence.
 * 
 * Resolution order:
 *   1. data-testid
 *   2. Exact visible text match (role-aware)
 *   3. Role + text match
 *   4. Label → input resolution (aria-label)
 *   5. Placeholder match
 *   6. aria-label / name / title attribute match
 *   7. Nearby anchor text (label_near)
 *   8. Container/section filtering
 *   9. Stable CSS attribute match
 */
export async function findDeterministic(
  page: Page,
  opts: {
    text?: string;
    role?: string;
    tag?: string;
    label?: string;
    placeholder?: string;
    near?: string;
    section?: string;
    testId?: string;
    cssSelector?: string;
    index?: number;
  }
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  const startMs = Date.now();

  // 1. data-testid (highest reliability)
  if (opts.testId) {
    const sel = `[data-testid="${esc(opts.testId)}"]`;
    if (await exists(page, sel)) {
      results.push({ selector: sel, strategy: 'testid', confidence: 0.99 });
    }
  }

  // 2. Exact CSS selector
  if (opts.cssSelector) {
    if (await exists(page, opts.cssSelector)) {
      results.push({ selector: opts.cssSelector, strategy: 'css_exact', confidence: 0.97 });
    }
  }

  // 3. Role + exact text match
  if (opts.role && opts.text) {
    // Playwright getByRole
    const sel = `[role="${esc(opts.role)}"]:has-text("${esc(opts.text)}")`;
    if (await exists(page, sel)) {
      results.push({ selector: sel, strategy: 'role_text', confidence: 0.95 });
    }
    // Also try the semantic tag equivalents
    const tagEquiv = roleToTags(opts.role);
    for (const tag of tagEquiv) {
      const tagSel = `${tag}:has-text("${esc(opts.text)}")`;
      if (await exists(page, tagSel)) {
        results.push({ selector: tagSel, strategy: 'tag_text', confidence: 0.93 });
      }
    }
  }

  // 4. Tag + exact text (no role specified)
  if (opts.tag && opts.text && !opts.role) {
    const sel = `${opts.tag}:has-text("${esc(opts.text)}")`;
    if (await exists(page, sel)) {
      results.push({ selector: sel, strategy: 'tag_text', confidence: 0.92 });
    }
  }

  // 5. Exact text match against interactive elements
  if (opts.text && !opts.role && !opts.tag) {
    const commonInteractive = [
      'button', 'a', '[role="button"]', '[role="link"]', 
      '[role="menuitem"]', '[role="tab"]', 'li', 'span'
    ];
    for (const tag of commonInteractive) {
      const sel = `${tag}:has-text("${esc(opts.text)}")`;
      if (await exists(page, sel)) {
        results.push({ selector: sel, strategy: 'interactive_text', confidence: 0.90 });
        break;
      }
    }
    
    // Generic text match (anything visible with the text)
    const genericSel = `:has-text("${esc(opts.text)}")`;
    if (await exists(page, genericSel)) {
      results.push({ selector: genericSel, strategy: 'any_visible_text', confidence: 0.80 });
    }
  }

  // 6. aria-label match
  if (opts.label) {
    const sel = `[aria-label="${esc(opts.label)}"]`;
    if (await exists(page, sel)) {
      results.push({ selector: sel, strategy: 'aria_label', confidence: 0.93 });
    }
    // Also try title attribute
    const titleSel = `[title="${esc(opts.label)}"]`;
    if (await exists(page, titleSel)) {
      results.push({ selector: titleSel, strategy: 'title_attr', confidence: 0.88 });
    }
  }

  // 7. Placeholder match
  if (opts.placeholder) {
    const sel = `[placeholder="${esc(opts.placeholder)}"]`;
    if (await exists(page, sel)) {
      results.push({ selector: sel, strategy: 'placeholder', confidence: 0.94 });
    }
    // Partial placeholder match
    const partialSel = `[placeholder*="${esc(opts.placeholder)}"]`;
    if (!results.some(r => r.strategy === 'placeholder') && await exists(page, partialSel)) {
      results.push({ selector: partialSel, strategy: 'placeholder_partial', confidence: 0.85 });
    }
  }

  // 8. Label text → input resolution (find label, then associated input)
  if (opts.label && !results.some(r => r.strategy === 'aria_label')) {
    // Try label[for] → input#id
    const labelForInput = await page.evaluate((labelText) => {
      const labels = Array.from(document.querySelectorAll('label'));
      for (const lbl of labels) {
        if (lbl.textContent?.trim().toLowerCase().includes(labelText.toLowerCase())) {
          const forAttr = lbl.getAttribute('for');
          if (forAttr) {
            const input = document.getElementById(forAttr);
            if (input) return `#${forAttr}`;
          }
          // Check for child input
          const child = lbl.querySelector('input, textarea, select');
          if (child && child.id) return `#${child.id}`;
        }
      }
      return null;
    }, opts.label).catch(() => null);
    
    if (labelForInput && await exists(page, labelForInput)) {
      results.push({ selector: labelForInput, strategy: 'label_for_input', confidence: 0.91 });
    }
  }

  // 9. Nearby anchor text resolution
  if (opts.near && opts.text) {
    // Find elements with text near another element containing opts.near
    const nearSel = await page.evaluate(({ text, near }: { text: string; near: string }) => {
      const allElements = Array.from(document.querySelectorAll('button, a, input, [role="button"], [role="link"]'));
      for (const el of allElements) {
        const elText = el.textContent?.trim() || '';
        if (!elText.toLowerCase().includes(text.toLowerCase())) continue;
        
        // Check if nearby text (parent or sibling) contains the anchor
        let node: HTMLElement | null = el as HTMLElement;
        for (let depth = 0; depth < 5 && node; depth++) {
          const parentText = node.parentElement?.textContent?.trim() || '';
          if (parentText.toLowerCase().includes(near.toLowerCase())) {
            // Build a useful selector
            if (el.id) return `#${el.id}`;
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            if (role) return `[role="${role}"]:has-text("${text}")`;
            return `${tag}:has-text("${text}")`;
          }
          node = node.parentElement;
        }
      }
      return null;
    }, { text: opts.text, near: opts.near }).catch(() => null);

    if (nearSel && await exists(page, nearSel)) {
      results.push({ selector: nearSel, strategy: 'near_anchor', confidence: 0.86 });
    }
  }

  // 10. Section filtering
  if (opts.section && opts.text) {
    const sectionSelectors: Record<string, string> = {
      'header': 'header',
      'footer': 'footer',
      'nav': 'nav',
      'sidebar': 'aside, [class*="sidebar"], [class*="side-panel"]',
      'main': 'main, [role="main"]',
      'login form': 'form:has(input[type="password"])',
      'form': 'form',
    };
    const sectionSel = sectionSelectors[opts.section.toLowerCase()];
    if (sectionSel) {
      const combinedSel = `${sectionSel} :has-text("${esc(opts.text)}")`;
      if (await exists(page, combinedSel)) {
        results.push({ selector: combinedSel, strategy: 'section_filter', confidence: 0.87 });
      }
    }
  }

  const elapsed = Date.now() - startMs;
  log.debug({ candidateCount: results.length, elapsed }, 'Deterministic resolution complete');

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function exists(page: Page, selector: string): Promise<boolean> {
  try {
    for (const frame of page.frames()) {
      const locator = frame.locator(selector).filter({ visible: true });
      const count = await locator.count().catch(() => 0);
      if (count > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function esc(text: string): string {
  return text.replace(/"/g, '\\"').slice(0, 100);
}

function roleToTags(role: string): string[] {
  const map: Record<string, string[]> = {
    'button': ['button', 'input[type="button"]', 'input[type="submit"]'],
    'link': ['a'],
    'textbox': ['input[type="text"]', 'input[type="email"]', 'textarea'],
    'checkbox': ['input[type="checkbox"]'],
    'radio': ['input[type="radio"]'],
    'combobox': ['select'],
    'menuitem': ['[role="menuitem"]'],
    'tab': ['[role="tab"]'],
  };
  return map[role] || [];
}
