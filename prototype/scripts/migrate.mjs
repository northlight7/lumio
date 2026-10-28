import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let client
let phase = 'configuration'
let migration
const readSecret = (name) => process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`], 'utf8').trim() : process.env[name]
try {
  const migrationPassword = readSecret('MIGRATION_POSTGRES_PASSWORD')
  let connection
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL)
    if (process.env.MIGRATION_POSTGRES_USER) url.username = process.env.MIGRATION_POSTGRES_USER
    if (migrationPassword) url.password = migrationPassword
    connection = { connectionString: url.toString() }
  } else {
    connection = {
      host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432),
      database: process.env.POSTGRES_DB || 'lumio', user: process.env.MIGRATION_POSTGRES_USER || process.env.POSTGRES_USER || 'lumio',
      password: migrationPassword || readSecret('POSTGRES_PASSWORD'),
    }
  }
  client = new pg.Client({ ...connection, application_name: 'lumio-migrate', connectionTimeoutMillis: 10000, statement_timeout: 30000 })
  phase = 'connect'
  await client.connect()
  await client.query('SELECT pg_advisory_lock(91427832)')
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  phase = 'migrations'
  for (const name of readdirSync(resolve(root, 'migrations')).filter(n => /^\d+.*\.sql$/.test(n)).sort()) {
    if ((await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name])).rowCount) continue
    migration = name
    await client.query('BEGIN')
    try {
      await client.query(readFileSync(resolve(root, 'migrations', name), 'utf8'))
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
      await client.query('COMMIT')
      console.log(`Applied migration ${name}`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  if (process.env.PROVISION_APP_ROLE === 'true') {
    phase = 'application_role'
    const appPassword = readSecret('APP_DB_PASSWORD')
    if (!appPassword || appPassword.length < 24) throw Object.assign(new Error('App database secret is missing or too short'), { code: 'APP_SECRET_INVALID' })
    await client.query('BEGIN')
    try {
      const exists = (await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'lumio_app'")).rowCount
      // PostgreSQL quotes the password as a literal. Neither generated SQL nor credentials are logged.
      const statement = exists
        ? "ALTER ROLE lumio_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L"
        : "CREATE ROLE lumio_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD %L"
      const formatted = (await client.query('SELECT format($1::text, $2::text) AS command', [statement, appPassword])).rows[0].command
      await client.query(formatted)
      const memberships = await client.query("SELECT parent.rolname FROM pg_auth_members m JOIN pg_roles parent ON parent.oid = m.roleid JOIN pg_roles member ON member.oid = m.member WHERE member.rolname = 'lumio_app'")
      for (const membership of memberships.rows) {
        const revoke = (await client.query('SELECT format(\'REVOKE %I FROM lumio_app\', $1::text) AS command', [membership.rolname])).rows[0].command
        await client.query(revoke)
      }
      const databaseName = (await client.query('SELECT current_database() AS name')).rows[0].name
      const connectGrant = (await client.query('SELECT format(\'GRANT CONNECT ON DATABASE %I TO lumio_app\', $1::text) AS command', [databaseName])).rows[0].command
      await client.query(connectGrant)
      await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC, lumio_app')
      await client.query('GRANT USAGE ON SCHEMA public TO lumio_app')
      await client.query('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM lumio_app')
      await client.query('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.learners, public.sessions, public.attempts, public.submissions, public.ai_requests, public.messages, public.shares, public.quotas, public.generation_locks, public.grading_requests, public.provider_leases, public.employer_accounts, public.employer_sessions, public.employer_evidence_consents TO lumio_app')
      await client.query('GRANT SELECT, INSERT ON TABLE public.task_variants TO lumio_app')
      await client.query('GRANT SELECT, INSERT, DELETE ON TABLE public.attachments TO lumio_app')
      await client.query('GRANT SELECT, INSERT, DELETE ON TABLE public.employer_shortlists TO lumio_app')
      await client.query('REVOKE ALL PRIVILEGES ON TABLE public.schema_migrations FROM lumio_app')
      await client.query('COMMIT')
      console.log('Restricted application database role ready')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
  phase = 'curriculum_catalog'
  const catalogs = []
  for (const name of ['company-catalog.json','task-family-catalog.json','core-catalog.json','expansion-catalog.json']) {
    try { catalogs.push(JSON.parse(readFileSync(resolve(root, 'curriculum', name), 'utf8'))) } catch(error) { if(error.code !== 'ENOENT') throw error }
  }
  let imported = 0
  const familyCoverage = new Map()
  for (const catalog of catalogs) {
    const variants = Array.isArray(catalog) ? catalog : catalog.variants
    for (const variant of variants) {
      const {demoEvaluation,demoPoorSample,...snapshot}=variant
      const presentation={...(demoEvaluation?{demoEvaluation}:{}),...(demoPoorSample?{demoPoorSample}:{})}
      const taskId=variant.taskId || 'legacy'
      if (variant.taskId !== variant.task.taskId) throw Object.assign(new Error('Task family metadata mismatch'),{code:'CATALOG_TASK_MISMATCH'})
      await client.query('BEGIN')
      try {
        const prior=await client.query('SELECT snapshot=$2::jsonb AS unchanged FROM task_variants WHERE id=$1',[variant.id,JSON.stringify(snapshot)])
        if (prior.rowCount && !prior.rows[0].unchanged) throw Object.assign(new Error('Published curriculum identities are immutable'),{code:'CATALOG_IMMUTABLE'})
        await client.query('UPDATE task_variants SET retired_at=now() WHERE role_id=$1 AND stage=$2 AND task_id=$3 AND variation=$4 AND id<>$5 AND retired_at IS NULL AND catalog_hidden_at IS NULL',[variant.roleId,variant.stage,taskId,variant.variation,variant.id])
        await client.query('INSERT INTO task_variants(id,role_id,stage,task_id,variation,snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING',[variant.id,variant.roleId,variant.stage,taskId,variant.variation,JSON.stringify(snapshot)])
        await client.query('UPDATE task_variants SET presentation=$2::jsonb WHERE id=$1',[variant.id,JSON.stringify(presentation)])
        await client.query('COMMIT')
        imported++
        if (variant.taskId && variant.stage === 'taster') {
          const families=familyCoverage.get(variant.roleId) || new Map()
          families.set(variant.taskId,(families.get(variant.taskId)||0)+1)
          familyCoverage.set(variant.roleId,families)
        }
      } catch(error) { await client.query('ROLLBACK');throw error }
    }
  }
  for (const [roleId,families] of familyCoverage) {
    if ([...families.values()].filter(count=>count>=2).length>=2) await client.query("UPDATE task_variants SET catalog_hidden_at=COALESCE(catalog_hidden_at,now()) WHERE role_id=$1 AND stage='taster' AND task_id='legacy'",[roleId])
  }
  if (catalogs.length) console.log(`AI curriculum catalog ready: ${imported} variations`)
  await client.query('SELECT pg_advisory_unlock(91427832)')
  console.log('Database migrations ready')
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{2,30}$/.test(error.code) ? error.code : 'UNKNOWN'
  console.error(JSON.stringify({ event: 'database_migration_failed', phase, migration, code }))
  console.error('Database migration failed. Use the phase and error code to check configuration, database availability or the named migration. No credentials were logged.')
  process.exitCode = 1
} finally {
  if (client) await client.end()
}
