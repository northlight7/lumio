'use client'
import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { Locale, Portfolio } from '@/lib/types'
import { companies } from '@/lib/companies'
import './employer-dashboard.css'
type Consent = { id: string; companyId: string; shareId: string; expiresAt: string }
export function EmployerConsent({ locale, shares }: { locale: Locale; shares: Portfolio['shares'] }) {
  const zh = locale === 'zh'
  const [consents, setConsents] = useState<Consent[]>([])
  const [companyId, setCompanyId] = useState(companies.find(c => c.relationship === 'independent-demo')?.id || '')
  const [shareId, setShareId] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeShares = shares.filter(s => Date.parse(s.expiresAt) > Date.now())
  const chosenShare = activeShares.find(s => s.id === shareId)?.id || activeShares[0]?.id || ''
  useEffect(() => { let active = true; fetch('/api/employer/consent', { cache: 'no-store' }).then(async r => { const result = await r.json(); if (!r.ok) throw new Error(result.error); if (active) setConsents(result.consents) }).catch(e => { if (active) setError(e.message) }); return () => { active = false } }, [shares])
  async function change(data: unknown) { setBusy(true); setError(''); setNotice(''); try { const response = await fetch('/api/employer/consent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setConsents(result.consents); setAgreed(false); setNotice(zh ? '公司存取權已更新。' : 'Company access updated.') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <section className="employer-consent"><h3><ShieldCheck size={23} />{zh ? '分享給指定公司' : 'Share with a chosen company'}</h3><p>{zh ? '自願分享任務評分及回饋。私人草稿、聊天、身份及原始檔案不會分享。' : 'Share task scores and feedback voluntarily. Private drafts, conversations, identity and original files stay private.'}</p>
    <details><summary>{zh ? '誰可以查看及如何撤銷' : 'Who can view this and how to revoke'}</summary><p>{zh ? '只限已設立帳戶的所選公司人員存取。所列公司為獨立模擬背景，不表示有合作。撤銷或到期後，公司再次載入時便無法取得證據，無法收回對方已保存的副本。' : 'Only provisioned accounts for your chosen company can access this evidence. Listed companies are independent simulation contexts, not partners. Revoked or expired evidence disappears on their next load. Copies already saved by a recipient cannot be recalled.'}</p></details>
    {!activeShares.length ? <p>{zh ? '先選擇已提交作品並建立分享連結。' : 'Select submitted work and create an evidence share first.'}</p> : <form className="employer-consent-form" onSubmit={e => { e.preventDefault(); if (agreed) void change({ action: 'grant', shareId: chosenShare, companyId }) }}><label>{zh ? '公司' : 'Company'}<select value={companyId} onChange={e => { setCompanyId(e.target.value); setAgreed(false) }} disabled={busy}>{companies.filter(c => c.relationship === 'independent-demo').map(c => <option key={c.id} value={c.id}>{c.name[locale]}</option>)}</select></label><label>{zh ? '作品分享連結' : 'Evidence share'}<select value={chosenShare} onChange={e => { setShareId(e.target.value); setAgreed(false) }} disabled={busy}>{activeShares.map(s => <option key={s.id} value={s.id}>{new Date(s.createdAt).toLocaleDateString(zh ? 'zh-HK' : 'en-GB')} · {s.id.slice(0, 6)}</option>)}</select></label><button className="primary-button" disabled={busy || !agreed || !chosenShare}>{busy ? zh ? '更新中…' : 'Updating…' : zh ? '授權此公司' : 'Grant company access'}</button><label className="employer-consent-agreement"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={busy} required /><span>{zh ? '我同意讓所選公司帳戶查看這些任務評分及回饋。我可隨時撤銷。' : 'I consent to this company’s account viewing these task scores and feedback. I can revoke access at any time.'}</span></label></form>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <ul className="employer-consent-list">{consents.filter(c => activeShares.some(s => s.id === c.shareId)).map(c => <li key={c.id}><span>{companies.find(company => company.id === c.companyId)?.name[locale] || c.companyId}<small>{zh ? '分享' : 'Share'} {c.shareId.slice(0, 6)} · {zh ? '到期' : 'Expires'} {new Date(c.expiresAt).toLocaleDateString(zh ? 'zh-HK' : 'en-GB')}</small></span><button className="secondary-button" disabled={busy} onClick={() => void change({ action: 'revoke', id: c.id })}>{zh ? '撤銷公司存取' : 'Revoke company access'}</button></li>)}</ul>
  </section>
}
