# Setup, deployment and verification

## Local development

Use Node.js 22 or later, npm and a running Docker installation with the Compose plugin.

```sh
git clone https://github.com/northlight7/lumio.git
cd lumio/prototype
npm ci
sh scripts/start-local.sh
```

Startup creates private configuration, starts PostgreSQL 17 on loopback port 55439, applies migrations, imports curriculum and starts Next.js at `http://localhost:3100`. Existing configuration and secrets are preserved.

| Path, relative to `prototype/` | Purpose |
| --- | --- |
| `.env.local` | Development settings |
| `../.internal/secrets/db_password` | Generated administrator password |
| `../.internal/secrets/app_db_password` | Generated restricted app password |
| `../.internal/secrets/deepseek_key` | Your provider key, initially empty |

Use an editor to populate the provider key. Keep `ALLOW_SCRIPTED_AI=false` to avoid presenting scripted conversation as live AI. Restart after configuration changes.

Catalog browsing and pre-authored presentation examples do not need fresh AI requests. Generation, grading and colleague conversations need provider access and available credit. The current model identifier is `deepseek-flash`.

Stop Next.js with Ctrl+C. Stop the database without deleting its volume with:

```sh
docker compose -f compose.dev.yaml -p lumio-dev stop
```

## Default checks

From `prototype/`:

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Vitest covers catalog contracts, AI response validation, grading, employer scoring, privacy, attachment parsing and public workpacks. Database and Docker code-execution suites are opt-in. A successful build does not prove a database or model connection.

## Optional integration checks

Use a disposable test database populated through the migration script with a restricted application role. Do not target a live deployment. Some tests exercise quotas and temporary curriculum state.

```sh
# After configuring an isolated database and applying migrations:
RUN_DB_TESTS=true node --env-file=.env.test node_modules/vitest/vitest.mjs run

# Isolated reference-code probes through Docker:
RUN_CODE_EXECUTION_TESTS=true npm test -- tests/code-execution.test.ts
```

Create `.env.test` locally using the connection fields in `.env.example`. It is not committed. Code probes need Docker access and their Node/Python runtime images. The production app does not mount a Docker socket.

## Browser checks

Playwright expects an already running app and PostgreSQL. Install Chromium and run a focused suite:

```sh
npx playwright install chromium
TEST_ORIGIN=http://localhost:3100 npx playwright test tests/browser/security.spec.ts \
  --grep 'origin, consent, stage prerequisites and validation are enforced'
```

`npm run test:e2e` discovers the complete historical browser suite. Several journeys make real provider calls, consume quota and can incur API charges. `mobile-layout.spec.ts` also requires private release-review manifests that are not published. It is retained as source, not advertised as a self-contained default check. Read prerequisites before running a full suite.

## Docker deployment

From `prototype/`, run `node scripts/setup-local.mjs` to create private secret files. Copy `.env.example` to `.env`, configure your own `DOMAIN` and `APP_ORIGIN`, and populate your provider key. Point the hostname at the server and make ports 80 and 443 available.

```sh
cp .env.example .env
# Edit .env and populate private secrets before continuing.
docker compose up -d --build --wait
docker compose ps
```

The standard stack runs PostgreSQL, a migration job, the app and Caddy. File-backed secrets and a restricted app database role separate runtime access from schema administration. PostgreSQL has no production host port mapping.

The optional `compose.vps.yaml` adds memory limits, bounded logs and an IP-certificate Caddy configuration. It needs certificate settings appropriate to the deployment.

## Backup and restore

```sh
sh scripts/backup.sh /absolute/private/path/lumio.dump
sh scripts/restore.sh /absolute/private/path/lumio.dump lumio_restore_check
```

The destination directory must exist. Dumps contain private data and must stay outside the public repository. Restore creates a separate database and refuses to target the live `lumio` database.

See [publication verification](verification.md) for the checks run on 28 October 2026. CI repeats checks that do not require private manifests, Docker or paid provider access.
