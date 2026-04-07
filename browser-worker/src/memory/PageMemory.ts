import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import type { PageFingerprint, PageType } from './types';

const log = createLogger('page-memory');

/**
 * Page Memory — stores and matches page fingerprints.
 * 
 * A fingerprint captures the structural identity of a page:
 * hostname, path pattern, title, headings, nav labels, form labels, page type.
 * 
 * Used to quickly identify known pages and select appropriate recipes.
 */
export class PageMemory {
  private dataDir: string;
  private cache: Map<string, PageFingerprint[]> = new Map();

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'fingerprints');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.loadAll();
  }

  // ─── Match ───────────────────────────────────────────────────────────────────

  /**
   * Find the best matching fingerprint for the current page.
   * Returns null if no match above threshold.
   */
  match(hostname: string, pathname: string, title: string, headings: string[]): { fingerprint: PageFingerprint; score: number } | null {
    const siteFingerprints = this.cache.get(hostname);
    if (!siteFingerprints || siteFingerprints.length === 0) return null;

    let bestMatch: PageFingerprint | null = null;
    let bestScore = 0;

    for (const fp of siteFingerprints) {
      let score = 0;

      // Path pattern match
      if (matchPathPattern(pathname, fp.pathPattern)) score += 0.4;
      
      // Title similarity
      if (fp.title && title && normalize(fp.title) === normalize(title)) score += 0.25;
      else if (fp.title && title && normalize(title).includes(normalize(fp.title))) score += 0.15;

      // Heading overlap
      const headingOverlap = arrayOverlap(
        headings.map(normalize),
        fp.headings.map(normalize)
      );
      score += headingOverlap * 0.35;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = fp;
      }
    }

    if (bestMatch && bestScore >= 0.5) {
      // Update match count
      bestMatch.matchCount++;
      bestMatch.lastSeenAt = new Date().toISOString();
      this.persist(hostname);
      return { fingerprint: bestMatch, score: bestScore };
    }

    return null;
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  save(fingerprint: Omit<PageFingerprint, 'id' | 'matchCount' | 'lastSeenAt'>): PageFingerprint {
    const hostname = fingerprint.hostname;
    if (!this.cache.has(hostname)) {
      this.cache.set(hostname, []);
    }

    const fingerprints = this.cache.get(hostname)!;

    // Check for existing fingerprint with same path pattern
    const existingIdx = fingerprints.findIndex(
      fp => fp.pathPattern === fingerprint.pathPattern && fp.pageType === fingerprint.pageType
    );

    const entry: PageFingerprint = {
      ...fingerprint,
      id: existingIdx >= 0 ? fingerprints[existingIdx].id : generateId(),
      matchCount: existingIdx >= 0 ? fingerprints[existingIdx].matchCount : 0,
      lastSeenAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      fingerprints[existingIdx] = entry;
    } else {
      fingerprints.push(entry);
    }

    this.persist(hostname);
    log.info({ hostname, pathPattern: fingerprint.pathPattern, pageType: fingerprint.pageType }, 'Saved page fingerprint');
    return entry;
  }

  // ─── Get all ──────────────────────────────────────────────────────────────────

  getAll(hostname?: string): PageFingerprint[] {
    if (hostname) return this.cache.get(hostname) || [];
    const all: PageFingerprint[] = [];
    for (const fps of this.cache.values()) {
      all.push(...fps);
    }
    return all;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────────

  private loadAll(): void {
    try {
      if (!fs.existsSync(this.dataDir)) return;
      const files = fs.readdirSync(this.dataDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const hostname = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        this.cache.set(hostname, data);
      }
      log.info({ sites: this.cache.size }, 'Loaded page memory');
    } catch (err) {
      log.error({ err }, 'Failed to load page memory');
    }
  }

  private persist(hostname: string): void {
    try {
      const fps = this.cache.get(hostname) || [];
      fs.writeFileSync(
        path.join(this.dataDir, `${sanitize(hostname)}.json`),
        JSON.stringify(fps, null, 2)
      );
    } catch (err) {
      log.error({ err, hostname }, 'Failed to persist page memory');
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function matchPathPattern(pathname: string, pattern: string): boolean {
  // Simple glob-style matching: /login matches /login, /login?foo
  // /dashboard/* matches /dashboard/anything
  if (pattern === pathname) return true;
  
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    return pathname.startsWith(prefix);
  }
  
  // Normalized match (strip trailing slash)
  const normPath = pathname.replace(/\/$/, '') || '/';
  const normPattern = pattern.replace(/\/$/, '') || '/';
  return normPath === normPattern;
}

function arrayOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const matches = a.filter(item => setB.has(item)).length;
  return matches / Math.max(a.length, b.length);
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

function generateId(): string {
  return `fp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}
