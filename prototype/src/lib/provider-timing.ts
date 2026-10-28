import 'server-only'
import { ApiError } from './security'

export type ProviderPhase = 'author'|'review'|'grade'
export function generationRepairAttempts():number {
  const value=Number(process.env.AI_GENERATION_REPAIR_ATTEMPTS||'0')
  if(!Number.isInteger(value)||value<0||value>1)throw new ApiError(503,'The AI generation repair configuration requires attention.','configuration_invalid')
  return value
}
export function providerDeadlineMs(phase: ProviderPhase): number {
  if (phase === 'grade') return 45000
  const offline = Number(process.env.CURRICULUM_OFFLINE_TIMEOUT_MS)
  if (process.env.CURRICULUM_OFFLINE_PROVIDER_LIMIT && Number.isInteger(offline) && offline >= 45000 && offline <= 150000) return offline
  if (Number.isInteger(offline) && offline >= 45000 && offline <= 90000) return offline
  const key = phase === 'author' ? 'AI_GENERATION_AUTHOR_TIMEOUT_MS' : 'AI_GENERATION_REVIEW_TIMEOUT_MS'
  const raw = process.env[key]
  if (raw === undefined) return 45000
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 45000 || value > 90000) throw new ApiError(503, 'The AI request deadline configuration requires attention.', 'configuration_invalid')
  return value
}

export function generationTiming() {
  // One author is followed by a parallel public solver, private audit and contrast.
  // Each request has a single body-inclusive deadline and no internal transport retry.
  const workMs = (1+generationRepairAttempts())*(providerDeadlineMs('author') + providerDeadlineMs('review'))
  const leaseMs = workMs + 20000
  const lockMs = leaseMs + 10000
  return { workMs, leaseMs, lockMs, requestMs: lockMs + 20000 }
}
