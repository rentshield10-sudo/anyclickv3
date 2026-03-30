import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  WORKER_PORT: z.coerce.number().default(3001),
  CHROME_EXECUTABLE_PATH: z.string().min(1, 'CHROME_EXECUTABLE_PATH is required'),
  CHROME_PROFILE_DIR: z.string().min(1, 'CHROME_PROFILE_DIR is required'),
  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_PRO_MODEL: z.string().default('gemini-2.5-pro'),
  DEBUG_OVERLAY: z.coerce.boolean().default(false),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = ConfigSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
