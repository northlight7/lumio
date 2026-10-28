import './role-art.css'
import type { CSSProperties } from 'react'
import { businessRoleScene } from './role-art-business'
import { technicalRoleScene } from './role-art-technical'

const tones: Record<string, string> = {
  'ai-engineer': 'violet', 'data-analyst': 'cyan', 'customer-operations': 'coral', 'ux-designer': 'pink',
  'sustainability-analyst': 'accent', 'software-developer': 'yellow', 'full-stack-developer': 'violet',
  'pcb-designer': 'accent', 'laboratory-analyst': 'cyan', 'environmental-scientist': 'accent',
  'business-analyst': 'coral', 'digital-marketing-analyst': 'pink',
  'frontend-developer': 'pink', 'qa-engineer': 'cyan', 'product-manager': 'violet', 'security-analyst': 'cyan',
  'mechanical-design-engineer': 'coral', 'supply-chain-planner': 'yellow', 'operations-planner': 'cyan',
  'financial-analyst': 'yellow', 'research-analyst': 'violet', 'project-coordinator': 'coral',
}

export function RoleArt({ roleId, className = '' }: { roleId: string; className?: string }) {
  const sceneRole = {'core-manufacturing-analyst':'supply-chain-planner','core-accounting-assistant':'financial-analyst','core-marketing-analyst':'digital-marketing-analyst'}[roleId] || roleId
  const scene = technicalRoleScene(sceneRole) ?? businessRoleScene(sceneRole) ?? businessRoleScene('digital-marketing-analyst')
  return <div className={`role-art ${className}`} data-art={roleId} style={{ '--art-color': `var(--${tones[sceneRole] || 'pink'})` } as CSSProperties}><svg viewBox="0 0 320 230" fill="none" aria-hidden="true"><ellipse cx="162" cy="211" rx="108" ry="10" className="art-shadow" />{scene}</svg></div>
}
