import { createServer } from 'vite'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
process.env.DEEPSEEK_API_KEY_FILE ||= resolve(root, '../.internal/secrets/deepseek_key')
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, resolve: { alias: { 'server-only': resolve(root, 'tests/server-only.ts') } } })
let priorAudit = {rejected:[]}
try { priorAudit = JSON.parse(await readFile(resolve(root,'../.internal/prototype/company-bank-audit.json'),'utf8')) } catch {}

try {
  const { validateVariant, reviewVariant } = await server.ssrLoadModule('/src/lib/ai-curriculum.ts')
  const path = resolve(root, 'curriculum/company-catalog.json')
  const bank = JSON.parse(await readFile(path, 'utf8'))
  const variants = bank.variants.map(validateVariant)
  let cursor = 0
  const approved = []
  const rejected = []
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < variants.length) {
      const variant = variants[cursor++]
      const knownIssue = priorAudit.rejected.find(item=>item.id===variant.id)?.issues.join(' ')
      let issues = knownIssue ? [knownIssue] : []
      try { issues.push(...await reviewVariant(variant)) } catch(error) { issues.push(`Review failed: ${error.message}`) }
      const target = {id:variant.id,roleId:variant.roleId,stage:variant.stage,variation:variant.variation,title:variant.task.title.en}
      if (issues.length) { rejected.push({...target,issues}); console.log(`Reject ${variant.roleId}:${variant.stage}:${variant.variation}: ${issues.join(' ')}`) }
      else { approved.push(variant); console.log(`Approved ${variant.roleId}:${variant.stage}:${variant.variation}`) }
    }
  }))
  const reportPath = resolve(root,'../.internal/prototype/company-bank-audit.json')
  await writeFile(reportPath,JSON.stringify({reviewedAt:new Date().toISOString(),approved:approved.map(v=>({id:v.id,roleId:v.roleId,stage:v.stage,variation:v.variation})),rejected},null,2))
  if (process.argv.includes('--retire')) { await writeFile(`${path}.tmp`,JSON.stringify({...bank,variants:approved},null,2));await rename(`${path}.tmp`,path) }
  console.log(`Blind audit: ${approved.length} approved, ${rejected.length} rejected.`)
} finally { await server.close() }
