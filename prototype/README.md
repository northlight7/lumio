# Lumio application

The complete Next.js application for Lumio, a bilingual career exploration and workplace simulation platform. It includes 25 roles, 138 task families, AI-generated variations, criterion-based feedback, private portfolios and an employer workspace.

See the [project overview](../README.md), [architecture](../docs/architecture.md), [ethics](../docs/ethics.md) and [setup guide](../docs/setup.md).

## Local startup

Requires Node.js 22 or later and Docker with Docker Compose. From this directory:

```sh
npm ci
sh scripts/start-local.sh
```

Open `http://localhost:3100`. Setup creates local configuration and database passwords. For live AI features, put your own DeepSeek API key in `../.internal/secrets/deepseek_key`, then restart the app. Secrets and local environment files are excluded from Git.

## Checks

```sh
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

The default test run skips opt-in database and isolated code-execution suites. Browser tests need a running app and database. Some also need live AI access or private release-review evidence. See the setup guide before running the full suite.

## Product boundaries

Company names and public facts are real. Internal rules, colleagues and datasets are synthetic independent simulations without employer endorsement. Feedback is not a qualification or validated hiring prediction.

Guest work resets on refresh. Registered accounts preserve work across sessions. Email verification and password recovery are not implemented.

Up to three files of 5 MB can be attached to a task. Supported formats include XLSX, CSV, PPTX, DOCX, TXT and selected source-code formats. AI review uses readable extracted text and saved spreadsheet results. It does not assess images, charts, slide design or speaker notes, and does not execute spreadsheet formulas. Recalculate and save workbooks before uploading.

Originals and submitted versions are private until a learner deliberately shares selected work. Portfolio links expire and can be revoked. Employer access follows a separate company-scoped consent path with minimized score evidence.
