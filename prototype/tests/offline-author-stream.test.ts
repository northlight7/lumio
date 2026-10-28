import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateVariant, gradeVariant, type GeneratedVariant } from '../src/lib/ai-curriculum'
vi.mock('../src/lib/db',()=>({secret:()=> 'mock-provider-key'}))
const fixture=JSON.parse(readFileSync(new URL('../curriculum/company-catalog.json',import.meta.url),'utf8')).variants.find((v:GeneratedVariant)=>v.roleId==='data-analyst'&&v.stage==='taster') as GeneratedVariant
const usage={prompt_tokens:100,completion_tokens:60,total_tokens:160,completion_tokens_details:{reasoning_tokens:20}}
const frame=(delta:Record<string,unknown>,finish:unknown=null,tokenUsage:unknown=null)=>'data: '+JSON.stringify({choices:[{index:0,delta,finish_reason:finish}],usage:tokenUsage})+'\n\n'
const envelope=(content:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}],usage}))
const stream=(content:unknown)=>{
 const value=JSON.stringify(content),wire=': keep-alive\n\n'+frame({role:'assistant',reasoning_content:'PRIVATE_AUTHOR_REASONING'})+frame({content:value.slice(0,27)})+frame({content:value.slice(27)},'stop',usage)+'data: [DONE]\n\n'
 const bytes=new TextEncoder().encode(wire)
 return new Response(new ReadableStream<Uint8Array>({start(controller){for(let at=0;at<bytes.length;at+=17)controller.enqueue(bytes.slice(at,at+17));controller.close()}}),{headers:{'content-type':'text/event-stream; charset=utf-8'}})
}
const setup=()=>{vi.stubEnv('CURRICULUM_OFFLINE_AUTHOR_STREAMING','true');vi.stubEnv('CURRICULUM_OFFLINE_PROVIDER_LIMIT','6');vi.stubEnv('CURRICULUM_AUTHOR_THINKING','enabled')}
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks()})
describe('offline author SSE transport',()=>{
 it('accepts split bilingual author output, discards reasoning and keeps publication reviews and grading unchanged',async()=>{
  setup()
  const logs=vi.spyOn(console,'error').mockImplementation(()=>{})
  const requests:Record<string,unknown>[]=[]
  const fetch=vi.fn().mockImplementation((_url,options)=>{
   const body=JSON.parse(options.body),system=body.messages[0].content;requests.push(body)
   if(system.includes('rigorous bilingual workplace curriculum author'))return stream({task:fixture.task,rubric:fixture.rubric})
   if(system.startsWith('Audit private assessment'))return envelope({approved:true,issues:[]})
   if(system.startsWith('You independently solve'))return envelope({issues:[],answers:fixture.rubric.expectedAnswers})
   return envelope({criteria:fixture.rubric.criteria.map(c=>({id:c.id,awarded:c.points,feedback:{en:'The evidence is complete.',zh:'證據完整。'}})),summary:{en:'Complete work.',zh:'工作完整。'},nextSteps:{en:'Try another case.',zh:'嘗試另一個案。'}})
  });vi.stubGlobal('fetch',fetch)
  const result=await generateVariant('data-analyst','taster',3)
  expect(result.rubric.expectedAnswers).toEqual(fixture.rubric.expectedAnswers)
  expect(requests[0]).toMatchObject({stream:true,stream_options:{include_usage:true},thinking:{type:'enabled'}})
  expect(requests.slice(1).every(r=>r.stream===false)).toBe(true)
  expect(JSON.stringify(result)).not.toContain('PRIVATE_AUTHOR_REASONING')
  expect(JSON.stringify(logs.mock.calls)).not.toContain('PRIVATE_AUTHOR_REASONING')
  await gradeVariant(fixture,fixture.rubric.expectedAnswers,fixture.rubric.exemplar.en,'en')
  expect(requests.at(-1)!.stream).toBe(false)
 })
 it.each(['malformed','truncated','provider-error','length','wrong-content-type'])('never publishes or falls back from an author %s stream',async mode=>{
  setup();vi.spyOn(console,'error').mockImplementation(()=>{})
  const fetch=vi.fn().mockImplementation(()=>{
   if(mode==='wrong-content-type')return envelope({task:fixture.task,rubric:fixture.rubric})
   const content=mode==='malformed'?'data: {broken}\n\n':mode==='provider-error'?'data: '+JSON.stringify({error:{message:'PRIVATE_PROVIDER_ERROR'}})+'\n\n':frame({content:'{}'},mode==='length'?'length':'stop',usage)+(mode==='truncated'?'':'data: [DONE]\n\n')
   return new Response(content,{headers:{'content-type':'text/event-stream'}})
  });vi.stubGlobal('fetch',fetch)
  await expect(generateVariant('data-analyst','taster',3,[],undefined,undefined,undefined,undefined,1)).rejects.toMatchObject({code:'ai_invalid_response'})
  expect(fetch).toHaveBeenCalledTimes(1)
 })
 it('includes the whole author stream in the deadline, cancels pending body and never starts reviews',async()=>{
  setup();vi.spyOn(console,'error').mockImplementation(()=>{})
  const deadline=new AbortController();vi.spyOn(AbortSignal,'timeout').mockReturnValue(deadline.signal)
  let cancelled=false
  const fetch=vi.fn().mockImplementation(()=>new Response(new ReadableStream<Uint8Array>({start(c){c.enqueue(new TextEncoder().encode(frame({reasoning_content:'PRIVATE_PENDING_REASONING'})))},cancel(){cancelled=true}}),{headers:{'content-type':'text/event-stream'}}))
  vi.stubGlobal('fetch',fetch)
  const request=generateVariant('data-analyst','taster',3)
  await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1))
  deadline.abort(new DOMException('Synthetic timeout','TimeoutError'))
  await expect(request).rejects.toMatchObject({code:'ai_timeout'})
  expect(cancelled).toBe(true)
  expect(fetch).toHaveBeenCalledTimes(1)
 })
 it.each(['unsupported','true-without-offline-limit'])('rejects invalid or production author SSE configuration (%s)',async mode=>{
  vi.stubEnv('CURRICULUM_OFFLINE_AUTHOR_STREAMING',mode==='unsupported'?'unsupported':'true')
  vi.stubEnv('CURRICULUM_OFFLINE_PROVIDER_LIMIT','')
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
  await expect(generateVariant('data-analyst','taster',3)).rejects.toMatchObject({code:'configuration_invalid'})
  expect(fetch).not.toHaveBeenCalled()
 })
})
