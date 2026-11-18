import { z } from 'zod';

const base64Key = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, 'must be 32 bytes, base64');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  JWT_SECRET: z.string().min(32),
  PII_ENC_KEY: base64Key,
  PII_HASH_KEY: base64Key,
  SMS_PROVIDER: z.enum(['console']).default('console'),
});

export type Env = z.infer<typeof envSchema>;

export const ENV = Symbol('ENV');

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${fields.join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.SMS_PROVIDER === 'console') {
    throw new Error('SMS_PROVIDER=console is not allowed in production');
  }
  return parsed.data;
}
