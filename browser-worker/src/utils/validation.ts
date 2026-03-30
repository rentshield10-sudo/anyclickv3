import { z } from 'zod';

// ─── Shared element schema ────────────────────────────────────────────────────

export const ElementSchema = z.object({
  id: z.number(),
  tag: z.string(),
  type: z.string(),
  role: z.string(),
  text: z.string(),
  label: z.string(),
  placeholder: z.string(),
  region: z.enum(['left_nav', 'main_content', 'right_panel', 'header', 'footer', 'unknown']),
  visible: z.boolean(),
  enabled: z.boolean(),
  selector: z.string().optional(),
});

export type Element = z.infer<typeof ElementSchema>;

// ─── Page state schema ────────────────────────────────────────────────────────

export const PageStateSchema = z.object({
  url: z.string(),
  title: z.string(),
  loginStatus: z.object({
    loggedIn: z.boolean(),
    evidence: z.array(z.string()),
  }),
  panels: z.object({
    main: z.object({ heading: z.string(), text: z.string() }),
    right: z.object({ heading: z.string(), text: z.string() }),
  }),
  elements: z.array(ElementSchema),
  frames: z.array(z.object({ name: z.string(), url: z.string() })),
  loading: z.object({ networkBusy: z.boolean(), spinnerVisible: z.boolean() }),
});

export type PageState = z.infer<typeof PageStateSchema>;

// ─── Action schema ────────────────────────────────────────────────────────────

export const ActionSchema = z.object({
  action: z.enum([
    'goto', 'click', 'type', 'press', 'scroll', 'select',
    'extract', 'wait_for_change', 'request_login', 'done',
  ]),
  target: z.object({
    elementId: z.number().nullable(),
    description: z.string(),
  }).optional(),
  value: z.string().nullable().optional(),
  watch: z.object({
    region: z.enum(['page', 'main_content', 'right_panel', 'iframe', 'unknown', 'none']),
    change: z.enum(['text_change', 'element_appeared', 'element_disappeared', 'url_change', 'loading_finished', 'none']),
  }).optional(),
  reason: z.string(),
  thinking: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type Action = z.infer<typeof ActionSchema>;

// ─── API request/response schemas ─────────────────────────────────────────────

export const StartRequestSchema = z.object({
  taskId: z.string(),
  url: z.string().url(),
  engine: z.enum(['playwright']).default('playwright'),
  visible: z.boolean().default(true),
});

export const ActRequestSchema = z.object({
  sessionId: z.string(),
  action: ActionSchema,
});

export const LoginRequestSchema = z.object({
  sessionId: z.string(),
  site: z.string(),
  message: z.string().optional(),
});


