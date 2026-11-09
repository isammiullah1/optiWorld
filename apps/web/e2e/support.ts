import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { expect, type Page } from '@playwright/test';

const exec = promisify(execFile);
const webRoot = resolve(process.cwd());
const statePath = resolve(webRoot, 'e2e/.runtime.json');

export const PASSWORD = 'OptiWorld123!';
export const retailerOwner = 'owner@brightview.example';
export const wholesalerAdmin = 'admin@lensline.example';
export const pricesHiddenRetailer = 'owner@clearpath.example';
export const tariqPhone = '+92 300 5550191';

export async function seed(
  command: string,
  args: readonly string[] = [],
): Promise<Record<string, string>> {
  const tsx = resolve(webRoot, '../../packages/db/node_modules/.bin/tsx');
  const envScript = resolve(webRoot, '../../scripts/with-root-env.mjs');
  await exec('node', [envScript, tsx, 'e2e/seed.ts', command, ...args], { cwd: webRoot });
  if (command.endsWith('-down')) {
    return {};
  }
  return JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, string>;
}

export async function login(page: Page, email: string): Promise<void> {
  await expect(async () => {
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.locator('#password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/(retailer|wholesaler)\//, { timeout: 8_000 });
  }).toPass({ timeout: 30_000 });
}

export async function openApp(page: Page, path: string): Promise<void> {
  await expect(async () => {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }).toPass({ timeout: 20_000 });
}

export async function readLocalInvoices(
  page: Page,
): Promise<Array<{ localId: string; syncStatus: string; customerName: string }>> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolveDb, reject) => {
      const request = indexedDB.open('optiworld-pos');
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<
      Array<{ localId: string; syncStatus: string; customerName: string }>
    >((resolveRows, reject) => {
      const transaction = database.transaction('local_invoices', 'readonly');
      const request = transaction.objectStore('local_invoices').getAll();
      request.onsuccess = () =>
        resolveRows(
          request.result as Array<{ localId: string; syncStatus: string; customerName: string }>,
        );
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows;
  });
}
