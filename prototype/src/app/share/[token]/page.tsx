'use client'

import { useEffect, useState, use } from 'react'
import { ArrowUpRight, FlaskConical, Loader2, ShieldCheck } from 'lucide-react'
import type { Attempt, Locale } from '@/lib/types'
import { EvidenceCard } from '@/components/evidence'
import { BrandLogo } from '@/components/brand-logo'

export default function SharedPortfolio({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [locale, setLocale] = useState<Locale>('en')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [demo, setDemo] = useState(false)
  const zh = locale === 'zh'
  useEffect(() => {
    document.documentElement.lang = zh ? 'zh-Hant' : 'en'
  }, [zh])
  useEffect(() => {
    fetch(`/api/share/${encodeURIComponent(token)}`).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'This sharing link is unavailable.')
      setAttempts(result.attempts)
      setDemo(result.demo === true)
    }).catch(e => setError((e as Error).message)).finally(() => setLoading(false))
  }, [token])
  return <main className="share-shell"><header className="share-header"><a className="brand" href="/"><BrandLogo /></a><div className="topbar-actions"><span className="status-pill"><ShieldCheck size={13} />{zh ? '唯讀作品集' : 'Read-only portfolio'}</span><div className="language-toggle"><button className={!zh ? 'active' : ''} aria-pressed={!zh} onClick={() => setLocale('en')}>EN</button><button className={zh ? 'active' : ''} aria-pressed={zh} onClick={() => setLocale('zh')}>繁</button></div></div></header>{demo && <div className="demo-banner"><FlaskConical size={15} /><span>{zh ? '簡報示範 · 練習工作範例' : 'Presentation demo · sample practice work'}</span><span>{zh ? 'AI 產生及評閱的範例，並非學員自行取得的結果' : 'AI-created and reviewed samples, not learner-earned results'}</span></div>}<p className="eyebrow">{zh ? '工作成果及探索證據' : 'WORK & EXPLORATION EVIDENCE'}</p><h1>{zh ? '親身體驗，留下成果。' : 'Learning by doing. Evidence to show.'}</h1><p className="share-description">{zh ? '由學員分享的獨立公司工作模擬，並非僱主認可或現有職缺。分享版本包含其提交檔案。AI 評閱結果不代表專業資格，協助紀錄只涵蓋 Lumio 內的對話。' : 'Independent company simulations shared by a learner. These are not employer-endorsed assignments or current vacancies. Shared versions include their submitted files. AI feedback is not a professional qualification. Assistance records cover only conversations within Lumio.'}</p>{loading ? <div className="empty-state"><Loader2 className="spin" size={26} /><p>{zh ? '正在載入分享內容…' : 'Loading shared work…'}</p></div> : error ? <div className="banner error-banner" role="alert"><span>{error}</span></div> : <div className="evidence-list">{attempts.map(attempt => <EvidenceCard key={attempt.id} attempt={attempt} locale={locale} />)}</div>}<div className="discovery-footer"><ShieldCheck size={18} /><span>{zh ? '此連結有有效期限，分享者可隨時撤銷。' : 'This link expires and can be revoked by its owner.'}</span><a className="text-button" href="/">{zh ? '探索 Lumio' : 'Explore Lumio'}<ArrowUpRight size={14} /></a></div></main>
}
