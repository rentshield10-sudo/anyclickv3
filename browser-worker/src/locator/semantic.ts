import { config } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('semantic-locator');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export interface SemanticTargetResult {
  text?: string;
  role?: string;
  tag?: string;
  label?: string;
  placeholder?: string;
  near?: string;
  section?: string;
  testId?: string;
  selector?: string;
  confidence: number;
}

/**
 * Use a small/fast model to infer the correct target element.
 * Receives a reduced page representation — NOT the full DOM.
 * Returns a compact target spec, not long reasoning.
 */
export async function inferTargetSemantic(
  intent: string,
  action: string,
  reducedState: {
    url: string;
    title: string;
    headings: string[];
    formLabels: string[];
    visibleTexts: string[];
    interactiveElements: { tag: string; text: string; role: string; label: string; placeholder: string }[];
  }
): Promise<SemanticTargetResult | null> {
  const startMs = Date.now();
  const model = config.GEMINI_MODEL; // fast model (Flash)

  const prompt = `You are a browser element locator. Given the page context and intent, identify the best target element.

Intent: ${intent}
Action: ${action}

Page URL: ${reducedState.url}
Page Title: ${reducedState.title}
Headings: ${reducedState.headings.slice(0, 10).join(', ')}
Form Labels: ${reducedState.formLabels.slice(0, 10).join(', ')}
Visible Text Snippets: ${reducedState.visibleTexts.slice(0, 40).join(' | ')}

Interactive elements (${reducedState.interactiveElements.length}):
${reducedState.interactiveElements.slice(0, 30).map((e, i) =>
  `  [${i}] ${e.tag} | role="${e.role}" | text="${e.text}" | label="${e.label}" | placeholder="${e.placeholder}"`
).join('\n')}

Return ONLY a JSON object with these fields (omit null fields):
{
  "text": "visible text of the element",
  "role": "WAI-ARIA role or semantic tag",
  "label": "aria-label or form label",
  "placeholder": "placeholder text",
  "near": "text of a nearby element for disambiguation",
  "section": "page section the element is in",
  "confidence": 0.0
}`;

  try {
    const res = await fetch(`${GEMINI_API_BASE}${model}:generateContent?key=${config.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      log.error({ status: res.status, errText }, 'Semantic model API error');
      return null;
    }

    const data = await res.json() as any;
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    
    let cleaned = raw.trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) cleaned = match[0];
    
    const parsed = JSON.parse(cleaned) as SemanticTargetResult;
    const elapsed = Date.now() - startMs;
    
    log.info({ intent, elapsed, confidence: parsed.confidence }, 'Semantic inference complete');
    return parsed;
  } catch (err: any) {
    log.error({ err: err.message, intent }, 'Semantic inference failed');
    return null;
  }
}
