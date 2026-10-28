import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { query, database } from '../src/lib/db'
import { employer, employerAuth, employerDashboard, saveEmployerRequirements, changeEmployerConsent, getEmployerConsents, saveEmployerShortlist } from '../src/lib/employer'
import { hash, passwordHash, token } from '../src/lib/security'
import { taskFamilies } from '../src/lib/task-families'
import { companies } from '../src/lib/companies'
import { resetTaskHistory } from '../src/lib/services'
import { GET as employerExportPreflight } from '../src/app/api/employer/route'
import type { Evaluation } from '../src/lib/types'
const ids = { learner: randomUUID(), outsider: randomUUID(), employer: randomUUID(), otherEmployer: randomUUID(), attempt: randomUUID(), privateAttempt: randomUUID(), share: randomUUID(), otherShare: randomUUID(), submission: randomUUID() }
const learnerToken = token(), outsiderToken = token(), employerToken = token(), otherEmployerToken = token()
const prefix = `qa-employer-${randomUUID()}`
const makeRequest = (name: string, value: string) => new Request('http://localhost/api/employer', { headers: { cookie: `${name}=${value}` } })
const learnerRequest = makeRequest('lumio_session', learnerToken)
const outsiderRequest = makeRequest('lumio_session', outsiderToken)
const employerRequest = makeRequest('lumio_employer_session', employerToken)
const otherEmployerRequest = makeRequest('lumio_employer_session', otherEmployerToken)
const companyId = companies.find(c => c.relationship === 'independent-demo')!.id
const otherCompanyId = companies.filter(c => c.relationship === 'independent-demo')[1].id
let family = taskFamilies[0]
let consentId = ''
const requirements = () => [{ taskId: family.id, weights: Object.fromEntries(family.criteria.map(c => [c.id, 1])) }]
describe.skipIf(process.env.RUN_DB_TESTS !== 'true')('employer separation, absolute scores and revocable company consent', () => {
  beforeAll(async () => {
    const variant = (await query<{ id: string; snapshot: { task: { taskId: string; rubricVersion: string } } }>('SELECT id,snapshot FROM task_variants WHERE retired_at IS NULL AND snapshot->\'task\'->>\'taskId\'=$1 LIMIT 1', [family.id]))[0]
    if (!variant) throw new Error('Migrate the reviewed catalog before employer tests')
    const evaluation: Evaluation = { score: 100, passed: true, rubricVersion: family.rubricVersion, source: 'deepseek', summary:{en:'PRIVATE_EVALUATION_SUMMARY',zh:'PRIVATE_EVALUATION_SUMMARY'},nextSteps:{en:'PRIVATE_EVALUATION_NEXT',zh:'PRIVATE_EVALUATION_NEXT'},simulations:[{id:'test',label:{en:'PRIVATE_EVALUATION_LABEL',zh:'PRIVATE_EVALUATION_LABEL'},actual:'PRIVATE_EVALUATION_ACTUAL',expected:'PRIVATE_EVALUATION_EXPECTED',passed:true}],checks: family.criteria.map(c => ({ id: c.id, label: {en:'PRIVATE_EVALUATION_CHECK_LABEL',zh:'PRIVATE_EVALUATION_CHECK_LABEL'}, points: c.points, awarded: c.points, passed: true, feedback: { en: 'PRIVATE_EVALUATION_FEEDBACK SHARED HANDOVER', zh: 'PRIVATE_EVALUATION_FEEDBACK SHARED HANDOVER' } })) }
    await query('INSERT INTO learners(id,name,email) VALUES($1,$2,$3),($4,$5,$6)', [ids.learner, 'PRIVATE REAL NAME', `${prefix}@example.test`, ids.outsider, 'OUTSIDER', `${prefix}-other@example.test`])
    await query("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')", [hash(learnerToken), ids.learner, hash(outsiderToken), ids.outsider])
    const encoded = await passwordHash('IsolatedQaPassword!123')
    await query('INSERT INTO employer_accounts(id,email,password_hash,company_id,name,requirements) VALUES($1,$2,$3,$4,$5,$6),($7,$8,$3,$9,$10,$6)', [ids.employer, `${prefix}-employer@example.test`, encoded, companyId, 'QA employer', JSON.stringify(requirements()), ids.otherEmployer, `${prefix}-other-employer@example.test`, otherCompanyId, 'QA other employer'])
    await query("INSERT INTO employer_sessions(token_hash,employer_id,expires_at) VALUES($1,$2,now()+interval '1 hour'),($3,$4,now()+interval '1 hour')", [hash(employerToken), ids.employer, hash(otherEmployerToken), ids.otherEmployer])
    await query("INSERT INTO attempts(id,learner_id,role_id,stage,locale,content_version,variant_id,work) VALUES($1,$2,$3,'taster','en','qa-employer',$4,'PRIVATE UNFINISHED DRAFT'),($5,$2,$3,'taster','en','qa-employer-private',NULL,'PRIVATE OTHER ATTEMPT')", [ids.attempt, ids.learner, family.roleId, variant.id, ids.privateAttempt])
    await query('INSERT INTO submissions(id,attempt_id,version,answers,work,evaluation,request_id) VALUES($1,$2,1,$3,$4,$5,$6)', [ids.submission, ids.attempt, '{}', 'SHARED HANDOVER', JSON.stringify(evaluation), randomUUID()])
    await query("INSERT INTO shares(id,learner_id,token_hash,attempt_ids,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 hour'),($5,$6,$7,$8,now()+interval '1 hour')", [ids.share, ids.learner, hash(token()), [ids.attempt], ids.otherShare, ids.outsider, hash(token()), []])
  })
  afterAll(async () => {
    await query('DELETE FROM employer_accounts WHERE id=ANY($1::uuid[])', [[ids.employer, ids.otherEmployer]])
    await query('DELETE FROM learners WHERE id=ANY($1::uuid[])', [[ids.learner, ids.outsider]])
    await query('DELETE FROM quotas WHERE key LIKE $1', [`%${hash(`${prefix}-employer@example.test`)}%`])
    await database().end()
  })
  it('does not authenticate a learner cookie as an employer and reveals no live candidates to guests', async () => {
    await expect(employer(learnerRequest)).rejects.toMatchObject({ status: 401 })
    const guest = await employerDashboard(learnerRequest)
    expect(guest.authenticated).toBe(false)
    expect(guest).not.toHaveProperty('candidates')
    expect(guest).toHaveProperty('demoSeed')
    expect(guest).toHaveProperty('demoScenarios')
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates', [])
  })
  it('cannot grant another learner’s share and requires learner identity', async () => {
    await expect(changeEmployerConsent(outsiderRequest, { action: 'grant', shareId: ids.share, companyId })).rejects.toMatchObject({ status: 404 })
    await expect(changeEmployerConsent(employerRequest, { action: 'grant', shareId: ids.share, companyId })).rejects.toMatchObject({ status: 401 })
  })
  it('grants one chosen company access to only selected, submitted task evidence', async () => {
    const result = await changeEmployerConsent(learnerRequest, { action: 'grant', shareId: ids.share, companyId })
    consentId = result.consents[0].id
    const report = await employerDashboard(employerRequest)
    if (!report.authenticated) throw new Error('Expected employer login')
    expect(report.candidates).toHaveLength(1)
    expect(report.candidates[0].scoring.score).toBe(100)
    expect(report.candidates[0].evidence).toHaveLength(1)
    expect(report.candidates[0].evidence[0].attemptId).toBe(ids.attempt)
    const serialized = JSON.stringify(report)
    for (const privateData of ['PRIVATE REAL NAME', 'PRIVATE UNFINISHED DRAFT', 'PRIVATE OTHER ATTEMPT', `${prefix}@example.test`, 'SHARED HANDOVER', 'downloadUrl', 'PRIVATE_EVALUATION_']) expect(serialized).not.toContain(privateData)
    expect((await employerDashboard(otherEmployerRequest))).toHaveProperty('candidates', [])
  })
  it('persists an owner-only shortlist and blocks learner or cross-company writes',async()=>{
    const report=await employerDashboard(employerRequest)
    if(!report.authenticated)throw new Error('Expected employer login')
    const candidateId=report.candidates[0].id
    await expect(saveEmployerShortlist(learnerRequest,{candidateId,selected:true})).rejects.toMatchObject({status:401})
    await expect(saveEmployerShortlist(otherEmployerRequest,{candidateId,selected:true})).rejects.toMatchObject({status:404})
    expect(await saveEmployerShortlist(employerRequest,{candidateId,selected:true})).toEqual({shortlisted:true})
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates.0.shortlisted',true)
    await saveEmployerShortlist(employerRequest,{candidateId,selected:true})
    expect((await query('SELECT * FROM employer_shortlists WHERE employer_id=$1',[ids.employer]))).toHaveLength(1)
  })
  it('scores only the selected role task while keeping company-scoped evidence private',async()=>{
    const otherRoleFamily=taskFamilies.find(f=>f.roleId!==family.roleId)!
    const next=[{taskId:otherRoleFamily.id,weights:Object.fromEntries(otherRoleFamily.criteria.map(c=>[c.id,1]))}]
    expect(await saveEmployerRequirements(employerRequest,{revision:0,requirements:next})).toEqual({revision:1})
    const report=await employerDashboard(employerRequest)
    if(!report.authenticated)throw new Error('Expected employer login')
    expect(report.candidates).toHaveLength(1)
    expect(report.candidates[0].scoring).toMatchObject({score:null,observedScore:null,coverage:0,samples:0})
    expect(report.candidates[0].scoring.tasks[0].taskId).toBe(otherRoleFamily.id)
    const otherCompany=await employerExportPreflight(otherEmployerRequest)
    expect(otherCompany.status).toBe(200)
    expect(await otherCompany.json()).toHaveProperty('candidates',[])
    expect(await saveEmployerRequirements(employerRequest,{revision:1,requirements:requirements()})).toEqual({revision:2})
  })
  it('stores requirements on the authenticated owner and detects concurrent edits', async () => {
    expect(await saveEmployerRequirements(employerRequest, { requirements: requirements(), revision: 2 })).toEqual({ revision: 3 })
    await expect(saveEmployerRequirements(employerRequest, { requirements: requirements(), revision: 2 })).rejects.toMatchObject({ status: 409 })
    expect((await query('SELECT requirements_revision FROM employer_accounts WHERE id=$1', [ids.otherEmployer]))[0].requirements_revision).toBe(0)
  })
  it('rejects outsider revocation and removes company access immediately after learner revocation', async () => {
    await expect(changeEmployerConsent(outsiderRequest, { action: 'revoke', id: consentId })).rejects.toMatchObject({ status: 404 })
    const candidateId=hash(`${companyId}:${ids.learner}`).slice(0,12)
    const cachedResponse=await employerExportPreflight(employerRequest)
    expect(cachedResponse.headers.get('cache-control')).toBe('no-store')
    const cached=await cachedResponse.json()
    expect(cached).toHaveProperty('candidates.0.id',candidateId)
    expect(cached).toHaveProperty('candidates.0.shortlisted',true)
    await changeEmployerConsent(learnerRequest, { action: 'revoke', id: consentId })
    await expect(saveEmployerShortlist(employerRequest,{candidateId,selected:true})).rejects.toMatchObject({status:404})
    expect(await saveEmployerShortlist(employerRequest,{candidateId,selected:false})).toEqual({shortlisted:false})
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates', [])
    const freshResponse=await employerExportPreflight(employerRequest)
    const fresh=await freshResponse.json()
    expect(fresh).toMatchObject({authenticated:true,candidates:[]})
    expect(JSON.stringify(fresh)).not.toContain(candidateId)
    // The previously downloaded data is a historical disclosure. A new export preflight is empty.
    expect(cached.candidates).toHaveLength(1)
  })
  it('stops access after public share revocation or expiry, even with unrevoked company consent', async () => {
    await changeEmployerConsent(learnerRequest, { action: 'grant', shareId: ids.share, companyId })
    const candidateId=hash(`${companyId}:${ids.learner}`).slice(0,12)
    await saveEmployerShortlist(employerRequest,{candidateId,selected:true})
    await query('UPDATE shares SET revoked_at=now() WHERE id=$1', [ids.share])
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates', [])
    expect((await getEmployerConsents(learnerRequest)).consents).toHaveLength(0)
    await expect(saveEmployerShortlist(employerRequest,{candidateId,selected:true})).rejects.toMatchObject({status:404})
    expect(await (await employerExportPreflight(employerRequest)).json()).toHaveProperty('candidates',[])
    await query("UPDATE shares SET revoked_at=NULL,expires_at=now()-interval '1 second' WHERE id=$1", [ids.share])
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates', [])
    await expect(changeEmployerConsent(learnerRequest, { action: 'grant', shareId: ids.share, companyId })).rejects.toMatchObject({ status: 404 })
  })
  it('drops consent evidence after task-history reset while preserving the learner session', async () => {
    await query("UPDATE shares SET expires_at=now()+interval '1 hour' WHERE id=$1", [ids.share])
    await changeEmployerConsent(learnerRequest, { action: 'grant', shareId: ids.share, companyId })
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates.0.scoring.score', 100)
    const profile = await resetTaskHistory(learnerRequest)
    expect(profile.id).toBe(ids.learner)
    expect(profile.attempts).toHaveLength(0)
    expect((await employerDashboard(employerRequest))).toHaveProperty('candidates', [])
    expect((await getEmployerConsents(learnerRequest)).consents).toHaveLength(0)
  })
  it('rejects expired employer sessions and issues a separate HttpOnly cookie on provisioned login', async () => {
    await query("UPDATE employer_sessions SET expires_at=now()-interval '1 second' WHERE employer_id=$1", [ids.employer])
    await expect(employer(employerRequest)).rejects.toMatchObject({ status: 401 })
    const response = await employerAuth(new Request('http://localhost/api/employer/auth'), { action: 'login', email: `${prefix}-employer@example.test`, password: 'IsolatedQaPassword!123' })
    expect(response.headers.get('set-cookie')).toMatch(/^lumio_employer_session=.*HttpOnly; SameSite=Lax;/)
    expect(response.headers.get('set-cookie')).not.toContain('lumio_session=')
  })
})
