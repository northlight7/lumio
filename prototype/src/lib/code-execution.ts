import 'server-only'
import {spawn} from 'node:child_process'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import ts from 'typescript-compiler'
import {codeBlocks} from './code-quality'
import type {GeneratedVariant} from './ai-curriculum'
export type PublicCodeProbe={supported:boolean;language?:'javascript'|'python';reason?:string;functionName?:string;tests?:{label:string;args:unknown[];expected?:unknown;errorContains?:string;errorExpected?:true}[]}
export function pythonBlocks(text:string,location:string):{code:string;location:string}[]{
 return [...text.matchAll(/```(?:python|py)\s*\n([\s\S]*?)```/g)].map((match,index)=>({code:match[1],location:`${location} Python ${index+1}`}))
}
function declares(code:string,name:string):boolean{
 const source=ts.createSourceFile('probe.ts',code,ts.ScriptTarget.ES2022,true)
 return source.statements.some(statement=>ts.isFunctionDeclaration(statement)&&statement.name?.text===name||ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>ts.isIdentifier(declaration.name)&&declaration.name.text===name))
}
export function executionCapability(code:string):{supported:boolean;reason?:string}{
 const source=ts.createSourceFile('capability.ts',code,ts.ScriptTarget.ES2022,true)
 const host:ts.CompilerHost={getSourceFile:name=>name==='capability.ts'?source:undefined,getDefaultLibFileName:()=>'',writeFile:()=>{},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:name=>name==='capability.ts',readFile:()=>undefined,getCanonicalFileName:name=>name,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'}
 const checker=ts.createProgram({rootNames:['capability.ts'],options:{noLib:true,noResolve:true},host}).getTypeChecker()
 const capabilities=new Set(['document','window','self','navigator','location','localStorage','sessionStorage','HTMLElement','Element','Event','EventTarget','MouseEvent','KeyboardEvent','FormData','File','Blob','fetch','Request','Response','WebSocket','React','useState','useEffect','useRef','useMemo','useCallback','useReducer','setTimeout','setInterval','requestAnimationFrame','addEventListener','process','require','db','database','pool','client','api','server','transaction'])
 let reason:string|undefined
 const visit=(node:ts.Node)=>{
  if(reason||ts.isTypeNode(node))return
  if(ts.isImportDeclaration(node)){
   const clause=node.importClause,bindings=clause?.namedBindings
   const onlyTypes=clause?.isTypeOnly||!clause?.name&&bindings&&ts.isNamedImports(bindings)&&bindings.elements.every(binding=>binding.isTypeOnly)
   if(!onlyTypes)reason='The complete code block requires runtime imports not supplied by the isolated function environment'
   return
  }
  if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){reason='The complete code block requires an external dynamic import';return}
  if(ts.isIdentifier(node)&&capabilities.has(node.text)){
   const parent=node.parent
   if(ts.isPropertyAssignment(parent)&&parent.name===node)return
   if(ts.isPropertyAccessExpression(parent)&&parent.name===node){
    if(ts.isIdentifier(parent.expression)&&['globalThis','window','self'].includes(parent.expression.text)&&!checker.getSymbolAtLocation(parent.expression))reason=`The complete code block requires the ${node.text} platform capability`
   }else{
    const binding=ts.isShorthandPropertyAssignment(parent)?checker.getShorthandAssignmentValueSymbol(parent):checker.getSymbolAtLocation(node)
    if(!binding)reason=`The complete code block requires the ${node.text} platform capability`
   }
  }
  ts.forEachChild(node,visit)
 }
 visit(source)
 return reason?{supported:false,reason}:{supported:true}
}
export async function executeCodeProbe(code:string,probe:PublicCodeProbe,compileOnly=false):Promise<{passed:boolean;results:unknown[]}> {
 if(!probe.supported||!probe.functionName||!probe.tests)throw Error('A supported public contract probe is required')
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),name=`lumio-code-probe-${randomUUID()}`
 return new Promise((accept,reject)=>{
  const python=probe.language==='python'
  const runtime=python?['-v',`${resolve(root,'scripts/python-code-probe.py')}:/gate.py:ro`,'python:3.13-alpine','env','-i','PATH=/usr/local/bin:/usr/bin:/bin','python','-I','-B','/gate.py']:['-v',`${resolve(root,'scripts/code-probe.cjs')}:/gate.cjs:ro`,'-v',`${resolve(root,'node_modules/typescript-compiler')}:/compiler:ro`,'node:22-alpine','node','--max-old-space-size=96','/gate.cjs']
  const child=spawn('docker',['run','--rm','-i','--name',name,'--network','none','--read-only','--cpus','1','--memory','128m','--memory-swap','128m','--pids-limit','32','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1001:1001','--tmpfs','/tmp:rw,noexec,nosuid,size=16m',...runtime],{env:{PATH:process.env.PATH,NODE_ENV:'production'},stdio:['pipe','pipe','pipe']})
  const chunks:Buffer[]=[];let size=0,settled=false
  const fail=(message:string)=>{if(settled)return;settled=true;clearTimeout(timeout);child.kill('SIGKILL');const cleanup=spawn('docker',['rm','-f',name],{stdio:'ignore',env:{PATH:process.env.PATH,NODE_ENV:'production'}});cleanup.on('error',()=>{});reject(Error(message))}
  const timeout=setTimeout(()=>fail('Isolated code probe exceeded its 15 second deadline'),15000)
  child.on('error',()=>fail('Isolated Docker code execution is unavailable'))
  child.stdin.on('error',()=>{})
  child.stderr.on('data',()=>{})
  child.stdout.on('data',chunk=>{size+=chunk.length;if(size>131072)fail('Isolated code probe output exceeded its bound');else chunks.push(chunk)})
  child.on('close',code=>{if(settled)return;try{const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(code||typeof result.passed!=='boolean'||!Array.isArray(result.results))throw Error(result.error||'Invalid isolated execution result');settled=true;clearTimeout(timeout);accept(result)}catch(error){fail(error instanceof Error?error.message:'Invalid isolated execution result')}})
  child.stdin.end(JSON.stringify({code,functionName:probe.functionName,tests:probe.tests,compileOnly}))
 })
}
export async function checkVariantPython(variant:GeneratedVariant):Promise<string[]>{
 const blocks=[...variant.task.documents.flatMap(doc=>['en','zh'].flatMap(locale=>pythonBlocks(doc.body[locale as 'en'|'zh'],`source ${doc.id} ${locale}`))),...['en','zh'].flatMap(locale=>pythonBlocks(variant.rubric.exemplar[locale as 'en'|'zh'],`reference handover ${locale}`))]
 const cache=new Map<string,Promise<{passed:boolean;results:unknown[]}>>()
 const issues:string[]=[]
 for(const block of blocks){
  if(!cache.has(block.code))cache.set(block.code,executeCodeProbe(block.code,{supported:true,language:'python',functionName:'__syntax_only__',tests:[]},true))
  const result=await cache.get(block.code)!
  if(!result.passed)issues.push(`${block.location}: ${JSON.stringify(result.results)}`)
 }
 return issues
}
export async function verifyReferenceExecution(variant:GeneratedVariant,probe:PublicCodeProbe,zhProbe?:PublicCodeProbe):Promise<{status:'passed'|'failed'|'context-dependent';reason?:string;source?:unknown;reference?:unknown;locales?:unknown}> {
 if(!probe.supported||!probe.functionName)return{status:'context-dependent',reason:probe.reason||'No self-contained public function contract'}
 const executionCache=new Map<string,Promise<{passed:boolean;results:unknown[]}>>()
 const execute=(code:string,contract:PublicCodeProbe)=>{const key=JSON.stringify({code,contract});if(!executionCache.has(key))executionCache.set(key,executeCodeProbe(code,contract));return executionCache.get(key)!}
 const locales:Record<string,{status:string;reason?:string;source?:unknown;reference?:unknown}>={}
 for(const locale of ['en','zh'] as const){
  const contract=locale==='zh'?zhProbe||probe:probe
  if(!contract.supported||!contract.functionName){locales[locale]={status:'context-dependent',reason:contract.reason||'No self-contained public contract in this locale'};continue}
  const name=contract.functionName
  const python=contract.language==='python'
  const blocks=(text:string,location:string)=>python?pythonBlocks(text,location):codeBlocks(text,location)
  const provides=(code:string)=>python?new RegExp(`^def ${name}\\s*\\(`,'m').test(code):declares(code,name)
  const source=variant.task.documents.flatMap(doc=>blocks(doc.body[locale],`${doc.id} ${locale}`)).find(block=>provides(block.code))
  const reference=blocks(variant.rubric.exemplar[locale],`reference ${locale}`).find(block=>provides(block.code))
  if(!source||!reference){locales[locale]={status:'context-dependent',reason:'The public source and reference handover do not supply matching complete standalone function declarations'};continue}
  if(!python){
   const sourceCapability=executionCapability(source.code),referenceCapability=executionCapability(reference.code)
   if(!sourceCapability.supported){locales[locale]={status:'context-dependent',reason:sourceCapability.reason};continue}
   if(!referenceCapability.supported){locales[locale]={status:'failed',reason:`The reference introduces a capability absent from the standalone public source: ${referenceCapability.reason}`};continue}
  }
  const [sourceResult,referenceResult]=await Promise.all([execute(source.code,contract),execute(reference.code,contract)])
  locales[locale]={status:referenceResult.passed?'passed':'failed',source:sourceResult,reference:referenceResult}
 }
 const status=Object.values(locales).some(result=>result.status==='failed')?'failed':Object.values(locales).every(result=>result.status==='passed')?'passed':'context-dependent'
 return{status,...(status==='context-dependent'?{reason:'At least one language lacks a complete matching source/reference function, without fabricated context'}:{}),source:locales.en.source,reference:locales.en.reference,locales}
}
