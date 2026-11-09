import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  SENDGRID_API_KEY: z.string().optional().default(''),
  SENDGRID_FROM_EMAIL: z.string().optional().default(''),
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_NEXTAUTH_URL: z.string().url().default('http://localhost:3001'),
  NEXT_PUBLIC_WEB_URL: z.string().optional().default(''),
  WEB_ORIGIN: z.string().optional().default(''),
  ADMIN_ORIGIN: z.string().optional().default(''),
});

export type ApiEnv = z.infer<typeof EnvSchema>;

let cached: ApiEnv | undefined;

export function getEnv(): ApiEnv {
  if (cached) {
    return cached;
  }

  cached = EnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    API_PORT: process.env.API_PORT,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    ADMIN_NEXTAUTH_URL: process.env.ADMIN_NEXTAUTH_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    WEB_ORIGIN: process.env.NEXT_PUBLIC_WEB_URL,
    ADMIN_ORIGIN: process.env.NEXT_PUBLIC_ADMIN_URL ?? process.env.ADMIN_NEXTAUTH_URL,
  });

  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
