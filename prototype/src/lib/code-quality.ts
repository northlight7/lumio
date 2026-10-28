import 'server-only'
import ts from 'typescript-compiler'
import type { GeneratedVariant } from './ai-curriculum'
export type CodeBlock={language:string;code:string;location:string}
export function fencedLanguages(text:string):string[]{
  return [...text.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)].map(match=>match[1].trim().toLowerCase()||'unlabelled')
}
export function codeBlocks(text:string,location:string):CodeBlock[]{
  return [...text.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)].flatMap((match,index)=>{
    const language=match[1].trim().toLowerCase()
    if(!['js','javascript','ts','typescript','tsx','jsx',''].includes(language))return []
    if(!language&&!/\b(?:function|const|let|var|interface|export|import|class)\b|=>/.test(match[2]))return []
    return [{language:language||'ts',code:match[2],location:`${location} code ${index+1}`}]
  })
}
export function malformedCodeFenceIssues(text:string,location:string):string[]{
 // Inspect prose outside actual newline-delimited fenced code. Escaped strings
 // inside valid programs may intentionally contain Markdown serialization.
 const outside=text.replace(/```(?:[A-Za-z][A-Za-z0-9_+-]*)?[ \t]*\r?\n[\s\S]*?^```[ \t]*(?:\r?\n|$)/gm,block=>' '.repeat(block.length))
 return /(?:^|\n|\\n|\\r)\s*```(?:javascript|js|typescript|ts|tsx|jsx|css|html|python|py)\\(?:n|r)/.test(outside)
  ? [`${location}: code fence contains a literal escaped line break instead of a readable newline`]
  : []
}
export function staticCodeIssues(block:CodeBlock):string[]{
  const jsx=['tsx','jsx'].includes(block.language),javascript=['js','javascript','jsx'].includes(block.language)
  const name=`candidate.${jsx?javascript?'jsx':'tsx':javascript?'js':'ts'}`
  const options:ts.CompilerOptions={noEmit:true,noLib:true,noResolve:true,allowJs:true,checkJs:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,skipLibCheck:true}
  const source=ts.createSourceFile(name,block.code,ts.ScriptTarget.ES2022,true,jsx?javascript?ts.ScriptKind.JSX:ts.ScriptKind.TSX:javascript?ts.ScriptKind.JS:ts.ScriptKind.TS)
  const host:ts.CompilerHost={getSourceFile:file=>file===name?source:undefined,getDefaultLibFileName:()=>'',writeFile:()=>{},getCurrentDirectory:()=>'',getDirectories:()=>[],fileExists:file=>file===name,readFile:file=>file===name?block.code:undefined,getCanonicalFileName:file=>file,useCaseSensitiveFileNames:()=>true,getNewLine:()=> '\n'}
  const program=ts.createProgram([name],options,host)
  // Standalone snippets often depend on supplied framework context. Reject actual
  // grammar/declaration failures, without inventing missing imports or type stubs.
  const semanticCodes=new Set([17001,2300,2451,2393,...(!javascript?[1117]:[])])
  const diagnostics=[...program.getSyntacticDiagnostics(source),...program.getSemanticDiagnostics(source).filter(d=>semanticCodes.has(d.code))]
  return diagnostics.slice(0,12).map(d=>{
    const line=source.getLineAndCharacterOfPosition(d.start||0).line+1
    return `${block.location} line ${line}, TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`
  })
}
export function reactHookScopeIssues(block:CodeBlock):string[]{
 const source=ts.createSourceFile('reference.tsx',block.code,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX)
 const hooks=new Set<string>(),namespaces=new Set<string>()
 for(const statement of source.statements){
  if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier)||statement.moduleSpecifier.text!=='react')continue
  const clause=statement.importClause
  if(clause?.name)namespaces.add(clause.name.text)
  const bindings=clause?.namedBindings
  if(bindings&&ts.isNamespaceImport(bindings))namespaces.add(bindings.name.text)
  if(bindings&&ts.isNamedImports(bindings))for(const binding of bindings.elements){const imported=binding.propertyName?.text||binding.name.text;if(imported==='use'||/^use[A-Z]/.test(imported))hooks.add(binding.name.text)}
 }
 const callable=(node:ts.Node)=>ts.isFunctionDeclaration(node)||ts.isFunctionExpression(node)||ts.isArrowFunction(node)||ts.isMethodDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)||ts.isConstructorDeclaration(node)
 const allowedFunction=(node:ts.Node)=>{
  if(ts.isConstructorDeclaration(node)||ts.isGetAccessorDeclaration(node)||ts.isSetAccessorDeclaration(node)||ts.isMethodDeclaration(node)&&(ts.isClassDeclaration(node.parent)||ts.isClassExpression(node.parent)))return false
  let name:ts.Node|undefined='name' in node?(node as ts.FunctionDeclaration).name:undefined
  if(!name&&ts.isVariableDeclaration(node.parent))name=node.parent.name
  if(name&&ts.isIdentifier(name)&&(/^[A-Z]/.test(name.text)||/^use[A-Z]/.test(name.text)))return true
  // An anonymous default-exported function may be the file's React component.
  return ts.isExportAssignment(node.parent)||ts.isFunctionDeclaration(node)&&!!node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.DefaultKeyword)
 }
 const issues:string[]=[]
 const walk=(node:ts.Node)=>{
  if(ts.isCallExpression(node)){
   const expression=node.expression
   const hook=ts.isIdentifier(expression)&&hooks.has(expression.text)||ts.isPropertyAccessExpression(expression)&&ts.isIdentifier(expression.expression)&&namespaces.has(expression.expression.text)&&(expression.name.text==='use'||/^use[A-Z]/.test(expression.name.text))
   if(hook){
    let parent=node.parent
    while(parent&&!callable(parent))parent=parent.parent
    if(!parent||!allowedFunction(parent))issues.push(`${block.location} line ${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}: imported React hook is outside a function component or custom Hook`)
   }
  }
  ts.forEachChild(node,walk)
 }
 walk(source)
 return issues.slice(0,12)
}
export function checkVariantCode(variant:GeneratedVariant):string[]{
  const sourceBlocks=variant.task.documents.flatMap(doc=>['en','zh'].flatMap(locale=>codeBlocks(doc.body[locale as 'en'|'zh'],`source ${doc.id} ${locale}`)))
  const patchBlocks=['en','zh'].flatMap(locale=>codeBlocks(variant.rubric.exemplar[locale as 'en'|'zh'],`reference handover ${locale}`))
  const explicitCompilerExercise=/\b(?:fix|repair|diagnose|resolve|correct|intentional)\b[\s\S]{0,100}\b(?:compiler|compilation|syntax|type-check)\b[\s\S]{0,50}\b(?:error|failure|defect|bug)\b/i.test(variant.task.brief.en)
  const formattingIssues=[...variant.task.documents.flatMap(doc=>['en','zh'].flatMap(locale=>malformedCodeFenceIssues(doc.body[locale as 'en'|'zh'],`source ${doc.id} ${locale}`))),...['en','zh'].flatMap(locale=>malformedCodeFenceIssues(variant.rubric.exemplar[locale as 'en'|'zh'],`reference handover ${locale}`))]
  return [...formattingIssues,...(explicitCompilerExercise?[]:sourceBlocks.flatMap(staticCodeIssues)),...patchBlocks.flatMap(staticCodeIssues),...patchBlocks.flatMap(reactHookScopeIssues)]
}
