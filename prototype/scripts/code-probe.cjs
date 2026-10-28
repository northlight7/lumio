'use strict'
const vm=require('node:vm')
const ts=require('/compiler/lib/typescript.js')
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?typeof value.toJSON==='function'?canonical(value.toJSON()):Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value
const chunks=[];let size=0
process.stdin.on('data',chunk=>{size+=chunk.length;if(size>131072)process.exit(2);chunks.push(chunk)})
process.stdin.on('end',async()=>{
 try{
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if(!/^[A-Za-z_$][\w$]*$/.test(input.functionName)||!Array.isArray(input.tests)||input.tests.length<3||input.tests.length>8)throw Error('Invalid public probe')
  const code=ts.transpileModule(input.code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const results=[]
  for(const test of input.tests){
   const exports={},context=vm.createContext({exports,module:{exports},__args:test.args})
   let actual,error
   try{
    vm.runInContext(code+`\nglobalThis.__fn = typeof ${input.functionName} === 'function' ? ${input.functionName} : exports[${JSON.stringify(input.functionName)}];`,context,{timeout:1000})
    if(typeof context.__fn!=='function')throw Error('Selected callable is not provided')
    actual=await Promise.resolve(vm.runInContext('__fn(...__args)',context,{timeout:1000}))
   }catch(failure){error=failure.message}
   const expectedError=typeof test.errorContains==='string'||test.errorExpected===true
   const passed=expectedError?!!error&&(test.errorExpected===true||error.includes(test.errorContains)):!error&&JSON.stringify(canonical(actual))===JSON.stringify(canonical(test.expected))
   results.push({label:test.label,passed,...(error?{error}:{actual}),...(expectedError?test.errorExpected===true?{errorExpected:true}:{errorContains:test.errorContains}:{expected:test.expected})})
  }
  process.stdout.write(JSON.stringify({results,passed:results.every(test=>test.passed)}))
 }catch(error){process.stdout.write(JSON.stringify({error:error.message}));process.exitCode=1}
})
