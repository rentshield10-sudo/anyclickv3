import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import type { RunRecord, RunStep } from './types';

const log = createLogger('run-memory');

/**
 * Run Memory — stores complete audit logs of every automation run.
 * 
 * Each run is saved as a separate JSON file in data/runs/.
 * Used for debugging, analytics, and recipe generation from successful runs.
 */
export class RunMemory {
  private dataDir: string;

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, 'runs');
    fs.mkdirSync(this.dataDir, { recursive: true });
  }

  // ─── Save ────────────────────────────────────────────────────────────────────

  save(record: RunRecord): void {
    try {
      const filename = `${formatDate(record.startedAt)}-${sanitize(record.site)}-${record.success ? 'ok' : 'fail'}.json`;
      fs.writeFileSync(
        path.join(this.dataDir, filename),
        JSON.stringify(record, null, 2)
      );
      log.info({
        id: record.id,
        site: record.site,
        success: record.success,
        steps: record.steps.length,
        aiCalls: record.aiCallCount,
        durationMs: record.totalDurationMs,
      }, 'Saved run record');
    } catch (err) {
      log.error({ err }, 'Failed to save run record');
    }
  }

  // ─── Query ───────────────────────────────────────────────────────────────────

  /**
   * Get recent runs, optionally filtered by site.
   */
  getRecent(limit: number = 20, site?: string): RunRecord[] {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit * 2); // over-fetch to allow filtering

      const records: RunRecord[] = [];
      for (const file of files) {
        if (records.length >= limit) break;
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.dataDir, file), 'utf-8'));
          if (!site || data.site === site) {
            records.push(data);
          }
        } catch {
          // Skip corrupt files
        }
      }
      return records;
    } catch {
      return [];
    }
  }

  /**
   * Get the last successful run for a specific goal.
   */
  getLastSuccess(goal: string, site?: string): RunRecord | null {
    const records = this.getRecent(50, site);
    const normalizedGoal = goal.toLowerCase().trim();
    return records.find(
      r => r.success && r.goal.toLowerCase().trim() === normalizedGoal
    ) || null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(isoStr: string): string {
  return isoStr.replace(/[:.]/g, '-').slice(0, 19);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 50);
}
