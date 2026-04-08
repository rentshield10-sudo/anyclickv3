import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import type { LocatorCandidate } from '../locator/types';

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

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'recipes');
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.loadAll();
  }

  // ─── Lookup ──────────────────────────────────────────────────────────────────

  lookup(site: string, intent: string, pageType?: string): RecipeEntry | null {
    const recipes = this.cache.get(site);
    if (!recipes) return null;

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

  getById(recipeId: string): RecipeEntry | null {
    for (const recipes of this.cache.values()) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe) return recipe;
    }
    return null;
  }

  // ─── Save / Update ───────────────────────────────────────────────────────────

  save(recipe: Omit<RecipeEntry, 'id'>): RecipeEntry {
    const site = recipe.site;
    if (!this.cache.has(site)) {
      this.cache.set(site, []);
    }

    const recipes = this.cache.get(site)!;

    const existingIdx = recipes.findIndex(
      (r) => r.intent === recipe.intent && r.pageType === recipe.pageType
    );

    const entry: RecipeEntry = {
      ...recipe,
      id: existingIdx >= 0 ? recipes[existingIdx].id : generateId(),
    };

    if (existingIdx >= 0) {
      recipes[existingIdx] = entry;
      log.info({ site, intent: recipe.intent }, 'Updated existing recipe');
    } else {
      recipes.push(entry);
      log.info({ site, intent: recipe.intent }, 'Saved new recipe');
    }

    this.persist(site);
    return entry;
  }

  update(recipeId: string, recipe: Omit<RecipeEntry, 'id'>): RecipeEntry | null {
    for (const [site, recipes] of this.cache) {
      const existingIdx = recipes.findIndex((r) => r.id === recipeId);
      if (existingIdx === -1) continue;

      const existing = recipes[existingIdx];
      const updated: RecipeEntry = {
        ...recipe,
        id: recipeId,
      };

      if (existing.site !== recipe.site) {
        recipes.splice(existingIdx, 1);
        this.persist(site);

        if (!this.cache.has(recipe.site)) {
          this.cache.set(recipe.site, []);
        }
        this.cache.get(recipe.site)!.push(updated);
        this.persist(recipe.site);
      } else {
        recipes[existingIdx] = updated;
        this.persist(site);
      }

      log.info({ recipeId, site: recipe.site, intent: recipe.intent }, 'Updated recipe by id');
      return updated;
    }

    return null;
  }

  delete(recipeId: string): boolean {
    for (const [site, recipes] of this.cache) {
      const existingIdx = recipes.findIndex((r) => r.id === recipeId);
      if (existingIdx === -1) continue;

      recipes.splice(existingIdx, 1);
      this.persist(site);
      log.info({ recipeId, site }, 'Deleted recipe');
      return true;
    }

    return false;
  }

  // ─── Mark Success/Failure ─────────────────────────────────────────────────────

  markSuccess(recipeId: string): void {
    for (const [site, recipes] of this.cache) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe) {
        recipe.successCount++;
        recipe.lastSuccessAt = new Date().toISOString();
        recipe.stale = false;
        recipe.confidence = Math.min(0.99, recipe.confidence + 0.02);
        this.persist(site);
        return;
      }
    }
  }

  markFailure(recipeId: string): void {
    for (const [site, recipes] of this.cache) {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (recipe) {
        recipe.failureCount++;
        recipe.confidence = Math.max(0.1, recipe.confidence - 0.1);
        if (recipe.failureCount >= 3) {
          recipe.stale = true;
        }
        this.persist(site);
        return;
      }
    }
  }

  // ─── Get all recipes for a site ───────────────────────────────────────────────

  getAll(site?: string): RecipeEntry[] {
    if (site) return this.cache.get(site) || [];
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
      for (const file of files) {
        const site = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
        this.cache.set(site, data);
      }
      log.info({ sites: this.cache.size }, 'Loaded recipe memory');
    } catch (err) {
      log.error({ err }, 'Failed to load recipe memory');
    }
  }

  private persist(site: string): void {
    try {
      const recipes = this.cache.get(site) || [];
      fs.writeFileSync(
        path.join(this.dataDir, `${sanitizeFilename(site)}.json`),
        JSON.stringify(recipes, null, 2)
      );
    } catch (err) {
      log.error({ err, site }, 'Failed to persist recipe memory');
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