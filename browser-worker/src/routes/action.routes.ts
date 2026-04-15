import { Router, Request, Response } from 'express';
import { createLogger } from '../utils/logger';
import { broadcastLog } from '../utils/events';
import * as pw from '../engine/playwright';
import { resolveLocator } from '../locator/LocatorEngine';
import { repairLocator } from '../ai/repair';
import { extractPageState } from '../state/extractPageState';
import { detectChanges } from '../state/detectChanges';
import { generateFingerprint } from '../state/fingerprint';
import { getMemoryStore } from '../memory/MemoryStore';
import { getSession } from './session.routes';
import { sleep } from '../utils/retry';
import { planNextAction } from '../prompts/planner';
import type { LocatorRequest, TargetSpec } from '../locator/types';

const log = createLogger('action-routes');
const router = Router();

interface ActionResponse {
  ok: boolean;
  data?: {
    matched: boolean;
    target?: { selector: string; confidence: number };
    method: string;
    fallbackReason?: string;
    pageChanged: boolean;
    value?: any;
  };
  logs: any[];
  error?: string;
}

type FlowStep = {
  action?: string;
  value?: string;
  target?: {
    label?: string;
    text?: string;
    placeholder?: string;
    role?: string;
    tag?: string;
    type?: string;
    cssSelector?: string;
  };
};

async function handleAction(
  req: Request,
  res: Response,
  actionType: string,
  actionFn: (page: any, selector: string, value?: string) => Promise<void>
) {
  try {
    const { sessionId, intent, target, value, site } = req.body as {
      sessionId?: string;
      intent?: string;
      target: TargetSpec;
      value?: string;
      site?: string;
    };

    if (!target) {
      res.status(400).json({ ok: false, error: 'target is required' });
      return;
    }

    const page = await pw.getPage();
    const pageUrl = new URL(page.url());
    const siteHost = site || pageUrl.hostname;

    const stateBefore = await extractPageState(page);

    const locatorReq: LocatorRequest = {
      intent: intent || `${actionType}_${target.text || target.label || 'element'}`,
      action: actionType,
      target,
      site: siteHost,
      value,
    };

    const memoryStore = getMemoryStore();
    const result = await resolveLocator(page, locatorReq, {
      lookup: (s, i, pt) => memoryStore.recipes.lookup(s, i, pt),
      markSuccess: (id) => memoryStore.recipes.markSuccess(id),
      markFailure: (id) => memoryStore.recipes.markFailure(id),
    });

    log.info(
      {
        actionType,
        intent: locatorReq.intent,
        target,
        found: result.found,
        method: result.method,
        confidence: result.confidence,
        candidates: result.candidates.slice(0, 10),
        logs: result.logs,
      },
      'TEMP DEBUG locator resolution'
    );

    let finalSelector = result.selector;
    let method = result.method;

    if (!result.found) {
      if (sessionId) {
        const session = getSession(sessionId);
        session.aiCallCount++;
      }

      const repairResult = await repairLocator(
        page,
        locatorReq.intent,
        actionType,
        target.text || target.label || 'unknown element',
        result.logs.map((l: any) => `${l.step}: ${l.result} (${l.detail || ''})`)
      );

      if (repairResult.success && repairResult.selector) {
        finalSelector = repairResult.selector;
        method = 'repair_ai';

        const fingerprint = await generateFingerprint(page);
        memoryStore.recipes.save({
          site: siteHost,
          pageType: fingerprint.pageType,
          intent: locatorReq.intent,
          fingerprint: {
            title: fingerprint.title,
            headings: fingerprint.headings,
            pathPattern: fingerprint.pathPattern,
          },
          locators: [
            {
              kind: 'css',
              selector: finalSelector,
              text: target.text,
              role: target.role,
              priority: 0,
              confidence: repairResult.confidence || 0.7,
            },
          ],
          fallbackTexts: [],
          confidence: repairResult.confidence || 0.7,
          lastSuccessAt: new Date().toISOString(),
          successCount: 1,
          failureCount: 0,
          stale: false,
        });

        broadcastLog('info', `AI repair saved as new recipe: ${locatorReq.intent}`);
      } else {
        res.json({
          ok: false,
          data: {
            matched: false,
            method: 'repair_ai',
            fallbackReason: repairResult.error || 'All strategies failed',
            pageChanged: false,
          },
          logs: result.logs,
          error: `Could not resolve target for ${actionType}`,
        } as ActionResponse);
        return;
      }
    }

    broadcastLog('info', `⚡ ${actionType.toUpperCase()} via ${method}`, {
      selector: finalSelector,
      confidence: result.confidence,
    });

    await actionFn(page, finalSelector!, value);

    await sleep(300);
    await pw.waitForChange(1200);

    const stateAfter = await extractPageState(page);
    const diff = detectChanges(stateBefore, stateAfter);

    if (sessionId) {
      try {
        const session = getSession(sessionId);
        session.stepCount++;
      } catch { }
    }

    if (result.found && (method === 'deterministic' || method === 'semantic_ai') && finalSelector) {
      const fingerprint = await generateFingerprint(page);
      memoryStore.recipes.save({
        site: siteHost,
        pageType: fingerprint.pageType,
        intent: locatorReq.intent,
        fingerprint: {
          title: fingerprint.title,
          headings: fingerprint.headings,
          pathPattern: fingerprint.pathPattern,
        },
        locators: result.candidates.map((c: any) => ({
          ...c,
          priority: c.priority,
        })),
        fallbackTexts: [],
        confidence: result.confidence,
        lastSuccessAt: new Date().toISOString(),
        successCount: 1,
        failureCount: 0,
        stale: false,
      });
    }

    res.json({
      ok: true,
      data: {
        matched: true,
        target: { selector: finalSelector!, confidence: result.confidence },
        method,
        pageChanged: diff.changed,
      },
      logs: result.logs,
    } as ActionResponse);
  } catch (err: any) {
    log.error({ err: err.message, action: actionType }, 'Action failed');
    res.status(500).json({ ok: false, error: err.message, logs: [] });
  }
}

