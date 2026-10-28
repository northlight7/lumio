import 'server-only'
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { database, query, transaction } from './db'
import { ApiError } from './security'
import { generationTiming } from './provider-timing'

export async function consumeQuota(key:string,limit:number,expires:Date,client?:PoolClient):Promise<void> {
  const db=client||database()
  const result=await db.query('INSERT INTO quotas (key, count, expires_at) VALUES ($1, 1, $3) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN quotas.expires_at <= now() THEN 1 ELSE quotas.count + 1 END, expires_at = CASE WHEN quotas.expires_at <= now() THEN EXCLUDED.expires_at ELSE quotas.expires_at END WHERE quotas.expires_at <= now() OR quotas.count < $2 RETURNING count',[key,limit,expires])
  if(!result.rowCount) throw new ApiError(429,'You have reached the request limit. Please try again later.','quota_exceeded')
}
const limit=(key:string,fallback:number)=>{ const value=Number(process.env[key]||fallback);return Number.isInteger(value)&&value>0?value:fallback }
export async function withProviderLease<T>(learnerId:string,purpose:string,run:(reserveAdditional:()=>Promise<void>)=>Promise<T>,charge:boolean|number=true):Promise<T> {
  const lease=randomUUID()
  const leaseMs=purpose==='generation'?generationTiming().leaseMs:110000
  await transaction(async client=>{
    const exists=await client.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[learnerId])
    if(!exists.rowCount) throw new ApiError(410,'This learner session has been erased.','session_erased')
    await client.query('SELECT pg_advisory_xact_lock(445901)')
    const workload=(await client.query<{load:string}>("SELECT COALESCE(sum(CASE WHEN purpose='generation' THEN 3 ELSE 1 END),0) AS load FROM provider_leases WHERE expires_at>now() AND learner_id<>$1",[learnerId])).rows[0]
    if(Number(workload.load)+(purpose==='generation'?3:1)>limit('AI_GLOBAL_CONCURRENCY',8)) throw new ApiError(429,'The AI review queue is busy. Your draft is saved. Please try again shortly.','ai_capacity')
    const granted=await client.query("INSERT INTO provider_leases(learner_id,lease_id,purpose,expires_at) VALUES ($1,$2,$3,now()+($4::double precision * interval '1 millisecond')) ON CONFLICT(learner_id) DO UPDATE SET lease_id=EXCLUDED.lease_id,purpose=EXCLUDED.purpose,expires_at=EXCLUDED.expires_at WHERE provider_leases.expires_at<now() RETURNING learner_id",[learnerId,lease,purpose,leaseMs])
    if(!granted.rowCount) throw new ApiError(429,'Wait for your current AI response before starting another review or conversation.','ai_concurrency_limit')
    if(charge) {
      const day=new Date().toISOString().slice(0,10)
      const tomorrow=new Date(`${day}T00:00:00.000Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
      for(let call=0;call<(charge===true?1:Number(charge));call++){
        await consumeQuota(`ai:user:${learnerId}:${day}`,limit('AI_DAILY_USER_LIMIT',60),tomorrow,client)
        await consumeQuota(`ai:global:${day}`,limit('AI_DAILY_GLOBAL_LIMIT',1000),tomorrow,client)
      }
    }
  })
  const reserveAdditional=async()=>{
    const day=new Date().toISOString().slice(0,10)
    const tomorrow=new Date(`${day}T00:00:00.000Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1)
    await transaction(async client=>{
      const active=await client.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[learnerId])
      if(!active.rowCount) throw new ApiError(410,'This learner session has been erased.','session_erased')
      await consumeQuota(`ai:user:${learnerId}:${day}`,limit('AI_DAILY_USER_LIMIT',60),tomorrow,client)
      await consumeQuota(`ai:global:${day}`,limit('AI_DAILY_GLOBAL_LIMIT',1000),tomorrow,client)
    })
  }
  try { return await run(reserveAdditional) }
  finally { await query('DELETE FROM provider_leases WHERE learner_id=$1 AND lease_id=$2',[learnerId,lease]) }
}
