import { presentationDemoScope } from './demo-scope'
import 'server-only'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { getRole, getTask, roles, CONTENT_VERSION } from './content'
import { query, transaction } from './db'
import { consumeQuota, withProviderLease } from './provider-quota'
export { consumeQuota } from './provider-quota'
import { aiMode, colleagueReply } from './ai'
import { gradeVariant } from './ai-curriculum'
import { chooseVariant, variantById } from './variant-store'
import { attachmentsByIds } from './attachments'
import { assertNoRecognizableSecrets } from './privacy'
import { submissionTiming } from './workspace-timing'
import { getTaskFamilies } from './task-families'
import { ApiError, appOrigin, hash, ipBucket, passwordHash, sessionCookie, sessionToken, token, verifyPassword } from './security'
import type { Answers, Attempt, ChatMessage, Locale, Portfolio, Profile, Stage, Submission, Task, Evaluation } from './types'

type Learner = { id: string; name: string; email: string | null; locale: Locale; password_hash: string | null; is_demo: boolean }
type DbAttempt = { practice_feedback_count: number; started_at?:Date|null; deadline_at?:Date|null; attachment_ids?:string[]; id: string; learner_id: string; role_id: string; stage: Stage; locale: Locale; answers: Answers; work: string; revision: number; status: Attempt['status']; content_version: string; variant_id?: string | null; created_at: Date; updated_at: Date }
type DbSubmission = { received_at?:Date|null; deadline_at?:Date|null; on_time?:boolean|null; attachment_ids?:string[]; id: string; attempt_id: string; version: number; answers: Answers; work: string; evaluation: Submission['evaluation']; assistance: number; request_id: string; created_at: Date }
type DbMessage = { id: string; attempt_id: string; role: ChatMessage['role']; persona: ChatMessage['persona']; content: string; source: ChatMessage['source']; created_at: Date }
const iso = (value: Date | string) => new Date(value).toISOString()
const positiveEnv = (name: string, fallback: number) => { const n = Number(process.env[name] || fallback); return Number.isInteger(n) && n > 0 ? n : fallback }

