import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { query, transaction } from './db'
import { ApiError, appOrigin, hash, ipBucket, token, verifyPassword } from './security'
import { learner } from './services'
import { consumeQuota } from './provider-quota'
import { roles } from './content'
import { companies } from './companies'
import { taskFamilies } from './task-families'
import { submissionTiming } from './workspace-timing'
import { sanitizeEmployerEvaluation, scoreEmployerEvidence, type EmployerEvidence, type EmployerRequirement } from './employer-scoring'
import type { Evaluation } from './types'
import { EMPLOYER_DEMO_SEED, type DemoScenario } from './employer-demo'

const COOKIE = 'lumio_employer_session'
type Employer = { id: string; email: string; company_id: string; name: string; password_hash: string; requirements: EmployerRequirement[]; requirements_revision: number }
const cookie = (value: string, clear = false) => `${COOKIE}=${clear ? '' : value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : 28800}${appOrigin().startsWith('https:') ? '; Secure' : ''}`
function employerToken(request: Request) {
  const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined
}
export async function employer(request: Request, required = true): Promise<Employer | null> {
  const raw = employerToken(request)
  const account = raw ? (await query<Employer>('SELECT e.* FROM employer_accounts e JOIN employer_sessions s ON s.employer_id=e.id WHERE s.token_hash=$1 AND s.expires_at>now()', [hash(raw)]))[0] : null
  if (!account && required) throw new ApiError(401, 'Sign in with a provisioned employer account.', 'employer_session_required')
  return account || null
}
export const employerAuthSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('login'), email: z.string().email().max(254).transform(s => s.trim().toLowerCase()), password: z.string().min(12).max(128) }).strict(),
  z.object({ action: z.literal('logout') }).strict(),
])
export async function employerAuth(request: Request, data: z.infer<typeof employerAuthSchema>) {
  const raw = employerToken(request)
  if (data.action === 'logout') {
    if (raw) await query('DELETE FROM employer_sessions WHERE token_hash=$1', [hash(raw)])
    return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie('', true), 'Cache-Control': 'no-store' } })
  }
  const window = Math.floor(Date.now() / 900000)
  await consumeQuota(`employer-auth:${ipBucket(request)}:${window}`, 20, new Date((window + 1) * 900000))
  await consumeQuota(`employer-auth-email:${hash(data.email)}:${window}`, 10, new Date((window + 1) * 900000))
  const account = (await query<Employer>('SELECT * FROM employer_accounts WHERE email=$1', [data.email]))[0]
  if (!await verifyPassword(data.password, account?.password_hash || null) || !account) throw new ApiError(401, 'Email or password is incorrect.', 'invalid_credentials')
  const next = token()
  await transaction(async client => {
    if (raw) await client.query('DELETE FROM employer_sessions WHERE token_hash=$1', [hash(raw)])
    await client.query('DELETE FROM employer_sessions WHERE employer_id=$1', [account.id])
    await client.query("INSERT INTO employer_sessions(token_hash,employer_id,expires_at) VALUES($1,$2,now()+interval '8 hours')", [hash(next), account.id])
  })
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': cookie(next), 'Cache-Control': 'no-store' } })
}
export const requirementSchema = z.object({ revision: z.number().int().nonnegative(), requirements: z.array(z.object({ taskId: z.string().max(120), weights: z.record(z.string().max(100), z.number().int().min(0).max(10)) }).strict()).min(1).max(30) }).strict()
export function validateRequirements(requirements: EmployerRequirement[]) {
  if (new Set(requirements.map(r => r.taskId)).size !== requirements.length) throw new ApiError(400, 'Choose each task only once.', 'requirements_invalid')
  for (const requirement of requirements) {
    const family = taskFamilies.find(f => f.id === requirement.taskId)
    if (!family || !Object.keys(requirement.weights).length || !Object.values(requirement.weights).some(w => w > 0) || Object.keys(requirement.weights).some(id => !family.criteria.some(c => c.id === id))) throw new ApiError(400, 'Choose valid task criteria and at least one positive weight per task.', 'requirements_invalid')
  }
}
export async function saveEmployerRequirements(request: Request, data: z.infer<typeof requirementSchema>) {
  const account = (await employer(request))!
  validateRequirements(data.requirements)
  const updated = await query('UPDATE employer_accounts SET requirements=$2, requirements_revision=requirements_revision+1 WHERE id=$1 AND requirements_revision=$3 RETURNING requirements_revision', [account.id, JSON.stringify(data.requirements), data.revision])
  if (!updated.length) throw new ApiError(409, 'Requirements changed in another tab. Reload before saving.', 'requirements_conflict')
  return { revision: updated[0].requirements_revision }
}
export async function employerDashboard(request: Request) {
  const account = await employer(request, false)
  const catalog = { companies: companies.filter(c => c.relationship === 'independent-demo').map(c => ({ id: c.id, name: c.name })), roles: roles.map(r => ({ id: r.id, title: r.title, companyId: r.companyId, skills: r.skills })), families: taskFamilies }
  if (!account) {
    const variants = await query<{ id:string; task_id:string; rubric_version:string; duration:number }>("SELECT id,snapshot->'task'->>'taskId' AS task_id,snapshot->'task'->>'rubricVersion' AS rubric_version,(snapshot->'task'->>'duration')::integer AS duration FROM task_variants WHERE retired_at IS NULL AND catalog_hidden_at IS NULL AND stage='taster' AND variation IN (1,2) ORDER BY id")
    const demoScenarios: DemoScenario[] = variants.filter(v => taskFamilies.some(f => f.id === v.task_id && f.rubricVersion === v.rubric_version)).map(v => ({id:v.id,taskId:v.task_id,rubricVersion:v.rubric_version,duration:v.duration}))
    return { authenticated: false as const, catalog, demoScenarios, demoSeed: EMPLOYER_DEMO_SEED }
  }
  // Company-scoped opt-in, live share expiry and revocation are checked on every request.
  // Do not hydrate attempts here: that would load private drafts, conversations and attachments.
  const records = await query<{ learner_id: string; attempt_id: string; role_id: string; variant_id: string; stage: string; evaluation: Evaluation; assistance: number; submitted_at: Date; task_id: string; started_at:Date|null; received_at:Date|null; deadline_at:Date|null }>(`
    SELECT DISTINCT a.learner_id,a.id AS attempt_id,a.role_id,a.variant_id,a.stage,
      s.evaluation,s.assistance,s.created_at AS submitted_at,a.started_at,s.received_at,s.deadline_at,v.snapshot->'task'->>'taskId' AS task_id
    FROM employer_evidence_consents c
    JOIN shares sh ON sh.id=c.share_id AND sh.learner_id=c.learner_id
    JOIN learners l ON l.id=c.learner_id AND l.is_demo=false
    JOIN attempts a ON a.learner_id=c.learner_id AND a.id=ANY(sh.attempt_ids)
    JOIN task_variants v ON v.id=a.variant_id
    JOIN LATERAL (SELECT evaluation,assistance,created_at,received_at,deadline_at FROM submissions WHERE attempt_id=a.id ORDER BY version DESC LIMIT 1) s ON true
    WHERE c.company_id=$1 AND c.revoked_at IS NULL AND sh.revoked_at IS NULL AND sh.expires_at>now()
    ORDER BY a.learner_id,a.id`, [account.company_id])
  const shortlist = new Set((await query<{learner_id:string}>('SELECT learner_id FROM employer_shortlists WHERE employer_id=$1',[account.id])).map(r=>r.learner_id))
  const candidates = [...new Set(records.map(r => r.learner_id))].map(id => {
    const evidence: EmployerEvidence[] = records.filter(r => r.learner_id === id).map(r => ({ attemptId: r.attempt_id, taskId: r.task_id, scenarioId: r.variant_id, evaluation: sanitizeEmployerEvaluation(r.evaluation,taskFamilies.find(f=>f.id===r.task_id)), assistance: r.assistance, assessment: r.stage === 'assessment', submittedAt: new Date(r.submitted_at).toISOString(), timing:submissionTiming(r.started_at?.toISOString(),r.deadline_at?.toISOString(),r.received_at?.toISOString()) }))
    return { shortlisted: shortlist.has(id), id: hash(`${account.company_id}:${id}`).slice(0, 12), name: `Candidate ${hash(`${account.company_id}:${id}`).slice(0, 6).toUpperCase()}`, evidence, scoring: scoreEmployerEvidence(account.requirements, taskFamilies, evidence) }
  })
  return { authenticated: true as const, catalog, account: { name: account.name, companyId: account.company_id, email: account.email }, requirements: account.requirements, revision: account.requirements_revision, candidates }
}
export const employerConsentSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('grant'), shareId: z.string().uuid(), companyId: z.string().max(120) }).strict(),
  z.object({ action: z.literal('revoke'), id: z.string().uuid() }).strict(),
])
export async function getEmployerConsents(request: Request) {
  const user = (await learner(request))!
  const consents = await query<{ id: string; company_id: string; share_id: string; expires_at: Date }>('SELECT c.id,c.company_id,c.share_id,s.expires_at FROM employer_evidence_consents c JOIN shares s ON s.id=c.share_id AND s.learner_id=c.learner_id WHERE c.learner_id=$1 AND c.revoked_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now() ORDER BY c.created_at DESC', [user.id])
  return { consents: consents.map(c => ({ id: c.id, companyId: c.company_id, shareId: c.share_id, expiresAt: new Date(c.expires_at).toISOString() })) }
}
export async function changeEmployerConsent(request: Request, data: z.infer<typeof employerConsentSchema>) {
  const user = (await learner(request))!
  if (data.action === 'revoke') {
    const result = await query('UPDATE employer_evidence_consents SET revoked_at=now() WHERE id=$1 AND learner_id=$2 RETURNING id', [data.id, user.id])
    if (!result.length) throw new ApiError(404, 'This consent is unavailable.', 'consent_missing')
  } else {
    if (!companies.some(c => c.id === data.companyId && c.relationship === 'independent-demo')) throw new ApiError(400, 'Choose a listed company.', 'company_invalid')
    const result = await query(`INSERT INTO employer_evidence_consents(id,learner_id,share_id,company_id)
      SELECT $1,$2,s.id,$4 FROM shares s WHERE s.id=$3 AND s.learner_id=$2 AND s.revoked_at IS NULL AND s.expires_at>now()
      ON CONFLICT(share_id,company_id) DO UPDATE SET revoked_at=NULL,created_at=now() RETURNING id`, [randomUUID(), user.id, data.shareId, data.companyId])
    if (!result.length) throw new ApiError(404, 'Choose your own active evidence share.', 'share_missing')
  }
  return getEmployerConsents(request)
}

