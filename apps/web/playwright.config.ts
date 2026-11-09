import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { defineConfig, devices } from '@playwright/test';

const rootEnv = resolve(__dirname, '../../.env');
if (existsSync(rootEnv)) {
  loadEnvFile(rootEnv);
}

const webPort = 3000;
const apiPort = 4000;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/with-root-env.mjs pnpm --filter @optiworld/api dev',
      cwd: resolve(__dirname, '../..'),
      url: `http://localhost:${apiPort}/api/v1/health`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'node scripts/with-root-env.mjs pnpm --filter @optiworld/web dev',
      cwd: resolve(__dirname, '../..'),
      url: `http://localhost:${webPort}/login`,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