export async function learner(request: Request, required = true): Promise<Learner | null> {
  const raw = sessionToken(request)
  const rows = raw ? await query<Learner>('SELECT l.* FROM learners l JOIN sessions s ON s.learner_id = l.id WHERE s.token_hash = $1 AND s.expires_at > now()', [hash(raw)]) : []
  if (!rows[0] && required) throw new ApiError(401, 'Start a learner session to continue.', 'session_required')
  return rows[0] || null
}
async function owned(request: Request): Promise<Learner> { return (await learner(request))! }
async function userThrottle(userId: string, action: string, limit: number): Promise<void> {
  const window = Math.floor(Date.now() / 60000)
  await consumeQuota(`${action}:user:${userId}:${window}`, limit, new Date((window + 1) * 60000))
}
async function throttle(request: Request, action: string, limit: number, minutes: number): Promise<void> {
  const window = Math.floor(Date.now() / (minutes * 60000))
  await consumeQuota(`${action}:${ipBucket(request)}:${window}`, limit, new Date((window + 1) * minutes * 60000))
}
export function validateAnswers(roleId: string, stage: Stage, answers: Answers, complete: boolean, snapshot?:Task): void {
  const task = snapshot || getTask(roleId, stage)
  if (!task) throw new ApiError(404, 'This role or assignment is unavailable.', 'task_missing')
  for (const [id, value] of Object.entries(answers)) {
    const question = task.questions.find(q => q.id === id)
    if (!question) throw new ApiError(400, 'An answer does not belong to this assignment.', 'invalid_answers')
    const options = question.options?.map(option => option.value) || []
    const valid = question.type === 'number'
      ? typeof value === 'number' && Number.isFinite(value)
      : question.type === 'select'
        ? typeof value === 'string' && options.includes(value)
        : Array.isArray(value) && value.every(v => options.includes(v)) && new Set(value).size === value.length
    if (!valid) throw new ApiError(400, 'An answer value is invalid for this assignment.', 'invalid_answers')
  }
  if (complete && task.questions.some(question => !(question.id in answers) || (Array.isArray(answers[question.id]) && (answers[question.id] as string[]).length === 0))) throw new ApiError(400, 'Complete all decisions before submitting.', 'incomplete_answers')
}
function mapSubmission(row: DbSubmission, startedAt?:string): Submission { return { timing:submissionTiming(startedAt,row.deadline_at?iso(row.deadline_at):undefined,row.received_at?iso(row.received_at):undefined), id: row.id, version: row.version, answers: row.answers, work: row.work, evaluation: row.evaluation, assistance: row.assistance, createdAt: iso(row.created_at) } }
function mapMessage(row: DbMessage): ChatMessage { return { id: row.id, role: row.role, persona: row.persona, content: row.content, source: row.source, createdAt: iso(row.created_at) } }
async function hydrate(rows: DbAttempt[]): Promise<Attempt[]> {
  if (!rows.length) return []
  const ids = rows.map(row => row.id)
  const [submissions, messages, variants, clock] = await Promise.all([
    query<DbSubmission>('SELECT * FROM submissions WHERE attempt_id = ANY($1::uuid[]) ORDER BY version ASC', [ids]),
    query<DbMessage>('SELECT * FROM messages WHERE attempt_id = ANY($1::uuid[]) ORDER BY created_at ASC, role DESC', [ids]),
    query<{id:string;snapshot:{task:Task};retired_at:Date|null}>('SELECT id,snapshot,retired_at FROM task_variants WHERE id=ANY($1::uuid[])',[rows.map(r=>r.variant_id).filter(Boolean)]),
    query<{server_now:Date}>('SELECT clock_timestamp() AS server_now'),
  ])
  const files=await attachmentsByIds([...new Set([...rows.flatMap(row=>row.attachment_ids||[]),...submissions.flatMap(row=>row.attachment_ids||[])])])
  const attached=(ids:string[]|undefined)=>(ids||[]).flatMap(id=>{const file=files.find(f=>f.id===id);return file?[file]:[]})
  return rows.map(row => ({ serverNow:iso(clock[0].server_now), ...(row.started_at?{startedAt:iso(row.started_at),deadlineAt:iso(row.deadline_at!)}:{}), attachments:attached(row.attachment_ids), id: row.id, roleId: row.role_id, stage: row.stage, locale: row.locale, answers: row.answers, work: row.work, revision: row.revision, status: row.status, contentVersion: row.content_version, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), ...(row.variant_id ? {variantId:row.variant_id,task:variants.find(v=>v.id===row.variant_id)?.snapshot.task,retired:!!variants.find(v=>v.id===row.variant_id)?.retired_at} : {}), submissions: submissions.filter(s => s.attempt_id === row.id).map(s=>({...mapSubmission(s,row.started_at?iso(row.started_at):undefined),attachments:attached(s.attachment_ids)})), messages: messages.filter(m => m.attempt_id === row.id).map(mapMessage) }))
}
async function attempts(userId: string): Promise<Attempt[]> { return hydrate(await query<DbAttempt>('SELECT * FROM attempts WHERE learner_id = $1 ORDER BY created_at ASC', [userId])) }
async function profile(user: Learner): Promise<Profile> { return { id: user.id, name: user.name, email: user.email, locale: user.locale, aiMode: aiMode(), demo: user.is_demo, attempts: await attempts(user.id) } }
export async function getProfile(request: Request): Promise<Profile> { return profile(await owned(request)) }
export async function getAttemptClock(request:Request,id:string) {
  const user=await owned(request)
  const row=(await query<{started_at:Date|null;deadline_at:Date|null;server_now:Date}>('SELECT started_at,deadline_at,clock_timestamp() AS server_now FROM attempts WHERE id=$1 AND learner_id=$2',[id,user.id]))[0]
  if(!row)throw new ApiError(404,'This assignment is unavailable.','attempt_missing')
  return {serverNow:iso(row.server_now),...(row.started_at?{startedAt:iso(row.started_at),deadlineAt:iso(row.deadline_at!)}:{})}
}

