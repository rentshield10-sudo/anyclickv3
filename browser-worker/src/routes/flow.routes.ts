import { Router, Request, Response } from 'express';
import { getMemoryStore } from '../memory/MemoryStore';
import { v4 as uuidv4 } from 'uuid';
import * as pw from '../engine/playwright';
import type { RecipeEntry } from '../memory/RecipeMemory';

const router = Router();

// Helper: Auto-create variable definitions for any templated locators
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
              required: false
            };
          }
        }
      }
    }
  }
}

// 1. GET /flows
router.get('/', (req, res) => {
  const store = getMemoryStore();
  const flows = store.recipes.getAll();
  res.json({ success: true, count: flows.length, flows });
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

// 6. POST /flows/:flowId/run
router.post('/:flowId/run', async (req: Request, res: Response) => {
  try {
    const run_id = `run_${uuidv4().replace(/-/g, '')}`;
    const store = getMemoryStore();
    const flowId = req.params.flowId;
    const flow = store.recipes.getById(flowId);
    
    if (!flow) {
      res.status(404).json({ success: false, error: 'Flow not found in Memory Bank' });
      return;
    }

    const inputs = req.body.inputs || {};
    
    // 6a. Validate declared variables
    if (flow.variables) {
      for (const [key, def] of Object.entries(flow.variables)) {
        let val = inputs[key];
        
        // If missing in inputs, fallback to locator's default_value for validation
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
        
        if (def.required && val === undefined) {
          res.status(400).json({ success: false, error: `Missing required variable: ${key}` });
          return;
        }

        if (val !== undefined) {
          if (def.type === 'number') {
            if (typeof val !== 'number') {
              res.status(400).json({ success: false, error: `Variable ${key} must be a number` });
              return;
            }
            if (def.constraints?.minimum !== undefined && val < def.constraints.minimum) {
              res.status(400).json({ success: false, error: `Variable ${key} must be >= ${def.constraints.minimum}` });
              return;
            }
            if (def.constraints?.maximum !== undefined && val > def.constraints.maximum) {
              res.status(400).json({ success: false, error: `Variable ${key} must be <= ${def.constraints.maximum}` });
              return;
            }
            if (def.constraints?.integerOnly && !Number.isInteger(val)) {
              res.status(400).json({ success: false, error: `Variable ${key} must be an integer` });
              return;
            }
          }

          if (def.type === 'text') {
            if (typeof val !== 'string') {
              res.status(400).json({ success: false, error: `Variable ${key} must be a string` });
              return;
            }
            if (def.constraints?.minLength !== undefined && val.length < def.constraints.minLength) {
              res.status(400).json({ success: false, error: `Variable ${key} length must be >= ${def.constraints.minLength}` });
              return;
            }
            if (def.constraints?.maxLength !== undefined && val.length > def.constraints.maxLength) {
              res.status(400).json({ success: false, error: `Variable ${key} length must be <= ${def.constraints.maxLength}` });
              return;
            }
            if (def.constraints?.pattern && !new RegExp(def.constraints.pattern).test(val)) {
              res.status(400).json({ success: false, error: `Variable ${key} fails pattern constraint` });
              return;
            }
          }
        }
      }
    }

    const page = await pw.getPage();
    let currentUrl = '';
    try { currentUrl = page.url(); } catch { }

    if (flow.startUrl && currentUrl !== flow.startUrl && currentUrl !== 'about:blank') {
      await pw.navigate(flow.startUrl);
    } else if (!currentUrl || currentUrl === 'about:blank') {
      if (flow.startUrl) {
         await pw.navigate(flow.startUrl);
      }
    }
    
    const results = [];
    
    // 6c. Safely substitute inputs and execute locked steps
    for (let i = 0; i < flow.locators.length; i++) {
      const step = flow.locators[i];
      const step_id = step.step_id || `step_${i.toString().padStart(3, '0')}`;
      
      try {
        let valueToType = step.value || '';
        
        // Execute Placeholder substitution securely
        if (step.input?.kind === 'template') {
           const templateKeyMatch = step.input.template.match(/\{\{([^}]+)\}\}/);
           if (templateKeyMatch) {
              const varName = templateKeyMatch[1].trim();
              if (inputs[varName] !== undefined) {
                 valueToType = String(inputs[varName]);
              } else if (step.input.default_value !== undefined) {
                 valueToType = String(step.input.default_value);
              }
           }
        }

        const action = step.action || 'click';
        if (action !== 'wait' && !step.selector) throw new Error('Missing selector on step');

        if (action === 'wait') {
           const waitKind = step.wait?.kind || 'idle';
           const timeout = step.wait?.timeout_ms || 5000;
           let waitText = step.wait?.text || step.value || valueToType || '';

           if (step.wait?.text?.includes('{{')) {
              const match = step.wait.text.match(/\{\{([^}]+)\}\}/);
              if (match) {
                 const varName = match[1].trim();
                 if (inputs[varName] !== undefined) waitText = String(inputs[varName]);
              }
           }
           
           if (waitKind === 'text_appears' && waitText) {
               await page.waitForSelector(`text=${waitText}`, { timeout }).catch(() => {});
           } else if (waitKind === 'selector_appears' && step.wait?.selector) {
               await page.waitForSelector(step.wait.selector, { timeout }).catch(() => {});
           } else if (waitKind === 'selector_disappears' && step.wait?.selector) {
               await page.waitForSelector(step.wait.selector, { state: 'hidden', timeout }).catch(() => {});
           } else if (waitKind === 'delay') {
               await page.waitForTimeout(timeout);
           } else {
               await pw.waitForChange(timeout);
           }
        } else if (action === 'type') {
           await pw.simulateCursor(step.selector, 'type');
           await pw.type(step.selector, valueToType);
        } else if (action === 'click') {
           await pw.simulateCursor(step.selector, 'click');
           const loc = page.locator(step.selector!).first();
           await loc.scrollIntoViewIfNeeded({ timeout: 1000 }).catch(() => {});
           await loc.click({ timeout: 2000 }).catch(async () => {
              await loc.click({ force: true, timeout: 1500 }).catch(async () => {
                 await loc.evaluate((node: HTMLElement) => node.click()).catch(() => {});
              });
           });
           await pw.waitForChange(500);
        } else if (action === 'select') {
           await pw.simulateCursor(step.selector, 'select');
           await pw.select(step.selector, valueToType);
        } else if (action === 'download') {
           const dlOpts = { ...(step.download || {}) };
           const filenameTpl = dlOpts.filename_template || valueToType || '';
           
           if (filenameTpl) {
               dlOpts.filename_template = filenameTpl;
           } else {
               delete dlOpts.filename_template;
           }
           
           // Support dynamic variable interpolation in filename template
           if (dlOpts.filename_template && dlOpts.filename_template.includes('{{')) {
               dlOpts.filename_template = dlOpts.filename_template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
                   const v = inputs[key.trim()];
                   return v !== undefined ? String(v) : '';
               });
           }
           
           const result = await pw.download(step.selector, dlOpts);
           results.push({ step_id, success: true, download: result });
           continue; // Skip the standard results.push below to preserve download metadata
        } else {
           throw new Error(`Unsupported action: ${action}`);
        }
        
        results.push({ step_id, success: true });
        
      } catch(err: any) {
        results.push({ step_id, success: false, error: err.message });
        
        res.json({
          success: false,
          flow_id: flowId,
          run_id,
          steps_executed: results.length,
          inputs_used: inputs,
          results
        });
        return;
      }
    }

    res.json({
      success: true,
      flow_id: flowId,
      run_id,
      steps_executed: results.length,
      inputs_used: inputs,
      results
    });

  } catch(err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
