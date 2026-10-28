import { getRole } from './content'
import 'server-only'
import { createHash } from 'node:crypto'
import { query } from './db'
import { ApiError } from './security'
import { withProviderLease } from './provider-quota'
import { CurriculumQualityError, assertContrastHistory, generateVariant, validateVariant, createRubricAnchor, type GeneratedVariant } from './ai-curriculum'
import { getTaskFamily, getTaskFamilies } from './task-families'
import { generationTiming,generationRepairAttempts } from './provider-timing'
import { assertPublicationWorkMaterials } from './work-materials'
import type { Stage, Variation } from './types'

export async function variantById(id: string, activeOnly=false): Promise<GeneratedVariant> {
  const row = (await query<{snapshot: object; presentation:object; retired_at:Date|null}>('SELECT snapshot,presentation,retired_at FROM task_variants WHERE id = $1', [id]))[0]
  if (!row) throw new ApiError(404, 'This task variation is unavailable.', 'variation_missing')
  if (activeOnly && row.retired_at) throw new ApiError(409, 'This variation was retired after review. Your evidence is preserved. Choose a current variation.', 'variation_retired')
  const candidate=validateVariant({...row.snapshot,...row.presentation})
  if(candidate.rubricAnchor){
    const anchor=(await query<{snapshot:object}>('SELECT snapshot FROM task_variants WHERE id=$1',[candidate.rubricAnchor.variantId]))[0]
    if(!anchor)throw new ApiError(409,'The original assessment criteria are unavailable. Choose another assignment.','rubric_anchor_missing')
    return validateVariant(candidate,validateVariant(anchor.snapshot))
  }
  return candidate
}
export async function listVariations(roleId: string, stage: Stage, taskId?:string): Promise<{variations: Variation[]}> {
  if (taskId && (stage !== 'taster' || !getTaskFamily(roleId,taskId))) throw new ApiError(400, 'Choose a task belonging to this role.', 'task_family_mismatch')
  const rows = await query<{id:string; role_id:string; stage:Stage; task_id:string; variation:number; snapshot:GeneratedVariant}>("SELECT * FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND ($4::boolean OR snapshot->'task'->'company' IS NOT NULL) AND role_id = $1 AND stage = $2 AND ($3::text IS NULL OR task_id=$3) ORDER BY task_id,variation", [roleId,stage,taskId || null,getRole(roleId)?.collection==='core'])
  return {variations:rows.map(r => ({id:r.id, roleId:r.role_id, stage:r.stage, variation:r.variation, title:r.snapshot.task.title, duration:r.snapshot.task.duration, ...(r.task_id !== 'legacy' ? {taskId:r.task_id, taskTitle:getTaskFamily(roleId,r.task_id)?.title} : {})}))}
}
export async function chooseVariant(learnerId:string, roleId:string, stage:Stage, fresh:boolean, requested?:string, taskId?:string):Promise<GeneratedVariant> {
  if (taskId && (stage !== 'taster' || !getTaskFamily(roleId,taskId))) throw new ApiError(400, 'Choose a task belonging to this role.', 'task_family_mismatch')
  if (requested) {
    const rows = await query<{retired_at:Date|null;catalog_hidden_at:Date|null}>('SELECT retired_at,catalog_hidden_at FROM task_variants WHERE id=$1',[requested])
    if (!rows.length || rows[0].retired_at) throw new ApiError(409, 'This variation was retired after review. Choose a current variation.', 'variation_retired')
    const variant = await variantById(requested)
    if (variant.roleId !== roleId || variant.stage !== stage || taskId && variant.taskId !== taskId) throw new ApiError(400, 'Choose a variation belonging to this role and task.', 'variation_mismatch')
    if (rows[0].catalog_hidden_at && !(await query('SELECT 1 FROM attempts WHERE learner_id=$1 AND variant_id=$2',[learnerId,requested])).length) throw new ApiError(409, 'This earlier task is available through your saved work. Choose a current task to start.', 'variation_archived')
    return variant
  }
  const familyId = taskId || (stage === 'taster' ? getTaskFamilies(roleId)[0]?.id : undefined)
  const keyId = familyId || 'legacy'
  if (!fresh) {
    const latest = (await query<{variant_id:string}>("SELECT a.variant_id FROM attempts a JOIN task_variants v ON v.id=a.variant_id WHERE v.retired_at IS NULL AND v.catalog_hidden_at IS NULL AND ($5::boolean OR v.snapshot->'task'->'company' IS NOT NULL) AND a.learner_id=$1 AND a.role_id=$2 AND a.stage=$3 AND v.task_id=$4 ORDER BY a.updated_at DESC LIMIT 1",[learnerId,roleId,stage,keyId,getRole(roleId)?.collection==='core']))[0]
    if (latest) return variantById(latest.variant_id)
  }
  const unused = (await query<{id:string}>("SELECT v.id FROM task_variants v WHERE v.retired_at IS NULL AND v.catalog_hidden_at IS NULL AND ($5::boolean OR v.snapshot->'task'->'company' IS NOT NULL) AND v.role_id=$2 AND v.stage=$3 AND v.task_id=$4 AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.learner_id=$1 AND a.variant_id=v.id) ORDER BY v.variation LIMIT 1",[learnerId,roleId,stage,keyId,getRole(roleId)?.collection==='core']))[0]
  if (unused) return variantById(unused.id)
  const key = familyId ? `${roleId}:${stage}:${familyId}` : `${roleId}:${stage}`
  const locked = await query<{key:string;lock_identity:string}>("INSERT INTO generation_locks(key,expires_at) VALUES ($1,now()+($2::double precision * interval '1 millisecond')) ON CONFLICT(key) DO UPDATE SET expires_at=EXCLUDED.expires_at WHERE generation_locks.expires_at < now() RETURNING key,expires_at::text AS lock_identity",[key,generationTiming().lockMs])
  if (!locked.length) throw new ApiError(409, 'A new variation is being prepared. Please try again in a moment.', 'generation_pending')
  try {
    const existing = await query<{variation:number;snapshot:GeneratedVariant}>("SELECT variation,snapshot FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND role_id=$1 AND stage=$2 AND task_id=$3 ORDER BY variation",[roleId,stage,keyId])
    const number = (existing.at(-1)?.variation || 0) + 1
    const anchorRow=!familyId&&stage!=='taster'?(await query<{snapshot:GeneratedVariant}>("SELECT snapshot FROM task_variants WHERE role_id=$1 AND stage=$2 AND task_id='legacy' AND snapshot->'task'->'company' IS NOT NULL ORDER BY variation,id LIMIT 1",[roleId,stage]))[0]:undefined
    const rubricAnchor=anchorRow?createRubricAnchor(validateVariant(anchorRow.snapshot)):undefined
    if(!familyId&&stage!=='taster'&&!rubricAnchor)throw new ApiError(409,'Choose an existing assignment while its assessment criteria are prepared.','rubric_anchor_missing')
    const previousTasks = existing.map(r => r.snapshot.task)
    assertContrastHistory(previousTasks)
    const previousCases = existing.map(r => JSON.stringify({title:r.snapshot.task.title.en,documents:r.snapshot.task.documents.map(d=>({title:d.title.en,body:d.body.en}))}))
    const repairAttempts=generationRepairAttempts()
    const candidate = await withProviderLease(learnerId,'generation',()=>generateVariant(roleId,stage,number,previousCases,undefined,undefined,familyId,existing.at(-1)?.snapshot.task,repairAttempts,previousTasks,rubricAnchor),4*(1+repairAttempts))
    const variant = validateVariant(candidate,anchorRow?validateVariant(anchorRow.snapshot):undefined)
    try{assertPublicationWorkMaterials(variant.task)}catch(error){throw new CurriculumQualityError(error instanceof Error?error.message:'Public workpack validation failed.',variant)}
    if (variant.roleId !== roleId || variant.stage !== stage || variant.taskId !== familyId || variant.variation !== number || (rubricAnchor&&!variant.rubricAnchor)) throw new CurriculumQualityError('Generated task identity did not match the requested family.')
    const fingerprint = (v:GeneratedVariant) => JSON.stringify(v.task.documents.map(d=>d.body.en.toLowerCase().replace(/\s+/g,' ').trim()))
    if (existing.some(r=>fingerprint(r.snapshot) === fingerprint(variant))) throw new CurriculumQualityError('Generated scenario repeats an existing case.')
    await query('INSERT INTO task_variants(id,role_id,stage,task_id,variation,snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb)',[variant.id,roleId,stage,keyId,number,JSON.stringify(variant)])
    return variant
  } catch (error) {
    if (error instanceof CurriculumQualityError) {
      const reasons=(error.issues.length?error.issues:[error.message]).slice(0,15).map(reason=>reason.slice(0,1500))
      // Operator logs contain authored curriculum only, never learner work or request headers.
      // No rejection details or private candidate are returned through the learner API.
      const snapshot=error.candidate?JSON.stringify(error.candidate):undefined
      console.error(JSON.stringify({event:'curriculum_quality_rejected',phase:'publication',roleId,stage,taskId:familyId||'legacy',candidateId:error.candidate?.id,reasons,...(snapshot?{snapshotHash:createHash('sha256').update(snapshot).digest('hex')}: {})}))
      if(snapshot&&Buffer.byteLength(snapshot,'utf8')<=262144)console.error(JSON.stringify({event:'curriculum_rejected_candidate',phase:'unpublished',roleId,stage,taskId:familyId||'legacy',candidate:error.candidate}))
      throw new ApiError(502, 'The new assignment did not pass its quality review. Your existing work is preserved. Please try another variation.', 'generation_quality')
    }
    throw error
  } finally { await query('DELETE FROM generation_locks WHERE key=$1 AND expires_at=$2::timestamptz',[key,locked[0].lock_identity]) }
}
