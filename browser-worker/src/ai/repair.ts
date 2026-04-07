import { Page } from 'playwright';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { broadcastLog } from '../utils/events';

const log = createLogger('ai-repair');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export interface RepairResult {
  success: boolean;
  selector?: string;
  reasoning?: string;
  confidence?: number;
  error?: string;
}

/**
 * Large-model repair — the EXCEPTION path, not the default.
 * 
 * Only called when all 3 prior locator steps fail.
 * Uses a reduced page representation + optional screenshot context.
 * If repair succeeds, the result should be saved as a new recipe.
 */
export async function repairLocator(
  page: Page,
  intent: string,
  action: string,
  targetDescription: string,
  failureLogs: string[],
  opts: {
    includeScreenshot?: boolean;
  } = {}
): Promise<RepairResult> {
  const startMs = Date.now();
  const model = config.GEMINI_PRO_MODEL || 'gemini-2.5-pro';

  broadcastLog('warn', `AI Repair triggered — all locator strategies failed`, { intent, action });
  log.info({ intent, action, model }, 'Starting AI repair');

  // Gather minimal context
  const url = page.url();
  const title = await page.title();

  const interactiveElements = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll(
      'button, a, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], [role="menuitem"]'
    )).filter(el => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    });

    return els.slice(0, 30).map((el, i) => {
      const tag = el.tagName.toLowerCase();
      return {
        index: i,
        tag,
        id: el.id || null,
        role: el.getAttribute('role') || tag,
        text: (el.textContent || '').trim().slice(0, 80),
        ariaLabel: el.getAttribute('aria-label') || null,
        placeholder: el.getAttribute('placeholder') || null,
        type: el.getAttribute('type') || null,
        name: el.getAttribute('name') || null,
        testId: el.getAttribute('data-testid') || null,
        className: (el.className || '').toString().slice(0, 60),
      };
    });
  }).catch(() => []);

  const prompt = `You are a browser automation repair agent. All standard locator strategies failed.
Your job: find the correct element and provide a working Playwright selector.

TASK: ${action} — ${targetDescription}
INTENT: ${intent}
URL: ${url}
TITLE: ${title}

FAILED ATTEMPTS:
${failureLogs.join('\n')}

VISIBLE INTERACTIVE ELEMENTS:
${interactiveElements.map((el, i) => 
  `[${i}] <${el.tag}> id="${el.id}" role="${el.role}" text="${el.text}" aria="${el.ariaLabel}" placeholder="${el.placeholder}" type="${el.type}" testid="${el.testId}" class="${el.className}"`
).join('\n')}

Find the correct element for this intent. Return ONLY JSON:
{
  "selector": "valid Playwright CSS selector",
  "reasoning": "brief explanation of why this is the right element",
  "confidence": 0.0
}`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}${model}:generateContent?key=${config.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 512,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log.error({ status: res.status }, 'AI repair API error');
      return { success: false, error: `API error ${res.status}: ${errText.slice(0, 200)}` };
    }

    const data = await res.json() as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { success: false, error: 'No JSON in repair response' };
    
    const parsed = JSON.parse(match[0]);
    
    // Verify selector actually works
    if (parsed.selector) {
      const count = await page.locator(parsed.selector).count().catch(() => 0);
      if (count > 0) {
        const elapsed = Date.now() - startMs;
        log.info({ selector: parsed.selector, elapsed, confidence: parsed.confidence }, 'AI repair successful');
        broadcastLog('info', `AI Repair succeeded (${elapsed}ms)`, { selector: parsed.selector });
        
        return {
          success: true,
          selector: parsed.selector,
          reasoning: parsed.reasoning,
          confidence: parsed.confidence || 0.6,
        };
      }
    }

    log.warn({ selector: parsed.selector }, 'AI repair selector did not match any element');
    return { success: false, error: 'Repaired selector matched no elements' };
  } catch (err: any) {
    log.error({ err: err.message }, 'AI repair failed');
    return { success: false, error: err.message };
  }
}
