import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const LOCAL_DATABASE_URL =
  'postgresql://optiworld:optiworld@localhost:5432/optiworld?schema=public';

const rootEnv = resolve(dirname(fileURLToPath(import.meta.url)), '../.env');

if (existsSync(rootEnv)) {
  loadEnvFile(rootEnv);
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = LOCAL_DATABASE_URL;
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  process.stderr.write('with-root-env: missing command\n');
  process.exit(1);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