async function issueSession(client: PoolClient, learnerId: string): Promise<string> {
  const raw = token()
  await client.query('INSERT INTO sessions (token_hash, learner_id, expires_at) VALUES ($1, $2, now() + interval \'30 days\')', [hash(raw), learnerId])
  return sessionCookie(raw)
}
export async function startSession(request: Request, locale: Locale, freshGuest=false): Promise<Response> {
  const existing = await learner(request, false)
  if (existing && (existing.email || !freshGuest)) return Response.json(await profile(existing), { headers: { 'Cache-Control': 'no-store' } })
  await throttle(request, 'guest', positiveEnv('GUEST_SESSIONS_PER_HOUR', 20), 60)
  const result = await transaction(async client => {
    if(existing && !existing.email)await client.query('DELETE FROM learners WHERE id=$1 AND email IS NULL',[existing.id])
    const user = (await client.query<Learner>('INSERT INTO learners (id, locale) VALUES ($1, $2) RETURNING *', [randomUUID(), locale])).rows[0]
    return { user, cookie: await issueSession(client, user.id) }
  })
  return Response.json(await profile(result.user), { headers: { 'Set-Cookie': result.cookie, 'Cache-Control': 'no-store' } })
}
export async function authenticate(request: Request, data: { action: 'register' | 'login' | 'logout'; email?: string; password?: string; name?: string }): Promise<Response> {
  if (data.action === 'logout') {
    const raw = sessionToken(request)
    if (raw) await query('DELETE FROM sessions WHERE token_hash = $1', [hash(raw)])
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', true), 'Cache-Control': 'no-store' } })
  }
  await throttle(request, 'auth', positiveEnv('AUTH_REQUESTS_PER_15_MINUTES', 20), 15)
  const authWindow = Math.floor(Date.now() / 900000)
  await consumeQuota(`auth:email:${hash(data.email!)}:${authWindow}`, 10, new Date((authWindow + 1) * 900000))
  if (data.action === 'register') {
    const current = await learner(request, false)
    if (current?.email) throw new ApiError(409, 'You are already signed in to an account.', 'already_registered')
    const encoded = await passwordHash(data.password!)
    let result: { user: Learner; cookie: string }
    try {
      result = await transaction(async client => {
        const user = (await client.query<Learner>('INSERT INTO learners (id, email, password_hash, name) VALUES ($1, $2, $3, $4) RETURNING *', [randomUUID(), data.email, encoded, data.name])).rows[0]
        if(current && !current.email)await client.query('DELETE FROM learners WHERE id=$1 AND email IS NULL',[current.id])
        await client.query('DELETE FROM sessions WHERE learner_id = $1', [user.id])
        return { user, cookie: await issueSession(client, user.id) }
      })
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'An account with that email already exists. Sign in instead.', 'email_exists')
      throw error
    }
    return Response.json(await profile(result.user), { headers: { 'Set-Cookie': result.cookie, 'Cache-Control': 'no-store' } })
  }
  const user = (await query<Learner>('SELECT * FROM learners WHERE email = $1', [data.email]))[0]
  if (!await verifyPassword(data.password!, user?.password_hash || null) || !user) throw new ApiError(401, 'Email or password is incorrect.', 'invalid_credentials')
  const cookie = await transaction(async client => {
    const raw = sessionToken(request)
    if (raw) await client.query('DELETE FROM sessions WHERE token_hash = $1', [hash(raw)])
    return issueSession(client, user.id)
  })
  return Response.json(await profile(user), { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } })
}
export async function getAttempt(request: Request, id: string): Promise<Attempt> {
  const user = await owned(request)
  const row = (await query<DbAttempt>('SELECT * FROM attempts WHERE id = $1 AND learner_id = $2', [id, user.id]))[0]
  if (!row) throw new ApiError(404, 'This attempt is unavailable.', 'attempt_missing')
  return (await hydrate([row]))[0]
}
export async function startAttempt(request: Request, data: { roleId: string; stage: Stage; locale: Locale; variantId?:string; taskId?:string; newVariation?:boolean }): Promise<Attempt> {
  const user = await owned(request)
  if (!getRole(data.roleId) || !getTask(data.roleId,data.stage)) throw new ApiError(404, 'This role or assignment is unavailable.', 'task_missing')
  await userThrottle(user.id,'start',30)
  const stages:Stage[]=['taster','diagnose','fix','adapt','assessment']
  const position=stages.indexOf(data.stage)
  if(position>0) {
    const passed=await query("SELECT 1 FROM attempts a JOIN submissions s ON s.attempt_id=a.id JOIN task_variants v ON v.id=a.variant_id WHERE v.retired_at IS NULL AND v.snapshot->'task'->'company'->>'id'=$4 AND a.learner_id=$1 AND a.role_id=$2 AND a.stage=$3 AND s.evaluation->>'passed'='true' LIMIT 1",[user.id,data.roleId,stages[position-1],getRole(data.roleId)!.companyId])
    if(!passed.length) throw new ApiError(403,'Pass the preceding assignment to unlock this task.','prerequisite_required')
  }
  const variant=await chooseVariant(user.id,data.roleId,data.stage,data.newVariation===true,data.variantId,data.taskId)
  const rows=await query<DbAttempt>("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,started_at,deadline_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()+($8 * interval '1 minute')) ON CONFLICT(learner_id,variant_id) WHERE variant_id IS NOT NULL DO UPDATE SET locale=EXCLUDED.locale RETURNING *",[randomUUID(),user.id,data.roleId,data.stage,data.locale,`ai-v1:${variant.id}`,variant.id,variant.task.duration])
  await query('UPDATE learners SET locale=$2 WHERE id=$1',[user.id,data.locale])
  return (await hydrate(rows))[0]
}
export async function saveAttempt(request: Request, id: string, data: { answers: Answers; work: string; locale: Locale; revision: number }): Promise<Attempt> {
  const current = await getAttempt(request, id)
  await userThrottle((await owned(request)).id, 'draft', 120)
  if (current.stage === 'assessment' && current.submissions.length) throw new ApiError(409, 'This assessment has already been submitted. Its evidence is final.', 'assessment_already_submitted')
  if (!current.variantId && current.contentVersion !== CONTENT_VERSION) throw new ApiError(409, 'This assignment was updated. Return to discovery and start the current task.', 'content_changed')
  validateAnswers(current.roleId, current.stage, data.answers, false, current.task)
  const user = await owned(request)
  const rows = await query<DbAttempt>('UPDATE attempts SET answers = $3::jsonb, work = $4, locale = $5, revision = revision + 1, status = \'draft\', updated_at = now() WHERE id = $1 AND learner_id = $2 AND revision = $6 RETURNING *', [id, user.id, JSON.stringify(data.answers), data.work, data.locale, data.revision])
  if (!rows.length) throw new ApiError(409, 'A newer draft is saved. Reload the task before saving again.', 'revision_conflict')
  return (await hydrate(rows))[0]
}
export async function submitAttempt(request: Request, id: string, data: { answers: Answers; work: string; locale: Locale; requestId: string; revision?:number; consent?:boolean }): Promise<Attempt> {
  const user = await owned(request)
  await userThrottle(user.id, 'submit', 30)
  const attempt=await getAttempt(request,id)
  if(!attempt.variantId) {
    const existing=(await query<DbSubmission>('SELECT * FROM submissions WHERE attempt_id=$1 AND request_id=$2',[id,data.requestId]))[0]
    if(existing && sameAnswers(existing.answers,data.answers) && existing.work===data.work) return attempt
    throw new ApiError(409,'This earlier assignment is archived. Choose an AI-created variation for a new review.','legacy_archived')
  }
  return submitAiAttempt(request,attempt,data,user.id)
}

