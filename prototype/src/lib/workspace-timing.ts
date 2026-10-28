export function submissionTiming(startedAt?:string|null, deadlineAt?:string|null, receivedAt?:string|null) {
  if(!startedAt || !deadlineAt || !receivedAt)return undefined
  return {receivedAt,deadlineAt,onTime:Date.parse(receivedAt)<=Date.parse(deadlineAt),elapsedSeconds:Math.max(0,Math.floor((Date.parse(receivedAt)-Date.parse(startedAt))/1000))}
}
