// Operator-only account provisioning. No public company registration endpoint.
import { readFileSync } from 'node:fs'
import { randomBytes, randomUUID, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import pg from 'pg'
const readSecret = name => process.env[`${name}_FILE`] ? readFileSync(process.env[`${name}_FILE`], 'utf8').trim() : process.env[name]
let client
try {
  const email = (process.env.EMPLOYER_EMAIL || '').trim().toLowerCase()
  const company = process.env.EMPLOYER_COMPANY_ID || ''
  const name = (process.env.EMPLOYER_NAME || '').trim()
  const password = readSecret('EMPLOYER_PASSWORD')
  const catalog = JSON.parse(readFileSync(new URL('../curriculum/company-catalog.json', import.meta.url), 'utf8'))
  const companyIds = new Set(catalog.variants.flatMap(v => v.task?.company?.id ? [v.task.company.id] : []))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !companyIds.has(company) || !name || name.length > 80 || !password || password.length < 12 || password.length > 128) throw new Error('Set EMPLOYER_EMAIL, EMPLOYER_COMPANY_ID, EMPLOYER_NAME and a private EMPLOYER_PASSWORD_FILE. Choose a company in the simulation catalog and a password of 12 to 128 characters.')
  const salt = randomBytes(16).toString('hex')
  const key = await promisify(scrypt)(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 })
  const encoded = `scrypt-32768-8-3:${salt}:${key.toString('hex')}`
  const config = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : { host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB || 'lumio', user: process.env.POSTGRES_USER || 'lumio', password: readSecret('POSTGRES_PASSWORD') }
  client = new pg.Client({ ...config, application_name: 'lumio-employer-provision', statement_timeout: 10000 })
  await client.connect()
  await client.query('BEGIN')
  const result = await client.query('INSERT INTO employer_accounts(id,email,password_hash,company_id,name) VALUES($1,$2,$3,$4,$5) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,name=EXCLUDED.name WHERE employer_accounts.company_id=EXCLUDED.company_id RETURNING id', [randomUUID(), email, encoded, company, name])
  if (!result.rows[0]) throw new Error('The email already belongs to another company. Provision a separate account.')
  await client.query('DELETE FROM employer_sessions WHERE employer_id=$1', [result.rows[0].id])
  await client.query('COMMIT')
  console.log('Employer account provisioned. Existing sessions were revoked. No password was logged.')
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {})
  console.error(error instanceof Error && !('code' in error) ? error.message : 'Employer provisioning failed. Check connection and migration status. No credentials were logged.')
  process.exitCode = 1
} finally { await client?.end() }
