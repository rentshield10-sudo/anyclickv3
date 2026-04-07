import path from 'path';
import { createLogger } from '../utils/logger';
import { RecipeMemory } from './RecipeMemory';
import { PageMemory } from './PageMemory';
import { RunMemory } from './RunMemory';

const log = createLogger('memory-store');

/**
 * MemoryStore — unified interface to all 3 memory layers.
 * 
 * Initializes and provides access to:
 *   - RecipeMemory (action recipes per intent)
 *   - PageMemory (page fingerprints)
 *   - RunMemory (complete run audit logs)
 */
export class MemoryStore {
  public recipes: RecipeMemory;
  public pages: PageMemory;
  public runs: RunMemory;

  constructor(dataDir?: string) {
    const dir = dataDir || path.join(process.cwd(), 'data');
    log.info({ dataDir: dir }, 'Initializing memory store');
    
    this.recipes = new RecipeMemory(dir);
    this.pages = new PageMemory(dir);
    this.runs = new RunMemory(dir);
  }

  /**
   * Determine if the system has enough memory about a site/page
   * to run in execution mode (fast, no AI) vs discovery mode.
   */
  hasRecipes(site: string, pageType?: string): boolean {
    const recipes = this.recipes.getAll(site);
    if (pageType) {
      return recipes.some(r => r.pageType === pageType && !r.stale);
    }
    return recipes.length > 0;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: MemoryStore | null = null;

export function getMemoryStore(dataDir?: string): MemoryStore {
  if (!_instance) {
    _instance = new MemoryStore(dataDir);
  }
  return _instance;
}
