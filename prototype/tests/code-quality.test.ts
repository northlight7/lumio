import {describe,expect,it} from 'vitest'
import {checkVariantCode,codeBlocks,fencedLanguages,reactHookScopeIssues,staticCodeIssues,malformedCodeFenceIssues} from '../src/lib/code-quality'
import type {GeneratedVariant} from '../src/lib/ai-curriculum'
const block=(code:string,language='ts')=>({code,language,location:'QA fixture'})
function fixture(source:string,patch:string,brief='Fix the documented input contract defect.'):GeneratedVariant{
 return {roleId:'software-developer',task:{brief:{en:brief,zh:'修正提供的問題。'},documents:[{id:'code',body:{en:'```ts\n'+source+'\n```',zh:'程式碼審查。'}}]},rubric:{exemplar:{en:'```ts\n'+patch+'\n```',zh:'修正程式碼。'}}} as GeneratedVariant
}
describe('readable code publication checks',()=>{
 it('rejects escaped fence headers outside code while preserving actual programs and serialized Markdown literals',()=>{
  expect(malformedCodeFenceIssues('Source\\n```html\\n<button type=\\"button\\">Run</button>\\n```','source').length).toBe(1)
  expect(malformedCodeFenceIssues('```js\\nfunction demo() { return 1 }\\n```','source').length).toBe(1)
  expect(malformedCodeFenceIssues('```css\\n.card {\n color: red;\n}\n```','source').length).toBe(1)
  expect(malformedCodeFenceIssues('```js\nfunction demo() { return 1 }\n```','source')).toEqual([])
  expect(malformedCodeFenceIssues('```js\nconst serialized = "example\\n```js\\ncode";\n```','source')).toEqual([])
  expect(malformedCodeFenceIssues('The literal JSON string contains \\"line\\ncode\\" without a code fence.','source')).toEqual([])
  const candidate=fixture('function ok() {}','function ok() {}')
  candidate.task.documents[0].body.zh='範例\\n```ts\\nfunction hidden() {}\\n```'
  expect(checkVariantCode(candidate).join(' ')).toContain('source code zh: code fence contains')
 })
 it('rejects imported React hooks at module scope, including aliases and namespace imports',()=>{
  expect(reactHookScopeIssues(block('import {useRef as ref} from "react"; const key = ref("x");')).length).toBe(1)
  expect(reactHookScopeIssues(block('import * as UI from "react"; const key = UI.useRef("x");')).length).toBe(1)
  expect(reactHookScopeIssues(block('function useRef(value: string) { return value; } const key = useRef("x");'))).toEqual([])
 })
 it('allows hooks inside components and custom Hooks but rejects event-handler hooks',()=>{
  expect(reactHookScopeIssues(block('import {useRef} from "react"; function Button() { const ref = useRef(null); return ref; }'))).toEqual([])
  expect(reactHookScopeIssues(block('import {useRef} from "react"; const useKey = () => useRef(null);'))).toEqual([])
  expect(reactHookScopeIssues(block('import {useRef} from "react"; function Button() { const onClick = () => useRef(null); return onClick; }')).length).toBe(1)
  expect(reactHookScopeIssues(block('import {useRef} from "react"; class Component { Render() { return useRef(null); } }')).length).toBe(1)
 })
 it('checks executable snippets in non-software roles and reports unsupported languages honestly',()=>{
  const candidate=fixture('const event = { id: 1, id: 2 };','const event = { id: 1 };')
  candidate.roleId='product-manager'
  expect(checkVariantCode(candidate).join(' ')).toContain('TS1117')
  expect(fencedLanguages('```python\ndef add(a, b): return a + b\n```\n```sql\nSELECT 1\n```')).toEqual(['python','sql'])
  expect(codeBlocks('```python\ndef add(a, b): return a + b\n```','source')).toEqual([])
 })
 it('rejects real TypeScript syntax and duplicate-property compilation errors',()=>{
  expect(staticCodeIssues(block('const event = { id: 1, id: 2 };')).join(' ')).toContain('TS1117')
  expect(staticCodeIssues(block('function broken(input: string { return input; }')).length).toBeGreaterThan(0)
  expect(staticCodeIssues(block('const Component = () => <div title="a" title="b"/>;','tsx')).join(' ')).toContain('TS17001')
 })
 it('allows intentional logic defects without inventing framework imports or type stubs',()=>{
  expect(staticCodeIssues(block('function trimASCII(input: string) { return input.trim(); }'))).toEqual([])
  expect(staticCodeIssues(block('import { useState } from "react"; export const Form = () => <input aria-label="Name"/>;','tsx'))).toEqual([])
  expect(codeBlocks('```sql\nSELECT 1\n```\n```json\n{"a":1}\n```','source')).toHaveLength(0)
 })
 it('checks Traditional Chinese code blocks rather than assuming bilingual syntax matches',()=>{
  const candidate=fixture('function ok(value: string) { return value; }','function ok(value: string) { return value; }')
  candidate.rubric.exemplar.zh='```ts\nconst translated = { event: 1, event: 2 };\n```'
  expect(checkVariantCode(candidate).join(' ')).toContain('reference handover zh')
  expect(checkVariantCode(candidate).join(' ')).toContain('TS1117')
 })
 it('requires reference patches to parse even when the public task explicitly teaches compiler errors',()=>{
  const broken='function broken(input: string { return input; }'
  const fixed='function broken(input: string) { return input; }'
  expect(checkVariantCode(fixture(broken,fixed))).not.toEqual([])
  expect(checkVariantCode(fixture(broken,fixed,'Repair the intentional syntax error in the supplied function.'))).toEqual([])
  expect(checkVariantCode(fixture(broken,broken,'Repair the intentional syntax error in the supplied function.'))).not.toEqual([])
 })
})
