import type { Role } from './types'
import { getTaskFamilies } from './task-families'

/** The presentation bank currently uses real-company practice and its advanced pathway. */
export function presentationDemoScope(roles: Role[]) {
  const companyRoles = roles.filter(role => role.collection !== 'core' && role.companyId)
  return {
    taskIds: companyRoles.map(role => getTaskFamilies(role.id)[0]?.id).filter((id): id is string => !!id),
    sampleCount: companyRoles.reduce((count, role) => count + role.tasks.filter(task => task.stage !== 'assessment').length, 0),
  }
}
