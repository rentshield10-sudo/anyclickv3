// ─── Locator Engine Types ────────────────────────────────────────────────────

export type LocatorKind =
  | 'role_text'
  | 'exact_text'
  | 'label'
  | 'placeholder'
  | 'aria'
  | 'css'
  | 'testid'
  | 'text'
  | 'label_near'
  | 'fuzzy_text'
  | 'semantic_ai'
  | 'repair_ai';

export interface LocatorCandidate {
  step_id?: string;
  kind: LocatorKind | 'wait';
  selector: string;
  role?: string;
  text?: string;
  near?: string;
  value?: string;
  input?: import('../memory/RecipeMemory').StepInputTemplate;
  action?: string;
  wait?: import('../memory/RecipeMemory').WaitCondition;
  priority: number;
  confidence: number;
}

export type ResolutionMethod = 'recipe_replay' | 'deterministic' | 'semantic_ai' | 'repair_ai';

export interface LocatorResult {
  found: boolean;
  selector: string | null;
  method: ResolutionMethod;
  confidence: number;
  candidates: LocatorCandidate[];
  logs: ResolutionLog[];
  durationMs: number;
}

export interface ResolutionLog {
  step: string;
  result: 'hit' | 'miss' | 'skip' | 'error';
  strategy?: string;
  ms: number;
  detail?: string;
}

export interface TargetSpec {
  text?: string;
  role?: string;
  tag?: string;
  label?: string;
  placeholder?: string;
  near?: string;
  section?: string;
  testId?: string;
  cssSelector?: string;
  index?: number;
}

export interface LocatorRequest {
  intent: string;          // e.g., "click_login_button", "type_email"
  action: string;          // "click", "type", "hover", etc.
  target: TargetSpec;
  site: string;
  pageType?: string;
  value?: string;          // for type/fill actions
}
