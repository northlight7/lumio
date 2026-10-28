import { readFileSync } from 'node:fs'
import pg from 'pg'
let client
try {
  const connection = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432),
        database: process.env.POSTGRES_DB || 'lumio', user: process.env.POSTGRES_USER || 'lumio_app',
        password: process.env.POSTGRES_PASSWORD_FILE ? readFileSync(process.env.POSTGRES_PASSWORD_FILE, 'utf8').trim() : process.env.POSTGRES_PASSWORD,
      }
  client = new pg.Client({ ...connection, application_name: 'lumio-maintenance', connectionTimeoutMillis: 10000, statement_timeout: 30000 })
  await client.connect()
  await client.query('BEGIN')
  const sessions = await client.query('DELETE FROM sessions WHERE expires_at <= now()')
  const employerSessions = await client.query('DELETE FROM employer_sessions WHERE expires_at <= now()')
  const abandonedGuests = await client.query("DELETE FROM learners l WHERE l.email IS NULL AND l.created_at < now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM sessions s WHERE s.learner_id=l.id AND s.expires_at>now())")
  const quotas = await client.query('DELETE FROM quotas WHERE expires_at <= now()')
  const leases=await client.query('DELETE FROM provider_leases WHERE expires_at<=now()')
  const generations=await client.query('DELETE FROM generation_locks WHERE expires_at<=now()')
  await client.query("UPDATE grading_requests SET state='failed' WHERE state='pending' AND updated_at<now()-interval '120 seconds'")
  await client.query('COMMIT')
  console.log(JSON.stringify({ event: 'maintenance_complete', expiredSessionsRemoved: sessions.rowCount, expiredEmployerSessionsRemoved: employerSessions.rowCount, abandonedGuestsRemoved: abandonedGuests.rowCount, expiredQuotaBucketsRemoved: quotas.rowCount, expiredProviderLeasesRemoved:leases.rowCount, expiredGenerationLocksRemoved:generations.rowCount }))
} catch (error) {
  if (client) { try { await client.query('ROLLBACK') } catch {} }
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{2,30}$/.test(error.code) ? error.code : 'UNKNOWN'
  console.error(JSON.stringify({ event: 'maintenance_failed', code }))
  process.exitCode = 1
} finally {
  if (client) await client.end()
}
