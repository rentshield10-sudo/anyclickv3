import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getMemoryStore } from '../memory/MemoryStore';
import { v4 as uuidv4 } from 'uuid';
import * as pw from '../engine/playwright';
import { createLogger } from '../utils/logger';
import { broadcastLog } from '../utils/events';

const router = Router();
const log = createLogger('flow-routes');
let flowRunQueue: Promise<void> = Promise.resolve();

function normalizeFlowVariables(flow: any) {
  if (!flow) return;
  if (!flow.variables) flow.variables = {};

  if (Array.isArray(flow.locators)) {
    for (const step of flow.locators) {
      if (step.input?.kind === 'template' && typeof step.input.template === 'string') {
        const match = step.input.template.match(/\{\{([^}]+)\}\}/);
        if (match) {
          const varName = match[1].trim();
          if (!flow.variables[varName]) {
            flow.variables[varName] = {
              type: 'text',
              required: false,
            };
          }
        }
      }
    }
  }
}

function normalizeUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '');
}

function isBlankLikeUrl(url: string): boolean {
  const u = String(url || '').trim().toLowerCase();
  return !u || u === 'about:blank' || u === 'chrome://newtab/' || u === 'chrome://new-tab-page/';
}

function isLikelyLoginUrl(url: string): boolean {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('id.myaccount.pseg.com') ||
    u.includes('/user/login') ||
    u.includes('/signin') ||
    u.includes('/authorize') ||
    u.includes('/oauth2/')
  );
}

function inferRecoveryStartUrl(flow: any): string {
  const recorded = normalizeUrl(String(flow?.startUrl || ''));
  const locators = Array.isArray(flow?.locators) ? flow.locators : [];

  const hasFindAccountInput = locators.some((s: any) =>
    String(s?.selector || '').includes('#findAccountInput')
  );
  const hasFindAccountEntry = locators.some((s: any) =>
    String(s?.selector || '').includes('Find an Account')
  );

  if (hasFindAccountInput || hasFindAccountEntry) {
    return 'https://nj.myaccount.pseg.com/dashboard/selectaccount';
  }

  return recorded;
}

async function collectSelectorState(page: any, selector?: string | null) {
  if (!selector) {
    return {
      selector: null,
      count: null,
      visible: null,
      attached: null,
      enabled: null,
      disabledAttr: null,
      ariaDisabled: null,
      textPreview: null,
    };
  }

  try {
    const loc = page.locator(selector);
    const count = await loc.count().catch(() => null);

    let visible: boolean | null = null;
    let attached: boolean | null = null;
    let enabled: boolean | null = null;
    let disabledAttr: string | null = null;
    let ariaDisabled: string | null = null;
    let textPreview: string | null = null;

    if (count && count > 0) {
      attached = true;
      visible = await loc.first().isVisible().catch(() => null);
      enabled = await loc.first().isEnabled().catch(() => null);
      disabledAttr = await loc.first().getAttribute('disabled').catch(() => null);
      ariaDisabled = await loc.first().getAttribute('aria-disabled').catch(() => null);
      textPreview = await loc.first().textContent().catch(() => null);
      if (typeof textPreview === 'string') {
        textPreview = textPreview.slice(0, 150);
      }
    } else {
      attached = false;
    }

    return {
      selector,
      count,
      visible,
      attached,
      enabled,
      disabledAttr,
      ariaDisabled,
      textPreview,
    };
  } catch (err: any) {
    return {
      selector,
      count: null,
      visible: null,
      attached: null,
      enabled: null,
      disabledAttr: null,
      ariaDisabled: null,
      textPreview: null,
      error: err?.message || String(err),
    };
  }
}

async function logPageSnapshot(
  page: any,
  meta: Record<string, any>,
  message: string,
  selector?: string | null
) {
  let title: string | null = null;
  let url: string | null = null;
  let selectorState: any = null;

  try {
    url = page.url();
  } catch {
    url = '(unavailable)';
  }

  try {
    title = await page.title().catch(() => null);
  } catch {
    title = null;
  }

  if (selector) {
    selectorState = await collectSelectorState(page, selector);
  }

  const payload = {
    ...meta,
    url,
    title,
    selectorState,
  };

  log.info(payload, message);
  broadcastLog('info', message, payload);
}

