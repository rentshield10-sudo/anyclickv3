import { Page } from 'playwright';
import { createLogger } from '../utils/logger';

const log = createLogger('fuzzy-locator');

interface FuzzyMatch {
  selector: string;
  strategy: string;
  confidence: number;
  matchedText: string;
  similarity: number;
}

/**
 * Fuzzy text matching for locator resolution.
 * Used as a sub-strategy when exact text matching fails.
 * 
 * Uses normalized Levenshtein distance + token overlap scoring.
 */
export async function findFuzzy(
  page: Page,
  targetText: string,
  opts: {
    role?: string;
    tag?: string;
    minSimilarity?: number;
    maxCandidates?: number;
  } = {}
): Promise<FuzzyMatch[]> {
  const minSim = opts.minSimilarity ?? 0.65;
  const maxCandidates = opts.maxCandidates ?? 5;

  // Build selector scope
  let scopeSelector = 'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input[type="submit"]';
  if (opts.role) {
    scopeSelector = `[role="${opts.role}"], ${roleToTags(opts.role).join(', ')}`;
  } else if (opts.tag) {
    scopeSelector = opts.tag;
  }

  // Extract candidate texts from the page
  const candidates = await page.evaluate(({ selector, target }: { selector: string; target: string }) => {
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes
      .filter(el => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.opacity !== '0';
      })
      .map((el, idx) => {
        const text = (el.textContent || '').trim().slice(0, 150);
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role') || '';
        const ariaLabel = el.getAttribute('aria-label') || '';
        const id = el.id ? `#${el.id}` : '';
        return { text, tag, role, ariaLabel, id, idx };
      })
      .filter(c => c.text.length > 0 || c.ariaLabel.length > 0);
  }, { selector: scopeSelector, target: targetText }).catch(() => []);

  const results: FuzzyMatch[] = [];
  const normalizedTarget = normalize(targetText);

  for (const c of candidates) {
    // Score against visible text
    const textSim = combinedSimilarity(normalizedTarget, normalize(c.text));
    // Score against aria-label
    const labelSim = c.ariaLabel ? combinedSimilarity(normalizedTarget, normalize(c.ariaLabel)) : 0;
    
    const bestSim = Math.max(textSim, labelSim);
    if (bestSim < minSim) continue;

    // Build selector for this candidate
    let selector: string;
    if (c.id) {
      selector = c.id;
    } else if (c.role && c.text) {
      selector = `[role="${c.role}"]:has-text("${escText(c.text)}")`;
    } else {
      selector = `${c.tag}:has-text("${escText(c.text)}")`;
    }

    results.push({
      selector,
      strategy: 'fuzzy_text',
      confidence: bestSim * 0.85, // Fuzzy matches capped below deterministic
      matchedText: bestSim === labelSim ? c.ariaLabel : c.text,
      similarity: bestSim,
    });
  }

  // Sort by similarity descending, take top N
  results.sort((a, b) => b.similarity - a.similarity);
  const topResults = results.slice(0, maxCandidates);

  log.debug({ targetText, found: topResults.length }, 'Fuzzy matching complete');
  return topResults;
}

// ─── Similarity Scoring ──────────────────────────────────────────────────────

/**
 * Combined similarity: weighted average of Levenshtein ratio and token overlap.
 */
function combinedSimilarity(a: string, b: string): number {
  const levSim = levenshteinSimilarity(a, b);
  const tokenSim = tokenOverlap(a, b);
  // Weight: 60% Levenshtein, 40% token overlap
  return levSim * 0.6 + tokenSim * 0.4;
}

/**
 * Levenshtein distance normalized to [0, 1] similarity.
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        matrix[i][j] = j;
      } else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Token overlap ratio (like Jaccard similarity on words).
 */
function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(t => t.length > 1));
  const tokensB = new Set(b.split(/\s+/).filter(t => t.length > 1));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return intersection / union;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function escText(text: string): string {
  return text.replace(/"/g, '\\"').slice(0, 80);
}

function roleToTags(role: string): string[] {
  const map: Record<string, string[]> = {
    'button': ['button', 'input[type="button"]', 'input[type="submit"]'],
    'link': ['a'],
    'textbox': ['input:not([type="hidden"])', 'textarea'],
    'checkbox': ['input[type="checkbox"]'],
    'radio': ['input[type="radio"]'],
  };
  return map[role] || [`[role="${role}"]`];
}
