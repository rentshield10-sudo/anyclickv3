import fs from 'fs';
import path from 'path';
import { createLogger } from '../utils/logger';
import { type Action } from '../utils/validation';

const log = createLogger('memory');

const MEMORY_FILE = path.join(__dirname, '../../profiles/memory.json');

interface MemoryEntry {
  goal: string;
  url: string;
  steps: Action[];
}

let memoryCache: Record<string, MemoryEntry> = {};

export function getMemoryData(): Record<string, MemoryEntry> {
  return memoryCache;
}

export function loadMemory(): void {
  try {
    if (fs.existsSync(MEMORY_FILE)) {
      const data = fs.readFileSync(MEMORY_FILE, 'utf-8');
      memoryCache = JSON.parse(data);
      log.info('Loaded workflow memory bank');
    }
  } catch (err) {
    log.error({ err }, 'Failed to load memory file');
  }
}

export function saveMemory(): void {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true });
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memoryCache, null, 2));
  } catch (err) {
    log.error({ err }, 'Failed to write memory file');
  }
}

export function recordSuccessfulRun(goal: string, finalUrl: string, actions: Action[]): void {
  // Key the memory uniquely by the goal format (ignoring capitalization and minor spaces)
  const key = goal.toLowerCase().trim();
  
  memoryCache[key] = {
    goal,
    url: finalUrl,
    steps: actions.filter(a => a.action !== 'done'), // Save the functional steps only
  };
  
  saveMemory();
  log.info({ key, stepCount: memoryCache[key].steps.length }, 'Successfully recorded perfect workflow run to memory!');
}

export function renameMemory(oldGoal: string, newGoal: string): boolean {
  const oldKey = oldGoal.toLowerCase().trim();
  const newKey = newGoal.toLowerCase().trim();
  
  if (memoryCache[oldKey]) {
    memoryCache[newKey] = {
      ...memoryCache[oldKey],
      goal: newGoal,
    };
    delete memoryCache[oldKey];
    saveMemory();
    log.info({ oldGoal, newGoal }, 'Successfully renamed memory entry');
    return true;
  }
  return false;
}

export function recallMemory(goal: string): Action[] | null {
  const key = goal.toLowerCase().trim();
  if (memoryCache[key]) {
    return memoryCache[key].steps;
  }
  return null;
}