export const employerShortlistSchema = z.object({candidateId:z.string().regex(/^[a-f0-9]{12}$/),selected:z.boolean()}).strict()
export async function saveEmployerShortlist(request:Request,data:z.infer<typeof employerShortlistSchema>) {
  const account=(await employer(request))!
  return transaction(async client=>{
    // Recheck consent inside the write transaction. IDs are anonymous, company-scoped references.
    const result=await client.query<{id:string}>(`SELECT DISTINCT l.id FROM learners l
      JOIN employer_evidence_consents c ON c.learner_id=l.id
      JOIN shares s ON s.id=c.share_id AND s.learner_id=l.id
      JOIN attempts a ON a.learner_id=l.id AND a.id=ANY(s.attempt_ids)
      JOIN submissions sub ON sub.attempt_id=a.id
      WHERE c.company_id=$1 AND c.revoked_at IS NULL AND s.revoked_at IS NULL AND s.expires_at>now() AND l.is_demo=false`,[account.company_id])
    let id=result.rows.find(r=>hash(`${account.company_id}:${r.id}`).slice(0,12)===data.candidateId)?.id
    if (!id && !data.selected) {
      const saved=await client.query<{learner_id:string}>('SELECT learner_id FROM employer_shortlists WHERE employer_id=$1',[account.id])
      id=saved.rows.find(r=>hash(`${account.company_id}:${r.learner_id}`).slice(0,12)===data.candidateId)?.learner_id
    }
    if(!id) throw new ApiError(404,'This candidate evidence is no longer available.','candidate_unavailable')
    if(data.selected) await client.query('INSERT INTO employer_shortlists(employer_id,learner_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[account.id,id])
    else await client.query('DELETE FROM employer_shortlists WHERE employer_id=$1 AND learner_id=$2',[account.id,id])
    return {shortlisted:data.selected}
  })
}
