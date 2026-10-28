import 'server-only'
import { readFileSync } from 'node:fs'
import { Pool, type PoolClient, type QueryResultRow } from 'pg'

export function secret(envName: string): string | undefined {
  const path = process.env[`${envName}_FILE`]
  return path ? readFileSync(path, 'utf8').trim() : process.env[envName]
}

const globalDb = globalThis as unknown as { lumioDb?: Pool }
export function database(): Pool {
  if (globalDb.lumioDb) return globalDb.lumioDb
  const config = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { host: process.env.POSTGRES_HOST || 'localhost', port: Number(process.env.POSTGRES_PORT || 5432), database: process.env.POSTGRES_DB || 'lumio', user: process.env.POSTGRES_USER || 'lumio', password: secret('POSTGRES_PASSWORD') }
  const pool = new Pool({ ...config, application_name: 'lumio-web', max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, statement_timeout: 10000 })
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })))
  globalDb.lumioDb = pool
  return pool
}

export async function query<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): Promise<T[]> {
  return (await database().query<T>(sql, values)).rows
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database().connect()
  try {
    await client.query('BEGIN')
    const result = await run(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