function sameAnswers(a: Answers, b: Answers): boolean { return JSON.stringify(Object.entries(a).sort(([x], [y]) => x.localeCompare(y))) === JSON.stringify(Object.entries(b).sort(([x], [y]) => x.localeCompare(y))) }
function validateAiWork(work:string,consent?:boolean,attachments:import('./types').Attachment[]=[]):void {
  assertNoRecognizableSecrets(work,...attachments.map(file=>file.extractedText))
  if(consent !== true) throw new ApiError(403,'Allow AI service to review your decisions and written work before requesting AI feedback.','ai_consent_required')
  if(work.trim().length+attachments.reduce((sum,file)=>sum+file.substantiveCharacters,0) < 50) throw new ApiError(400,'Explain your decisions in the handover or readable attached files, using at least 50 characters of substantive content.','insufficient_work')
}
async function submitAiAttempt(request:Request, attempt:Attempt, data:{answers:Answers;work:string;locale:Locale;requestId:string;revision?:number;consent?:boolean},userId:string):Promise<Attempt> {
  validateAiWork(data.work,data.consent,attempt.attachments)
  validateAnswers(attempt.roleId,attempt.stage,data.answers,!(attempt.attachments?.length),attempt.task)
  const fingerprint=hash(JSON.stringify({gradingPolicy:'lumio-absolute-2026-10-12.1',answers:Object.entries(data.answers).sort(([a],[b])=>a.localeCompare(b)),work:data.work,locale:data.locale,variantId:attempt.variantId,attachments:(attempt.attachments||[]).map(f=>({fileName:f.fileName,format:f.format,sha256:f.sha256,extractionHash:f.extractionHash,limitations:f.limitations}))}))
  const reservation=await transaction(async client=>{
    const current=(await client.query<DbAttempt>('SELECT * FROM attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE',[attempt.id,userId])).rows[0]
    if(!current) throw new ApiError(404,'This attempt is unavailable.','attempt_missing')
    if(JSON.stringify(current.attachment_ids||[])!==JSON.stringify((attempt.attachments||[]).map(f=>f.id))) throw new ApiError(409,'Your files changed before review. Refresh the draft and try again.','revision_conflict')
    const original=(await client.query<DbSubmission>('SELECT * FROM submissions WHERE attempt_id=$1 AND request_id=$2',[attempt.id,data.requestId])).rows[0]
    if(original) {
      if(!sameAnswers(original.answers,data.answers)||original.work!==data.work||JSON.stringify(original.attachment_ids||[])!==JSON.stringify((attempt.attachments||[]).map(f=>f.id))) throw new ApiError(409,'This request ID was already used for different work.','request_conflict')
      const review=(await client.query<{fingerprint:string}>('SELECT fingerprint FROM grading_requests WHERE attempt_id=$1 AND request_id=$2',[attempt.id,data.requestId])).rows[0]
      if(review && review.fingerprint!==fingerprint) throw new ApiError(409,'This request ID was already used for different review inputs.','request_conflict')
      // Recover a saved receipt before enforcing one-shot assessment or stale draft revision.
      return {done:true,revision:current.revision}
    }
    if(data.revision!==undefined&&current.revision!==data.revision) throw new ApiError(409,'Your draft changed. Refresh it before requesting AI review.','revision_conflict')
    if(current.stage==='assessment' && (await client.query('SELECT 1 FROM submissions WHERE attempt_id=$1 LIMIT 1',[attempt.id])).rowCount) throw new ApiError(409,'This assessment has already been submitted. Its evidence is final.','assessment_already_submitted')
    const existing=(await client.query<{id:string;state:string;fingerprint:string;evaluation:Evaluation;updated_at:Date}>('SELECT * FROM grading_requests WHERE attempt_id=$1 AND request_id=$2',[attempt.id,data.requestId])).rows[0]
    if(existing && existing.fingerprint!==fingerprint) throw new ApiError(409,'This review request ID was already used for different work.','request_conflict')
    if(existing?.state==='complete') return {id:existing.id,evaluation:existing.evaluation,revision:current.revision}
    if((await client.query("SELECT 1 FROM grading_requests WHERE attempt_id=$1 AND state='pending' AND updated_at>now()-interval '110 seconds'",[attempt.id])).rowCount) throw new ApiError(409,'Your work is already being reviewed. Please wait for the result.','grading_pending')
    const cached=(await client.query<{evaluation:Evaluation}>("SELECT evaluation FROM grading_requests WHERE attempt_id=$1 AND learner_id=$2 AND fingerprint=$3 AND state='complete' AND evaluation IS NOT NULL ORDER BY created_at,id LIMIT 1",[attempt.id,userId,fingerprint])).rows[0]
    const id=existing?.id||randomUUID()
    if(existing) await client.query("UPDATE grading_requests SET state='pending',updated_at=now() WHERE id=$1",[id])
    else await client.query("INSERT INTO grading_requests(id,attempt_id,learner_id,request_id,fingerprint,state) VALUES ($1,$2,$3,$4,$5,'pending')",[id,attempt.id,userId,data.requestId,fingerprint])
    return {id,revision:current.revision,...(cached?{evaluation:cached.evaluation}:{})}
  })
  if('done' in reservation) return getAttempt(request,attempt.id)
  try {
    const evaluation=reservation.evaluation || await withProviderLease(userId,'submission',async(reserveRetry)=>gradeVariant(await variantById(attempt.variantId!,true),data.answers,data.work,data.locale,reserveRetry,attempt.attachments))
    const stored = await query("UPDATE grading_requests SET state='complete',evaluation=$2::jsonb,updated_at=now() WHERE id=$1 RETURNING id",[reservation.id,JSON.stringify(evaluation)])
    if(!stored.length) throw new ApiError(410,'This learner session has been erased.','session_erased')
    await transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock_shared(91427832)')
      const current=(await client.query<DbAttempt>('SELECT * FROM attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE',[attempt.id,userId])).rows[0]
      if(!current) throw new ApiError(410,'This learner session has been erased.','session_erased')
      const done=await client.query('SELECT 1 FROM submissions WHERE attempt_id=$1 AND request_id=$2',[attempt.id,data.requestId])
      if(done.rowCount) return
      const active=await client.query('SELECT 1 FROM task_variants WHERE id=$1 AND retired_at IS NULL',[attempt.variantId])
      if(!active.rowCount) throw new ApiError(409,'This variation was retired during review. Your draft is preserved. Choose a current variation.','variation_retired')
      if(current.revision!==reservation.revision) throw new ApiError(409,'Your draft changed during the AI review. Submit the current draft again.','revision_conflict')
      const count=await client.query<{count:string}>('SELECT count(*) AS count FROM messages WHERE attempt_id=$1 AND role=\'assistant\'',[attempt.id])
      const versions=await client.query<{version:number}>('SELECT COALESCE(max(version),0)+1 AS version FROM submissions WHERE attempt_id=$1',[attempt.id])
      await client.query(`INSERT INTO submissions(id,attempt_id,version,answers,work,evaluation,assistance,request_id,attachment_ids,received_at,deadline_at,on_time) SELECT $1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8,$9::uuid[],g.received_at,a.deadline_at,CASE WHEN a.deadline_at IS NULL THEN NULL ELSE g.received_at <= a.deadline_at END FROM grading_requests g JOIN attempts a ON a.id=g.attempt_id WHERE g.id=$10`,[randomUUID(),attempt.id,versions.rows[0].version,JSON.stringify(data.answers),data.work,JSON.stringify(evaluation),Number(count.rows[0].count)+current.practice_feedback_count,data.requestId,(attempt.attachments||[]).map(f=>f.id),reservation.id])
      await client.query("UPDATE attempts SET answers=$2::jsonb,work=$3,locale=$4,status='submitted',revision=revision+1,updated_at=now() WHERE id=$1",[attempt.id,JSON.stringify(data.answers),data.work,data.locale])
    })
  } catch(error) {
    await query("UPDATE grading_requests SET state='failed',updated_at=now() WHERE id=$1 AND state='pending'",[reservation.id])
    throw error
  }
  return getAttempt(request,attempt.id)
}
export async function checkAttempt(request: Request, id: string, answers: Answers, data:{work?:string;locale?:Locale;revision?:number;consent?:boolean}={}): Promise<Submission['evaluation']> {
  const current = await getAttempt(request, id)
  await userThrottle((await owned(request)).id, 'check', 60)
  if (!current.variantId && current.contentVersion !== CONTENT_VERSION) throw new ApiError(409, 'This assignment was updated. Return to discovery and start the current task.', 'content_changed')
  if(data.revision!==undefined&&current.revision!==data.revision) throw new ApiError(409,'Your draft changed. Refresh it before requesting AI review.','revision_conflict')
  if (current.stage === 'assessment') throw new ApiError(403, 'Practice checks are disabled during assessment. Submit your independent work for a final result.', 'assessment_no_check')
  validateAnswers(current.roleId, current.stage, answers, !current.attachments?.length, current.task)
  if(current.variantId) {
    validateAiWork(data.work || '',data.consent,current.attachments)
    const evaluation=await withProviderLease((await owned(request)).id,'feedback',async(reserveRetry)=>gradeVariant(await variantById(current.variantId!,true),answers,data.work || '',data.locale || current.locale,reserveRetry,current.attachments))
    await variantById(current.variantId,true)
    await transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock_shared(91427832)')
      const latest=(await client.query<DbAttempt>('SELECT * FROM attempts WHERE id=$1 AND learner_id=$2 FOR UPDATE',[id,(await owned(request)).id])).rows[0]
      if(!latest) throw new ApiError(410,'This learner session has been erased.','session_erased')
      if(latest.revision!==current.revision) throw new ApiError(409,'Your draft changed during the AI review. Review the current draft again.','revision_conflict')
      const active=await client.query('SELECT id FROM task_variants WHERE id=$1 AND retired_at IS NULL',[current.variantId])
      if(!active.rowCount) throw new ApiError(409,'This variation was retired during review. Choose a current variation.','variation_retired')
      // Record delivered AI feedback without modifying the draft clock or revision.
      await client.query('UPDATE attempts SET practice_feedback_count=practice_feedback_count+1 WHERE id=$1',[id])
    })
    return evaluation
  }
  throw new ApiError(409,'This earlier assignment is archived. Choose an AI-created variation for a new review.','legacy_archived')
}
export async function chat(request: Request, id: string, data: { message: string; persona: 'coach' | 'manager'; requestId: string }): Promise<{ message: ChatMessage }> {
  const user = await owned(request)
  const attempt = await getAttempt(request, id)
  assertNoRecognizableSecrets(data.message,attempt.work,...(attempt.attachments||[]).map(file=>file.extractedText),...attempt.messages.map(message=>message.content))
  await userThrottle(user.id, 'chat', 10)
  if (!attempt.variantId && attempt.contentVersion !== CONTENT_VERSION) throw new ApiError(409, 'This assignment was updated. Return to discovery and start the current task.', 'content_changed')
  if(!attempt.variantId) throw new ApiError(409,'This earlier assignment is archived. Choose an AI-created variation.','legacy_archived')
  if(attempt.retired) throw new ApiError(409,'This variation was retired after review. Choose a current variation.','variation_retired')
  if (attempt.stage === 'assessment') throw new ApiError(403, 'All AI assistance is disabled during assessment.', 'assessment_no_ai')
  const reservation = await transaction(async client => {
    // Serialize request reservations per learner to enforce concurrency and per-user quotas.
    await client.query('SELECT id FROM learners WHERE id = $1 FOR UPDATE', [user.id])
    const current = (await client.query<{ id: string; state: string; persona: string; user_content: string; updated_at: Date }>('SELECT * FROM ai_requests WHERE attempt_id = $1 AND request_id = $2', [id, data.requestId])).rows[0]
    if (current && (current.persona !== data.persona || current.user_content !== data.message)) throw new ApiError(409, 'This conversation request ID was used for a different message.', 'request_conflict')
    if (current?.state === 'complete') {
      const message = (await client.query<DbMessage>('SELECT * FROM messages WHERE request_id = $1 AND role = \'assistant\'', [current.id])).rows[0]
      if (message) return { cached: mapMessage(message), id: current.id }
    }
    if (current?.state === 'pending' && Date.now() - current.updated_at.getTime() < 55000) throw new ApiError(409, 'This message is already being answered. Wait a moment before retrying.', 'ai_request_pending')
    const inFlight = await client.query('SELECT 1 FROM ai_requests WHERE learner_id = $1 AND state = \'pending\' AND updated_at > now() - interval \'55 seconds\' LIMIT 1', [user.id])
    if (inFlight.rowCount) throw new ApiError(429, 'Wait for your current conversation reply before sending another message.', 'ai_concurrency_limit')
    const day = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(`${day}T00:00:00.000Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    await consumeQuota(`ai:user:${user.id}:${day}`, positiveEnv('AI_DAILY_USER_LIMIT', 60), tomorrow, client)
    await consumeQuota(`ai:global:${day}`, positiveEnv('AI_DAILY_GLOBAL_LIMIT', 1000), tomorrow, client)
    const requestId = current?.id || randomUUID()
    if (current) await client.query('UPDATE ai_requests SET state = \'pending\', updated_at = now() WHERE id = $1', [requestId])
    else await client.query('INSERT INTO ai_requests (id, attempt_id, learner_id, request_id, persona, user_content, state) VALUES ($1, $2, $3, $4, $5, $6, \'pending\')', [requestId, id, user.id, data.requestId, data.persona, data.message])
    await client.query('INSERT INTO messages (id, attempt_id, request_id, role, persona, content, source) VALUES ($1, $2, $3, \'user\', $4, $5, \'learner\') ON CONFLICT (request_id, role) DO NOTHING', [randomUUID(), id, requestId, data.persona, data.message])
    return { id: requestId }
  })
  if ('cached' in reservation && reservation.cached) return { message: reservation.cached }
  try {
    const reply = await withProviderLease(user.id,'conversation',()=>colleagueReply(attempt,data.message,data.persona),false)
    const message = await transaction(async client => {
      // The learner may erase their account while the provider request is in flight.
      const saved = await client.query('UPDATE ai_requests SET state = \'complete\', input_tokens = $2, output_tokens = $3, updated_at = now() WHERE id = $1 RETURNING id', [reservation.id, reply.inputTokens ?? null, reply.outputTokens ?? null])
      if (!saved.rowCount) throw new ApiError(410, 'This learner session has been erased.', 'session_erased')
      const row = (await client.query<DbMessage>('INSERT INTO messages (id, attempt_id, request_id, role, persona, content, source) VALUES ($1, $2, $3, \'assistant\', $4, $5, $6) RETURNING *', [randomUUID(), id, reservation.id, data.persona, reply.content, reply.source])).rows[0]
      return mapMessage(row)
    })
    return { message }
  } catch (error) {
    await query('UPDATE ai_requests SET state = \'failed\', updated_at = now() WHERE id = $1 AND state = \'pending\'', [reservation.id])
    throw error
  }
}
export async function getPortfolio(request: Request): Promise<Portfolio> {
  const user = await owned(request)
  const shares = await query<{ id: string; expires_at: Date; created_at: Date }>('SELECT id, expires_at, created_at FROM shares WHERE learner_id = $1 AND revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC', [user.id])
  return { attempts: await attempts(user.id), shares: shares.map(s => ({ id: s.id, expiresAt: iso(s.expires_at), createdAt: iso(s.created_at) })) }
}
export async function createShare(request: Request, attemptIds: string[]): Promise<{ id: string; url: string; expiresAt: string }> {
  const user = await owned(request)
  await userThrottle(user.id, 'share', 10)
  const selected = await query('SELECT a.id FROM attempts a WHERE a.learner_id = $1 AND a.id = ANY($2::uuid[]) AND EXISTS (SELECT 1 FROM submissions s WHERE s.attempt_id = a.id)', [user.id, attemptIds])
  if (selected.length !== new Set(attemptIds).size) throw new ApiError(400, 'Share only your attempts with submitted evidence.', 'share_invalid')
  const raw = token()
  const id = randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()
  await query('INSERT INTO shares (id, learner_id, token_hash, attempt_ids, expires_at) VALUES ($1, $2, $3, $4::uuid[], $5)', [id, user.id, hash(raw), [...new Set(attemptIds)], expiresAt])
  return { id, url: `${appOrigin()}/share/${raw}`, expiresAt }
}
export async function revokeShare(request: Request, id: string): Promise<{ ok: true }> {
  const user = await owned(request)
  const rows = await query('UPDATE shares SET revoked_at = now() WHERE id = $1 AND learner_id = $2 RETURNING id', [id, user.id])
  if (!rows.length) throw new ApiError(404, 'This share is unavailable.', 'share_missing')
  return { ok: true }
}
export function publicEvidence(attempt: Attempt): Attempt {
  const latest = attempt.submissions.at(-1)
  return { ...attempt, attachments:latest?.attachments||[], answers: latest?.answers || {}, work: latest?.work || '', revision: 0, status: 'submitted', messages: [], updatedAt: latest?.createdAt || attempt.updatedAt }
}
export async function readShare(raw: string): Promise<{ attempts: Attempt[]; demo: boolean }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw new ApiError(404, 'This share has expired or is unavailable.', 'share_missing')
  const share = (await query<{ learner_id: string; attempt_ids: string[]; is_demo: boolean }>('SELECT s.learner_id, s.attempt_ids, l.is_demo FROM shares s JOIN learners l ON l.id = s.learner_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()', [hash(raw)]))[0]
  if (!share) throw new ApiError(404, 'This share has expired or is unavailable.', 'share_missing')
  const records = await hydrate(await query<DbAttempt>('SELECT * FROM attempts WHERE learner_id = $1 AND id = ANY($2::uuid[]) ORDER BY created_at ASC', [share.learner_id, share.attempt_ids]))
  const sharedFiles=(files:import('./types').Attachment[]|undefined)=>(files||[]).map(file=>({...file,downloadUrl:`/api/attachments/${file.id}?share=${encodeURIComponent(raw)}`}))
  return { attempts: records.filter(a => a.submissions.length).map(a=>({...publicEvidence(a),attachments:sharedFiles(a.submissions.at(-1)?.attachments),submissions:a.submissions.map(s=>({...s,attachments:sharedFiles(s.attachments)}))})), demo: share.is_demo }
}
export async function exportPortfolio(request: Request): Promise<Response> {
  const user = await owned(request)
  const records = await getPortfolio(request)
  return Response.json({ exportedAt: new Date().toISOString(), demo: user.is_demo, description: 'Independent Lumio simulations using public company context and synthetic staff, rules and records. Not affiliated with or endorsed by these companies and not a current vacancy. This is not employment experience or an accredited qualification. Assistance records cover Lumio only. This export includes readable file content and original download links. Download original files separately before deleting your account.', profile: { id: user.id, name: user.name, email: user.email, locale: user.locale }, ...records }, { headers: { 'Content-Disposition': 'attachment; filename="lumio-portfolio.json"', 'Cache-Control': 'no-store' } })
}
export async function resetTaskHistory(request:Request):Promise<Profile> {
  const user=await owned(request)
  await transaction(async client=>{
    await client.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[user.id])
    await client.query('DELETE FROM shares WHERE learner_id=$1',[user.id])
    await client.query('DELETE FROM attempts WHERE learner_id=$1',[user.id])
    await client.query('UPDATE learners SET is_demo=false WHERE id=$1',[user.id])
  })
  return profile({...user,is_demo:false})
}
export async function eraseLearner(request: Request): Promise<Response> {
  const user = await owned(request)
  await transaction(async client => {
    await client.query('DELETE FROM learners WHERE id = $1', [user.id])
    await client.query('DELETE FROM quotas WHERE key LIKE $1', [`%:user:${user.id}:%`])
  })
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': sessionCookie('', true), 'Cache-Control': 'no-store' } })
}
export async function health(): Promise<Response> {
  try {
    appOrigin()
    await query('SELECT 1 FROM learners LIMIT 1')
    if (process.env.NODE_ENV === 'production' && aiMode() === 'unavailable') throw new ApiError(503, 'AI configuration is missing.', 'ai_not_configured')
    return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}


export async function populateDemo(request: Request): Promise<Profile> {
  const user=await owned(request)
  if(user.email) throw new ApiError(409,'Use a fresh guest session for the presentation demo.','demo_guest_required')
  const demoScope=presentationDemoScope(roles)
  const catalog=await query<{snapshot:import('./ai-curriculum').GeneratedVariant;presentation:{demoEvaluation?:Evaluation;demoPoorSample?:{answers:Answers;work:import('./types').Text;evaluation:Evaluation}}}>("SELECT snapshot,presentation FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND (stage <> 'taster' OR task_id=ANY($1::text[])) AND snapshot->'task'->'company' IS NOT NULL AND variation=1 AND stage <> 'assessment' ORDER BY CASE WHEN stage='taster' THEN 0 ELSE 1 END,role_id,stage",[demoScope.taskIds])
  const samples=catalog.map(r=>({...r.snapshot,...r.presentation})).filter(v=>v.demoEvaluation)
  if(samples.length!==demoScope.sampleCount || !samples.some(v=>v.roleId==='ai-engineer'&&v.stage==='fix'&&v.demoPoorSample)) throw new ApiError(503,'The AI presentation samples are still being prepared. Try a career variation while the demo is prepared.','demo_preparing')
  const result=await transaction(async client=>{
    const current=(await client.query<Learner>('SELECT * FROM learners WHERE id=$1 FOR UPDATE',[user.id])).rows[0]
    if(!current) throw new ApiError(401,'Start a guest session to use the demo.','session_required')
    if(current.email) throw new ApiError(409,'Use a fresh guest session for the presentation demo.','demo_guest_required')
    if(!current.is_demo && (await client.query('SELECT 1 FROM attempts WHERE learner_id=$1 LIMIT 1',[user.id])).rowCount) throw new ApiError(409,'Your session already contains work. Use a fresh guest session for the demo.','demo_existing_work')
    for(const sample of samples) {
      const id=randomUUID()
      const inserted=await client.query('INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id',[id,user.id,sample.roleId,sample.stage,'en',`ai-v1:${sample.id}`,sample.id])
      if(!inserted.rowCount) continue
      const versions:{answers:Answers;work:import('./types').Text;evaluation:Evaluation}[]=[]
      const poor=(sample as typeof sample & {demoPoorSample?:{answers:Answers;work:import('./types').Text;evaluation:Evaluation}}).demoPoorSample
      if(poor) versions.push(poor)
      versions.push({answers:sample.rubric.expectedAnswers,work:sample.rubric.exemplar,evaluation:sample.demoEvaluation!})
      for(const [index,version] of versions.entries()) {
        const work=version.work.en
        validateAnswers(sample.roleId,sample.stage,version.answers,true,sample.task)
        await client.query('INSERT INTO submissions(id,attempt_id,version,answers,work,evaluation,assistance,request_id) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,0,$7)',[randomUUID(),id,index+1,JSON.stringify(version.answers),work,JSON.stringify(version.evaluation),randomUUID()])
        await client.query("UPDATE attempts SET answers=$2::jsonb,work=$3,status='submitted',revision=revision+1 WHERE id=$1",[id,JSON.stringify(version.answers),work])
      }
    }
    return (await client.query<Learner>("UPDATE learners SET is_demo=true,name='Presentation demo' WHERE id=$1 RETURNING *",[user.id])).rows[0]
  })
  return profile(result)
}
