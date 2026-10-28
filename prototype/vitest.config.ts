import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({ resolve: { alias: { '@': resolve(import.meta.dirname, 'src'), 'server-only': resolve(import.meta.dirname, 'tests/server-only.ts') } }, test: { environment: 'node', exclude: ['tests/browser/**','node_modules/**'] } })
