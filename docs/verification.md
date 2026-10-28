# Publication verification

Checks run on **28 October 2026** against a separate public export with freshly installed dependencies and no private environment files, database or uploads.

| Check | Result |
| --- | --- |
| `npm ci --include=dev --ignore-scripts` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 372 passed, 84 skipped across 35 files |
| `npm run build` | Passed with Next.js 16.4.3 |
| `npm audit --omit=dev` | Zero reported vulnerabilities |
| Application source completeness | All 197 tracked application files included |
| Known local credential scan | No matches in the publication files |
| Token-pattern scan | Only deliberate test strings, with no real credentials found |
| Live prototype health | HTTPS `/api/health` returned 200 and `ready` |
| Demo media | 44 seconds, 1920 × 1080, 30 fps, H.264 video and AAC audio |

The local checks used Node.js 26.10.0 and npm 11.19.1. The GitHub workflow targets Node.js 22 on Linux and repeats installation, TypeScript, default tests, build and production dependency audit.

The 84 skipped tests require optional database or Docker code-execution environments. They are not counted as passing. Docker was unavailable on this machine during publication, so startup, container build, database integration and full browser suites were not rerun. Some historical browser audits also require private review manifests. Current screenshots are retained captures from the running October prototype, not new screenshots of the patched build.

The two patched dependencies are Next.js 16.4.3 and Zod 4.6.7. This applies to the published source copy. Updating an existing hosted deployment is a separate operational task.

Credential scanning checks known secret bytes and recognizable token patterns. It does not prove that arbitrary confidential prose or every possible secret format is absent. The export uses a file allowlist and excludes internal history, private configuration, databases and uploads.
