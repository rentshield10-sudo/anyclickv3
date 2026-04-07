import { config } from '../config';
import { createLogger } from '../utils/logger';
import { ActionSchema, type Action, type PageState } from '../utils/validation';
import { getMemoryStore } from '../memory/MemoryStore';
import { broadcastLog } from '../utils/events';

const log = createLogger('planner');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a browser action planner for a local automation system.
Your job is to choose exactly one next action based on the current page state and the user goal.
You do not control the browser directly. A browser worker executes your chosen action.

Rules:
1. Return EXACTLY ONE JSON object and absolutely NOTHING else.
2. DO NOT output markdown blocks (like json markdown wrappers).
3. Use the optional "thinking" field ONLY if the previous action failed or if the page state changed in an unexpected way. Otherwise, omit it to save tokens.
4. Keep the "reason" field extremely short (under 10 words).
5. Target elements exactly by their elementId from the provided list.
6. The allowed actions are: goto | click | type | press | scroll | select | extract | wait_for_change | request_login | done.
7. If unsure or page is loading, return action=wait_for_change.
8. CRITICAL: If the user goal is already completely achieved or clearly visible on the screen, YOU MUST IMMEDIATELY return action="done" to terminate the automation loop. Do not execute any further actions.
9. PREVENT INFINITE LOOPS: Look closely at "actionHistory". If you just clicked the final submit/send button in the previous step, assume the goal is complete and return "done". Do not repeat the same action repeatedly.
10. AVOID UNNECESSARY WAITING: Never return "wait_for_change" if the relevant page content or buttons for the next logical step are already visible. Only wait if the page is literally blank or shows a loading spinner.
11. NO PLACEHOLDERS: Never use "..." or placeholders in the JSON. You MUST use literal strings as defined in the enums. Do not summarize objects.

Output schema (JSON only, no markdown):
{
  "action": "string",
  "target": { "elementId": number | null, "description": "string" },
  "value": "string or null",
  "watch": { "region": "page | main_content | right_panel | iframe | unknown | none", "change": "text_change | element_appeared | element_disappeared | url_change | loading_finished | none" },
  "thinking": "optional step-by-step logic ONLY if error recovery is needed",
  "reason": "brief reason",
  "confidence": 0.0
}`;

// ─── User prompt builder ──────────────────────────────────────────────────────

export function buildUserPrompt(
  goal: string,
  engine: string,
  state: PageState,
  history: Action[],
  failures: string[]
): string {
  let hostname = 'unknown';
  try { hostname = new URL(state.url).hostname; } catch {}
  const rememberedSequence = getMemoryStore().runs.getLastSuccess(goal, hostname);
  const memoryBlock = rememberedSequence 
    ? `\nMEMORY CACHE (SUCCESSFUL STEPS FROM PREVIOUS RUN):\n${JSON.stringify(rememberedSequence, null, 2)}\nIf the current state resembles the memory, strongly prefer continuing the sequence above.`
    : '';

  return `User goal: ${goal}${memoryBlock}

Current engine: ${engine}
Current URL: ${state.url}
Current title: ${state.title}
Login status: ${state.loginStatus.loggedIn ? 'Logged in' : 'NOT logged in'} (evidence: ${state.loginStatus.evidence.join(', ') || 'none'})

Main panel:
  Heading: ${state.panels.main.heading || '(none)'}
  Text: ${state.panels.main.text.slice(0, 800) || '(empty)'}

Right panel:
  Heading: ${state.panels.right.heading || '(none)'}
  Text: ${state.panels.right.text.slice(0, 800) || '(empty)'}

Loading: networkBusy=${state.loading.networkBusy}, spinnerVisible=${state.loading.spinnerVisible}

Visible interactive elements (${state.elements.length}):
${JSON.stringify(state.elements.slice(0, 80), null, 2)}

Recent action history (last ${history.length}):
${history.length > 0 ? JSON.stringify(history, null, 2) : '(none)'}

Failure history:
${failures.length > 0 ? failures.join('\n') : '(none)'}

Choose the next best single action. Return JSON only.`;
}

// ─── Call Gemini ──────────────────────────────────────────────────────────────

export async function planNextAction(
  goal: string,
  engine: string,
  state: PageState,
  history: Action[] = [],
  failures: string[] = []
): Promise<Action> {
  const userPrompt = buildUserPrompt(goal, engine, state, history, failures);

  const isErrorRecovery = failures.length > 0;
  const modelToUse = isErrorRecovery ? config.GEMINI_PRO_MODEL.trim() : config.GEMINI_MODEL.trim();
  const GEMINI_API_URL = `${GEMINI_API_BASE}${modelToUse}:generateContent`;

  log.info({ goal, url: state.url, model: modelToUse, fastMode: !isErrorRecovery }, 'Calling Gemini planner');
  broadcastLog('info', `Routing request to AI Model (${modelToUse.split('-')[1].toUpperCase()})`, {
    errorRecovery: isErrorRecovery
  });

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: isErrorRecovery ? 0.4 : 0.1, // more creative in recovery
      maxOutputTokens: isErrorRecovery ? 8192 : 2048, // huge token limit for pro reasoning
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(`${GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  log.debug({ raw }, 'Gemini raw response');

  // ── Parse & validate ────────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    let cleanJson = raw.trim();
    const match = cleanJson.match(/\{[\s\S]*\}/);
    if (match) {
      cleanJson = match[0];
    }
    // Automatically strip trailing commas and illegal triple-dot placeholders
    cleanJson = cleanJson
      .replace(/,\s*}/g, '}')
      .replace(/,\s*\]/g, ']')
      .replace(/:\s*"\.\.\."/g, ': null')
      .replace(/:\s*\{s*\.\.\.\s*\}/g, ': null');
    
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Gemini returned non-JSON: ${raw.slice(0, 200)}... (Parse Error: ${(err as Error).message})`);
  }

  const result = ActionSchema.safeParse(parsed);
  if (!result.success) {
    log.error({ errors: result.error.flatten(), raw }, 'Invalid action schema from Gemini');
    broadcastLog('error', 'AI Output failed JSON schema validation', result.error.flatten());
    throw new Error(`Gemini action failed validation: ${JSON.stringify(result.error.flatten())}`);
  }

  log.info({ action: result.data.action, confidence: result.data.confidence }, 'Gemini planned action');
  
  broadcastLog('info', `AI Decision Received: ${result.data.action}`, {
    confidence: result.data.confidence,
    reason: result.data.reason,
    thinking: result.data.thinking || null,
  });

  return result.data;
}
