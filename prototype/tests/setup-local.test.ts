import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
const fixtures:string[]=[]
afterEach(()=>{for(const path of fixtures.splice(0))rmSync(path,{recursive:true})})
function runSetup(){
  mkdirSync(resolve('../.internal/prototype'),{recursive:true})
  const base=mkdtempSync(resolve('../.internal/prototype/setup-config-test-'))
  fixtures.push(base)
  const cwd=resolve(base,'prototype')
  mkdirSync(cwd)
  const script=resolve('scripts/setup-local.mjs')
  const execute=()=>spawnSync(process.execPath,[script],{cwd,encoding:'utf8'})
  return {base,cwd,execute}
}
describe('local setup creates live configuration without changing saved secrets',()=>{
  it('sets bounded live defaults and private file permissions for a fresh project',()=>{
    const {base,cwd,execute}=runSetup()
    const result=execute()
    expect(result.status).toBe(0)
    const env=Object.fromEntries(readFileSync(resolve(cwd,'.env.local'),'utf8').trim().split('\n').map(line=>line.split('=')))
    expect(env).toMatchObject({ALLOW_SCRIPTED_AI:'false',AI_GENERATION_AUTHOR_TIMEOUT_MS:'45000',AI_GENERATION_REVIEW_TIMEOUT_MS:'90000',AI_GENERATION_REPAIR_ATTEMPTS:'1',AI_GENERATION_REVIEW_STREAMING:'true'})
    expect(statSync(resolve(cwd,'.env.local')).mode&0o777).toBe(0o600)
    for(const name of ['db_password','app_db_password','deepseek_key'])expect(statSync(resolve(base,'.internal/secrets',name)).mode&0o777).toBe(0o600)
    expect(result.stdout).not.toContain(readFileSync(resolve(base,'.internal/secrets/db_password'),'utf8'))
  })
  it('preserves existing environment and secret bytes on repeat setup',()=>{
    const {base,cwd,execute}=runSetup()
    expect(execute().status).toBe(0)
    const secret=resolve(base,'.internal/secrets/deepseek_key'),env=resolve(cwd,'.env.local')
    writeFileSync(secret,'QA_EXISTING_SECRET')
    writeFileSync(env,'APP_ORIGIN=http://localhost:3100\nAI_DAILY_USER_LIMIT=77\n')
    const before=readFileSync(env)
    const result=execute()
    expect(result.status).toBe(0)
    expect(readFileSync(secret,'utf8')).toBe('QA_EXISTING_SECRET')
    expect(readFileSync(env)).toEqual(before)
    expect(result.stdout).not.toContain('QA_EXISTING_SECRET')
  })
})
