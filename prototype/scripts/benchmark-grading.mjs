import {createServer} from 'vite'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
process.env.DEEPSEEK_API_KEY_FILE ||= resolve(root,'../.internal/secrets/deepseek_key')
process.env.CURRICULUM_GRADE_THINKING='enabled'
const server=await createServer({root,configFile:false,server:{middlewareMode:true,hmr:false},resolve:{alias:{'server-only':resolve(root,'tests/server-only.ts')}}})
try{
 const {gradeVariant}=await server.ssrLoadModule('/src/lib/ai-curriculum.ts')
 const bank=JSON.parse(await readFile(resolve(root,'curriculum/company-catalog.json'),'utf8'))
 const cases=[['data-analyst',2],['customer-operations',1],['pcb-designer',2],['laboratory-analyst',3],['environmental-scientist',1]]
 const results=[]
 let cursor=0
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<cases.length){const [role,variation]=cases[cursor++];const v=bank.variants.find(v=>v.roleId===role&&v.stage==='taster'&&v.variation===variation);if(!v)throw Error('Missing benchmark '+role)
   const wrong=Object.fromEntries(v.task.questions.map(q=>[q.id,q.type==='number'?Number((Number(v.rubric.expectedAnswers[q.id])+Math.max(1,Math.abs(Number(v.rubric.expectedAnswers[q.id]))*0.2)).toFixed(3)):q.type==='multi'?[q.options.find(o=>!v.rubric.expectedAnswers[q.id].includes(o.value))?.value||q.options[0].value]:q.options.find(o=>o.value!==v.rubric.expectedAnswers[q.id])?.value]))
   const badWork='I selected the fastest option without checking the source records. I have no calculation to support my numerical answers. I assumed all policy conditions were met even when confirmation was missing. I would report the decision as certain, omit the limitations and move straight to the next job. I have not linked this decision to specific evidence or tested the proposed change.'
   const runs=[]
   for(const kind of ['good','bad','good','bad']){const start=Date.now();try{const g=await gradeVariant(v,kind==='good'?v.rubric.expectedAnswers:wrong,kind==='good'?v.rubric.exemplar.en:badWork,'en');runs.push({kind,score:g.score,passed:g.passed,elapsedMs:Date.now()-start,source:g.source,model:g.model})}catch(error){runs.push({kind,error:error.message,elapsedMs:Date.now()-start})}}
   results.push({variantId:v.id,roleId:role,variation,runs});console.log(JSON.stringify(results.at(-1)))
  }
 }))
 await writeFile(resolve(root,'../.internal/prototype/grading-calibration.json'),JSON.stringify({model:'deepseek-flash',thinking:'enabled',reasoningEffort:'low',testedAt:new Date().toISOString(),cases:results},null,2))
 console.log('Saved5case grading calibration')
}finally{await server.close()}
