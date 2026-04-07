import { Page } from 'playwright';
import { createLogger } from '../utils/logger';
import { findDeterministic } from './deterministic';
import { findFuzzy } from './fuzzy';
import { inferTargetSemantic } from './semantic';
import type { LocatorRequest, LocatorResult, LocatorCandidate, ResolutionLog, ResolutionMethod } from './types';
import type { ActionRecipe } from '../memory/types';

const log = createLogger('locator-engine');

/**
 * Main Locator Engine — the heart of AnyClick v2.
 * 
 * For every browser action, resolves the target element using this cascade:
 *   1. Recipe Replay    — check memory for a known recipe
 *   2. Deterministic    — code-based matching (no AI)
 *   3. Semantic AI      — small/fast model inference
 *   4. Repair AI        — large model recovery (exception only)
 * 
 * Returns the best selector, resolution method, confidence, and debug logs.
 */
export async function resolveLocator(
  page: Page,
  request: LocatorRequest,
  recipeStore?: {
    lookup: (site: string, intent: string, pageType?: string) => ActionRecipe | null;
    markSuccess: (recipeId: string) => void;
    markFailure: (recipeId: string) => void;
  }
): Promise<LocatorResult> {
  const startMs = Date.now();
  const logs: ResolutionLog[] = [];
  const allCandidates: LocatorCandidate[] = [];

  // ─── Step 1: Recipe Replay ─────────────────────────────────────────────────
  if (recipeStore) {
    const stepStart = Date.now();
    const recipe = recipeStore.lookup(request.site, request.intent, request.pageType);
    
    if (recipe && !recipe.stale) {
      // Try each locator from the recipe in priority order
      const sortedLocators = [...recipe.locators].sort((a, b) => a.priority - b.priority);
      
      for (const loc of sortedLocators) {
        try {
          const count = await page.locator(loc.selector).count();
          if (count > 0) {
            recipeStore.markSuccess(recipe.id);
            logs.push({ step: 'recipe_replay', result: 'hit', strategy: loc.kind, ms: Date.now() - stepStart });
            
            return buildResult(loc.selector, 'recipe_replay', recipe.confidence, allCandidates, logs, startMs);
          }
        } catch {
          // Selector failed, try next
        }
      }
      
      // All recipe locators failed — mark stale
      recipeStore.markFailure(recipe.id);
      logs.push({ step: 'recipe_replay', result: 'miss', ms: Date.now() - stepStart, detail: 'all recipe locators stale' });
    } else {
      logs.push({ step: 'recipe_replay', result: recipe ? 'skip' : 'miss', ms: Date.now() - stepStart, detail: recipe ? 'recipe marked stale' : 'no recipe found' });
    }
  } else {
    logs.push({ step: 'recipe_replay', result: 'skip', ms: 0, detail: 'no recipe store' });
  }

  // ─── Step 2: Deterministic Matching ────────────────────────────────────────
  const detStart = Date.now();
  const deterministicResults = await findDeterministic(page, {
    text: request.target.text,
    role: request.target.role,
    tag: request.target.tag,
    label: request.target.label,
    placeholder: request.target.placeholder,
    near: request.target.near,
    section: request.target.section,
    testId: request.target.testId,
    cssSelector: request.target.cssSelector,
    index: request.target.index,
  });

  if (deterministicResults.length > 0) {
    // Convert to LocatorCandidates
    for (const r of deterministicResults) {
      allCandidates.push({
        kind: r.strategy as any,
        selector: r.selector,
        text: request.target.text,
        role: request.target.role,
        priority: allCandidates.length,
        confidence: r.confidence,
      });
    }

    const best = deterministicResults[0];
    logs.push({ step: 'deterministic', result: 'hit', strategy: best.strategy, ms: Date.now() - detStart });
    
    return buildResult(best.selector, 'deterministic', best.confidence, allCandidates, logs, startMs);
  }

  logs.push({ step: 'deterministic', result: 'miss', ms: Date.now() - detStart });

  // ─── Step 2b: Fuzzy Matching ───────────────────────────────────────────────
  if (request.target.text) {
    const fuzzyStart = Date.now();
    const fuzzyResults = await findFuzzy(page, request.target.text, {
      role: request.target.role,
      tag: request.target.tag,
      minSimilarity: 0.65,
      maxCandidates: 3,
    });

    if (fuzzyResults.length > 0) {
      for (const r of fuzzyResults) {
        allCandidates.push({
          kind: 'fuzzy_text',
          selector: r.selector,
          text: r.matchedText,
          priority: allCandidates.length,
          confidence: r.confidence,
        });
      }

      const best = fuzzyResults[0];
      if (best.similarity >= 0.75) {
        logs.push({ step: 'fuzzy', result: 'hit', strategy: 'fuzzy_text', ms: Date.now() - fuzzyStart, detail: `similarity=${best.similarity.toFixed(2)}` });
        return buildResult(best.selector, 'deterministic', best.confidence, allCandidates, logs, startMs);
      }
    }
    
    logs.push({ step: 'fuzzy', result: 'miss', ms: Date.now() - fuzzyStart });
  }

  // ─── Step 3: Small-Model Semantic Targeting ────────────────────────────────
  const semStart = Date.now();
  try {
    // Gather reduced page state for the model
    const reducedState = await gatherReducedState(page);
    
    const semanticResult = await inferTargetSemantic(
      request.intent,
      request.action,
      reducedState
    );

    if (semanticResult && (semanticResult.text || semanticResult.label || semanticResult.placeholder)) {
      // Run deterministic again with the semantic-inferred target
      const refinedResults = await findDeterministic(page, {
        text: semanticResult.text,
        role: semanticResult.role,
        label: semanticResult.label,
        placeholder: semanticResult.placeholder,
        near: semanticResult.near,
        section: semanticResult.section,
        testId: semanticResult.testId,
        cssSelector: semanticResult.selector,
      });

      if (refinedResults.length > 0) {
        const best = refinedResults[0];
        allCandidates.push({
          kind: 'semantic_ai',
          selector: best.selector,
          text: semanticResult.text,
          role: semanticResult.role,
          priority: 0,
          confidence: Math.min(best.confidence, semanticResult.confidence || 0.8),
        });

        logs.push({ step: 'semantic_ai', result: 'hit', strategy: best.strategy, ms: Date.now() - semStart });
        return buildResult(best.selector, 'semantic_ai', semanticResult.confidence || 0.8, allCandidates, logs, startMs);
      }
    }

    logs.push({ step: 'semantic_ai', result: 'miss', ms: Date.now() - semStart });
  } catch (err: any) {
    logs.push({ step: 'semantic_ai', result: 'error', ms: Date.now() - semStart, detail: err.message });
  }

  // ─── Step 4: Not found ─────────────────────────────────────────────────────
  // The repair (large model) step is handled by the caller (execution layer)
  // because it may need screenshots, full page context, etc.
  log.warn({ intent: request.intent, site: request.site }, 'All locator strategies exhausted');
  
  return {
    found: false,
    selector: null,
    method: 'repair_ai',
    confidence: 0,
    candidates: allCandidates,
    logs,
    durationMs: Date.now() - startMs,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildResult(
  selector: string,
  method: ResolutionMethod,
  confidence: number,
  candidates: LocatorCandidate[],
  logs: ResolutionLog[],
  startMs: number
): LocatorResult {
  return {
    found: true,
    selector,
    method,
    confidence,
    candidates,
    logs,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Gather a minimal page representation for semantic model calls.
 * This is NOT the full extractPageState — it's much smaller.
 */
async function gatherReducedState(page: Page): Promise<{
  url: string;
  title: string;
  headings: string[];
  formLabels: string[];
  visibleTexts: string[];
  interactiveElements: { tag: string; text: string; role: string; label: string; placeholder: string }[];
}> {
  const url = page.url();
  const title = await page.title();

  const pageData = await page.evaluate(() => {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
    .map(h => (h.textContent || '').trim())
    .filter(h => h.length > 0)
    .slice(0, 10);

  const formLabels = Array.from(document.querySelectorAll('label'))
    .map(l => (l.textContent || '').trim())
    .filter(l => l.length > 0)
    .slice(0, 15);

  const interactive = Array.from(document.querySelectorAll(
    'button, a, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [onclick], li'
  ))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0';
    })
    .map(el => ({
      tag: el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 80),
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      label: el.getAttribute('aria-label') || '',
      placeholder: el.getAttribute('placeholder') || '',
    }))
    .slice(0, 120);

  const visibleTexts = Array.from(document.querySelectorAll('nav, aside, header, main, section, div, span'))
    .map(el => (el.textContent || '').trim().replace(/\s+/g, ' '))
    .filter(t => t.length > 0 && t.length < 120)
    .slice(0, 150);

  return { headings, formLabels, interactive, visibleTexts };
}).catch(() => ({ headings: [], formLabels: [], interactive: [], visibleTexts: [] }));

  return {
    url,
    title,
    headings: pageData.headings,
    formLabels: pageData.formLabels,
    visibleTexts: pageData.visibleTexts,
    interactiveElements: pageData.interactive,
  };
}
