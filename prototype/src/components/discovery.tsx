'use client'

import { useState } from 'react'
import { ArrowRight, BookOpen, Check, ChevronRight, Clock3, FlaskConical, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import { companies, getCompany } from '@/lib/companies'
import { getTaskFamilies } from '@/lib/task-families'
import { availableJobFields, jobFieldsFor, roleJobFields } from '@/lib/job-fields'
import type { Attempt, Company, Locale, Profile, Role, Variation } from '@/lib/types'
import { RoleArt } from './role-art'
import { CompanyLogo } from './company-logo'
import './discovery.css'

const interestOptions = [{ id: 'technology', en: 'Building things', zh: '建構事物' }, { id: 'numbers', en: 'Finding patterns', zh: '尋找規律' }, { id: 'people', en: 'Helping people', zh: '幫助他人' }, { id: 'design', en: 'Designing experiences', zh: '設計體驗' }, { id: 'environment', en: 'Environmental impact', zh: '環境影響' }, { id: 'science', en: 'Scientific evidence', zh: '科學證據' }]
const hooks: Record<string, { en: string; zh: string }> = {
  'core-manufacturing-analyst': {en:'Check the yield. Plan the next shift.',zh:'核對良率，規劃下一輪生產。'},
  'core-accounting-assistant': {en:'Reconcile records. Keep the audit clear.',zh:'核對記錄，清楚保留審查依據。'},
  'core-marketing-analyst': {en:'Compare campaigns. Test the next idea.',zh:'比較推廣，測試下一個想法。'},
  'ai-engineer': { en: 'Make an AI assistant safer.', zh: '讓 AI 助理更安全。' },
  'data-analyst': { en: 'Find the story behind the numbers.', zh: '找出數字背後的故事。' },
  'customer-operations': { en: 'Turn a tricky request into a solution.', zh: '把棘手要求變成解決方案。' },
  'ux-designer': { en: 'Make the next tap feel effortless.', zh: '讓下一次點按更順暢。' },
  'sustainability-analyst': { en: 'Choose a plan with measurable impact.', zh: '選擇成效可衡量的方案。' },
  'software-developer': { en: 'Trace a bug. Ship a better fix.', zh: '追蹤問題，提出更好的修正。' },
  'full-stack-developer': { en: 'Connect the screen to the system.', zh: '連結畫面與系統。' },
  'pcb-designer': { en: 'Follow the signal. Fix the circuit.', zh: '追蹤訊號，改善電路。' },
  'laboratory-analyst': { en: 'Turn a sample into reliable evidence.', zh: '把樣本轉化為可靠證據。' },
  'environmental-scientist': { en: 'Read the evidence in the environment.', zh: '解讀環境中的證據。' },
  'business-analyst': { en: 'Untangle a process. Find a better way.', zh: '理清流程，找出更好方法。' },
  'digital-marketing-analyst': { en: 'Find which campaign really works.', zh: '找出真正有效的推廣活動。' },
  'frontend-developer': { en: 'Build an interface that works for everyone.', zh: '建立人人可用的介面。' },
  'qa-engineer': { en: 'Find the failure before it reaches a user.', zh: '在問題影響用戶之前找出它。' },
  'product-manager': { en: 'Choose the next problem worth solving.', zh: '選擇下一個值得解決的問題。' },
  'security-analyst': { en: 'Spot a risk. Protect the right access.', zh: '辨識風險，守護存取權限。' },
  'mechanical-design-engineer': { en: 'Check the fit before the build.', zh: '製造前核對設計配合。' },
  'supply-chain-planner': { en: 'Match the stock to the next demand.', zh: '配對庫存及下一輪需求。' },
  'operations-planner': { en: 'Plan a service that can handle the rush.', zh: '規劃能應付高峰的服務。' },
  'financial-analyst': { en: 'Turn costs into a defensible decision.', zh: '以成本資料作出有理據的決策。' },
  'research-analyst': { en: 'Ask what the evidence really supports.', zh: '探究證據真正支持的結論。' },
  'project-coordinator': { en: 'Keep the next milestone on track.', zh: '讓下一個里程碑按計劃推進。' },
}

const industries = [
  { id: 'all', en: 'All industries', zh: '所有行業' },
  { id: 'commerce', en: 'Retail & commerce', zh: '零售與商貿' },
  { id: 'transport', en: 'Travel & transport', zh: '旅遊與交通' },
  { id: 'manufacturing', en: 'Manufacturing', zh: '製造業' },
  { id: 'software', en: 'Software & services', zh: '軟件與服務' },
  { id: 'business-services', en: 'Marketing services', zh: '營銷服務' },
  { id: 'testing', en: 'Testing & environment', zh: '測試與環境' },
  { id: 'property', en: 'Property', zh: '物業' },
]
const companyIndustry: Record<string, string> = { hktvmall: 'commerce', shopline: 'commerce', foodpanda: 'transport', klook: 'transport', mtr: 'transport', lalamove: 'transport', asmpt: 'manufacturing', oursky: 'software', fimmick: 'business-services', stc: 'testing', 'enviro-labs': 'testing', 'swire-properties': 'property' }
const industryLabel = (company: Company, locale: Locale) => industries.find(item => item.id === companyIndustry[company.id])?.[locale] || company.sector[locale]

const roleSearchAliases: Record<string, string> = {
  'ai-engineer': 'artificial intelligence engineer LLM engineer',
  'full-stack-developer': 'full stack fullstack developer',
  'frontend-developer': 'front end frontend UI developer',
  'qa-engineer': 'quality assurance software testing test engineer',
  'ux-designer': 'user experience interaction designer',
  'pcb-designer': 'printed circuit board circuitboard designer',
  'laboratory-analyst': 'lab analyst laboratory analyst',
  'security-analyst': 'cybersecurity cyber security analyst',
}
const isUnfinished = (attempt: Attempt) => attempt.status === 'draft' || !attempt.submissions.at(-1)?.evaluation.passed
const normaliseSearch = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, '')
const matchesSearch = (value: string, query: string) => {
  const haystack = normaliseSearch(value)
  return query.trim().split(/\s+/u).every(term => haystack.includes(normaliseSearch(term)))
}