async function ensurePageReadyForFlowStart(params: {
  page: any;
  flow: any;
  run_id: string;
  flowId: string;
}) {
  const { page, flow, run_id, flowId } = params;

  const title = await page.title().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const lowerTitle = String(title || '').toLowerCase();
  const lowerBody = String(bodyText || '').toLowerCase();

  const firstStepSelector =
    Array.isArray(flow?.locators) && flow.locators.length > 0
      ? flow.locators[0]?.selector || null
      : null;

  const firstStepState = firstStepSelector
    ? await collectSelectorState(page, firstStepSelector)
    : null;

  const serviceUnavailable =
    lowerTitle.includes('service unavailable') ||
    lowerBody.includes('http error 503') ||
    lowerBody.includes('the service is unavailable');

  log.info(
    {
      run_id,
      flowId,
      title,
      serviceUnavailable,
      firstStepSelector,
      firstStepState,
      currentUrl: page.url(),
    },
    'Flow start readiness check'
  );
  broadcastLog('info', 'Flow start readiness check', {
    run_id,
    flowId,
    title,
    serviceUnavailable,
    firstStepSelector,
    firstStepState,
    currentUrl: page.url(),
  });

  if (serviceUnavailable) {
    throw new Error(`Start page is unavailable (503). Current URL: ${page.url()}`);
  }

  if (firstStepSelector) {
    const ready =
      !!firstStepState?.count &&
      firstStepState.count > 0 &&
      firstStepState.visible !== false;

    if (!ready) {
      throw new Error(
        `Start page not ready for first step. Missing or hidden selector: ${firstStepSelector}. Current URL: ${page.url()}`
      );
    }
  }
}

async function waitForHumanLoginIfNeeded(
  page: any,
  meta: { run_id: string; flowId: string; timeoutMs?: number }
) {
  const timeoutMs = Number(meta.timeoutMs || 180000);
  let currentUrl = '';

  try {
    currentUrl = page.url();
  } catch {
    currentUrl = '';
  }

  if (!isLikelyLoginUrl(currentUrl)) {
    return;
  }

  log.info(
    {
      ...meta,
      currentUrl,
      timeoutMs,
    },
    'Login page detected, waiting for human login'
  );
  broadcastLog('info', 'Login page detected, waiting for human login', {
    ...meta,
    currentUrl,
    timeoutMs,
  });

  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    await page.waitForTimeout(1500).catch(() => { });
    try {
      currentUrl = page.url();
    } catch {
      currentUrl = '';
    }

    if (!isLikelyLoginUrl(currentUrl)) {
      log.info(
        {
          ...meta,
          currentUrl,
          elapsedMs: Date.now() - started,
        },
        'Human login appears complete'
      );
      broadcastLog('info', 'Human login appears complete', {
        ...meta,
        currentUrl,
        elapsedMs: Date.now() - started,
      });
      return;
    }
  }

  throw new Error(`Still on login page after waiting ${timeoutMs}ms: ${currentUrl}`);
}

function resolveRuntimeStepValue(step: any, inputs: Record<string, any>) {
  let resolvedValue = step.value ?? '';
  let templateVarName: string | null = null;
  let valueSource = 'recorded_value';

  if (step.input?.kind === 'template' && typeof step.input.template === 'string') {
    const match = step.input.template.match(/\{\{([^}]+)\}\}/);
    if (match) {
      templateVarName = match[1].trim();

      if (
        inputs[templateVarName] !== undefined &&
        inputs[templateVarName] !== null &&
        String(inputs[templateVarName]) !== ''
      ) {
        resolvedValue = String(inputs[templateVarName]);
        valueSource = `template_input:${templateVarName}`;
      } else if (step.input.default_value !== undefined) {
        resolvedValue = String(step.input.default_value);
        valueSource = `template_default:${templateVarName}`;
      } else if (step.value !== undefined) {
        resolvedValue = String(step.value);
        valueSource = `template_fallback_recorded:${templateVarName}`;
      }
    }

    return { resolvedValue, templateVarName, valueSource };
  }

  if (step.action === 'type' || step.action === 'select') {
    const explicitKeys = [
      step.input?.name,
      step.input?.key,
      step.input?.variable,
      step.variableName,
    ].filter(Boolean);

    for (const key of explicitKeys) {
      if (inputs[key] !== undefined && inputs[key] !== null && String(inputs[key]) !== '') {
        resolvedValue = String(inputs[key]);
        valueSource = `explicit_input:${key}`;
        return { resolvedValue, templateVarName, valueSource };
      }
    }

    const selector = String(step.selector || '').toLowerCase();
    const heuristicKeys: string[] = [];

    if (selector.includes('account')) {
      heuristicKeys.push('account_number', 'accountNumber', 'account', 'acct', 'accountNo');
    }
    if (selector.includes('find') || selector.includes('search')) {
      heuristicKeys.push('search', 'search_text', 'query');
    }

    heuristicKeys.push('text', 'value', 'input', 'string');

    for (const key of heuristicKeys) {
      if (inputs[key] !== undefined && inputs[key] !== null && String(inputs[key]) !== '') {
        resolvedValue = String(inputs[key]);
        valueSource = `heuristic_input:${key}`;
        return { resolvedValue, templateVarName, valueSource };
      }
    }

    const nonEmptyEntries = Object.entries(inputs).filter(
      ([, v]) => v !== undefined && v !== null && String(v) !== ''
    );

    if (nonEmptyEntries.length === 1) {
      resolvedValue = String(nonEmptyEntries[0][1]);
      valueSource = `single_input_override:${nonEmptyEntries[0][0]}`;
      return { resolvedValue, templateVarName, valueSource };
    }
  }

  return { resolvedValue, templateVarName, valueSource };
}

