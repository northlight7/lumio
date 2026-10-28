import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { consumeQuota } from '../src/lib/services'
import { database, query } from '../src/lib/db'
import { ApiError } from '../src/lib/security'
const key=`test:quota:${randomUUID()}`
describe.skipIf(process.env.RUN_DB_TESTS!=='true')('PostgreSQL atomic quotas',()=>{
  afterAll(async()=>{await query('DELETE FROM quotas WHERE key=$1',[key]);await database().end()})
  it('allows exactly five concurrent reservations and rejects the rest',async()=>{
    const results=await Promise.allSettled(Array.from({length:20},()=>consumeQuota(key,5,new Date(Date.now()+60000))))
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(5)
    for(const result of results) if(result.status==='rejected'){expect(result.reason).toBeInstanceOf(ApiError);expect(result.reason.status).toBe(429)}
    const rows=await query('SELECT count FROM quotas WHERE key=$1',[key]);expect(rows[0].count).toBe(5)
  })
})