export function CompanyMark({ company, name }: { company?: Company; name?: string }) {
  const label = company?.name.en || name || 'Lumio'
  const initials = label.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2) || label.slice(0, 2)
  return <span className="company-mark" aria-hidden="true">{initials.toUpperCase()}</span>
}

export function Discovery({ roles, locale, profile, busy, variations, onDemo, onOverview, onCompany, onResume, onAccount }: { roles: Role[]; locale: Locale; profile: Profile | null; busy: string; variations: Record<string, Variation[]>; onDemo: () => void; onOverview: (role: Role) => void; onCompany: (company: Company) => void; onResume: (attempt: Attempt) => void; onAccount: () => void }) {
  const zh = locale === 'zh'
  const t = (en: string, chinese: string) => zh ? chinese : en
  const [mode, setMode] = useState<'roles' | 'companies'>('roles')
  const [practiceCollection, setPracticeCollection] = useState<'all' | 'company' | 'core'>('all')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [industry, setIndustry] = useState('all')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [companyId, setCompanyId] = useState('all')
  const [interests, setInterests] = useState<string[]>([])
  const [advanced, setAdvanced] = useState(false)
  const [featuredId, setFeaturedId] = useState('pcb-designer')
  const fields = availableJobFields(roles)
  const categories = [{ id: 'all', en: 'All positions', zh: '所有職位' }, ...fields]
  const match = (role: Role) => interests.filter(interest => role.interests.includes(interest)).length
  const filtered = roles.filter(role => (practiceCollection === 'all' || (role.collection || 'company') === practiceCollection) && (category === 'all' || roleJobFields[role.id]?.some(id => id === category)) && (companyId === 'all' || role.companyId === companyId) && (industry === 'all' || (role.collection === 'core' ? role.id !== 'core-manufacturing-analyst' || industry === 'manufacturing' : companyIndustry[role.companyId || ''] === industry)) && matchesSearch(`${role.title.en} ${role.title.zh} ${role.company.en} ${role.company.zh} ${role.field.en} ${role.field.zh} ${jobFieldsFor(role).map(item => `${item.en} ${item.zh}`).join(' ')} ${role.description.en} ${role.description.zh} ${roleSearchAliases[role.id] || ''} ${getTaskFamilies(role.id).map(item => `${item.title.en} ${item.title.zh} ${item.objective.en} ${item.objective.zh}`).join(' ')} ${role.skills.map(skill => `${skill.en} ${skill.zh}`).join(' ')}`, query)).sort((a, b) => match(b) - match(a))
  const featured = roles.find(role => role.id === featuredId) || roles[0]
  const featuredCompany = getCompany(featured.companyId || '')
  const current = profile?.attempts.filter(attempt => !attempt.retired && attempt.task?.generation && isUnfinished(attempt)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
  const currentRole = roles.find(role => role.id === current?.roleId)
  const filterCount = Number(category !== 'all') + Number(companyId !== 'all') + Number(industry !== 'all') + Number(practiceCollection !== 'all') + interests.length
  const reset = () => { setQuery(''); setCategory('all'); setCompanyId('all'); setIndustry('all'); setInterests([]); setPracticeCollection('all') }

  const selectedCompany = companies.find(company => company.id === collectionId)
  const visibleCompanies = companies.filter(company => roles.some(role => role.companyId === company.id) && (industry === 'all' || companyIndustry[company.id] === industry) && matchesSearch(`${company.name.en} ${company.name.zh} ${company.sector.en} ${company.sector.zh} ${industryLabel(company, 'en')} ${industryLabel(company, 'zh')}`, query))
  const changeMode = (next: 'roles' | 'companies') => { setMode(next); reset(); setAdvanced(false); setCollectionId(null) }

  function careerTile(role: Role) { const company = getCompany(role.companyId || ''); const saved = profile?.attempts.some(attempt => attempt.roleId === role.id && !attempt.retired && isUnfinished(attempt)); const passed = profile?.attempts.some(attempt => attempt.roleId === role.id && !attempt.retired && attempt.submissions.some(submission => submission.evaluation.passed)); return <article className="career-card playground-card" key={role.id}><div className="career-tile-head"><h3>{role.title[locale]}</h3><div className="tile-company-row">{company && <CompanyLogo company={company} />}{role.collection === 'core' ? <span className="core-practice-label"><ShieldCheck size={14}/>{role.id === 'core-manufacturing-analyst' ? t('Manufacturing practice', '製造業練習') : t('Cross-industry practice', '跨行業練習')}</span> : <button className="role-company-link" onClick={() => company && onCompany(company)}>{role.company[locale]}<ChevronRight size={14} /></button>}</div></div><div className="career-art-stage"><RoleArt roleId={role.id} />{passed && <span className="playground-practised"><Check size={14} />{t('Practised', '已體驗')}</span>}{match(role) > 0 && <span className="playground-match"><Sparkles size={14} />{t('Interest match', '興趣相符')}</span>}</div><div className="career-tile-copy"><p>{hooks[role.id]?.[locale] || role.description[locale]}</p><div className="career-card-bottom"><span className="role-task-count"><BookOpen size={16} />{t(`${getTaskFamilies(role.id).length} task types`, `${getTaskFamilies(role.id).length} 種任務`)}</span><button className="tile-start" disabled={!!busy} onClick={() => onOverview(role)} aria-label={role.collection === 'core' ? t(`Explore ${role.title.en} core practice`, `探索${role.title.zh}通用練習`) : t(`Explore ${role.title.en} at ${role.company.en}`, `探索 ${role.company.zh} 的${role.title.zh}`)}>{saved ? t('Resume', '繼續') : passed ? t('View tasks', '查看任務') : t('Explore', '探索')}<ArrowRight size={18} /></button></div></div></article> }
  return <div className="discovery-view playground-discovery">
    <div className={`playground-intro ${current && currentRole && mode === 'roles' ? 'has-resume' : ''}`}><div><h1>{t('Find your kind of work.', '找到你的工作方向。')}</h1><p>{t('Try a real-world decision. Discover what clicks.', '體驗工作決策，發現適合你的方向。')}</p></div>{mode === 'roles' && current && currentRole && <section className="playground-resume" aria-label={t('Your next step', '你的下一步')}><RoleArt roleId={currentRole.id} /><div><span>{t('Pick up where you left off', '繼續上次的體驗')}</span><strong>{currentRole.title[locale]}</strong><p>{current.task?.title[locale]}</p></div><button className="secondary-button" disabled={!!busy} onClick={() => onResume(current)} aria-label={t('Continue your assignment', '繼續你的任務')}>{t('Continue', '繼續')}<ArrowRight size={18} /></button></section>}<div className="discovery-entry-actions">{!profile?.email && <button className="secondary-button learner-account-entry" disabled={!!busy} onClick={onAccount}>{t('Sign in / create account','登入／建立帳戶')}<ArrowRight size={16}/></button>}{(profile?.demo || !profile || !profile.email && profile.attempts.length === 0) && <button className="secondary-button demo-entry" disabled={!!busy} onClick={onDemo}><FlaskConical size={18} />{profile?.demo ? t('Return to presentation demo', '返回簡報示範') : t('Open presentation demo', '開啟簡報示範')}</button>}</div></div>
    <div className="discovery-browse-controls"><div className="discovery-mode-tabs" role="group" aria-label={t('Explore by', '探索方式')}><button aria-pressed={mode === 'roles'} onClick={() => changeMode('roles')}>{t('Explore roles', '按職位探索')}</button><button aria-pressed={mode === 'companies'} onClick={() => changeMode('companies')}>{t('Explore companies', '按公司探索')}</button></div>{mode === 'roles' && <div className="practice-collection" role="group" aria-label={t('Practice collection', '練習類別')}>{(['all','company','core'] as const).map(value => <button key={value} aria-pressed={practiceCollection === value} onClick={() => { setPracticeCollection(value); setCompanyId('all'); setIndustry('all') }}>{value === 'all' ? t('All practice', '所有練習') : value === 'company' ? t('Company contexts', '公司背景') : t('Core industry skills', '通用行業技能')}</button>)}</div>}</div>
    {mode === 'roles' && <>
    <section className="playground-library" id="careers"><div className="playground-library-heading"><h2>{t('Choose a job field', '選擇職業領域')}</h2><label className="search-control"><Search size={20} /><input aria-label={t('Search roles or companies', '搜尋職位或公司')} placeholder={t('Search role, company or skill', '搜尋職位、公司或技能')} value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="search-clear" aria-label={t('Clear search', '清除搜尋')} onClick={() => setQuery('')}><X size={18}/></button>}</label></div>{practiceCollection === 'core' && <p className="core-library-note">{t('Reusable work skills for many employers. Synthetic industry tasks, without a specific company.', '適用於不同僱主的工作技能。使用模擬行業任務，不對應特定公司。')}</p>}<div className="playground-filterbar"><label className="job-field-picker">{t('Job field', '職業領域')}<select aria-label={t('Filter by job field', '按職業領域篩選')} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}</select></label><button className="filter-toggle" aria-label={t('Filters','篩選')} aria-expanded={advanced} aria-controls="advanced-position-filters" onClick={() => setAdvanced(value => !value)}><SlidersHorizontal size={18} /><span className="filter-toggle-label">{t('Filters', '篩選')}</span>{filterCount > 0 && <span>{filterCount}</span>}</button></div>
      <aside hidden={!advanced} id="advanced-position-filters" className="playground-advanced" aria-label={t('Position filters', '職位篩選')}><div className="advanced-selects"><label className="mobile-job-field-picker">{t('Job field', '職業領域')}<select aria-label={t('Filter by job field', '按職業領域篩選')} value={category} onChange={event => setCategory(event.target.value)}>{categories.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}</select></label><label className="mobile-collection-picker">{t('Practice collection', '練習類別')}<select aria-label={t('Practice collection', '練習類別')} value={practiceCollection} onChange={event => { setPracticeCollection(event.target.value as 'all' | 'company' | 'core'); setCompanyId('all'); setIndustry('all') }}><option value="all">{t('All practice', '所有練習')}</option><option value="company">{t('Company contexts', '公司背景')}</option><option value="core">{t('Core industry skills', '通用行業技能')}</option></select></label>{practiceCollection !== 'core' && <label>{t('Company', '公司')}<select aria-label={t('Filter by company', '按公司篩選')} value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="all">{t('All companies', '所有公司')}</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name[locale]}</option>)}</select></label>}<label>{t('Industry', '行業')}<select aria-label={t('Filter by industry', '按行業篩選')} value={industry} onChange={event => setIndustry(event.target.value)}>{industries.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}</select></label><button className="text-button" onClick={reset}>{t('Reset filters', '重設篩選')}</button></div><p className="industry-helper">{t('Job field describes the work. Industry describes the company.', '職業領域指工作性質，行業指公司所屬類別。')}</p><fieldset><legend>{t('Put your interests first', '優先顯示你的興趣')}</legend><div className="advanced-interests">{interestOptions.map(interest => <label className="interest-choice" key={interest.id}><input type="checkbox" checked={interests.includes(interest.id)} onChange={() => setInterests(previous => previous.includes(interest.id) ? previous.filter(value => value !== interest.id) : [...previous, interest.id])} />{interest[locale]}</label>)}</div></fieldset>{interests.length > 0 && <p>{t('Matches move higher. Interests help you explore, they do not predict aptitude.', '相符興趣會排列較前。興趣有助探索，並非能力預測。')}</p>}</aside>
      <div className="active-filter-chips" aria-label={t('Active filters', '已選篩選')}>
        {category !== 'all' && <button onClick={() => setCategory('all')}>{categories.find(item => item.id === category)?.[locale]}<X size={14}/><span className="sr-only">{t('Remove job field filter', '移除職業領域篩選')}</span></button>}
        {companyId !== 'all' && <button onClick={() => setCompanyId('all')}>{getCompany(companyId)?.name[locale]}<X size={14}/><span className="sr-only">{t('Remove company filter', '移除公司篩選')}</span></button>}
        {industry !== 'all' && <button onClick={() => setIndustry('all')}>{industries.find(item => item.id === industry)?.[locale]}<X size={14}/><span className="sr-only">{t('Remove industry filter', '移除行業篩選')}</span></button>}
        {interests.map(id => <button key={id} onClick={() => setInterests(previous => previous.filter(value => value !== id))}>{interestOptions.find(item => item.id === id)?.[locale]}<X size={14}/><span className="sr-only">{t('Remove interest preference', '移除興趣偏好')}</span></button>)}
      </div>
      <div className="playground-resultcount" aria-live="polite">{t(`${filtered.length} practice ${filtered.length === 1 ? 'position' : 'positions'}`, `${filtered.length} 個體驗職位`)}{(filterCount > 0 || query.trim()) && <button className="text-button" onClick={reset}>{t('Clear filters', '清除篩選')}</button>}</div><div className="career-grid playground-grid">{filtered.map(careerTile)}</div>{!filtered.length && <div className="playground-no-results"><Search size={28} /><h3>{t('No positions match these filters', '沒有符合篩選的職位')}</h3><p>{t('Try another company or search term.', '試試其他公司或搜尋字詞。')}</p><button className="secondary-button" onClick={reset}>{t('Reset filters', '重設篩選')}</button></div>}
    </section><details className="playground-suggestion"><summary>{t('Suggested position', '建議體驗職位')}<ChevronRight size={17} /></summary>      <section className="playground-feature" aria-label={t('Featured practice position', '精選體驗職位')}><div className="feature-copy"><span className="feature-kicker"><Sparkles size={16} />{t('Try something new', '嘗試新方向')}</span><h2>{featured.title[locale]}</h2><button className="feature-company" onClick={() => featuredCompany && onCompany(featuredCompany)}>{featured.company[locale]}<ChevronRight size={15} /></button><p>{hooks[featured.id]?.[locale] || featured.description[locale]}</p><button className="primary-button" disabled={!!busy} onClick={() => onOverview(featured)}>{t('Explore this position', '探索此職位')}<ArrowRight size={18} /></button><label className="playground-feature-selector"><select aria-label={t('Featured position', '精選職位')} value={featured.id} onChange={event => setFeaturedId(event.target.value)}>{roles.map(role => <option key={role.id} value={role.id}>{role.title[locale]} · {role.company[locale]}</option>)}</select></label></div><RoleArt roleId={featured.id} className="feature-art" /></section></details></>}
    {mode === 'companies' && <section className="playground-company-library" aria-label={t('Company explorer', '公司探索')}>
      {selectedCompany ? <><div className="company-collection-header"><div><button className="back-button" onClick={() => setCollectionId(null)}>{t('All companies', '所有公司')}</button><h2>{selectedCompany.name[locale]}</h2><p>{industryLabel(selectedCompany, locale)} · {t('Independent company-context practice', '獨立公司背景體驗')}</p></div><button className="secondary-button" onClick={() => onCompany(selectedCompany)}>{t('Company profile and sources', '公司簡介及來源')}<ChevronRight size={17} /></button></div><div className="career-grid playground-grid company-role-collection">{roles.filter(role => role.companyId === selectedCompany.id).map(careerTile)}</div></> : <>
      <div className="playground-library-heading"><div><h2>{t('Choose a company context', '選擇公司背景')}</h2></div><label className="search-control"><Search size={20} /><input aria-label={t('Search companies or industries', '搜尋公司或行業')} placeholder={t('Search company or industry', '搜尋公司或行業')} value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" className="search-clear" aria-label={t('Clear search', '清除搜尋')} onClick={() => setQuery('')}><X size={18}/></button>}</label></div>
      <label className="mobile-industry-picker">{t('Industry', '行業')}<select aria-label={t('Filter companies by industry', '按行業篩選公司')} value={industry} onChange={event => setIndustry(event.target.value)}>{industries.map(item => <option key={item.id} value={item.id}>{item[locale]}</option>)}</select></label><div className="category-chips industry-chips" role="group" aria-label={t('Company industries', '公司行業')}>{industries.map(item => <button key={item.id} aria-pressed={industry === item.id} className={industry === item.id ? 'selected' : ''} onClick={() => setIndustry(item.id)}>{item[locale]}</button>)}</div><div className="playground-resultcount" aria-live="polite">{t(`${visibleCompanies.length} company context${visibleCompanies.length === 1 ? '' : 's'}`, `${visibleCompanies.length} 個公司背景`)}{(query || industry !== 'all') && <button className="text-button" onClick={reset}>{t('Clear filters', '清除篩選')}</button>}</div>
      <div className="playground-company-grid">{visibleCompanies.map(company => { const companyRoles = roles.filter(role => role.companyId === company.id); return <article className="company-tile" key={company.id}><div className="company-tile-head"><div className="company-identity"><CompanyLogo company={company} /><h3>{company.name[locale]}</h3></div><p>{industryLabel(company, locale)}</p></div><div className="company-art-stage"><RoleArt roleId={companyRoles[0].id} /></div><div className="company-tile-copy"><p>{companyRoles.slice(0, 2).map(role => role.title[locale]).join(' · ')}{companyRoles.length > 2 ? t(` +${companyRoles.length - 2} more`, ` 及另外 ${companyRoles.length - 2} 個職位`) : ''}</p><div><span>{t(`${companyRoles.length} practice position${companyRoles.length === 1 ? '' : 's'}`, `${companyRoles.length} 個體驗職位`)}</span><button className="tile-start" disabled={!!busy} aria-label={t(`View roles at ${company.name.en}`, `查看 ${company.name.zh} 的職位`)} onClick={() => { setCollectionId(company.id); document.getElementById('main')?.scrollTo({ top: 0, behavior: 'instant' }) }}>{t('View roles', '查看職位')}<ArrowRight size={18} /></button></div></div></article> })}</div>{!visibleCompanies.length && <div className="playground-no-results"><Search size={28} /><h3>{t('No companies match these filters', '沒有符合篩選的公司')}</h3><button className="secondary-button" onClick={reset}>{t('Reset filters', '重設篩選')}</button></div>}
      </>}
    </section>}
    {(profile?.demo || !profile || !profile.email && profile.attempts.length === 0) && <button className="secondary-button mobile-demo-entry" disabled={!!busy} onClick={onDemo}><FlaskConical size={18} />{profile?.demo ? t('Return to presentation demo', '返回簡報示範') : t('Open presentation demo', '開啟簡報示範')}</button>}<div className="discovery-footer"><ShieldCheck size={18} /><p>{t('Independent simulations with real company context. Fictional assignments, no endorsement or live vacancies. Your work stays private until you share.', '真實公司背景的獨立模擬。任務為虛構，並不代表認可或實際招聘。作品保持私密，直至你選擇分享。')}</p></div>
  </div>
}