function rewriteRuntimeSelector(step: any, inputs: Record<string, any>) {
  const original = String(step?.selector || '');

  if (!original || step?.action !== 'click') {
    return original;
  }

  const accountNumber =
    inputs.account_number ??
    inputs.accountNumber ??
    inputs.account ??
    inputs.acct ??
    inputs.accountNo ??
    null;

  if (original.includes('radioCntAccount') && accountNumber !== null && accountNumber !== undefined) {
    const accountStr = String(accountNumber).trim();
    if (accountStr) {
      return `label[for*="${accountStr}"]`;
    }
  }

  // Convert brittle saved card selectors into visible-text selectors
  if (original.includes('[data-value=') && original.includes(':has-text(')) {
    const match = original.match(/:has-text\("([^"]+)"\)/);
    if (match?.[1]) {
      const visibleText = match[1].trim();
      return `ul.list li:has-text("${visibleText}")`;
    }
  }

  return original;
}

function buildHumanHelpResponse(params: {
  flowId: string;
  run_id: string;
  step_id: string;
  step_index: number;
  selector: string | null;
  reason: string;
  current_url: string;
  extra?: Record<string, any>;
}) {
  return {
    success: false,
    needs_human_help: true,
    repair_type: 'selector',
    flow_id: params.flowId,
    run_id: params.run_id,
    step_id: params.step_id,
    step_index: params.step_index,
    selector: params.selector,
    reason: params.reason,
    current_url: params.current_url,
    ...params.extra,
  };
}

async function tryAutoHealSelector(step: any, page: any, inputs: Record<string, any>) {
  const selector = String(step.selector || '');
  const candidates: string[] = [];

  const accountNumber =
    inputs.account_number ??
    inputs.accountNumber ??
    inputs.account ??
    inputs.acct ??
    inputs.accountNo ??
    null;

  if (selector.includes('radioCntAccount') && accountNumber) {
    const accountStr = String(accountNumber).trim();
    candidates.push(`label[for*="${accountStr}"]`);
    candidates.push(`label:has-text("${accountStr}")`);
    candidates.push(`text="${accountStr}"`);
  }

  if (selector.includes('[data-value=') && selector.includes(':has-text(')) {
    const match = selector.match(/:has-text\("([^"]+)"\)/);
    if (match?.[1]) {
      const visibleText = match[1].trim();
      candidates.push(`ul.list li:has-text("${visibleText}")`);
      candidates.push(`text="${visibleText}"`);
    }
  }

  for (const candidate of candidates) {
    const state = await collectSelectorState(page, candidate);
    log.info(
      {
        originalSelector: selector,
        candidate,
        state,
      },
      'Auto-heal candidate check'
    );

    if (state.count && state.count > 0 && state.visible) {
      return {
        healed: true,
        selector: candidate,
        confidence: 'high',
      };
    }
  }

  return { healed: false };
}

async function waitForEnabled(page: any, selector: string, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const state = await collectSelectorState(page, selector);
    const enabled =
      !!state.count &&
      !!state.visible &&
      state.enabled !== false &&
      state.disabledAttr === null &&
      state.ariaDisabled !== 'true';

    if (enabled) {
      return { ok: true, state };
    }

    await page.waitForTimeout(250).catch(() => { });
  }

  return {
    ok: false,
    state: await collectSelectorState(page, selector),
  };
}

async function waitForVisible(page: any, selector: string, timeoutMs = 8000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const state = await collectSelectorState(page, selector);
    if (state.count && state.count > 0 && state.visible) {
      return { ok: true, state };
    }
    await page.waitForTimeout(250).catch(() => { });
  }

  return {
    ok: false,
    state: await collectSelectorState(page, selector),
  };
}

