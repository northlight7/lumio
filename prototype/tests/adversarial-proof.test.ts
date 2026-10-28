import {describe,expect,it} from 'vitest'
import {reusableAdversarialProof} from './adversarial-proof'
const criteria=[{id:'accuracy',label:{en:'Accuracy',zh:'準確'},description:{en:'Source grounded',zh:'按來源'},points:100}]
const proof={taskId:'family',variantId:'immutable-source-uuid',score:2,passed:false,checks:[{id:'accuracy',points:100}],unsupportedHandover:{score:20,passed:false,checks:[{id:'accuracy',points:100}]},checkedAt:'2026-10-10T00:00:00Z'}
describe('reuse of real negative-grading proofs',()=>{
 it('accepts complete results only for the exact immutable task snapshot and fixed criteria',()=>{
  expect(reusableAdversarialProof(proof,'family','immutable-source-uuid',criteria)).toBe(true)
  expect(reusableAdversarialProof(proof,'family','replacement-source-uuid',criteria)).toBe(false)
  expect(reusableAdversarialProof(proof,'other-family','immutable-source-uuid',criteria)).toBe(false)
  expect(reusableAdversarialProof(proof,'family','immutable-source-uuid',[{...criteria[0],points:90}])).toBe(false)
 })
 it('rejects missing complementary work checks, passing scores and malformed evidence',()=>{
  expect(reusableAdversarialProof({...proof,unsupportedHandover:undefined},'family','immutable-source-uuid',criteria)).toBe(false)
  expect(reusableAdversarialProof({...proof,score:70},'family','immutable-source-uuid',criteria)).toBe(false)
  expect(reusableAdversarialProof({...proof,unsupportedHandover:{...proof.unsupportedHandover,passed:true}},'family','immutable-source-uuid',criteria)).toBe(false)
  expect(reusableAdversarialProof({...proof,checkedAt:'unknown'},'family','immutable-source-uuid',criteria)).toBe(false)
 })
})
