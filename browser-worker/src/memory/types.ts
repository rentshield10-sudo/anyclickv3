// ─── Memory System Types ─────────────────────────────────────────────────────

import type { LocatorCandidate } from '../locator/types';

// ─── Page Fingerprint ────────────────────────────────────────────────────────

export interface PageFingerprint {
  id: string;
  site: string;
  hostname: string;
  pathPattern: string;
  title: string;
  headings: string[];
  navLabels: string[];
  formLabels: string[];
  pageType: PageType;
  lastSeenAt: string;
  matchCount: number;
}

export type PageType =
  | 'login'
  | 'dashboard'
  | 'list'
  | 'detail'
  | 'form'
  | 'search'
  | 'settings'
  | 'compose'
  | 'inbox'
  | 'unknown';

// ─── Action Recipe ───────────────────────────────────────────────────────────

export interface ActionRecipe {
  id: string;
  site: string;
  pageType: string;
  intent: string;
  fingerprint: {
    title: string;
    headings: string[];
    pathPattern: string;
  };
  startUrl?: string;
  generatedScript?: string;
  locators: LocatorCandidate[];
  fallbackTexts: string[];
  confidence: number;
  lastSuccessAt: string;
  successCount: number;
  failureCount: number;
  stale: boolean;
}

// ─── Run Memory ──────────────────────────────────────────────────────────────

export interface RunRecord {
  id: string;
  site: string;
  startUrl: string;
  goal: string;
  startedAt: string;
  completedAt: string;
  success: boolean;
  steps: RunStep[];
  totalDurationMs: number;
  aiCallCount: number;
}

export interface RunStep {
  index: number;
  action: string;
  intent: string;
  target: { selector: string; description: string };
  value?: string;
  method: 'recipe' | 'deterministic' | 'semantic' | 'repair';
  durationMs: number;
  success: boolean;
  error?: string;
}

// ─── Recipe Lookup Request ───────────────────────────────────────────────────

export interface RecipeLookupRequest {
  site: string;
  intent: string;
  pageType?: string;
  pathPattern?: string;
}

// ─── Legacy Memory (for migration) ──────────────────────────────────────────

export interface LegacyMemoryEntry {
  goal: string;
  url: string;
  steps: any[];
}