async function waitForUrlMatch(page: any, matchers: string[], timeoutMs = 10000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const currentUrl = normalizeUrl(page.url());
    if (matchers.some((m) => currentUrl.includes(m))) {
      return { ok: true, currentUrl };
    }
    await page.waitForTimeout(250).catch(() => { });
  }

  return { ok: false, currentUrl: normalizeUrl(page.url()) };
}

function isAccountSearchFlow(flow: any) {
  const locators = Array.isArray(flow?.locators) ? flow.locators : [];
  return locators.some((s: any) => String(s?.selector || '').includes('#findAccountInput'));
}

async function verifyCriticalPostClick(params: {
  page: any;
  flow: any;
  step: any;
  step_id: string;
  step_index: number;
  run_id: string;
  flowId: string;
  selectorUsed: string;
}) {
  const { page, flow, step_id, step_index, run_id, flowId, selectorUsed } = params;
  const selector = String(selectorUsed || '');

  if (
    selector.includes('radioCntAccount') ||
    selector.includes('label:has-text(') ||
    selector.includes('[for*=')
  ) {
    const result = await waitForEnabled(page, '#btnSwitchSelectedAccount', 10000);

    log.info(
      {
        run_id,
        flowId,
        step_id,
        step_index,
        validation: 'switch_button_enabled_after_account_select',
        result,
      },
      'Post-click validation'
    );
    broadcastLog('info', 'Post-click validation', {
      run_id,
      flowId,
      step_id,
      step_index,
      validation: 'switch_button_enabled_after_account_select',
      result,
    });

    return result.ok
      ? { ok: true }
      : {
        ok: false,
        reason: 'Account row click did not enable Switch to Selected Account button',
        extra: {
          expected_selector: '#btnSwitchSelectedAccount',
          expected_state: result.state,
        },
      };
  }

  if (selector === '#btnSwitchSelectedAccount') {
    const menuResult = await waitForVisible(page, '#dropdownMenu1', 12000);
    if (menuResult.ok) {
      return { ok: true };
    }

    const urlResult = await waitForUrlMatch(page, ['myaccountdashboard', 'SelectAccountPage=1'], 12000);

    log.info(
      {
        run_id,
        flowId,
        step_id,
        step_index,
        validation: 'dashboard_loaded_after_switch',
        menuResult,
        urlResult,
      },
      'Post-click validation'
    );
    broadcastLog('info', 'Post-click validation', {
      run_id,
      flowId,
      step_id,
      step_index,
      validation: 'dashboard_loaded_after_switch',
      menuResult,
      urlResult,
    });

    return urlResult.ok
      ? { ok: true }
      : {
        ok: false,
        reason: 'Switch account click did not reach dashboard state',
        extra: {
          dropdown_state: menuResult.state,
          current_url: urlResult.currentUrl,
        },
      };
  }

  if (selector === '#dropdownMenu1') {
    const downloadResult = await waitForVisible(page, '#lnkDownloadThisBill', 8000);
    const payResult = await waitForVisible(page, '#lnkPayBill', 8000);

    return downloadResult.ok || payResult.ok
      ? { ok: true }
      : {
        ok: false,
        reason: 'Dropdown click did not reveal bill/payment controls',
        extra: {
          download_state: downloadResult.state,
          pay_state: payResult.state,
        },
      };
  }

  if (selector === 'div.ccSelect' || selector.includes('Credit/ Debit Card')) {
    const listResult = await waitForVisible(page, 'ul.list', 8000);
    return listResult.ok
      ? { ok: true }
      : {
        ok: false,
        reason: 'Payment method click did not reveal the payment list',
        extra: { list_state: listResult.state },
      };
  }

  if (
    selector.includes('ul.list li:has-text(') ||
    selector.startsWith('text="') ||
    selector.startsWith("text='")
  ) {
    return { ok: true };
  }

  if (selector === '#payBillContinueBtn') {
    const beforeUrl = normalizeUrl(page.url());
    const beforeTitle = await page.title().catch(() => '');

    const started = Date.now();
    while (Date.now() - started < 10000) {
      const currentUrl = normalizeUrl(page.url());
      const currentTitle = await page.title().catch(() => '');
      const btnState = await collectSelectorState(page, '#payBillContinueBtn');

      const changed =
        currentUrl !== beforeUrl ||
        currentTitle !== beforeTitle ||
        !btnState.count ||
        btnState.visible === false ||
        btnState.enabled === false ||
        btnState.disabledAttr !== null ||
        btnState.ariaDisabled === 'true';

      if (changed) {
        return { ok: true, currentUrl, currentTitle, btnState };
      }

      await page.waitForTimeout(250).catch(() => { });
    }

    const finalBtnState = await collectSelectorState(page, '#payBillContinueBtn');
    return {
      ok: false,
      reason: 'Continue click did not change page state',
      extra: {
        beforeUrl,
        beforeTitle,
        currentUrl: normalizeUrl(page.url()),
        currentTitle: await page.title().catch(() => ''),
        btn_state: finalBtnState,
      },
    };
  }

  if (isAccountSearchFlow(flow)) {
    return { ok: true };
  }

  return { ok: true };
}

