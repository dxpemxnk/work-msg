import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { z } from 'zod';

if (existsSync('.env')) loadEnvFile('.env');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().positive().default(4100),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_PATH: z.string().default('./data/ems-messenger.sqlite'),
  DEV_AUTH_ENABLED: z.enum(['true', 'false']).default('true'),
  SESSION_SECRET: z.string().min(32).default('local-development-secret-change-me-now'),
  MESSAGE_MAX_LENGTH: z.coerce.number().int().min(1).max(50_000).default(8000),
});

type ConfigInput = Partial<Record<keyof z.infer<typeof schema>, string>>;

export function loadConfig(overrides: ConfigInput = {}) {
  const env = schema.parse({ ...process.env, ...overrides });
  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    clientOrigin: env.CLIENT_ORIGIN,
    databasePath: env.DATABASE_PATH === ':memory:' ? ':memory:' : resolve(env.DATABASE_PATH),
    devAuthEnabled: env.DEV_AUTH_ENABLED === 'true',
    sessionSecret: env.SESSION_SECRET,
    messageMaxLength: env.MESSAGE_MAX_LENGTH,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;
