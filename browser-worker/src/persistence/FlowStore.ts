import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';

type RecipeEntry = import('../memory/RecipeMemory').RecipeEntry;

const log = createLogger('flow-store');

interface FlowRow {
  id: string;
  data: string;
}

export class FlowStore {
  private static instance: FlowStore | null = null;
  private db: Database.Database;

  static getInstance(): FlowStore {
    if (!FlowStore.instance) {
      FlowStore.instance = new FlowStore();
    }
    return FlowStore.instance;
  }

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'flows.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS flows (
        id TEXT PRIMARY KEY,
        site TEXT NOT NULL,
        page_type TEXT,
        intent TEXT NOT NULL,
        name TEXT,
        start_url TEXT,
        confidence REAL,
        success_count INTEGER,
        failure_count INTEGER,
        stale INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_flows_site ON flows(site);
      CREATE INDEX IF NOT EXISTS idx_flows_intent ON flows(intent);
    `);
  }

  importLegacyRecipes(recipes: RecipeEntry[]): void {
    const select = this.db.prepare('SELECT id FROM flows WHERE id = ?');
    for (const recipe of recipes) {
      if (!recipe || !recipe.id) continue;
      const exists = select.get(recipe.id);
      if (!exists) {
        this.save(recipe);
      }
    }
  }

  save(flow: Omit<RecipeEntry, 'id'> & { id?: string }): RecipeEntry {
    const id = flow.id || generateId();
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT created_at FROM flows WHERE id = ?').get(id) as { created_at?: string } | undefined;
    const createdAt = existing?.created_at || now;

    const entry: RecipeEntry = {
      id,
      name: flow.name,
      slug: flow.slug,
      version: flow.version ?? 1,
      source_flow_id: flow.source_flow_id ?? null,
      site: flow.site,
      pageType: flow.pageType,
      intent: flow.intent,
      variables: flow.variables || {},
      fingerprint: flow.fingerprint || { title: '', headings: [], pathPattern: '' },
      startUrl: flow.startUrl,
      generatedScript: flow.generatedScript,
      locators: Array.isArray(flow.locators) ? flow.locators : [],
      fallbackTexts: Array.isArray(flow.fallbackTexts) ? flow.fallbackTexts : [],
      confidence: flow.confidence ?? 0.5,
      lastSuccessAt: flow.lastSuccessAt || '',
      successCount: flow.successCount ?? 0,
      failureCount: flow.failureCount ?? 0,
      stale: flow.stale ?? false,
    };

    this.db.prepare(`
      INSERT INTO flows (id, site, page_type, intent, name, start_url, confidence, success_count, failure_count, stale, created_at, updated_at, data)
      VALUES (@id, @site, @page_type, @intent, @name, @start_url, @confidence, @success_count, @failure_count, @stale, @created_at, @updated_at, @data)
      ON CONFLICT(id) DO UPDATE SET
        site = excluded.site,
        page_type = excluded.page_type,
        intent = excluded.intent,
        name = excluded.name,
        start_url = excluded.start_url,
        confidence = excluded.confidence,
        success_count = excluded.success_count,
        failure_count = excluded.failure_count,
        stale = excluded.stale,
        updated_at = excluded.updated_at,
        data = excluded.data
    `).run({
      id: entry.id,
      site: entry.site,
      page_type: entry.pageType || null,
      intent: entry.intent,
      name: entry.name || null,
      start_url: entry.startUrl || null,
      confidence: entry.confidence,
      success_count: entry.successCount,
      failure_count: entry.failureCount,
      stale: entry.stale ? 1 : 0,
      created_at: createdAt,
      updated_at: now,
      data: JSON.stringify(entry),
    });

    return entry;
  }

  update(recipeId: string, flow: Omit<RecipeEntry, 'id'>): RecipeEntry | null {
    const existing = this.getById(recipeId);
    if (!existing) return null;
    return this.save({ ...flow, id: recipeId });
  }

  delete(recipeId: string): boolean {
    const result = this.db.prepare('DELETE FROM flows WHERE id = ?').run(recipeId);
    return result.changes > 0;
  }

  getById(recipeId: string): RecipeEntry | null {
    const row = this.db.prepare('SELECT data FROM flows WHERE id = ?').get(recipeId) as FlowRow | undefined;
    if (!row) return null;
    return JSON.parse(row.data);
  }

  getAll(site?: string): RecipeEntry[] {
    const rows = (site
      ? this.db.prepare('SELECT data FROM flows WHERE site = ? ORDER BY updated_at DESC').all(site)
      : this.db.prepare('SELECT data FROM flows ORDER BY updated_at DESC').all()) as FlowRow[];
    return rows.map((row) => JSON.parse(row.data));
  }

  markSuccess(recipeId: string): void {
    const flow = this.getById(recipeId);
    if (!flow) return;

    flow.successCount = (flow.successCount || 0) + 1;
    flow.lastSuccessAt = new Date().toISOString();
    flow.stale = false;
    flow.confidence = Math.min(0.99, (flow.confidence ?? 0.5) + 0.02);

    this.save(flow);
  }

  markFailure(recipeId: string): void {
    const flow = this.getById(recipeId);
    if (!flow) return;

    flow.failureCount = (flow.failureCount || 0) + 1;
    flow.confidence = Math.max(0.1, (flow.confidence ?? 0.5) - 0.1);
    if (flow.failureCount >= 3) {
      flow.stale = true;
    }

    this.save(flow);
  }
}

function generateId(): string {
  return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
