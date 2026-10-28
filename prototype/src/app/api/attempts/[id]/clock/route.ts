import { endpoint, pathId } from '@/lib/security'
import { getAttemptClock } from '@/lib/services'
export const runtime='nodejs'
export const GET=(request:Request,context:{params:Promise<{id:string}>})=>endpoint(async()=>getAttemptClock(request,pathId((await context.params).id)))