export function RoleOverview({ role, locale, variations, attempts, busy, guest, onStart, onCompany, onAccount }: { role: Role; locale: Locale; variations: Variation[]; attempts: Attempt[]; busy: boolean; guest: boolean; onStart: (taskId: string, variantId?: string) => void; onCompany: (company: Company) => void; onAccount: () => void }) {
  const t = (en: string, chinese: string) => locale === 'zh' ? chinese : en
  const company = getCompany(role.companyId || '')
  const families = getTaskFamilies(role.id)
  const roleAttempts = attempts.filter(item => !item.retired && item.roleId === role.id)
  const practised = families.filter(item => roleAttempts.some(attempt => attempt.task?.taskId === item.id && attempt.submissions.length > 0)).length
  return <div className="role-overview playground-overview compact-role-overview">
    <div className="role-overview-lead"><RoleArt roleId={role.id}/><div><span className="overview-company-name">{role.company[locale]}</span><p>{role.description[locale]}</p><div className="overview-quickmeta"><span><BookOpen size={17}/>{t(`${families.length} task types`, `${families.length} 種任務`)}</span></div></div></div>
    {guest && <div className="task-guest-note"><ShieldCheck size={16}/><p>{t('Guest work resets on refresh. Sign in to keep it.','重新整理後會重設訪客工作，登入可保留作品。')}</p><button className="text-button" disabled={busy} onClick={onAccount}>{t('Sign in','登入')}<ArrowRight size={14}/></button></div>}
    <section className="task-family-choices" aria-label={t('Task types', '任務類型')}>
      <div className="task-choice-heading"><h3>{t('Choose a task', '選擇任務')}</h3><span>{t(`${practised} of ${families.length} practised`, `已體驗 ${practised}/${families.length} 種任務`)}</span></div>
      <p>{t('Different work. Repeatable scenarios. Pick your next skill.', '不同工作，可重複練習的情境。選擇下一項技能。')}</p>
      <div className="task-family-rows">{families.map((family, index) => {
        const saved = roleAttempts.filter(item => item.task?.taskId === family.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
        const unfinished = saved.find(isUnfinished)
        const reviewed = saved.some(item => item.submissions.length > 0)
        const available = variations.filter(item => item.taskId === family.id).length
        return <button className="task-family-card task-family-row" key={family.id} data-task-id={family.id} aria-label={family.title[locale]} aria-describedby={`task-state-${role.id}-${family.id}`} disabled={busy} onClick={() => onStart(family.id, (unfinished || saved[0])?.variantId)}>
          <span className={`task-row-number ${reviewed ? 'task-row-reviewed' : ''}`} aria-hidden="true">{reviewed ? <BookOpen size={18}/> : String(index + 1).padStart(2,'0')}</span>
          <span className="task-row-copy"><strong>{family.title[locale]}</strong><span>{family.description[locale]}</span><span className="task-family-meta"><span><Clock3 size={15}/>{family.duration} {t('min','分鐘')}</span><span>{available ? t(`${available} ${available === 1 ? 'scenario' : 'scenarios'}`, `${available} 個情境`) : t('AI-created scenarios','AI 生成情境')}</span></span></span>
          <span id={`task-state-${role.id}-${family.id}`} className="task-family-action">{unfinished ? t('Resume','繼續') : reviewed ? t('Review','查看評估') : t('Start','開始')}<ArrowRight size={18}/></span>
        </button>
      })}</div>
    </section>
    <details className="playground-company-expand"><summary>{t('Skills you will practise','你會體驗的技能')}<ChevronRight size={17}/></summary><div className="skill-tags">{role.skills.map(skill => <span key={skill.en}>{skill[locale]}</span>)}</div></details>
    <details className="playground-company-expand"><summary>{t('How it works', '體驗流程')}<ChevronRight size={17}/></summary><ol className="playground-workflow"><li><span>1</span><strong>{t('Read the brief','閱讀任務')}</strong><p>{t('Read the brief and download your workpack.','閱讀簡介並下載任務檔案。')}</p></li><li><span>2</span><strong>{t('Work in your tools','使用自己的工具')}</strong><p>{t('Complete the task in your own apps.','在你熟悉的應用程式完成任務。')}</p></li><li><span>3</span><strong>{t('Upload and review','上載及評估')}</strong><p>{t('Upload the finished file and get feedback.','上載完成檔案並取得回饋。')}</p></li></ol></details>
    {company && <details className="playground-company-expand"><summary>{t('The company context','公司背景')}<ChevronRight size={17}/></summary><p>{company.about[locale]}</p><button className="text-button" onClick={() => onCompany(company)}>{t('Read company profile and sources','查看公司簡介及來源')}<ChevronRight size={15}/></button></details>}
    <p className="fine-print">{t('Independent practice with fictional staff, policies and records. No company endorsement or recruitment assessment.','使用虛構職員、政策及記錄的獨立練習，並非公司認可或招聘評估。')}</p>
  </div>
}

export function CompanyDetails({ company: snapshot, locale, onBack }: { company: Company; locale: Locale; onBack?: () => void }) {
  const t = (en: string, chinese: string) => locale === 'zh' ? chinese : en
  const company = getCompany(snapshot.id) || snapshot
  return <div className="company-details"><div className="overview-company"><CompanyMark company={company} /><div><span className="context-label">{company.sector[locale]}</span><strong>{company.name[locale]}</strong></div><span className="status-pill">{t('Independent demo', '獨立示範')}</span></div><section><h3>{t('Public company profile', '公開公司簡介')}</h3><p>{company.about[locale]}</p></section><section><h3>{t('Publicly stated focus', '公開重點')}</h3><ul>{company.publicValues.map(value => <li key={value.en}>{value[locale]}</li>)}</ul></section><section className="practice-culture"><h3>{t('Our simulated working approach', '模擬工作方式')}</h3><p>{company.simulationStyle[locale]}</p></section><section><h3>{t('Source information', '資料來源')}</h3><div className="company-source-links">{company.sourceUrls.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ChevronRight size={15} /></a>)}</div><p className="fine-print">{t('Public facts checked ', '公開資料核實日期：')}{company.factsVerifiedAt}</p></section><p className="relationship-note"><ShieldCheck size={18} />{t('Lumio is independent. This simulation is not endorsed by the company and does not represent its internal policies or current vacancies.', 'Lumio 為獨立平台。此模擬並未獲公司認可，亦不代表其內部政策或現有職缺。')}</p>{onBack && <button className="secondary-button" onClick={onBack}>{t('Back to position overview', '返回職位概覽')}</button>}</div>
}
