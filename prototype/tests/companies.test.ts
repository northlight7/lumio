import { describe, expect, it } from 'vitest'
import { companies, getCompany } from '../src/lib/companies'
import { roles, getTask } from '../src/lib/content'

describe('real company context and learning boundaries', () => {
  it('maps twenty-two careers to twelve verified company profiles', () => {
    const companyRoles = roles.filter(role => role.collection !== 'core')
    expect(companyRoles).toHaveLength(22)
    expect(companies).toHaveLength(12)
    expect(new Set(companyRoles.map(role => role.id)).size).toBe(22)
    expect(new Set(companyRoles.map(role => role.companyId)).size).toBe(12)
    expect(new Set(companies.map(company => company.id)).size).toBe(12)
    for (const role of companyRoles) {
      const company = getCompany(role.companyId!)
      expect(company, `Missing company for ${role.id}`).toBeTruthy()
      expect(role.company).toEqual(company!.name)
      expect(company!.about.en.length).toBeGreaterThan(30)
      expect(company!.about.zh).toMatch(/[\u3400-\u9fff]/)
    }
  })
  it('uses real factual company identities while declining invented affiliations and vacancy claims', () => {
    const names = companies.map(company => company.name.en)
    expect(names).toEqual(expect.arrayContaining(['HKTVmall', 'foodpanda', 'Klook', 'MTR Corporation', 'Swire Properties', 'Oursky', 'SHOPLINE', 'ASMPT', 'STC', 'Enviro Labs', 'Lalamove', 'FIMMICK']))
    for (const company of companies) {
      expect(company.relationship).toBe('independent-demo')
      expect(company.about.en).not.toMatch(/Lumio partner|endorses Lumio|official Lumio|current vacancy|hiring now|job offer/i)
      expect(company.name.en).not.toMatch(/Harbour Home|Harbour Bento|District Market|Green Harbour Studio/)
      expect(Number.isFinite(Date.parse(company.factsVerifiedAt))).toBe(true)
    }
  })
  it('provides safe primary source URLs without credentials, tracking or private company systems', () => {
    for (const company of companies) {
      expect(company.sourceUrls.length).toBeGreaterThan(0)
      for (const source of company.sourceUrls) {
        const url = new URL(source.url)
        expect(url.protocol).toBe('https:')
        expect(url.username).toBe('')
        expect(url.password).toBe('')
        expect(url.search).toBe('')
        expect(source.title.trim()).not.toBe('')
        expect(url.hostname).not.toMatch(/localhost|127\.0\.0\.1|intranet|internal|login/)
      }
    }
  })
  it('distinguishes public corporate values from a labelled synthetic simulation style', () => {
    for (const company of companies) {
      expect(company.publicValues.length).toBeGreaterThan(0)
      expect(company.publicValues.every(value => value.en.length > 0 && value.zh.length > 0)).toBe(true)
      expect(company.simulationStyle.en).toMatch(/simulation|fictional|synthetic|simulated/i)
      expect(company.simulationStyle.zh).toMatch(/模擬|虛構|合成/)
    }
  })
  it('requires software role deliverables to include a concrete change without implying browser execution', () => {
    for (const roleId of ['software-developer', 'full-stack-developer']) {
      const task = getTask(roleId, 'taster')!
      expect(task.brief.en).toMatch(/patch|implementation/i)
      expect(task.brief.en).toMatch(/test/i)
    }
    expect(getTask('software-developer', 'taster')!.brief.en).toMatch(/Do not claim code executes/i)
    expect(getTask('full-stack-developer', 'taster')!.brief.en).toMatch(/No actual merchant system/i)
  })
  it('keeps engineering and science exercises documentary with synthetic criteria and no real-world certification', () => {
    const pcb = getTask('pcb-designer', 'taster')!
    expect(pcb.brief.en).toMatch(/paper-only low-voltage/i)
    expect(pcb.brief.en).toMatch(/explicit|every requirement/i)
    expect(pcb.brief.en).toMatch(/Avoid mains voltage.*real certification/i)
    const laboratory = getTask('laboratory-analyst', 'taster')!
    expect(laboratory.brief.en).toMatch(/synthetic measurements/i)
    expect(laboratory.brief.en).toMatch(/without chemicals, biological agents/i)
    const environmental = getTask('environmental-scientist', 'taster')!
    expect(environmental.brief.en).toMatch(/not legal or health standards/i)
    expect(environmental.brief.en).toMatch(/not actual sampling or chemical treatment/i)
  })
})
