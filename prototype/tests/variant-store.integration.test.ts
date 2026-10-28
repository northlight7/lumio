import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { database, query, secret } from '../src/lib/db'
import { chooseVariant, listVariations, variantById } from '../src/lib/variant-store'
import {createRubricAnchor,rubricAnchorVersion,validateVariant,type GeneratedVariant } from '../src/lib/ai-curriculum'
import { getCompany } from '../src/lib/companies'
import { getRole } from '../src/lib/content'

const learnerId = randomUUID()
const retiredId = randomUUID()
const replacementId = randomUUID()
const attemptId = randomUUID()
const anchorId=randomUUID(),anchoredId=randomUUID()
let original: GeneratedVariant
let administrator: Pool
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('retired task snapshots and published catalog', () => {
  beforeAll(async () => {
    administrator = new Pool({ host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB, user: process.env.MIGRATION_POSTGRES_USER || 'lumio', password: secret('MIGRATION_POSTGRES_PASSWORD'), max: 1 })
    const file = process.env.CURRICULUM_CATALOG_PATH || 'curriculum/company-catalog.json'
    const catalog = JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8')) as { variants: GeneratedVariant[] }
    original = structuredClone(catalog.variants[0])
    original.id = retiredId
    original.variation = 999
    original.task.generation!.variantId = retiredId
    original.task.generation!.variation = 999
    original.task.title = { en: 'QA retired snapshot', zh: '品質測試已停用情境' }
    await administrator.query('INSERT INTO learners(id) VALUES ($1)', [learnerId])
    await administrator.query('INSERT INTO task_variants(id,role_id,stage,variation,snapshot,retired_at) VALUES ($1,$2,$3,$4,$5::jsonb,now())', [retiredId, original.roleId, original.stage, original.variation, JSON.stringify(original)])
    await administrator.query('INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,$3,$4,\'en\',$5,$6)', [attemptId, learnerId, original.roleId, original.stage, `qa:${retiredId}`, retiredId])
  })
  afterAll(async () => {
    await administrator.query('DELETE FROM learners WHERE id=$1', [learnerId])
    await administrator.query('DELETE FROM task_variants WHERE id=ANY($1::uuid[])', [[retiredId, replacementId,anchorId,anchoredId]])
    await administrator.end()
    await database().end()
  })
  it('verifies pinned advanced criteria against the immutable database anchor after JSONB roundtrip',async()=>{
    const catalog=JSON.parse(await readFile(resolve(process.cwd(),'curriculum/company-catalog.json'),'utf8')) as {variants:GeneratedVariant[]}
    const anchor=structuredClone(catalog.variants.find(v=>v.roleId==='ai-engineer'&&v.stage==='adapt')!)
    anchor.id=anchorId;anchor.variation=997
    Object.assign(anchor.task.generation!,{variantId:anchorId,variation:997})
    const candidate=structuredClone(anchor)
    candidate.id=anchoredId;candidate.variation=998
    Object.assign(candidate.task.generation!,{variantId:anchoredId,variation:998,promptVersion:'lumio-generated-2026-10-10.advanced.1'})
    candidate.provenance.promptVersion='lumio-generated-2026-10-10.advanced.1'
    candidate.rubricAnchor=createRubricAnchor(anchor)
    candidate.task.rubricVersion=rubricAnchorVersion(candidate.rubricAnchor)
    delete candidate.demoEvaluation;delete candidate.demoPoorSample
    for(const variant of [anchor,candidate])await administrator.query('INSERT INTO task_variants(id,role_id,stage,variation,snapshot,retired_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',[variant.id,variant.roleId,variant.stage,variant.variation,JSON.stringify(variant),variant.id===anchorId?new Date():null])
    expect(await variantById(anchoredId)).toEqual(validateVariant(candidate,anchor))
    const forged=structuredClone(candidate)
    forged.rubricAnchor!.criteria[0].label.en='Forged public label'
    forged.task.criteria![0].label.en='Forged public label'
    forged.rubric.criteria[0].label.en='Forged public label'
    forged.task.rubricVersion=rubricAnchorVersion(forged.rubricAnchor!)
    await administrator.query('UPDATE task_variants SET snapshot=$2::jsonb WHERE id=$1',[anchoredId,JSON.stringify(forged)])
    await expect(variantById(anchoredId)).rejects.toThrow('differs from immutable source')
    await administrator.query('UPDATE task_variants SET snapshot=$2::jsonb WHERE id=$1',[anchoredId,JSON.stringify(candidate)])
    await administrator.query('DELETE FROM task_variants WHERE id=$1',[anchorId])
    await expect(variantById(anchoredId)).rejects.toMatchObject({code:'rubric_anchor_missing',status:409})
  })
  it('keeps an old referenced snapshot available without exposing it as a current challenge', async () => {
    const record = await variantById(retiredId)
    expect(record).toEqual(original)
    const catalog = await listVariations(original.roleId, original.stage)
    expect(catalog.variations.some(v => v.id === retiredId)).toBe(false)
    await expect(chooseVariant(learnerId, original.roleId, original.stage, false, retiredId)).rejects.toMatchObject({ status: 409, code: 'variation_retired' })
  })
  it('publishes a replacement without altering evidence attached to the retired snapshot', async () => {
    const replacement = structuredClone(original)
    replacement.id = replacementId
    replacement.task.generation!.variantId = replacementId
    replacement.task.company = structuredClone(getCompany(getRole(replacement.roleId)!.companyId!)!)
    replacement.task.title = { en: 'QA replacement scenario', zh: '品質測試替代情境' }
    await administrator.query('INSERT INTO task_variants(id,role_id,stage,variation,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)', [replacementId, replacement.roleId, replacement.stage, replacement.variation, JSON.stringify(replacement)])
    try {
      const catalog = await listVariations(original.roleId, original.stage)
      const metadata = catalog.variations.find(v => v.id === replacementId)!
      expect(metadata.title).toEqual(replacement.task.title)
      expect(Object.keys(metadata).sort()).toEqual(['duration', 'id', 'roleId', 'stage', 'title', 'variation'])
      expect(await chooseVariant(learnerId, original.roleId, original.stage, true, replacementId)).toEqual(replacement)
      expect(await variantById(retiredId)).toEqual(original)
      const attempt = await query<{ variant_id: string }>('SELECT variant_id FROM attempts WHERE id=$1', [attemptId])
      expect(attempt[0].variant_id).toBe(retiredId)
    } finally { await administrator.query('UPDATE task_variants SET retired_at=now() WHERE id=$1', [replacementId]) }
  })
})
