import type {Criterion} from '../src/lib/types'
export function reusableAdversarialProof(value:unknown,taskId:string,variantId:string,criteria:Criterion[]):boolean {
  if(!value||typeof value!=='object')return false
  const row=value as Record<string,unknown>
  if(row.taskId!==taskId||row.variantId!==variantId||typeof row.checkedAt!=='string'||!Number.isFinite(Date.parse(row.checkedAt)))return false
  const matches=(grade:Record<string,unknown>)=>{
    if(grade.passed!==false||!Number.isInteger(grade.score)||(grade.score as number)<0||(grade.score as number)>=70||!Array.isArray(grade.checks)||grade.checks.length!==criteria.length)return false
    return grade.checks.every((check,index)=>check&&typeof check==='object'&&check.id===criteria[index].id&&check.points===criteria[index].points)
  }
  if(!row.unsupportedHandover||typeof row.unsupportedHandover!=='object')return false
  return matches(row)&&matches(row.unsupportedHandover as Record<string,unknown>)
}
