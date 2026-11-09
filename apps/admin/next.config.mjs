import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  loadEnvFile(rootEnv);
}

if (process.env.ADMIN_NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = process.env.ADMIN_NEXTAUTH_SECRET;
}
if (process.env.ADMIN_NEXTAUTH_URL) {
  process.env.NEXTAUTH_URL = process.env.ADMIN_NEXTAUTH_URL;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@optiworld/shared'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
