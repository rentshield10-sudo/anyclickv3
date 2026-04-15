import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import type { LocatorCandidate } from '../locator/types';
import { FlowStore } from '../persistence/FlowStore';

const log = createLogger('recipe-memory');

/**
 * Action Recipe Memory — stores reusable per-intent locator recipes.
 *
 * Recipes are keyed by site and stored in `data/recipes/{site}.json`.
 * Each recipe captures the locators, fallback texts, confidence, and
 * staleness info for a specific action intent on a specific page type.
 */
export class RecipeMemory {
  private dataDir: string;
  private cache: Map<string, RecipeEntry[]> = new Map();
  private flowStore = FlowStore.getInstance();

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'recipes');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.loadAll();
    this.reloadCacheFromDb();
  }

  // ─── Lookup ──────────────────────────────────────────────────────────────────

  lookup(site: string, intent: string, pageType?: string): RecipeEntry | null {
    const recipes = this.flowStore.getAll(site);
    if (!recipes.length) {
      const legacy = this.cache.get(site) || [];
      if (!legacy.length) return null;
      return this.findBestMatch(legacy, intent, pageType);
    }
    this.cache.set(site, recipes.slice());
    const bestDb = this.findBestMatch(recipes, intent, pageType);
    if (bestDb) return bestDb;

    const legacy = this.cache.get(site) || [];
    return this.findBestMatch(legacy, intent, pageType);
  }

  getById(recipeId: string): RecipeEntry | null {
    const flow = this.flowStore.getById(recipeId);
    if (flow) {
      this.setCacheEntry(flow);
      return flow;
    }
    for (const recipes of this.cache.values()) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe) return recipe;
    }
    return null;
  }

  // ─── Save / Update ───────────────────────────────────────────────────────────

  save(recipe: Omit<RecipeEntry, 'id'>): RecipeEntry {
    const entry = this.flowStore.save(recipe);
    this.setCacheEntry(entry);
    this.persist(entry.site);
    return entry;
  }

  update(recipeId: string, recipe: Omit<RecipeEntry, 'id'>): RecipeEntry | null {
    const updated = this.flowStore.update(recipeId, recipe);
    if (!updated) return null;
    this.setCacheEntry(updated);
    this.persist(updated.site);
    log.info({ recipeId, site: updated.site, intent: updated.intent }, 'Updated recipe by id');
    return updated;
  }

  delete(recipeId: string): boolean {
    const flow = this.getById(recipeId);
    if (!flow) return false;
    const deleted = this.flowStore.delete(recipeId);
    if (!deleted) return false;
    this.removeFromCache(recipeId, flow.site);
    this.persist(flow.site);
    log.info({ recipeId, site: flow.site }, 'Deleted recipe');
    return true;
  }

  // ─── Mark Success/Failure ─────────────────────────────────────────────────────

  markSuccess(recipeId: string): void {
    const flow = this.flowStore.getById(recipeId);
    if (!flow) return;
    this.flowStore.markSuccess(recipeId);
    const updated = this.flowStore.getById(recipeId);
    if (updated) {
      this.setCacheEntry(updated);
      this.persist(updated.site);
    }
  }

  markFailure(recipeId: string): void {
    const flow = this.flowStore.getById(recipeId);
    if (!flow) return;
    this.flowStore.markFailure(recipeId);
    const updated = this.flowStore.getById(recipeId);
    if (updated) {
      this.setCacheEntry(updated);
      this.persist(updated.site);
    }
  }

  // ─── Get all recipes for a site ───────────────────────────────────────────────

  getAll(site?: string): RecipeEntry[] {
    const flows = this.flowStore.getAll(site);
    if (site) {
      this.cache.set(site, flows.slice());
      return flows;
    }

    this.reloadCacheFromDb();
    const all: RecipeEntry[] = [];
    for (const recipes of this.cache.values()) {
      all.push(...recipes);
    }
    return all;
  }

  // ─── Persistence ──────────────────────────────────────────────────────────────

  private loadAll(): void {
    try {
      if (!fs.existsSync(this.dataDir)) return;
      const files = fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.json'));
      const legacy: RecipeEntry[] = [];
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
          if (Array.isArray(data)) {
            legacy.push(...data);
          }
        } catch (err) {
          log.error({ err, file }, 'Failed to read legacy recipe file');
        }
      }

      if (legacy.length > 0) {
        this.flowStore.importLegacyRecipes(legacy);
      }
      log.info({ legacy: legacy.length }, 'Loaded legacy recipe memory');
    } catch (err) {
      log.error({ err }, 'Failed to load recipe memory');
    }
  }

  private persist(site: string): void {
    try {
      const recipes = this.flowStore.getAll(site);
      fs.writeFileSync(
        path.join(this.dataDir, `${sanitizeFilename(site)}.json`),
        JSON.stringify(recipes, null, 2)
      );
      this.cache.set(site, recipes.slice());
    } catch (err) {
      log.error({ err, site }, 'Failed to persist recipe memory');
    }
  }

  private reloadCacheFromDb(): void {
    this.cache.clear();
    const all = this.flowStore.getAll();
    for (const recipe of all) {
      this.setCacheEntry(recipe);
    }
  }

  private findBestMatch(recipes: RecipeEntry[], intent: string, pageType?: string): RecipeEntry | null {
    let best: RecipeEntry | null = null;
    for (const recipe of recipes) {
      if (recipe.intent !== intent) continue;
      if (pageType && recipe.pageType === pageType) {
        return recipe;
      }
      if (!best || recipe.confidence > best.confidence) {
        best = recipe;
      }
    }
    return best;
  }

  private setCacheEntry(recipe: RecipeEntry): void {
    if (!recipe.site) return;
    if (!this.cache.has(recipe.site)) {
      this.cache.set(recipe.site, []);
    }
    const arr = this.cache.get(recipe.site)!;
    const idx = arr.findIndex((r) => r.id === recipe.id);
    if (idx >= 0) {
      arr[idx] = recipe;
    } else {
      arr.push(recipe);
    }
  }

  private removeFromCache(recipeId: string, site?: string): void {
    if (site && this.cache.has(site)) {
      const arr = this.cache.get(site)!;
      const idx = arr.findIndex((r) => r.id === recipeId);
      if (idx >= 0) {
        arr.splice(idx, 1);
      }
      return;
    }

    for (const [key, arr] of this.cache) {
      const idx = arr.findIndex((r) => r.id === recipeId);
      if (idx >= 0) {
        arr.splice(idx, 1);
        return;
      }
    }
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VariableDefinition {
  type: 'text' | 'number';
  required?: boolean;
  description?: string;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    minimum?: number;
    maximum?: number;
    integerOnly?: boolean;
  };
}

export interface DownloadConfig {
  mode?: 'auto';
  save_dir?: string;
  filename_template?: string;
  close_popup?: boolean;
  timeout_ms?: number;
}

export interface WaitCondition {
  kind: 'text_appears' | 'selector_appears' | 'selector_disappears' | 'url_change' | 'idle' | 'delay';
  text?: string;
  selector?: string;
  timeout_ms?: number;
}

export interface StepInputTemplate {
  kind: 'template';
  template: string;
  value_type: 'text' | 'number';
  default_value?: string | number;
}

export interface RecipeEntry {
  id: string;
  name?: string;
  slug?: string;
  version?: number;
  source_flow_id?: string | null;
  site: string;
  pageType: string;
  intent: string;
  variables?: Record<string, VariableDefinition>;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}
