import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { loadEnvFile } from 'node:process';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  loadEnvFile(rootEnv);
}

const nodeModulesSegment = `${sep}node_modules${sep}`;

/**
 * Shared package imports use .js specifiers that point at .ts source.
 * A global extensionAlias also rewrites date-fns (and other ESM packages)
 * and leaves webpack with a module id that has no factory.
 */
function sharedJsSpecifierPlugin() {
  return {
    apply(resolver) {
      const target = resolver.ensureHook('resolve');
      resolver
        .getHook('resolve')
        .tapAsync('OptiWorldSharedJsSpecifier', (request, context, callback) => {
          const specifier = request.request;
          const issuer = request.path ?? '';
          if (typeof specifier !== 'string' || !specifier.endsWith('.js')) {
            callback();
            return;
          }
          if (issuer.includes(nodeModulesSegment) || specifier.includes('node_modules')) {
            callback();
            return;
          }
          const tryExtension = (extension, done) => {
            resolver.doResolve(
              target,
              { ...request, request: `${specifier.slice(0, -3)}${extension}` },
              `shared ${extension} specifier`,
              context,
              done,
            );
          };
          tryExtension('.ts', (tsError, tsResult) => {
            if (tsError) {
              callback(tsError);
              return;
            }
            if (tsResult) {
              callback(null, tsResult);
              return;
            }
            tryExtension('.tsx', (tsxError, tsxResult) => {
              if (tsxError || tsxResult) {
                callback(tsxError, tsxResult);
                return;
              }
              callback();
            });
          });
        });
    },
  };
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@optiworld/shared'],
  webpack: (config) => {
    if (config.resolve.extensionAlias) {
      delete config.resolve.extensionAlias['.js'];
    }
    config.resolve.plugins = [...(config.resolve.plugins ?? []), sharedJsSpecifierPlugin()];
    return config;
  },
};

export default nextConfig;
