import {describe,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {checkVariantPython,executeCodeProbe,verifyReferenceExecution,executionCapability} from '../src/lib/code-execution'
import type {GeneratedVariant} from '../src/lib/ai-curriculum'
const probe={supported:true,functionName:'parseTags',tests:[
 {label:'Empty input',args:[''],expected:[]},
 {label:'ASCII whitespace and empty segments',args:[' , alpha,, beta\t, '],expected:['alpha','beta']},
 {label:'Non-ASCII whitespace must remain',args:['\u00a0alpha\u00a0,beta'],expected:['\u00a0alpha\u00a0','beta']},
 {label:'Preserve duplicates and case',args:['Alpha,Alpha,beta'],expected:['Alpha','Alpha','beta']},
]}
describe('deterministic execution capability checks',()=>{
 it('identifies real browser, event, React and database dependencies without mistaking local names or types for platform globals',()=>{
  expect(executionCapability('function check(document: string) { return document.length; }').supported).toBe(true)
  expect(executionCapability('function check(value: string) { const document = value; return document.length; }').supported).toBe(true)
  expect(executionCapability('function check(event: Event) { return true; }').supported).toBe(true)
  for(const code of ['document.querySelector("form"); function check(v) {return !!v}', 'window.addEventListener("submit",()=>{}); function check(v) {return !!v}', 'import React from "react"; function check(v) {return !!v}', 'function check(v) {return db.find(v)}'])expect(executionCapability(code).supported).toBe(false)
  expect(executionCapability('import type {Event} from "react"; function check(v: Event) {return true}').supported).toBe(true)
 })
 it('classifies whole browser modules as context dependent even when the AI incorrectly marks one helper standalone',async()=>{
  const fenced='```js\nconst form = document.querySelector("form"); function parseTags(raw) { return raw.split(","); }\n```'
  const candidate={task:{documents:[{id:'browser',body:{en:fenced,zh:fenced}}]},rubric:{exemplar:{en:fenced,zh:fenced}}} as GeneratedVariant
  const result=await verifyReferenceExecution(candidate,probe)
  expect(result.status).toBe('context-dependent')
  expect(result.locales).toMatchObject({en:{status:'context-dependent'},zh:{status:'context-dependent'}})
  expect(result.reference).toBeUndefined()
 })
 it('still rejects an unsupported dependency introduced only by the reference for a public standalone function',async()=>{
  const source='```js\nfunction parseTags(raw) { return raw.split(","); }\n```',reference='```js\nfunction parseTags(raw) { return document.querySelector(raw); }\n```'
  const candidate={task:{documents:[{id:'pure',body:{en:source,zh:source}}]},rubric:{exemplar:{en:reference,zh:reference}}} as GeneratedVariant
  expect((await verifyReferenceExecution(candidate,probe)).status).toBe('failed')
 })
})
describe.skipIf(process.env.RUN_CODE_EXECUTION_TESTS!=='true')('readonly offline Docker contract probes',()=>{
 it('resolves operator runtime files independently of the caller working directory',async()=>{
  const cwd=process.cwd()
  try{
   process.chdir(resolve(cwd,'..'))
   const contract={supported:true,functionName:'echo',tests:[{label:'Number',args:[2],expected:2},{label:'Text',args:['verified'],expected:'verified'},{label:'Record',args:[{a:1}],expected:{a:1}}]}
   expect((await executeCodeProbe('function echo(value) { return value; }',contract)).passed).toBe(true)
  }finally{process.chdir(cwd)}
 },20000)
 it('checks public rejection without inventing an error message for JavaScript or Python',async()=>{
  const tests=[{label:'Valid input',args:['yes'],expected:'accepted'},{label:'Reject unsupported flag',args:['maybe'],errorExpected:true as const},{label:'An explicitly required message remains strict',args:['maybe'],errorContains:'invalid'}]
  const javascript='function flag(value) { if (value !== "yes") throw Error("flags must be yes or no"); return "accepted"; }'
  const python='def flag(value):\n    if value != "yes": raise ValueError("flags must be yes or no")\n    return "accepted"'
  for(const [language,code] of [['javascript',javascript],['python',python]] as const){
   const result=await executeCodeProbe(code,{supported:true,language,functionName:'flag',tests})
   expect(result.results).toMatchObject([{passed:true},{passed:true},{passed:false}])
  }
 },20000)
 it('uses locale-specific public inputs rather than reusing an English execution cache for Chinese records',async()=>{
  const code='function status(flag: string) { return flag === "yes" ? "held" : "available"; }'
  const fenced='```ts\n'+code+'\n```'
  const candidate={task:{documents:[{id:'flags',body:{en:fenced,zh:fenced}}]},rubric:{exemplar:{en:fenced,zh:fenced}}} as GeneratedVariant
  const en={supported:true,functionName:'status',tests:[{label:'Yes hold',args:['yes'],expected:'held'},{label:'No hold',args:['no'],expected:'available'},{label:'Repeated hold',args:['yes'],expected:'held'}]}
  const zh={supported:true,functionName:'status',tests:[{label:'Translated yes record',args:['是'],expected:'held'},{label:'Translated no record',args:['否'],expected:'available'},{label:'Repeated translated hold',args:['是'],expected:'held'}]}
  const result=await verifyReferenceExecution(candidate,en,zh)
  expect(result.status).toBe('failed')
  expect(result.locales).toMatchObject({en:{status:'passed'},zh:{status:'failed'}})
 },20000)
 it('compiles Python without executing top-level statements and checks both reference languages',async()=>{
  const fenced=(code:string)=>'```python\n'+code+'\n```'
  const candidate={task:{documents:[{id:'python',body:{en:fenced('raise RuntimeError("Compilation must not execute code")'),zh:fenced('def resolve_status(item):\n    return "in-stock"')}}]},rubric:{exemplar:{en:fenced('def resolve_status(item):\n    return "in-stock"'),zh:fenced('def resolve_status(item)\n    return "in-stock"')}}} as GeneratedVariant
  const issues=await checkVariantPython(candidate)
  expect(issues).toHaveLength(1)
  expect(issues[0]).toContain('reference handover zh')
 },20000)
 it('detects Python yes/no truthiness defects under a public standalone function contract',async()=>{
  const contract={supported:true,language:'python' as const,functionName:'resolve_status',tests:[
   {label:'No hold with positive stock',args:[{hold_flag:'no',listed_stock_qty:3}],expected:'in-stock'},
   {label:'Hold with positive stock',args:[{hold_flag:'yes',listed_stock_qty:3}],expected:'out-of-stock'},
   {label:'Zero stock',args:[{hold_flag:'no',listed_stock_qty:0}],expected:'out-of-stock'},
  ]}
  const wrong='def resolve_status(item):\n    if item["hold_flag"] or item["listed_stock_qty"] == 0:\n        return "out-of-stock"\n    return "in-stock"'
  const fixed=wrong.replace('item["hold_flag"] or','item["hold_flag"] == "yes" or')
  expect((await executeCodeProbe(wrong,contract)).passed).toBe(false)
  expect((await executeCodeProbe(fixed,contract)).passed).toBe(true)
 },20000)
 it('isolates Python probes from app files, secret mounts and inherited credentials',async()=>{
  const code='import os\ndef isolation():\n    return {"mountedApp":os.path.exists("/app"),"secret":os.path.exists("/run/secrets/deepseek_key"),"keys":[key for key in os.environ if "KEY" in key or "TOKEN" in key or "PASSWORD" in key]}'
  const contract={supported:true,language:'python' as const,functionName:'isolation',tests:Array.from({length:3},(_,i)=>({label:`Isolation ${i}`,args:[],expected:{mountedApp:false,secret:false,keys:[]}}))}
  expect((await executeCodeProbe(code,contract)).passed).toBe(true)
 },20000)
 it('uses JSON numeric equivalence while keeping Python booleans distinct from numeric answers',async()=>{
  const contract={supported:true,language:'python' as const,functionName:'result',tests:[
   {label:'Numeric division',args:[2],expected:1},
   {label:'Record order and numeric representation',args:[4],expected:{a:2,b:1}},
   {label:'Boolean is not one',args:[1],expected:1},
  ]}
  const code='def result(value):\n    if value == 2: return 1.0\n    if value == 4: return {"b": 1.0, "a": 2}\n    return True'
  const result=await executeCodeProbe(code,contract)
  expect(result.results).toMatchObject([{passed:true},{passed:true},{passed:false}])
 },20000)
 it('executes bilingual reference patches and rejects a Chinese-only contract regression',async()=>{
  const fixed='function parseTags(raw: string) { return raw.split(",").map(tag => tag.replace(/^[\\x09-\\x0D\\x20]+|[\\x09-\\x0D\\x20]+$/g, "")).filter(tag => tag.length > 0); }'
  const wrong='function parseTags(raw: string) { return raw.split(",").map(tag => tag.trim()).filter(Boolean); }'
  const fenced=(code:string)=>'```ts\n'+code+'\n```'
  const candidate={task:{documents:[{id:'input',body:{en:fenced(wrong),zh:fenced(wrong)}}]},rubric:{exemplar:{en:fenced(fixed),zh:fenced(wrong)}}} as GeneratedVariant
  const result=await verifyReferenceExecution(candidate,probe)
  expect(result.status).toBe('failed')
  expect(result.locales).toMatchObject({en:{status:'passed'},zh:{status:'failed'}})
 },20000)
 it('detects the actual Unicode trim contract error rather than merely parsing the patch',async()=>{
  const wrong='export function parseTags(raw: string): string[] { return raw.split(",").map(tag => tag.trim()).filter(Boolean); }'
  const result=await executeCodeProbe(wrong,probe)
  expect(result.passed).toBe(false)
  expect(result.results[2]).toMatchObject({label:'Non-ASCII whitespace must remain',passed:false})
 },20000)
 it('passes a corrected ASCII-only patch against all independently specified assertions',async()=>{
  const fixed='export function parseTags(raw: string): string[] { return raw.split(",").map(tag => tag.replace(/^[\\x09-\\x0D\\x20]+|[\\x09-\\x0D\\x20]+$/g, "")).filter(tag => tag.length > 0); }'
  const result=await executeCodeProbe(fixed,probe)
  expect(result.passed).toBe(true)
  expect(result.results).toHaveLength(4)
 },20000)
 it('compares record values without treating JSON property order as a contract difference',async()=>{
  const records={supported:true,functionName:'result',tests:Array.from({length:3},(_,i)=>({label:`Record ${i}`,args:[],expected:{a:1,b:2}}))}
  expect((await executeCodeProbe('function result() { return { b: 2, a: 1 }; }',records)).passed).toBe(true)
 },20000)
 it('mounts no app or secret files and does not inherit provider credentials',async()=>{
  const code='function isolation() { const process = exports.constructor.constructor("return globalThis.process")(); const fs=process.getBuiltinModule("fs"); return { mountedApp:fs.existsSync("/app"), secret:fs.existsSync("/run/secrets/deepseek_key"), keys:Object.keys(process.env).filter(key => /KEY|TOKEN|PASSWORD/.test(key)) }; }'
  const boundary={supported:true,functionName:'isolation',tests:Array.from({length:3},(_,i)=>({label:`Isolation ${i}`,args:[],expected:{mountedApp:false,secret:false,keys:[]}}))}
  expect((await executeCodeProbe(code,boundary)).passed).toBe(true)
 },20000)
})
