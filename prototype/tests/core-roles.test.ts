import { describe, expect, it } from 'vitest'
import { coreRoles } from '../src/lib/core-roles'
import { presentationDemoScope } from '../src/lib/demo-scope'
import { roles, getRole } from '../src/lib/content'
import { baselineTaskFamilies } from '../src/lib/task-families'
import { jobFieldsFor } from '../src/lib/job-fields'

describe('transferable core industry practice', () => {
  it('keeps the prepared presentation bank independent of core-role expansion', () => {
    const baseline=roles.filter(role=>role.collection!=='core')
    expect(presentationDemoScope(roles)).toEqual(presentationDemoScope(baseline))
    expect(presentationDemoScope(roles).sampleCount).toBe(25)
    expect(presentationDemoScope(roles).taskIds).toHaveLength(22)
    expect(presentationDemoScope(roles).taskIds.every(id=>!id.startsWith('core-'))).toBe(true)
  })
  it('keeps core practice separate from named employers and assigns occupational filters', () => {
    expect(coreRoles).toHaveLength(3)
    for (const role of coreRoles) {
      expect(getRole(role.id)).toEqual(role)
      expect(role.collection).toBe('core')
      expect(role.companyId).toBeUndefined()
      expect(role.company.en).toBe('Core practice')
      expect(role.tasks.every(task => !task.company)).toBe(true)
      expect(role.learningObjective!.en).toMatch(/synthetic|invented/i)
      expect(jobFieldsFor(role).length).toBeGreaterThan(0)
    }
    expect(jobFieldsFor(coreRoles[1]).map(field => field.id)).toContain('finance-accounting')
  })

  it('keeps two baseline work deliverables per core role with complete portable source data', () => {
    for (const role of coreRoles) {
      const families = baselineTaskFamilies.filter(family=>family.roleId===role.id)
      expect(families).toHaveLength(2)
      expect(families[0].objective.en).not.toBe(families[1].objective.en)
      for (const family of families) {
        expect(family.variationGuideline.en).toContain('CSV')
        expect(family.variationGuideline.en).toContain('A:')
        expect(family.variationGuideline.en).toContain('B:')
        expect(family.criteria.reduce((sum, item) => sum + item.points, 0)).toBe(100)
        expect(family.criteria[0].id).toBe('domain-accuracy')
      }
    }
  })
})
