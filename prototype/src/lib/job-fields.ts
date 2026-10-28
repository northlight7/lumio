import type { Role } from './types'

/** Occupational fields describe the work, independently of employer industry. */
export const jobFields = [
  { id: 'it-software', en: 'IT & software', zh: '資訊科技與軟件' },
  { id: 'engineering', en: 'Engineering', zh: '工程' },
  { id: 'finance-accounting', en: 'Finance & accounting', zh: '財務與會計' },
  { id: 'data-analytics', en: 'Data & analytics', zh: '數據與分析' },
  { id: 'marketing', en: 'Marketing', zh: '市場營銷' },
  { id: 'design', en: 'Design & UX', zh: '設計與用戶體驗' },
  { id: 'science-research', en: 'Science & research', zh: '科學與研究' },
  { id: 'environment', en: 'Sustainability & environment', zh: '可持續發展與環境' },
  { id: 'operations-logistics', en: 'Operations & logistics', zh: '營運與物流' },
  { id: 'product-projects', en: 'Product & project management', zh: '產品與項目管理' },
  { id: 'customer-service', en: 'Customer service', zh: '客戶服務' },
  { id: 'education', en: 'Education & training', zh: '教育與培訓' },
] as const

export type JobFieldId = typeof jobFields[number]['id']

export const roleJobFields: Record<string, JobFieldId[]> = {
  'ai-engineer': ['it-software', 'data-analytics'],
  'software-developer': ['it-software'],
  'full-stack-developer': ['it-software'],
  'frontend-developer': ['it-software', 'design'],
  'qa-engineer': ['it-software'],
  'security-analyst': ['it-software'],
  'pcb-designer': ['engineering'],
  'mechanical-design-engineer': ['engineering'],
  'financial-analyst': ['finance-accounting', 'data-analytics'],
  'data-analyst': ['data-analytics'],
  'business-analyst': ['data-analytics', 'product-projects'],
  'digital-marketing-analyst': ['marketing', 'data-analytics'],
  'ux-designer': ['design'],
  'laboratory-analyst': ['science-research'],
  'research-analyst': ['science-research', 'data-analytics'],
  'sustainability-analyst': ['environment', 'data-analytics'],
  'environmental-scientist': ['environment', 'science-research'],
  'supply-chain-planner': ['operations-logistics'],
  'operations-planner': ['operations-logistics'],
  'product-manager': ['product-projects'],
  'project-coordinator': ['product-projects'],
  'customer-operations': ['customer-service'],
  'core-manufacturing-analyst': ['operations-logistics', 'data-analytics'],
  'core-accounting-assistant': ['finance-accounting'],
  'core-marketing-analyst': ['marketing', 'data-analytics'],
}

export function jobFieldsFor(role: Pick<Role, 'id'>) {
  return jobFields.filter(field => roleJobFields[role.id]?.includes(field.id))
}

export function availableJobFields(roles: Pick<Role, 'id'>[]) {
  const active = new Set(roles.flatMap(role => roleJobFields[role.id] || []))
  return jobFields.filter(field => active.has(field.id))
}
