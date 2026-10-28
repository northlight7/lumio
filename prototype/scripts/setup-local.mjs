import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { resolve } from 'node:path'
const directory = resolve('../.internal/secrets')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const passwordFile = resolve(directory, 'db_password')
if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600 })
const appPasswordFile = resolve(directory, 'app_db_password')
if (!existsSync(appPasswordFile)) writeFileSync(appPasswordFile, randomBytes(32).toString('hex'), { mode: 0o600 })
chmodSync(appPasswordFile, 0o600)
const aiFile = resolve(directory, 'deepseek_key')
if (!existsSync(aiFile)) writeFileSync(aiFile, '', { mode: 0o600 })
chmodSync(passwordFile, 0o600)
chmodSync(aiFile, 0o600)
if (!existsSync('.env.local')) writeFileSync('.env.local', [
'APP_ORIGIN=http://localhost:3100','POSTGRES_HOST=127.0.0.1','POSTGRES_PORT=55439','POSTGRES_DB=lumio','POSTGRES_USER=lumio_app','POSTGRES_PASSWORD_FILE=../.internal/secrets/app_db_password','MIGRATION_POSTGRES_USER=lumio','MIGRATION_POSTGRES_PASSWORD_FILE=../.internal/secrets/db_password','PROVISION_APP_ROLE=true','APP_DB_PASSWORD_FILE=../.internal/secrets/app_db_password','DEEPSEEK_API_KEY_FILE=../.internal/secrets/deepseek_key','ALLOW_SCRIPTED_AI=false','AI_GENERATION_AUTHOR_TIMEOUT_MS=45000','AI_GENERATION_REVIEW_TIMEOUT_MS=90000','AI_GENERATION_REPAIR_ATTEMPTS=1','AI_GENERATION_REVIEW_STREAMING=true','AI_DAILY_USER_LIMIT=40','AI_DAILY_GLOBAL_LIMIT=1000',''
].join('\n'), { mode: 0o600 })
console.log('Local configuration ready. Secret values were not printed.')