function softFail(res: Response, payload: any) {
  return res.json(payload);
}

async function clickPermissive(page: any, selector: string) {
  const loc = page.locator(selector).first();
  await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => { });
  await loc.click({ timeout: 2000 }).catch(async () => {
    await loc.click({ force: true, timeout: 1500 }).catch(async () => {
      await loc.evaluate((node: HTMLElement) => node.click()).catch(() => { });
    });
  });
  await pw.waitForChange(500);
}

// 1. GET /flows
router.get('/', (req, res) => {
  const store = getMemoryStore();
  const flows = store.recipes.getAll();
  res.json({ success: true, count: flows.length, flows });
});

router.get('/file', (req: Request, res: Response) => {
  try {
    const relPath = String(req.query.path || '');
    if (!relPath) {
      return res.status(400).json({
        success: false,
        error: 'Missing path',
      });
    }

    const absPath = path.resolve(process.cwd(), relPath);

    if (!fs.existsSync(absPath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    return res.sendFile(absPath);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 2. GET /flows/:flowId
router.get('/:flowId', (req, res) => {
  const store = getMemoryStore();
  const flow = store.recipes.getById(req.params.flowId);
  if (!flow) {
    res.status(404).json({ success: false, error: 'Flow not found' });
    return;
  }
  res.json({ success: true, flow });
});

// 3. POST /flows
router.post('/', (req, res) => {
  const store = getMemoryStore();
  normalizeFlowVariables(req.body);
  const newFlow = store.recipes.save(req.body);
  res.json({ success: true, flow: newFlow });
});

// 4. PUT /flows/:flowId
router.put('/:flowId', (req, res) => {
  const store = getMemoryStore();
  normalizeFlowVariables(req.body);
  const updated = store.recipes.update(req.params.flowId, req.body);
  if (!updated) {
    res.status(404).json({ success: false, error: 'Flow not found' });
    return;
  }
  res.json({ success: true, flow: updated });
});

// 5. POST /flows/:flowId/duplicate
router.post('/:flowId/duplicate', (req, res) => {
  const store = getMemoryStore();
  const existing = store.recipes.getById(req.params.flowId);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Flow not found' });
    return;
  }

  const duplicated: any = JSON.parse(JSON.stringify(existing));
  delete duplicated.id;
  duplicated.source_flow_id = req.params.flowId;
  duplicated.name = (existing.name || existing.intent) + ' (Copy)';
  duplicated.version = 1;
  duplicated.successCount = 0;
  duplicated.failureCount = 0;

  const saved = store.recipes.save(duplicated);
  res.json({ success: true, flow: saved });
});

// 6. POST /flows/:flowId/repair/start-url
router.post('/:flowId/repair/start-url', async (req: Request, res: Response) => {
  try {
    const store = getMemoryStore();
    const flowId = req.params.flowId;
    const flow = store.recipes.getById(flowId);

    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

    const page = await pw.getPage();
    const currentUrl = page.url();
    const updated = store.recipes.update(flowId, {
      ...flow,
      startUrl: currentUrl,
    });

    res.json({
      success: true,
      flow_id: flowId,
      old_start_url: flow.startUrl || null,
      new_start_url: currentUrl,
      flow: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 7. POST /flows/:flowId/repair/step/:stepId
router.post('/:flowId/repair/step/:stepId', async (req: Request, res: Response) => {
  try {
    const store = getMemoryStore();
    const flowId = req.params.flowId;
    const stepId = req.params.stepId;
    const { selector, value, input } = req.body || {};
    const flow = store.recipes.getById(flowId);

    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found' });
      return;
    }

    const locators = Array.isArray(flow.locators) ? [...flow.locators] : [];
    const idx = locators.findIndex((s: any) => (s.step_id || '') === stepId);

    if (idx < 0) {
      res.status(404).json({ success: false, error: 'Step not found' });
      return;
    }

    locators[idx] = {
      ...locators[idx],
      ...(selector ? { selector } : {}),
      ...(value !== undefined ? { value } : {}),
      ...(input !== undefined ? { input } : {}),
    };

    const updated = store.recipes.update(flowId, {
      ...flow,
      locators,
    });

    res.json({
      success: true,
      flow_id: flowId,
      step_id: stepId,
      updated_step: locators[idx],
      flow: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || String(err) });
  }
});

// 8. POST /flows/:flowId/run
router.post('/:flowId/run', async (req: Request, res: Response) => {
  let release!: () => void;

  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });

  const previous = flowRunQueue;
  flowRunQueue = previous.then(() => turn);

  await previous;

  try {
    const run_id = `run_${uuidv4().replace(/-/g, '')}`;
    const store = getMemoryStore();
    const flowId = req.params.flowId;

    log.info(
      {
        run_id,
        flowId,
        requestMethod: req.method,
        requestPath: req.originalUrl,
        requestBody: req.body,
      },
      'RUN endpoint hit'
    );
    broadcastLog('info', 'RUN endpoint hit', {
      run_id,
      flowId,
      requestMethod: req.method,
      requestPath: req.originalUrl,
      requestBody: req.body,
    });

    const flow = store.recipes.getById(flowId);

    if (!flow) {
      log.error({ run_id, flowId }, 'Flow not found in Memory Bank');
      res.status(404).json({ success: false, error: 'Flow not found in Memory Bank' });
      return;
    }

    const recordedStartUrl = normalizeUrl(String(flow.startUrl || ''));
    const recoveryStartUrl = normalizeUrl(inferRecoveryStartUrl(flow));

    log.info(
      {
        run_id,
        flowId,
        loadedFlow: {
          id: flow.id,
          name: flow.name,
          intent: (flow as any).intent,
          recordedStartUrl,
          recoveryStartUrl,
          startSelector: (flow as any).startSelector,
          locatorCount: Array.isArray(flow.locators) ? flow.locators.length : 0,
        },
      },
      'Loaded flow from memory'
    );
    broadcastLog('info', 'Loaded flow from memory', {
      run_id,
      flowId,
      loadedFlow: {
        id: flow.id,
        name: flow.name,
        intent: (flow as any).intent,
        recordedStartUrl,
        recoveryStartUrl,
        locatorCount: Array.isArray(flow.locators) ? flow.locators.length : 0,
      },
    });

    const inputs = req.body.inputs || {};
    const inputKeys = Object.keys(inputs);
    log.info({ run_id, flowId, inputs: inputKeys, inputsRaw: inputs }, 'Flow run started');
    broadcastLog('info', 'Flow run started', { run_id, flowId, inputs: inputKeys, inputsRaw: inputs });

    if (flow.variables) {
      for (const [key, def] of Object.entries(flow.variables)) {
        let val = (inputs as any)[key];

        if (val === undefined && Array.isArray(flow.locators)) {
          const stepWithDefault = flow.locators.find((s: any) =>
            s.input?.kind === 'template' &&
            s.input.template.includes(`{{${key}}}`) &&
            s.input.default_value !== undefined
          );
          if (stepWithDefault && stepWithDefault.input) {
            val = stepWithDefault.input.default_value;
          }
        }

        if ((def as any).required && val === undefined) {
          res.status(400).json({ success: false, error: `Missing required variable: ${key}` });
          return;
        }

        if (val !== undefined) {
          if ((def as any).type === 'number' && typeof val !== 'number') {
            res.status(400).json({ success: false, error: `Variable ${key} must be a number` });
            return;
          }

          if ((def as any).type === 'text' && typeof val !== 'string') {
            res.status(400).json({ success: false, error: `Variable ${key} must be a string` });
            return;
          }
        }
      }
    }

    let page = await pw.getPage();
    const currentBrowserUrl = normalizeUrl(page.url());
    const browserBlank = isBlankLikeUrl(currentBrowserUrl);

    await logPageSnapshot(
      page,
      {
        run_id,
        flowId,
        recordedStartUrl,
        recoveryStartUrl,
        currentBrowserUrl,
        browserBlank,
      },
      'Pre-step browser URL check'
    );

    if (recoveryStartUrl) {
      const alreadyAtRecoveryUrl =
        currentBrowserUrl === recoveryStartUrl || currentBrowserUrl.startsWith(recoveryStartUrl);

      log.info(
        {
          run_id,
          flowId,
          decision: alreadyAtRecoveryUrl ? 'skip_navigate' : 'navigate_to_recoveryStartUrl',
          recordedStartUrl,
          recoveryStartUrl,
          currentBrowserUrl,
          browserBlank,
          alreadyAtRecoveryUrl,
        },
        'Pre-step navigation decision'
      );
      broadcastLog('info', 'Pre-step navigation decision', {
        run_id,
        flowId,
        decision: alreadyAtRecoveryUrl ? 'skip_navigate' : 'navigate_to_recoveryStartUrl',
        recordedStartUrl,
        recoveryStartUrl,
        currentBrowserUrl,
        browserBlank,
        alreadyAtRecoveryUrl,
      });

      if (!alreadyAtRecoveryUrl || browserBlank) {
        await pw.navigate(recoveryStartUrl);
        page = await pw.getPage();

        await waitForHumanLoginIfNeeded(page, {
          run_id,
          flowId,
          timeoutMs: Number(req.body.loginTimeoutMs || 180000),
        });

        const afterLoginUrl = normalizeUrl(page.url());
        const atRecoveryAfterLogin =
          afterLoginUrl === recoveryStartUrl || afterLoginUrl.startsWith(recoveryStartUrl);

        if (!atRecoveryAfterLogin) {
          await pw.navigate(recoveryStartUrl);
          page = await pw.getPage();
        }

        await page.waitForLoadState('domcontentloaded').catch(() => { });
        await page.waitForTimeout(1000);

        await logPageSnapshot(
          page,
          {
            run_id,
            flowId,
            navigateTarget: recoveryStartUrl,
          },
          'Post-navigation page snapshot'
        );

        await ensurePageReadyForFlowStart({
          page,
          flow,
          run_id,
          flowId,
        });
      }
    }

    const results: any[] = [];

    for (let i = 0; i < flow.locators.length; i++) {
      const step = flow.locators[i];
      const step_id = step.step_id || `step_${i.toString().padStart(3, '0')}`;
      const actionType = step.action || 'click';
      const originalSelector = step.selector || null;
      let selector = originalSelector;

      const { resolvedValue, templateVarName, valueSource } = resolveRuntimeStepValue(step, inputs);

      if (actionType === 'click' && selector) {
        selector = rewriteRuntimeSelector(step, inputs);
      }

      await logPageSnapshot(
        page,
        {
          run_id,
          flowId,
          step_index: i,
          step_id,
          action: actionType,
          selector,
          originalSelector,
          rawStepValue: step.value,
          resolvedValueToType: resolvedValue,
          templateVarName,
          valueSource,
          inputForTemplate: templateVarName ? (inputs as any)[templateVarName] : undefined,
          waitConfig: step.wait,
          downloadConfig: step.download,
        },
        'Flow step start snapshot',
        selector
      );

      try {
        const action = step.action || 'click';
        if (action !== 'wait' && !selector) throw new Error('Missing selector on step');

        if (action === 'wait') {
          const waitKind = step.wait?.kind || 'idle';
          const timeout = step.wait?.timeout_ms || 5000;
          let waitText = step.wait?.text || step.value || resolvedValue || '';

          if (step.wait?.text?.includes('{{')) {
            const match = step.wait.text.match(/\{\{([^}]+)\}\}/);
            if (match) {
              const varName = match[1].trim();
              if ((inputs as any)[varName] !== undefined) waitText = String((inputs as any)[varName]);
            }
          }

          if (waitKind === 'text_appears' && waitText) {
            await page.waitForSelector(`text=${waitText}`, { timeout }).catch(() => { });
          } else if (waitKind === 'selector_appears' && step.wait?.selector) {
            await page.waitForSelector(step.wait.selector, { timeout }).catch(() => { });
          } else if (waitKind === 'selector_disappears' && step.wait?.selector) {
            await page
              .waitForSelector(step.wait.selector, { state: 'hidden', timeout })
              .catch(() => { });
          } else if (waitKind === 'delay') {
            await page.waitForTimeout(timeout);
          } else {
            await pw.waitForChange(timeout);
          }
        } else if (action === 'type' || action === 'click' || action === 'select') {
          let selectorState = await collectSelectorState(page, selector);

          if ((!selectorState.count || selectorState.count === 0 || !selectorState.visible) && action === 'click') {
            const healed = await tryAutoHealSelector(step, page, inputs);
            if (healed.healed && healed.selector) {
              selector = healed.selector;
              selectorState = await collectSelectorState(page, selector);

              log.info(
                {
                  run_id,
                  flowId,
                  step_id,
                  originalSelector,
                  healedSelector: selector,
                  confidence: healed.confidence,
                },
                'Auto-heal applied for click step'
              );
              broadcastLog('info', 'Auto-heal applied for click step', {
                run_id,
                flowId,
                step_id,
                originalSelector: step.selector,
                healedSelector: selector,
                confidence: healed.confidence,
              });
            }
          }

          if (!selectorState.count || selectorState.count === 0) {
            return softFail(
              res,
              buildHumanHelpResponse({
                flowId,
                run_id,
                step_id,
                step_index: i,
                selector,
                reason: 'Selector not found on page',
                current_url: page.url(),
                extra: {
                  original_selector: step.selector || null,
                  selector_state: selectorState,
                },
              })
            );
          }

          if (action === 'type') {
            await pw.simulateCursor(selector, 'type');
            await pw.type(selector, resolvedValue);
          } else if (action === 'click') {
            await pw.simulateCursor(selector, 'click');
            await clickPermissive(page, selector);

            const postCheck = await verifyCriticalPostClick({
              page,
              flow,
              step,
              step_id,
              step_index: i,
              run_id,
              flowId,
              selectorUsed: selector,
            });

            if (!postCheck.ok) {
              log.warn(
                {
                  run_id,
                  flowId,
                  step_id,
                  selector,
                  reason: postCheck.reason,
                  extra: postCheck.extra || null,
                },
                'Post-click validation did not pass; continuing permissively'
              );
              broadcastLog('warn', 'Post-click validation did not pass; continuing permissively', {
                run_id,
                flowId,
                step_id,
                selector,
                reason: postCheck.reason,
                extra: postCheck.extra || null,
              });
            }
          } else if (action === 'select') {
            await pw.simulateCursor(selector, 'select');
            await pw.select(selector, resolvedValue);
          }
        } else if (action === 'download') {
          const selectorState = await collectSelectorState(page, selector);

          if (!selectorState.count || selectorState.count === 0) {
            return softFail(
              res,
              buildHumanHelpResponse({
                flowId,
                run_id,
                step_id,
                step_index: i,
                selector,
                reason: 'Download selector not found on page',
                current_url: page.url(),
                extra: { selector_state: selectorState },
              })
            );
          }

          const dlOpts = { ...(step.download || {}) };
          const filenameTpl = dlOpts.filename_template || resolvedValue || '';

          if (filenameTpl) {
            dlOpts.filename_template = filenameTpl;
          } else {
            delete dlOpts.filename_template;
          }

          if (dlOpts.filename_template && dlOpts.filename_template.includes('{{')) {
            dlOpts.filename_template = dlOpts.filename_template.replace(
              /\{\{([^}]+)\}\}/g,
              (_: string, key: string) => {
                const v = (inputs as any)[key.trim()];
                return v !== undefined ? String(v) : '';
              }
            );
          }

          const result = await pw.download(selector, dlOpts);

          await logPageSnapshot(
            page,
            {
              run_id,
              flowId,
              step_id,
              selector,
              downloadResult: result,
            },
            'Flow step download success snapshot'
          );

          results.push({ step_id, success: true, selector_used: selector, download: result });
          continue;
        } else {
          throw new Error(`Unsupported action: ${action}`);
        }

        await logPageSnapshot(
          page,
          {
            run_id,
            flowId,
            step_index: i,
            step_id,
            action,
            selector_used: selector,
          },
          'Flow step success snapshot',
          selector
        );

        results.push({ step_id, success: true, selector_used: selector });
      } catch (err: any) {
        await logPageSnapshot(
          page,
          {
            run_id,
            flowId,
            step_index: i,
            step_id,
            action: actionType,
            selector,
            error: err?.message || String(err),
          },
          'Flow step failure snapshot',
          selector
        );

        const lastSaved = pw.getLastSavedDownload?.();
        const pdf_path =
          lastSaved?.saved_path && String(lastSaved.saved_path).toLowerCase().endsWith('.pdf')
            ? lastSaved.saved_path
            : null;

        return res.json({
          success: false,
          flow_id: flowId,
          run_id,
          steps_executed: results.length,
          inputs_used: inputs,
          pdf_path,
          current_url: page.url(),
          results,
          error: err.message,
        });
      }
    }

    await logPageSnapshot(
      page,
      {
        run_id,
        flowId,
        stepsExecuted: results.length,
      },
      'Flow run completed snapshot'
    );

    const lastSaved = pw.getLastSavedDownload?.();
    const pdf_path =
      lastSaved?.saved_path && String(lastSaved.saved_path).toLowerCase().endsWith('.pdf')
        ? lastSaved.saved_path
        : null;

    res.status(200).json({
      success: true,
      message: "Flow completed successfully",
      flow_id: flowId,
      run_id: run_id,
      steps_executed: results.length,
      inputs_used: inputs,
      pdf_path: pdf_path,
      current_url: page.url(),
      results: results,
    });
  } catch (err: any) {
    log.error(
      {
        error: err?.message || String(err),
        stack: err?.stack,
      },
      'Unhandled /run error'
    );

    if (!res.headersSent) {
      res.json({ success: false, error: err.message });
    }
  } finally {
    release();
  }
});

export default router;