async function executeDirectPageAction(
  page: any,
  action: string,
  selector: string,
  value?: string
): Promise<void> {
  if (action === 'wait') {
    // Basic fallback for a wait action if someone calls it direct
    await pw.waitForChange(5000);
    return;
  }

  if (action === 'download') {
    // Attempt parsing options from value if provided, or empty config
    let opts: any = {};
    if (value) {
      try { 
        opts = JSON.parse(value); 
      } catch {
        opts.filename_template = value;
      }
    }
    await pw.download(selector, opts);
    return;
  }

  const locator = page.locator(selector).first();

  await locator.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => { });

  if (action === 'click') {
    await pw.simulateCursor(selector, 'click');
    // Attempt standard click
    await locator.click({ timeout: 2000 }).catch(async () => {
      // If Playwright strict click fails, try forcing it
      await locator.click({ force: true, timeout: 1500 }).catch(async () => {
         // If still fails (e.g. element is technically detached or covered), evaluate raw DOM click
         await locator.evaluate((node: HTMLElement) => node.click()).catch(() => {});
      });
    });
    await pw.waitForChange(1200);
    return;
  }

  if (action === 'type') {
    await pw.simulateCursor(selector, 'type');
    await locator.click({ timeout: 1500 }).catch(() => { });
    await locator.fill(value || '', { timeout: 2500 }).catch(async () => {
      await locator.clear({ timeout: 1000 }).catch(() => { });
      await locator.type(value || '', { timeout: 2500 });
    });
    await pw.waitForChange(1200);
    return;
  }

  if (action === 'select') {
    await pw.simulateCursor(selector, 'select');
    await locator.selectOption(value || '', { timeout: 2500 });
    await pw.waitForChange(1200);
    return;
  }

  throw new Error(`Unsupported direct flow action: ${action}`);
}

