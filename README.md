# OptiWorld

B2B SaaS platform for optical retailers, wholesalers, and laboratories. This repository is a pnpm workspace. It currently contains the monorepo structure and shared tooling only. Application source for Next.js, Expo, and Express is not scaffolded yet.

## Prerequisites

- Node.js 20 LTS or newer (`nvm use` reads `.nvmrc`)
- pnpm 9 or newer
- Docker with Compose v2, for PostgreSQL and Redis

Enable pnpm through Corepack (ships with Node.js):

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
```

## Repository layout

```text
apps/web        Next.js 14 web app and PWA
apps/mobile     React Native app (Expo SDK 51, Android first)
apps/admin      Next.js 14 Super Admin portal
packages/api    Express.js + TypeScript REST API
packages/db     Prisma schema and migrations (PostgreSQL)
packages/shared Shared types, enums, constants, and utilities
packages/ui     Shared React components (web and mobile)
docs/srs        Software requirements (SRS v1.2)
docs/prompts    Prompt library
```

Workspace packages depend on `@optiworld/shared` and, where relevant, `@optiworld/ui` through the `workspace:` protocol. Domain models, screens, and API routes are intentionally absent.

## Install

From the repository root:

```bash
pnpm install
cp .env.example .env
```

Fill in the secrets in `.env` before starting any app. Local database credentials in `.env.example` match `docker-compose.yml` and are for this machine only.

## Local infrastructure

PostgreSQL 15 and Redis 7:

```bash
pnpm docker:up
```

Stop them with `pnpm docker:down`. Data is kept in named volumes (`postgres_data`, `redis_data`).

| Service    | Image                | Port |
| ---------- | -------------------- | ---- |
| PostgreSQL | `postgres:15-alpine` | 5432 |
| Redis      | `redis:7-alpine`     | 6379 |

Check the Prisma schema (no domain models yet):

```bash
pnpm --filter @optiworld/db prisma:validate
```

That command loads the root `.env` when the file exists. If `DATABASE_URL` is still empty, it uses the local Docker URL from `.env.example`.

## Scripts

| Command             | What it does                              |
| ------------------- | ----------------------------------------- |
| `pnpm lint`         | ESLint across the repo (strict: no `any`) |
| `pnpm lint:fix`     | ESLint with autofix                       |
| `pnpm format`       | Prettier write                            |
| `pnpm format:check` | Prettier check                            |
| `pnpm typecheck`    | `tsc --noEmit` in every app and package   |
| `pnpm docker:up`    | Start PostgreSQL and Redis                |
| `pnpm docker:down`  | Stop PostgreSQL and Redis                 |

## Tooling

- **TypeScript** strict mode is defined in `tsconfig.base.json`. Every workspace extends it. The compiler version is pinned once in the pnpm catalog.
- **ESLint** flat config is `eslint.config.mjs` (`typescript-eslint` recommended, plus `@typescript-eslint/no-explicit-any`).
- **Prettier** config is `.prettierrc.json`. Prettier owns formatting; ESLint does not restyle code.
- **Husky** runs `lint-staged` on commit: ESLint and Prettier on staged source, Prettier on staged JSON, Markdown, and YAML.

## Environment variables

`.env.example` lists every variable the platform expects:

- `DATABASE_URL`, `REDIS_URL`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` for the web app
- `ADMIN_NEXTAUTH_SECRET`, `ADMIN_NEXTAUTH_URL` for the admin portal
- `JWT_SECRET`, `JWT_REFRESH_SECRET` for the API and mobile clients
- AWS S3 settings, with commented Cloudflare R2 alternatives
- `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
- `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- `SOCKET_IO_CORS_ORIGIN`
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_WEB_URL`
- `API_PORT`, `WEB_PORT`, `ADMIN_PORT`, `NODE_ENV`

Never commit `.env`.

## What is not here yet

Next.js apps, the Expo app, Express routes, and Prisma domain models are the next scaffolding step. Each workspace already has a `package.json`, a `tsconfig.json`, and a small TypeScript marker so `pnpm typecheck` succeeds before that code exists.