router.post('/load-url', async (req: Request, res: Response) => {
  try {
    const { url, sessionId, newTab } = req.body as { url?: string; sessionId?: string; newTab?: boolean };

    if (!url) {
      res.status(400).json({ ok: false, error: 'url is required' });
      return;
    }

    log.info({ url, sessionId, newTab }, 'Navigating to URL');
    broadcastLog('info', `Navigating to ${url}`, { sessionId });

    await pw.navigate(url, { newTab: !!newTab });
    const page = await pw.getPage();

    res.json({
      ok: true,
      data: {
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    log.error({ err: err.message, url: req.body?.url }, 'Navigation failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/do-task', async (req: Request, res: Response) => {
  try {
    const { sessionId, goal: overridingGoal } = req.body as {
      sessionId?: string;
      goal?: string;
    };

    const page = await pw.getPage();
    const state = await extractPageState(page);

    let goal = overridingGoal;
    if (!goal && sessionId) {
      try {
        const session = getSession(sessionId);
        goal = session.goal;
      } catch { }
    }

    if (!goal) {
      res.status(400).json({ ok: false, error: 'goal or sessionId with goal is required' });
      return;
    }

    const plan = await planNextAction(goal, 'playwright', state);

    let target = undefined;
    if (plan.target?.elementId) {
      const el = state.elements.find((e: any) => e.id === plan.target?.elementId);
      if (el) {
        target = {
          text: el.text || undefined,
          label: el.label || undefined,
          placeholder: el.placeholder || undefined,
          role: el.role || undefined,
          testId: (el as any).testId || undefined,
          cssSelector: el.selector || undefined,
        };
      }
    }

    const n8nToolMapping: Record<string, string> = {
      goto: 'load-url',
      wait_for_change: 'wait-for-condition',
    };

    res.json({
      ok: true,
      data: {
        tool: n8nToolMapping[plan.action] || plan.action,
        params: {
          sessionId,
          intent: plan.target?.description || plan.action,
          target,
          value: plan.value,
          url: plan.action === 'goto' ? plan.value : undefined,
          condition: plan.action === 'wait_for_change' ? 'url_change' : undefined,
        },
        done: plan.action === 'done',
        thinking: plan.thinking,
        reason: plan.reason,
      },
    });
  } catch (err: any) {
    log.error({ err: err.message }, 'do-task failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/test-click', async (req: Request, res: Response) => {
  try {
    const { target } = req.body as {
      target?: {
        cssSelector?: string;
        text?: string;
        label?: string;
        placeholder?: string;
      };
    };

    if (!target) {
      res.status(400).json({ ok: false, error: 'target is required' });
      return;
    }

    const page = await pw.getPage();
    let locator: any = null;

    if (target.cssSelector) {
      locator = page.locator(target.cssSelector).first();
    } else if (target.label) {
      locator = page.getByLabel(target.label).first();
    } else if (target.placeholder) {
      locator = page.getByPlaceholder(target.placeholder).first();
    } else if (target.text) {
      locator = page.getByText(target.text, { exact: false }).first();
    }

    if (!locator) {
      res.status(400).json({ ok: false, error: 'No fast target available for test click' });
      return;
    }

    if (target.cssSelector) {
        await pw.simulateCursor(target.cssSelector, 'click');
    }

    await locator.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
    await locator.click({ timeout: 2000 }).catch(async () => {
      await locator.click({ force: true, timeout: 1500 }).catch(async () => {
         await locator.evaluate((node: HTMLElement) => node.click()).catch(() => {});
      });
    });

    await pw.waitForChange(1200);

    res.json({
      ok: true,
      data: {
        method: 'test_click_fast',
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/get-select-options', async (req: Request, res: Response) => {
  try {
    const { selector, open } = req.body as { selector?: string; open?: boolean };
    if (!selector) {
      res.status(400).json({ ok: false, error: 'selector is required' });
      return;
    }

    const page = await pw.getPage();
    const locator = page.locator(selector).first();
    const count = await locator.count();

    if (count === 0) {
      res.json({ ok: false, error: 'Element not found for selector' });
      return;
    }

    if (open) {
      await locator.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
      await locator.click({ timeout: 1500 }).catch(() => { });
      await page.waitForTimeout(150).catch(() => { });
    }

    const options = await locator.evaluate((node) => {
      const results = [] as Array<{ value: string; label: string; selected: boolean; selector?: string }>;
      if (!node) return results;

      const toText = (input: any) => {
        if (input === null || input === undefined) return '';
        return String(input).trim();
      };

      const className = (node as HTMLElement).className ? (node as HTMLElement).className.toString().toLowerCase() : '';

      const isOptionCandidate = (el: Element | null): el is HTMLElement => {
        if (!el) return false;
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        const cls = (el as HTMLElement).className ? (el as HTMLElement).className.toString().toLowerCase() : '';
        const roleAttr = (el.getAttribute('role') || '').toLowerCase();
        if (roleAttr === 'option') return true;
        if (el.hasAttribute('data-value') || el.hasAttribute('data-option-value') || el.hasAttribute('data-select-value')) return true;
        if (cls.includes('option') || cls.includes('dropdown-item') || cls.includes('choices__item')) return true;
        if (tag === 'li' && (cls.includes('select') || cls.includes('choice'))) return true;
        if (tag === 'button' && cls.includes('select')) return true;
        return false;
      };

      const buildAutoSelector = (el: HTMLElement, fallbackValue: string, fallbackLabel: string): string | undefined => {
        const role = el.getAttribute('role');
        const textSnippet = toText(el.textContent || fallbackLabel || fallbackValue);
        const escapedText = textSnippet.replace(/"/g, '\\"').slice(0, 60);

        const dataValue = el.getAttribute('data-value') || el.getAttribute('data-option-value') || el.getAttribute('data-select-value');
        if (dataValue) {
          const escapedValue = toText(dataValue).replace(/"/g, '\\"');
          return `[data-value="${escapedValue}"]${textSnippet ? `:has-text("${escapedText}")` : ''}`;
        }

        if (role === 'option') {
          return `[role="option"]${textSnippet ? `:has-text("${escapedText}")` : ''}`;
        }

        const ariaLabelValue = el.getAttribute('aria-label') || el.getAttribute('aria-valuetext');
        if (ariaLabelValue) {
          const escapedAria = toText(ariaLabelValue).replace(/"/g, '\\"');
          return `[aria-label="${escapedAria}"]${textSnippet ? `:has-text("${escapedText}")` : ''}`;
        }

        const classes = (el.className || '').toString().trim().split(/\s+/);
        for (const cls of classes) {
          if (!cls) continue;
          return `.${cls}${textSnippet ? `:has-text("${escapedText}")` : ''}`;
        }

        const parent = el.closest('[role="option"]');
        if (parent) {
          return `[role="option"]${textSnippet ? `:has-text("${escapedText}")` : ''}`;
        }

        return textSnippet ? `:has-text("${escapedText}")` : undefined;
      };

      const pushOption = (el: Element | null) => {
        if (!el) return;
        const valueAttr = el.getAttribute('value');
        const dataValue = el.getAttribute('data-value');
        const dataOptionValue = el.getAttribute('data-option-value');
        const dataSelectValue = el.getAttribute('data-select-value');
        const ariaValue = el.getAttribute('aria-label');
        const ariaValueText = el.getAttribute('aria-valuetext');
        const textContent = el.textContent || '';
        const value = toText(valueAttr || dataValue || dataOptionValue || dataSelectValue || ariaValue || ariaValueText || textContent);
        const labelAttr =
          el.getAttribute('label') ||
          el.getAttribute('data-label') ||
          ariaValue ||
          ariaValueText ||
          textContent;
        const label = toText(labelAttr) || value || '(blank option)';
        const ariaSelected = el.getAttribute('aria-selected');
        const classList = (el as HTMLElement).classList || { contains: () => false };
        const selectedProp = (el as any).selected;
        const selected =
          ariaSelected === 'true' ||
          ariaSelected === '1' ||
          Boolean(selectedProp) ||
          classList.contains('selected') ||
          classList.contains('active');

        if (!value && !label) return;
        const selector = buildAutoSelector(el as HTMLElement, value, label);
        results.push({ value, label, selected, selector });
      };

      const tagName = node.tagName ? node.tagName.toLowerCase() : '';

      if (tagName === 'select') {
        const selectEl = node as HTMLSelectElement;
        const nativeOptions = Array.from(selectEl.options || []);
        if (nativeOptions.length > 0) {
          nativeOptions.forEach((opt) => {
            const value = toText(opt.value || opt.textContent || '');
            const label = toText(opt.label || opt.textContent || '') || value || '(blank option)';
            results.push({ value, label, selected: opt.selected });
          });
          return results;
        }
      }

      const candidateNodes = new Set<Element>();

      Array.from(node.querySelectorAll('option, [role="option"], [data-option-value], [data-select-value], [data-value]')).forEach((opt) => {
        if (isOptionCandidate(opt)) candidateNodes.add(opt);
      });

      if (className.includes('nice-select')) {
        Array.from((node as HTMLElement).querySelectorAll('.list .option')).forEach((opt) => {
          if (isOptionCandidate(opt)) candidateNodes.add(opt);
        });
      }

      if (candidateNodes.size === 0) {
        Array.from(node.querySelectorAll('li, div, span, button')).forEach((opt) => {
          if (isOptionCandidate(opt)) {
            candidateNodes.add(opt);
          }
        });
      }

      candidateNodes.forEach((opt) => pushOption(opt));

      return results;
    });

    if (open) {
      await locator.evaluate((n: any) => {
        if (n && n.classList && typeof n.classList.remove === 'function') {
          n.classList.remove('open');
        }
      }).catch(() => { });
      await page.keyboard.press('Escape').catch(() => { });
    }

    const unique: Array<{ value: string; label: string; selected: boolean; selector?: string }> = [];
    const seen = new Set<string>();

    for (const opt of options) {
      const key = `${opt.value}:::${opt.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(opt);
    }

    res.json({
      ok: true,
      data: {
        options: unique,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/direct-click', async (req: Request, res: Response) => {
  try {
    const { selector } = req.body as { selector?: string };
    if (!selector) {
      res.status(400).json({ ok: false, error: 'selector is required' });
      return;
    }

    const page = await pw.getPage();
    await executeDirectPageAction(page, 'click', selector);

    res.json({
      ok: true,
      data: {
        method: 'direct_click',
        selector,
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/direct-type', async (req: Request, res: Response) => {
  try {
    const { selector, value } = req.body as { selector?: string; value?: string };
    if (!selector) {
      res.status(400).json({ ok: false, error: 'selector is required' });
      return;
    }

    const page = await pw.getPage();
    await executeDirectPageAction(page, 'type', selector, value);

    res.json({
      ok: true,
      data: {
        method: 'direct_type',
        selector,
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/direct-select', async (req: Request, res: Response) => {
  try {
    const { selector, value } = req.body as { selector?: string; value?: string };
    if (!selector) {
      res.status(400).json({ ok: false, error: 'selector is required' });
      return;
    }

    const page = await pw.getPage();
    await executeDirectPageAction(page, 'select', selector, value);

    res.json({
      ok: true,
      data: {
        method: 'direct_select',
        selector,
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/direct-download', async (req: Request, res: Response) => {
  try {
    const { selector, value } = req.body as { selector?: string; value?: string };
    if (!selector) {
      res.status(400).json({ ok: false, error: 'selector is required' });
      return;
    }

    const page = await pw.getPage();
    await executeDirectPageAction(page, 'download', selector, value);

    res.json({
      ok: true,
      data: {
        method: 'direct_download',
        selector,
        url: page.url(),
        title: await page.title(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/run-flow', async (req: Request, res: Response) => {
  try {
    interface FlowStepShape {
      action?: string;
      target?: {
        cssSelector?: string;
        text?: string;
        label?: string;
        placeholder?: string;
        role?: string;
        tag?: string;
      };
      value?: string;
    }

    const body = req.body as {
      sessionId?: string;
      startUrl?: string;
      steps?: FlowStepShape[];
    };

    const sessionId = body.sessionId;
    const startUrl = body.startUrl;
    const steps = body.steps;

    if (!Array.isArray(steps) || steps.length === 0) {
      res.status(400).json({ ok: false, error: 'steps array is required' });
      return;
    }

    const page = await pw.getPage();
    
    if (startUrl && page.url() !== startUrl && !page.url().includes(startUrl)) {
      log.info({ current: page.url(), target: startUrl }, 'Navigating to startUrl before running flow');
      await pw.navigate(startUrl);
    }

    const memoryStore = getMemoryStore();
    const pageUrl = new URL(page.url());

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (!step) {
        res.json({
          ok: false,
          error: 'Missing flow step',
          data: { failedStepIndex: i }
        });
        return;
      }

      const action = step.action || 'click';
      const value = step.value || '';
      let selector = step.target?.cssSelector;

      log.info({ stepIndex: i, action, selector: selector || '(none)', target: step.target }, `Running flow step ${i + 1}/${steps.length}`);

      if (action === 'wait') {
        const timeout = 5000;
        const waitValue = value || (step.target ? step.target.text : '') || '';
        if (waitValue) {
          await page.waitForSelector(`text=${waitValue}`, { timeout }).catch(() => {});
        } else {
          await pw.waitForChange(timeout);
        }
        
        if (sessionId) {
          try {
            const session = getSession(sessionId);
            session.stepCount++;
          } catch { }
        }
        continue;
      }

      // If no CSS selector, try to resolve via locator engine using text/label/role
      if (!selector && step.target) {
        const target = step.target;
        const hasIdentifiers = target.text || target.label || target.placeholder || target.role;

        if (hasIdentifiers) {
          log.info({ stepIndex: i }, 'No cssSelector — falling back to locator engine');
          const locResult = await resolveLocator(page, {
            intent: `flow_step_${i}_${action}`,
            action,
            target: {
              text: target.text,
              label: target.label,
              placeholder: target.placeholder,
              role: target.role,
              tag: target.tag,
            },
            site: pageUrl.hostname,
          }, {
            lookup: (s, intent, pt) => memoryStore.recipes.lookup(s, intent, pt),
            markSuccess: (id) => memoryStore.recipes.markSuccess(id),
            markFailure: (id) => memoryStore.recipes.markFailure(id),
          });

          if (locResult.found && locResult.selector) {
            selector = locResult.selector;
            log.info({ stepIndex: i, resolvedSelector: selector, method: locResult.method }, 'Locator engine resolved selector');
          }
        }
      }

      if (!selector) {
        res.json({
          ok: false,
          error: `Step ${i + 1}: Could not resolve a selector. Element has no cssSelector, and locator engine could not find it by text/label/role.`,
          data: { failedStepIndex: i }
        });
        return;
      }

      try {
        await executeDirectPageAction(page, action, selector, value);

        // SPA settle time — wait for page to react before next step
        if (i < steps.length - 1) {
          await sleep(250);
          await pw.waitForChange(1200);
        } else {
          // It's the final step. Give the framework just an instant to process a click
          // before the dashboard forcefully scrapes the screen again.
          await sleep(150);
          await pw.waitForChange(500);
        }

        if (sessionId) {
          try {
            const session = getSession(sessionId);
            session.stepCount++;
          } catch { }
        }
      } catch (err: any) {
        log.error({ stepIndex: i, err: err.message, selector }, 'Flow step execution failed');
        res.json({
          ok: false,
          error: `Step ${i + 1} failed: ${err.message || 'Unknown error'}`,
          data: { failedStepIndex: i }
        });
        return;
      }
    }

    res.json({
      ok: true,
      data: { stepsExecuted: steps.length }
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message || 'Flow run failed' });
  }
});

router.post('/click', (req, res) =>
  handleAction(req, res, 'click', async (_page, selector) => {
    await pw.click(selector);
  })
);

router.post('/type', (req, res) =>
  handleAction(req, res, 'type', async (_page, selector, value) => {
    await pw.type(selector, value || '');
  })
);

router.post('/download', (req, res) =>
  handleAction(req, res, 'download', async (_page, selector, value) => {
    let opts: any = {};
    if (value) {
      try { 
        opts = JSON.parse(value); 
      } catch {
        opts.filename_template = value;
      }
    }
    await pw.download(selector, opts);
  })
);

router.post('/hover', (req, res) =>
  handleAction(req, res, 'hover', async (page, selector) => {
    await page.locator(selector).first().hover({ timeout: 5000 });
  })
);

router.post('/form-fill', async (req: Request, res: Response) => {
  try {
    const { fields, site } = req.body as {
      sessionId?: string;
      fields: { label?: string; placeholder?: string; name?: string; text?: string; value: string }[];
      site?: string;
    };

    if (!fields || !Array.isArray(fields)) {
      res.status(400).json({ ok: false, error: 'fields array is required' });
      return;
    }

    const page = await pw.getPage();
    const pageUrl = new URL(page.url());
    const siteHost = site || pageUrl.hostname;
    const results: any[] = [];

    for (const field of fields) {
      const target: TargetSpec = {
        label: field.label,
        placeholder: field.placeholder,
        text: field.text,
        cssSelector: field.name ? `[name="${field.name}"]` : undefined,
      };

      const locatorReq: LocatorRequest = {
        intent: `fill_${field.label || field.placeholder || field.name || 'field'}`,
        action: 'type',
        target,
        site: siteHost,
        value: field.value,
      };

      const memoryStore = getMemoryStore();
      const locResult = await resolveLocator(page, locatorReq, {
        lookup: (s, i, pt) => memoryStore.recipes.lookup(s, i, pt),
        markSuccess: (id) => memoryStore.recipes.markSuccess(id),
        markFailure: (id) => memoryStore.recipes.markFailure(id),
      });

      if (locResult.found && locResult.selector) {
        await pw.type(locResult.selector, field.value);
        results.push({ field: field.label || field.placeholder, ok: true, method: locResult.method });
      } else {
        results.push({ field: field.label || field.placeholder, ok: false, error: 'Could not resolve field' });
      }
    }

    res.json({ ok: results.every((r) => r.ok), results });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/scroll-to-element', async (req: Request, res: Response) => {
  try {
    const { target, direction, amount } = req.body as {
      target?: TargetSpec;
      direction?: string;
      amount?: number;
    };

    const page = await pw.getPage();

    if (target) {
      const memoryStore = getMemoryStore();
      const pageUrl = new URL(page.url());
      const locResult = await resolveLocator(
        page,
        {
          intent: 'scroll_to',
          action: 'scroll',
          target,
          site: pageUrl.hostname,
        },
        {
          lookup: (s, i, pt) => memoryStore.recipes.lookup(s, i, pt),
          markSuccess: (id) => memoryStore.recipes.markSuccess(id),
          markFailure: (id) => memoryStore.recipes.markFailure(id),
        }
      );

      if (locResult.found && locResult.selector) {
        await page.locator(locResult.selector).first().scrollIntoViewIfNeeded({ timeout: 5000 });
        res.json({ ok: true, method: locResult.method });
        return;
      }
    }

    await pw.scroll((direction === 'up' ? 'up' : 'down'), amount || 500);
    res.json({ ok: true, method: 'generic_scroll' });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/wait-for-condition', async (req: Request, res: Response) => {
  try {
    const { condition, timeout, text, selector } = req.body as {
      condition: 'url_change' | 'text_appears' | 'element_appears' | 'network_idle' | 'load';
      timeout?: number;
      text?: string;
      selector?: string;
    };

    const page = await pw.getPage();
    const timeoutMs = timeout || 10000;
    const urlBefore = page.url();

    switch (condition) {
      case 'url_change':
        await page.waitForURL((url) => url.toString() !== urlBefore, { timeout: timeoutMs }).catch(() => { });
        break;
      case 'text_appears':
        if (text) {
          await page.waitForSelector(`:has-text("${text}")`, { timeout: timeoutMs }).catch(() => { });
        }
        break;
      case 'element_appears':
        if (selector) {
          await page.waitForSelector(selector, { timeout: timeoutMs }).catch(() => { });
        }
        break;
      case 'network_idle':
        await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => { });
        break;
      case 'load':
      default:
        await page.waitForLoadState('load', { timeout: timeoutMs }).catch(() => { });
        break;
    }

    const urlAfter = page.url();
    res.json({
      ok: true,
      data: {
        urlChanged: urlBefore !== urlAfter,
        currentUrl: urlAfter,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/get-interactable-elements', async (_req: Request, res: Response) => {
  try {
    const page = await pw.getPage();
    const state = await extractPageState(page);
    res.json({
      ok: true,
      data: {
        url: state.url,
        title: state.title,
        elementCount: state.elements.length,
        elements: state.elements,
      },
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/validate-page-change', async (req: Request, res: Response) => {
  try {
    const { expectedUrl, expectedTitle, expectedText } = req.body as {
      expectedUrl?: string;
      expectedTitle?: string;
      expectedText?: string;
    };

    const page = await pw.getPage();
    const url = page.url();
    const title = await page.title();

    let valid = true;
    const checks: any[] = [];

    if (expectedUrl) {
      const urlMatch = url.includes(expectedUrl);
      checks.push({ check: 'url', expected: expectedUrl, actual: url, pass: urlMatch });
      if (!urlMatch) valid = false;
    }

    if (expectedTitle) {
      const titleMatch = title.toLowerCase().includes(expectedTitle.toLowerCase());
      checks.push({ check: 'title', expected: expectedTitle, actual: title, pass: titleMatch });
      if (!titleMatch) valid = false;
    }

    if (expectedText) {
      const hasText = await page.locator(`:has-text("${expectedText}")`).count().catch(() => 0);
      checks.push({ check: 'text', expected: expectedText, found: hasText > 0, pass: hasText > 0 });
      if (hasText === 0) valid = false;
    }

    res.json({ ok: true, data: { valid, url, title, checks } });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/press', (req, res) =>
  handleAction(req, res, 'press', async (_page, selector, value) => {
    await pw.press(selector, value || 'Enter');
  })
);

router.post('/select', (req, res) =>
  handleAction(req, res, 'select', async (_page, selector, value) => {
    await pw.select(selector, value || '');
  })
);

router.post('/extract', async (req: Request, res: Response) => {
  try {
    const { target } = req.body as { target: TargetSpec };
    const page = await pw.getPage();
    const memoryStore = getMemoryStore();
    const pageUrl = new URL(page.url());

    const locResult = await resolveLocator(
      page,
      {
        intent: 'extract_text',
        action: 'extract',
        target,
        site: pageUrl.hostname,
      },
      {
        lookup: (s, i, pt) => memoryStore.recipes.lookup(s, i, pt),
        markSuccess: (id) => memoryStore.recipes.markSuccess(id),
        markFailure: (id) => memoryStore.recipes.markFailure(id),
      }
    );

    if (locResult.found && locResult.selector) {
      const text = await pw.extract(locResult.selector);
      res.json({ ok: true, data: { value: text }, method: locResult.method });
    } else {
      res.status(404).json({ ok: false, error: 'Could not resolve target for extraction' });
    }
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/screenshot', async (_req: Request, res: Response) => {
  try {
    const data = await pw.screenshot();
    res.setHeader('Content-Type', 'image/png');
    res.end(data, 'binary');
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
