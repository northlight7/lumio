'use client'

import { ConversationText } from '@/components/conversation-text'
import { BrandLogo } from '@/components/brand-logo'

import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, BookOpen, BriefcaseBusiness, Check, ChevronRight, CircleCheck, Clock3, Compass, FileText, FlaskConical, FolderOpen, HeartHandshake, Leaf, Link2, Loader2, LockKeyhole, LogOut, MessageCircle, Palette, Search, Send, ShieldCheck, Sparkles, Terminal, Trash2, UserRound, X } from 'lucide-react'
import { roles, getRole, getTask } from '@/lib/content'
import { getTaskFamilies, getTaskFamily } from '@/lib/task-families'
import type { Answers, Attempt, ChatMessage, Evaluation, Locale, Portfolio, Profile, Role, Stage, Task, Variation, Company, Attachment } from '@/lib/types'
import { CheckReport, EvidenceCard } from '@/components/evidence'
import { Discovery, RoleOverview, CompanyDetails, CompanyMark } from '@/components/discovery'
import { getCompany } from '@/lib/companies'
import { RoleArt } from '@/components/role-art'
import { WorkFiles } from '@/components/work-files'
import { WorkMaterials, DeadlineCard } from '@/components/workspace-tools'
import { EmployerConsent } from '@/components/employer-consent'
import '@/components/learner-navigation.css'

const catalogKey = (roleId: string, stage: Stage, taskId?: string) => `${roleId}:${stage}:${taskId || '_legacy'}`
type View = 'discover' | 'workspace' | 'portfolio'
type Modal = 'account' | 'consent' | 'erase' | 'reset' | 'role' | 'company' | null
const stages: Stage[] = ['taster', 'diagnose', 'fix', 'adapt', 'assessment']
const stageNames = { taster: { en: 'Career taster', zh: '職業體驗' }, diagnose: { en: '01 · Diagnose', zh: '01 · 診斷' }, fix: { en: '02 · Improve', zh: '02 · 改善' }, adapt: { en: '03 · Adapt', zh: '03 · 應變' }, assessment: { en: '04 · Assessment', zh: '04 · 評估' } }

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response:Response
  try { response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }) }
  catch { throw Object.assign(new Error('Connection interrupted. Keep this page open and try again.'),{code:'connection_interrupted'}) }
  let value
  try { value = await response.json() }
  catch { throw Object.assign(new Error('The server returned an incomplete response. Keep this page open and try again.'),{code:'response_incomplete',status:response.status}) }
  if (!response.ok) throw Object.assign(new Error(value.error || `Request failed (${response.status})`), {code:value.code, status:response.status})
  return value as T
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>('en')
  const [view, setView] = useState<View>('discover')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [work, setWork] = useState('')
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [reportKind, setReportKind] = useState<'practice' | 'submission'>('practice')
  const [busy, setBusy] = useState('initial')
  const [error, setError] = useState('')
  const [initialConnectionFailed, setInitialConnectionFailed] = useState(false)
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<Modal>(null)
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register')
  const [consent, setConsent] = useState(false)
  const [selectedRole, setSelectedRole] = useState<Role | null>(null)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [persona, setPersona] = useState<'coach' | 'manager'>('coach')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [shareUrl, setShareUrl] = useState('')
  const [variations, setVariations] = useState<Record<string, Variation[]>>({})
  const [variationPicker, setVariationPicker] = useState(false)
  const [workspaceOptions, setWorkspaceOptions] = useState(false)
  const [loadingVariations, setLoadingVariations] = useState(false)
  const [creatingScenario, setCreatingScenario] = useState(false)
  const [portfolioRole, setPortfolioRole] = useState('all')
  const [portfolioTask, setPortfolioTask] = useState('all')
  const [portfolioStatus, setPortfolioStatus] = useState('all')
  const consentAction = useRef<(() => void) | null>(null)
  const submitRequest = useRef<{ fingerprint: string; id: string } | null>(null)
  const chatRequest = useRef<{ fingerprint: string; id: string } | null>(null)
  const feedbackRef = useRef<HTMLElement>(null)
  const teamRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const workRef = useRef<HTMLElement>(null)
  const materialsRef = useRef<HTMLElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const workspaceNavigationRef = useRef<HTMLDivElement>(null)
  const initialView = useRef(true)
  const initialProfileLoad = useRef(false)
  const modalOpener = useRef<HTMLElement | null>(null)
  const zh = locale === 'zh'
  const t = (en: string, chinese: string) => zh ? chinese : en
  const role = attempt ? getRole(attempt.roleId) : null
  const task = attempt ? attempt.task || getTask(attempt.roleId, attempt.stage) : null
  const generated = !!task?.generation
  const advancedAssignment = !!task && !task.taskId && task.stage !== 'taster'
  const historicalAssignment = advancedAssignment && !task?.rubricVersion
  const archived = !!attempt && (!generated || !!attempt.retired)
  const company = !archived && task?.company ? task.company || getCompany(role?.companyId || '') : undefined
  const family = role && task?.taskId ? getTaskFamily(role.id, task.taskId) : undefined
  const families = role ? getTaskFamilies(role.id) : []
  const availableVariations = attempt ? (variations[catalogKey(attempt.roleId, attempt.stage, task?.taskId)] || []).filter(item => item.taskId === task?.taskId) : []
  const needsFamily = attempt?.stage === 'taster' && families.length > 0 && !task?.taskId
  const assessmentFinal = attempt?.stage === 'assessment' && attempt.submissions.length > 0

  const portfolioAttempts = [...(portfolio?.attempts || [])].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  const portfolioRoles = roles.filter(item => portfolioAttempts.some(value => value.roleId === item.id))
  const portfolioTasks = [...new Map(portfolioAttempts.filter(item => portfolioRole === 'all' || item.roleId === portfolioRole).map(item => { const family = item.task?.taskId ? getTaskFamily(item.roleId,item.task.taskId) : undefined; return [item.task?.taskId || `${item.roleId}:${item.stage}`, {id:item.task?.taskId || `${item.roleId}:${item.stage}`, title:family?.title || item.task?.title || stageNames[item.stage]}] })).values()]
  const visiblePortfolio = portfolioAttempts.filter(item => (portfolioRole === 'all' || item.roleId === portfolioRole) && (portfolioTask === 'all' || (item.task?.taskId || `${item.roleId}:${item.stage}`) === portfolioTask) && (portfolioStatus === 'all' || (portfolioStatus === 'draft' ? item.status === 'draft' : portfolioStatus === 'passed' ? item.submissions.at(-1)?.evaluation.passed : item.status !== 'draft' && !!item.submissions.length && !item.submissions.at(-1)?.evaluation.passed)))
  function jumpTo(element: HTMLElement | null) {
    const surface = contentRef.current
    if (!element || !surface) return
    const inset = Number.parseFloat(getComputedStyle(surface).scrollPaddingTop) || 0
    const anchor = element === teamRef.current && window.matchMedia('(min-width:1301px)').matches ? materialsRef.current || element : element
    element.focus({ preventScroll: true })
    requestAnimationFrame(() => surface.scrollTo({ top: surface.scrollTop + anchor.getBoundingClientRect().top - surface.getBoundingClientRect().top - inset, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }))
  }

  useEffect(() => {
    if (initialProfileLoad.current) return
    initialProfileLoad.current = true
    const preference = localStorage.getItem('lumio-locale')
    if (preference === 'zh') setLocale('zh')
    const sessionOptions = {locale: preference === 'zh' ? 'zh' : 'en', freshGuest:true}
    api<Profile>('/me').then(current => current.email ? current : api<Profile>('/session','POST',sessionOptions))
      .catch(e => { if (e.code === 'session_required') return api<Profile>('/session','POST',sessionOptions); throw e })
      .then(setProfile).catch(e => {setError(e.message);setInitialConnectionFailed(true)}).finally(() => setBusy(''))
  }, [])

  useEffect(() => {
    if (!selectedRole) return
    let active = true
    Promise.all(getTaskFamilies(selectedRole.id).map(async family => {
      const result = await api<{ variations: Variation[] }>(`/variations?roleId=${encodeURIComponent(selectedRole.id)}&stage=taster&taskId=${encodeURIComponent(family.id)}`)
      return [catalogKey(selectedRole.id, 'taster', family.id), result.variations] as const
    })).then(entries => { if (active) setVariations(previous => ({ ...previous, ...Object.fromEntries(entries) })) }).catch(() => {})
    return () => { active = false }
  }, [selectedRole])

  useEffect(() => {
    if (!attempt) return
    let active = true
    setLoadingVariations(true)
    api<{ variations: Variation[] }>(`/variations?roleId=${encodeURIComponent(attempt.roleId)}&stage=${attempt.stage}${task?.taskId ? `&taskId=${encodeURIComponent(task.taskId)}` : ''}`)
      .then(result => { if (active) setVariations(previous => ({ ...previous, [catalogKey(attempt.roleId, attempt.stage, task?.taskId)]: result.variations })) })
      .catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoadingVariations(false) })
    return () => { active = false }
  }, [attempt?.id, attempt?.roleId, attempt?.stage, task?.taskId])

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    if (initialView.current) initialView.current = false
    else contentRef.current?.focus({ preventScroll: true })
  }, [view, attempt?.id])

  useEffect(() => {
    const surface = contentRef.current
    const navigation = workspaceNavigationRef.current
    if (view !== 'workspace' || !surface || !navigation) return
    const measure = () => {
      surface.style.setProperty('--workspace-toolbar-height', `${Math.ceil(navigation.getBoundingClientRect().height)}px`)
      surface.style.setProperty('--workspace-content-padding', getComputedStyle(surface).paddingTop)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(navigation)
    return () => {
      observer.disconnect()
      surface.style.removeProperty('--workspace-toolbar-height')
      surface.style.removeProperty('--workspace-content-padding')
    }
  }, [view, attempt?.id])

  useEffect(() => { document.documentElement.lang = zh ? 'zh-Hant' : 'en'; localStorage.setItem('lumio-locale', locale) }, [locale, zh])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function takeAttempt(next: Attempt) {
    setAttempt(next); setAnswers(next.answers); setWork(next.work); setDirty(false); setSavedAt(next.updatedAt)
    setDocumentId(null); setMessage(''); setVariationPicker(false); chatRequest.current = null; submitRequest.current = null; setEvaluation(next.submissions.at(-1)?.evaluation || null); setReportKind('submission')
    setProfile(p => p ? { ...p, attempts: [...p.attempts.filter(a => a.id !== next.id), next] } : p)
  }

  function markDirty() { setDirty(true); setEvaluation(null) }

  function requestId(reference: typeof submitRequest, fingerprint: string) {
    if (reference.current?.fingerprint !== fingerprint) reference.current = { fingerprint, id: crypto.randomUUID() }
    return reference.current!.id
  }

  async function openDemo() {
    setBusy('demo'); setError(''); setNotice('')
    try {
      await ensureProfile()
      const next = await api<Profile>('/demo', 'POST', {})
      setProfile(next)
      const sample = next.attempts.find(a => a.roleId === 'ai-engineer' && a.stage === 'fix' && a.task?.generation) || next.attempts.find(a => a.task?.generation) || next.attempts.find(a => a.roleId === 'ai-engineer' && a.stage === 'fix')
      if (!sample) throw new Error(t('The demo workspace is unavailable. Please retry.', '示範工作區暫時無法開啟，請重試。'))
      takeAttempt(sample); setView('workspace')
      setNotice(t('Presentation demo opened. These are AI-generated sample submissions, not learner-earned results.', '簡報示範已開啟。這些是 AI 生成的提交範例，不是學員自行取得的結果。'))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function ensureProfile() {
    if (profile) return profile
    const value = await api<Profile>('/session', 'POST', { locale })
    setProfile(value)
    return value
  }

  async function start(roleId: string, stage: Stage = 'taster', options?: { variantId?: string; newVariation?: boolean; taskId?: string }) {
    if (busy) return
    const taskId = options?.taskId || (!options?.variantId && stage === 'taster' ? getTaskFamilies(roleId)[0]?.id : undefined)
    const resuming = !options?.variantId && !options?.newVariation && profile?.attempts.some(item => !item.retired && item.roleId === roleId && item.stage === stage && item.task?.taskId === taskId)
    setCreatingScenario(!!options?.newVariation || !resuming && !options?.variantId && !(variations[catalogKey(roleId, stage, taskId)]?.length))
    setError(''); setNotice(''); setBusy(`start:${roleId}`)
    try {
      if (dirty && attempt) await saveDraft()
      await ensureProfile()
      const next = await api<Attempt>('/attempts', 'POST', { roleId, stage, locale, ...options, ...(taskId ? { taskId } : {}) })
      takeAttempt(next); setView('workspace')
      contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    } catch (e) {
      if ((e as Error & { code?: string }).code === 'variation_retired' && stage === 'taster' && taskId && options?.variantId) {
        try {
          setProfile(await api<Profile>('/me'))
          const next = await api<Attempt>('/attempts', 'POST', { roleId, stage, locale, taskId })
          takeAttempt(next); setView('workspace')
          setNotice(t('A current variation is ready. Your earlier work is preserved in your portfolio.', '已開啟現行變化，較早的作品仍保留於作品集。'))
          contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
        } catch (retryError) { setError((retryError as Error).message) }
      } else setError((e as Error).message)
    } finally { setBusy('') }
  }

  async function anotherVariation() {
    if (!attempt) return
    if (needsFamily) { document.getElementById('workspace-task-type')?.focus(); return }
    const used = new Set(profile?.attempts.map(item => item.variantId).filter(Boolean))
    const next = availableVariations.find(variation => !used.has(variation.id))
    await start(attempt.roleId, attempt.stage, next ? { variantId: next.id, taskId: next.taskId } : { newVariation: true, taskId: task?.taskId })
  }

  async function saveDraft() {
    if (!attempt) return
    const next = await api<Attempt>(`/attempts/${attempt.id}`, 'PATCH', { answers, work, locale, revision: attempt.revision })
    setAttempt(next); setDirty(false); setSavedAt(next.updatedAt)
    setProfile(p => p ? { ...p, attempts: [...p.attempts.filter(a => a.id !== next.id), next] } : p)
    return next
  }

  function applyFileAttempt(next: Attempt) {
    setAttempt(next); setDirty(false); setSavedAt(next.updatedAt); setEvaluation(null)
    submitRequest.current = null
    setProfile(previous => previous ? { ...previous, attempts: [...previous.attempts.filter(item => item.id !== next.id), next] } : previous)
  }

  async function fileResponse(response: Response): Promise<Attempt> {
    const value = await response.json()
    if (!response.ok) {
      const messages: Record<string, string> = { file_too_large: '檔案最多為 5 MB，且不可為空白。', unsupported_format: '請使用 XLSX、CSV、PPTX、DOCX 或 TXT 檔案。', attachment_limit: '每項任務最多保留三個檔案，請先移除一個檔案。', file_reader_busy: '檔案讀取服務忙碌，請稍後重試。', invalid_file: '無法讀取此檔案，請以支援的格式重新儲存。', file_invalid: '無法讀取此檔案，請以支援的格式重新儲存。', unsafe_file: '請使用不含巨集、嵌入物件或加密內容的普通 Office 文件。', extraction_too_large: '檔案過於複雜或文字過多，請上載較短的文件。', file_parse_timeout: '讀取檔案逾時，請使用較小的檔案。', file_reader_unavailable: '檔案讀取服務暫時無法使用，請稍後再試。', revision_conflict: '草稿已更新，請重新載入後再修改檔案。', attachment_storage_limit: '已達到 100 MB 檔案儲存上限，請移除未使用的草稿檔案。' }
      throw new Error(zh && messages[value.code] ? messages[value.code] : value.error || t('Your file could not be saved. Please retry.', '無法儲存檔案，請重試。'))
    }
    return value as Attempt
  }

  async function uploadFiles(files: File[]) {
    if (!attempt || busy || archived || assessmentFinal) return
    setBusy('upload'); setError(''); setNotice(''); setEvaluation(null)
    try {
      let current = dirty ? await saveDraft() || attempt : attempt
      for (const file of files) {
        const body = new FormData(); body.append('file', file); body.append('revision', String(current.revision)); body.append('privacyConsent', 'true')
        current = await fileResponse(await fetch(`/api/attempts/${attempt.id}/attachments`, { method: 'POST', credentials: 'same-origin', body }))
        applyFileAttempt(current)
      }
    } finally { setBusy('') }
  }

  async function removeFile(file: Attachment) {
    if (!attempt || busy || archived || assessmentFinal) return
    setBusy('files'); setError(''); setNotice(''); setEvaluation(null)
    try {
      const current = dirty ? await saveDraft() || attempt : attempt
      const response = await fetch(`/api/attempts/${attempt.id}/attachments/${file.id}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: current.revision }) })
      applyFileAttempt(await fileResponse(response))
    } finally { setBusy('') }
  }

  async function action(kind: 'save' | 'check' | 'submit', approved = false) {
    if (!attempt) return
    if (kind !== 'save' && archived) { setError(t('This variation was retired after review. Try a current variation for AI feedback.', '此變化已在檢視後停用。請嘗試現行變化以取得 AI 回饋。')); return }
    if (kind !== 'save' && generated) {
      const incomplete = task?.questions.some(question => answers[question.id] === undefined || answers[question.id] === '' || Array.isArray(answers[question.id]) && !(answers[question.id] as string[]).length)
      if (incomplete && !(attempt.attachments || []).length || work.trim().length + (attempt.attachments || []).reduce((sum, file) => sum + file.substantiveCharacters, 0) < 50) { setError(t('Upload a readable finished file, or complete the decisions and explain your approach. Include at least 50 substantive characters.', '請上載可讀取的完成檔案，或回答問題並解釋方法。合計至少 50 個有實質內容的字元。')); return }
      if (!consent && !approved) { consentAction.current = () => { void action(kind, true) }; setModal('consent'); return }
    }
    setError(''); setNotice(''); setBusy(kind)
    if (kind === 'check' || kind === 'submit') setEvaluation(null)
    try {
      const current = kind !== 'save' && dirty ? await saveDraft() || attempt : attempt
      if (kind === 'save') { await saveDraft(); setNotice(t('Your draft is saved.', '草稿已儲存。')) }
      if (kind === 'check') { setEvaluation(await api<Evaluation>(`/attempts/${current.id}/check`, 'POST', { answers, work, locale, revision: current.revision, consent: consent || approved })); setReportKind('practice') }
      if (kind === 'check') requestAnimationFrame(() => { jumpTo(feedbackRef.current) })
      if (kind === 'submit') {
        const next = await api<Attempt>(`/attempts/${current.id}/submit`, 'POST', { answers, work, locale, revision: current.revision, consent: consent || approved, requestId: requestId(submitRequest, JSON.stringify({ attemptId: current.id, answers, work, locale, files: (current.attachments || []).map(file => ({ id: file.id, hash: file.extractionHash })) })) })
        submitRequest.current = null
        takeAttempt(next); setEvaluation(next.submissions.at(-1)?.evaluation || null); setReportKind('submission')
        setNotice(t('Submission saved. Each version stays in your portfolio.', '提交已儲存。每個版本都會保留在作品集。'))
        requestAnimationFrame(() => { jumpTo(feedbackRef.current) })
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function navigate(next: View) {
    if (busy) return
    setError(''); setNotice('')
    try {
      if (dirty && attempt) { setBusy('save'); await saveDraft() }
      if (next === 'portfolio') {
        setBusy('portfolio'); contentRef.current?.scrollTo({ top: 0, behavior: 'instant' }); await ensureProfile(); setPortfolio(await api<Portfolio>('/portfolio'))
      }
      setView(next)
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function sendChat(event?: FormEvent, approved = false) {
    event?.preventDefault()
    if (!attempt || archived || !message.trim() || busy) return
    if (!consent && !approved) { consentAction.current = () => { void sendChat(undefined, true) }; setModal('consent'); return }
    setError(''); setBusy('chat')
    const text = message.trim()
    try {
      if (dirty) await saveDraft()
      const result = await api<{ message: ChatMessage }>(`/attempts/${attempt.id}/chat`, 'POST', { message: text, persona, consent: true, requestId: requestId(chatRequest, JSON.stringify({ attemptId: attempt.id, message: text, persona })) })
      const next = await api<Attempt>(`/attempts/${attempt.id}`)
      chatRequest.current = null
      setAttempt(next); setMessage('')
      setProfile(p => p ? { ...p, attempts: [...p.attempts.filter(a => a.id !== next.id), next] } : p)
      if (result.message.source === 'scripted') setNotice(t('Scripted colleague reply. Live conversation is currently unavailable.', '這是預先編寫的同事回覆。即時對話暫時未能使用。'))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy('auth'); setError('')
    const data = new FormData(event.currentTarget)
    try {
      if (dirty) await saveDraft()
      setProfile(await api<Profile>('/auth', 'POST', { action: authMode, email: data.get('email'), password: data.get('password'), ...(authMode === 'register' ? { name: data.get('name') } : {}) }))
      setModal(null); setPortfolio(null); setAttempt(null); setView('discover'); setDirty(false); setConsent(false); setSelected([]); setShareUrl('')
      setNotice(t('You are signed in.', '已登入。'))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function logout() {
    setBusy('auth'); setError('')
    try {
      if (dirty) await saveDraft()
      await api('/auth', 'POST', { action: 'logout' })
      setProfile(null); setAttempt(null); setPortfolio(null); setDirty(false); setView('discover'); setModal(null); setConsent(false); setSelected([]); setShareUrl('')
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function share() {
    if (selected.length > 20) { setError(t('Choose up to 20 submitted tasks for one sharing link.', '每個分享連結最多可選取 20 個已提交任務。')); return }
    setBusy('share'); setError('')
    try {
      const result = await api<{ id: string; url: string; expiresAt: string }>('/share', 'POST', { attemptIds: selected })
      setShareUrl(new URL(result.url, window.location.origin).href); setPortfolio(await api<Portfolio>('/portfolio'))
    } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function revoke(id: string) {
    setBusy(`revoke:${id}`); setError('')
    try { await api('/share', 'DELETE', { id }); setPortfolio(await api<Portfolio>('/portfolio')); setShareUrl(''); setNotice(t('Sharing link revoked.', '分享連結已撤銷。')) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function erase() {
    setBusy('erase'); setError('')
    try { await api('/me', 'DELETE', {}); setProfile(null); setAttempt(null); setPortfolio(null); setModal(null); setDirty(false); setSelected([]); setShareUrl(''); setConsent(false); setView('discover'); setNotice(t('Your Lumio data and active sharing links have been deleted.', '你的 Lumio 資料及有效分享連結已刪除。')) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  async function exportData() {
    setBusy('export'); setError('')
    try { const data = await api('/export'); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'lumio-portfolio.json'; a.click(); URL.revokeObjectURL(url) } catch (e) { setError((e as Error).message) } finally { setBusy('') }
  }

  return <div className="app-shell" onClickCapture={event => { const trigger = (event.target as Element).closest<HTMLElement>('button,a'); if (trigger && !trigger.closest('dialog')) modalOpener.current = trigger }}>
    <a className="skip-link" href="#main">{t('Skip to content', '跳至內容')}</a>
    <aside className="sidebar">
      <button className="brand" disabled={!!busy} aria-label={t('Lumio home', 'Lumio 首頁')} onClick={() => navigate('discover')}><BrandLogo /></button>
      <div className="sidebar-caption">{t('Your practice', '你的體驗')}</div>
      <nav aria-label={t('Main navigation', '主要導覽')}>
        <NavButton active={view === 'discover'} onClick={() => navigate('discover')} icon={<Compass size={20} />} label={t('Discover careers', '探索職業')} disabled={!!busy} />
        <NavButton active={view === 'workspace'} onClick={() => { if (!attempt && profile?.attempts.length) takeAttempt([...profile.attempts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]); navigate('workspace') }} icon={<BriefcaseBusiness size={20} />} label={t('My workspace', '我的工作區')} disabled={!!busy} />
        <NavButton active={view === 'portfolio'} onClick={() => navigate('portfolio')} icon={<FolderOpen size={20} />} label={t('My portfolio', '我的作品集')} disabled={!!busy} />
        <a href="/employers" aria-label={t('Employers', '僱主')} className="nav-button employer-entry"><BriefcaseBusiness size={20}/><span className="nav-full-label">{t('Employers', '僱主')}</span><span className="nav-short-label">{t('Employers', '僱主')}</span></a>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="tiny-orbit"><Sparkles size={18} /></span><strong>{t('Build a work sample.', '建立工作作品。')}</strong><p>{t('Explore a position, practise a decision and keep the evidence.', '探索職位，體驗決策，保留證據。')}</p></div><span className="sidebar-footer">{t('Independent career practice', '獨立職業體驗')}</span></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><span className="breadcrumb">{t('Your practice', '你的體驗')} <ChevronRight size={14} /> <strong>{view === 'discover' ? t('Discover', '探索') : view === 'workspace' ? t('Workspace', '工作區') : t('Portfolio', '作品集')}</strong></span><div className="topbar-actions"><div className="language-toggle" aria-label={t('Language', '語言')}><button aria-pressed={!zh} className={!zh ? 'active' : ''} onClick={() => setLocale('en')}>EN</button><button aria-pressed={zh} className={zh ? 'active' : ''} onClick={() => setLocale('zh')}>繁</button></div><button className="account-button" aria-label={profile?.email ? t(`Account: ${profile.name}`, `帳戶：${profile.name}`) : t('Guest account', '訪客帳戶')} disabled={!!busy} onClick={() => { setError(''); setModal('account') }}><span className="avatar"><UserRound size={17} /></span><span>{profile?.email ? profile.name : t('Guest learner', '訪客學員')}</span></button></div></header>
      <main id="main" ref={contentRef} tabIndex={-1} className={`main-content view-${view} ${view === 'workspace' ? 'workspace-main' : ''}`}>
        {profile?.demo && <div className="demo-banner"><FlaskConical size={15} /><span>{t('Presentation demo · sample practice work', '簡報示範 · 練習工作範例')}</span><span>{t('AI-generated samples, not learner-earned results', 'AI 生成範例，並非學員自行取得的結果')}</span></div>}
        {busy === 'portfolio' && <div className="ai-progress" role="status"><Loader2 size={17} className="spin" /><span>{t('Loading your portfolio', '正在載入你的作品集')}</span></div>}
        {error && <div className="banner error-banner" role="alert"><span>{error}</span><button aria-label={t('Dismiss error', '關閉錯誤')} onClick={() => setError('')}><X size={17} /></button></div>}
        {initialConnectionFailed && !profile && <div className="initial-connection-recovery" role="status"><span>{t('Your workspace did not connect. Reload to try again.','未能連接工作區，重新載入以重試。')}</span><button className="secondary-button" onClick={() => window.location.reload()}>{t('Reload workspace','重新載入工作區')}<ArrowRight size={16}/></button></div>}
        {notice && <div className="banner notice-banner" role="status"><CircleCheck size={18} /><span>{notice}</span><button aria-label={t('Dismiss message', '關閉訊息')} onClick={() => setNotice('')}><X size={17} /></button></div>}
        {view === 'discover' && (busy.startsWith('start:') || busy === 'demo') && <div className="ai-progress" role="status"><Loader2 size={18} className="spin" /><div><strong>{busy === 'demo' ? t('Preparing your presentation workspace', '正在準備簡報工作區') : creatingScenario ? t('Creating a fresh AI assignment', '正在生成新的 AI 任務') : t('Opening your assignment', '正在開啟你的任務')}</strong><p>{creatingScenario ? t('Creating and reviewing a scenario can take a few minutes. Your saved work is safe. Keep this page open.', '生成及審核情境可能需要數分鐘。已儲存的工作會保留，請保持此頁面開啟。') : t('Loading your saved scenario and work.', '正在載入已儲存的情境及工作。')}</p></div></div>}
        {<div hidden={view !== 'discover'}><Discovery roles={roles} locale={locale} profile={profile} busy={busy} variations={variations} onDemo={openDemo} onAccount={() => {setError('');setAuthMode('login');setModal('account')}} onResume={next => { takeAttempt(next); setView('workspace') }} onOverview={next => { setSelectedRole(next); setSelectedCompany(null); setModal('role') }} onCompany={next => { setSelectedCompany(next); setSelectedRole(null); setModal('company') }} /></div>}

        {view === 'workspace' && (!attempt || !role || !task ? <EmptyWorkspace locale={locale} onDiscover={() => navigate('discover')} /> : <>
          <div className="workspace-heading"><div><button className="back-button" disabled={!!busy} onClick={() => navigate('discover')}><ArrowLeft size={14} />{t('All careers', '所有職業')}</button><div className="workspace-role-title"><RoleArt roleId={role.id} className="workspace-role-art" /><h1>{role.title[locale]}</h1></div><p>{role.collection === 'core' ? t('Core industry practice', '通用行業練習') : company ? company.name[locale] : t('Earlier practice workplace', '較早體驗工作場所')} <span>·</span> {task.title[locale]}</p></div><div className="workspace-head-meta"><span className="status-pill"><Clock3 size={13} /> {task.duration} {t('min', '分鐘')}</span><span className={`status-pill ${task.coaching === 'off' ? '' : 'positive-pill'}`}><ShieldCheck size={13} />{task.coaching === 'off' ? t('Unassisted assessment', '無協助評估') : t('Practice with support', '有協助練習')}</span></div></div>
          {archived && <div className="banner retirement-banner" role="status"><ShieldCheck size={17} /><p>{generated ? t('This variation was retired after review. Your saved evidence is preserved. Try a current variation.', '此變化已在檢視後停用，已儲存的工作證據會保留。請嘗試現行變化。') : t('This earlier task is archived. Your saved evidence is preserved. Try a current AI-created variation.', '此較早任務已封存，已儲存的工作證據會保留。請嘗試現行 AI 生成變化。')}</p></div>}
          {role.id === 'ai-engineer' && <div className="pathway"><div className="pathway-label"><span className="eyebrow">{t('Your learning path', '你的學習路徑')}</span><p>{t('Support fades as you grow.', '隨著進步，協助逐步減少。')}</p></div><div className="pathway-steps">{stages.filter(stage => role.tasks.some(k => k.stage === stage)).map((stage, index) => { const prerequisite: Partial<Record<Stage, Stage>> = { diagnose: 'taster', fix: 'diagnose', adapt: 'fix', assessment: 'adapt' }; const prev = prerequisite[stage]; const unlocked = !prev || profile?.attempts.some(a => a.roleId === role.id && a.stage === prev && a.submissions.some(s => s.evaluation.passed)); const passed = profile?.attempts.some(a => a.roleId === role.id && a.stage === stage && a.submissions.some(s => s.evaluation.passed)); return <button key={stage} disabled={!unlocked || !!busy} className={`${stage === attempt.stage ? 'active' : ''} ${passed ? 'complete' : ''}`} onClick={() => start(role.id, stage)} title={!unlocked ? t(`Complete ${stageNames[prev!].en} first`, `請先完成${stageNames[prev!].zh}`) : undefined}><span>{passed ? <Check size={13} /> : !unlocked ? <LockKeyhole size={12} /> : index + 1}</span>{stageNames[stage][locale]}</button> })}</div></div>}
          <button className="workspace-options-toggle" aria-expanded={workspaceOptions} aria-controls="workspace-options" onClick={() => setWorkspaceOptions(value => !value)}><span>{t('Task & variation options', '任務及變化設定')}</span><ChevronRight size={18}/></button><div id="workspace-options" className={`workspace-selector ${workspaceOptions ? 'options-open' : ''}`}>{attempt.stage === 'taster' && families.length > 0 && <section className="task-type-bar" aria-label={t('Choose your task', '選擇你的任務')}><label htmlFor="workspace-task-type">{t('Task type', '任務類型')}<select id="workspace-task-type" aria-label={t('Task type', '任務類型')} value={task.taskId || ''} disabled={!!busy} onChange={event => { if (event.target.value) void start(role.id, 'taster', { taskId: event.target.value }) }}>{!task.taskId && <option value="">{t('Earlier assignment', '較早任務')}</option>}{families.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}</select></label><button className="text-button choose-task-link" disabled={!!busy} onClick={() => { setSelectedRole(role); setSelectedCompany(null); setModal('role') }}>{t('Choose another task','選擇另一任務')}<ChevronRight size={15}/></button><p>{family ? family.description[locale] : t('Your earlier saved assignment is preserved. Choose a current task type for more practice.', '較早儲存的任務會保留。選擇現行任務類型繼續體驗。')}</p><span>{t('Switching tasks saves your current draft.', '切換任務時會儲存目前草稿。')}</span></section>}
          <section className="variation-bar" aria-label={advancedAssignment ? t('Practice assignments', '練習任務') : t('Task variations', '任務變化')}>
            <div><span className="variation-badge"><Sparkles size={14} />{generated ? advancedAssignment ? t(`Assignment ${task.generation!.variation}`, `任務 ${task.generation!.variation}`) : t(`Variation ${task.generation!.variation}`, `變化 ${task.generation!.variation}`) : t('Original task', '原始任務')}</span>{historicalAssignment && <p>{t('Each earlier assignment is reviewed against its own criteria.', '每項較早任務均按其各自標準評估。')}</p>}</div>
            <div className="variation-actions"><button className="secondary-button" disabled={!!busy || loadingVariations || needsFamily} onClick={() => setVariationPicker(value => !value)} aria-expanded={variationPicker}>{advancedAssignment ? t('Browse assignments', '瀏覽任務') : t('Browse variations', '瀏覽變化')}<ChevronRight size={14} /></button><button className="secondary-button" disabled={!!busy || loadingVariations} onClick={anotherVariation}>{busy.startsWith('start:') ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}{needsFamily ? t('Choose a task type', '選擇任務類型') : advancedAssignment ? t('Try another assignment', '嘗試另一項任務') : t('Try another variation', '嘗試另一種變化')}</button></div>
            {variationPicker && <div className="variation-picker">{availableVariations.length ? availableVariations.map(variation => { const existing = profile?.attempts.find(item => item.variantId === variation.id); const current = attempt.variantId === variation.id; return <button key={variation.id} disabled={!!busy || current} className={current ? 'selected' : ''} onClick={() => start(role.id, attempt.stage, { variantId: variation.id, taskId: variation.taskId })} data-variant-id={variation.id}><span>{advancedAssignment ? t(`Assignment ${variation.variation}`, `任務 ${variation.variation}`) : t(`Variation ${variation.variation}`, `變化 ${variation.variation}`)} · {variation.duration} {t('min', '分鐘')}</span><strong>{variation.title[locale]}</strong><small>{current ? t('Current', '目前任務') : existing ? existing.status === 'draft' || !existing.submissions.at(-1)?.evaluation.passed ? t('Resume saved work', '繼續已儲存工作') : t('Review saved work','查看已評估作品') : t('New challenge', '新挑戰')}</small></button> }) : <p>{advancedAssignment ? t('No other saved assignments yet. Try another assignment to continue.', '尚未有其他已儲存任務。嘗試另一項任務繼續體驗。') : t('No other saved scenarios yet. Try another variation to create a new challenge.', '尚未有其他已儲存情境。嘗試另一種變化，即可建立新挑戰。')}</p>}</div>}
          </section></div>
          {!!busy && (busy.startsWith('start:') || busy === 'demo' || generated && ['check', 'submit'].includes(busy)) && <div className="ai-progress" role="status"><Loader2 size={18} className="spin" /><div><strong>{busy.startsWith('start:') ? creatingScenario ? t('Creating a fresh AI assignment', '正在生成新的 AI 任務') : t('Opening your assignment', '正在開啟你的任務') : busy === 'demo' ? t('Preparing your presentation workspace', '正在準備簡報工作區') : t('Preparing your AI feedback', '正在準備 AI 回饋')}</strong><p>{busy.startsWith('start:') ? creatingScenario ? t('Creating and reviewing a scenario can take a few minutes. Your saved work is safe. Keep this page open.', '生成及審核情境可能需要數分鐘。已儲存的工作會保留，請保持此頁面開啟。') : t('Loading your saved scenario and work.', '正在載入已儲存的情境及工作。') : t('This can take 35–90 seconds. Keep this page open.', '可能需要 35–90 秒，請保持此頁面開啟。')}</p></div></div>}
          <div ref={workspaceNavigationRef} className="workspace-navigation">
            <nav className="workspace-process" aria-label={t('Your workflow', '工作流程')}>
              <button aria-label={t('Read & download','閱讀及下載')} onClick={() => jumpTo(materialsRef.current)}><b>1</b><span className="workflow-label-full">{t('Read & download','閱讀及下載')}</span><span className="workflow-label-short" aria-hidden="true">{t('Read','閱讀')}</span></button>
              <button aria-label={t('Work in your tools','使用自己的工具')} onClick={() => jumpTo(toolsRef.current)}><b>2</b><span className="workflow-label-full">{t('Work in your tools','使用自己的工具')}</span><span className="workflow-label-short" aria-hidden="true">{t('Work','工作')}</span></button>
              <button aria-label={t('Upload & review','上載及評估')} onClick={() => jumpTo(workRef.current)}><b>3</b><span className="workflow-label-full">{t('Upload & review','上載及評估')}</span><span className="workflow-label-short" aria-hidden="true">{t('Upload','上載')}</span></button>
              {evaluation && <button aria-label={t('See review','查看評估')} onClick={() => jumpTo(feedbackRef.current)}><CircleCheck size={17}/><span className="workflow-label-full">{t('See review','查看評估')}</span><span className="workflow-label-short" aria-hidden="true">{t('Review','評估')}</span></button>}
              <button aria-label={t('Ask your team','詢問團隊')} className="text-button" aria-controls="workspace-team" onClick={() => jumpTo(teamRef.current)}><MessageCircle size={17}/><span className="workflow-label-full">{t('Ask your team','詢問團隊')}</span><span className="workflow-label-short" aria-hidden="true">{t('Team','團隊')}</span></button>
            </nav><DeadlineCard attempt={attempt} locale={locale}/>
          </div>
          <div className="workspace-grid file-first-grid team-open">
            <section ref={materialsRef} tabIndex={-1} className="material-panel panel"><div className="panel-heading"><span className="panel-glyph glyph-cyan"><BookOpen size={20} /></span><h2>{t('Your assignment', '你的任務')}</h2></div>{company && <div className="workspace-company-context"><CompanyMark company={company} /><div><strong>{company.name[locale]}</strong><span>{t('Independent practice', '獨立模擬')}</span></div><button className="text-button" onClick={() => { setSelectedCompany(company); setSelectedRole(null); setModal('company') }}>{t('Company context', '公司背景')}<ChevronRight size={15} /></button></div>}<div ref={toolsRef} tabIndex={-1} className="workspace-tools-target"><WorkMaterials key={`${attempt.id}:${locale}`} attemptId={attempt.id} locale={locale}/></div><div className="document-tabs"><button className={documentId === null ? 'active' : ''} onClick={() => setDocumentId(null)}>{t('Brief', '任務簡介')}</button><button className={documentId !== null ? 'active' : ''} onClick={() => setDocumentId(task.documents[0]?.id ?? null)}>{t('Documents', '文件')} <span>{task.documents.length}</span></button></div>
              <button className="mobile-work-jump text-button" onClick={() => jumpTo(workRef.current)}>{t('Go to your handover', '前往提交作品')}<ArrowRight size={15} /></button>
              {documentId === null ? <div className="brief-body"><div className="manager-note"><span className="manager-avatar">{task.manager.slice(0, 1)}</span><div><strong>{task.manager}</strong><span>{task.managerRole[locale]}</span></div><span className="inbox-label">{t('Inbox', '收件箱')}</span></div><h3>{task.title[locale]}</h3><p className="brief-text">{task.brief[locale]}</p><div className="document-links"><span className="eyebrow">{t('Attached documents', '任務附件')}</span>{task.documents.map(doc => <button key={doc.id} onClick={() => setDocumentId(doc.id)}><FileText size={15} /><span>{doc.title[locale]}</span><ChevronRight size={15} /></button>)}</div></div> : <div className="document-body"><div className="document-picker"><label className="sr-only" htmlFor="source-document">{t('Choose source document', '選擇參考文件')}</label><select id="source-document" value={documentId} onChange={event => setDocumentId(event.target.value)}>{task.documents.map(doc => <option key={doc.id} value={doc.id}>{doc.title[locale]}</option>)}</select></div>{task.documents.filter(doc => doc.id === documentId).map(doc => <article key={doc.id}><span className="eyebrow">{t('Source document', '參考文件')} · {zh ? { policy: '政策', data: '資料', message: '訊息', brief: '簡介' }[doc.kind] : doc.kind}</span><h3>{doc.title[locale]}</h3><SourceDocument body={doc.body[locale]} locale={locale} /></article>)}</div>}
            </section>
            <section ref={workRef} tabIndex={-1} className="work-panel panel"><div className="panel-heading"><span className="panel-glyph glyph-violet"><Terminal size={20} /></span><h2>{t('Your handover', '提交你的作品')}</h2><span className={`save-status ${dirty ? 'unsaved' : ''}`}>{dirty ? t('Unsaved', '未儲存') : savedAt ? t('Draft saved', '草稿已儲存') : t('New draft', '新草稿')}</span></div><div className="work-body"><div className="work-entry">{attempt.stage === 'assessment' && <div className="assessment-warning"><LockKeyhole size={15} /><p>{assessmentFinal ? t('Assessment complete. This independent submission is final. View your result below or in your portfolio.', '評估已完成。此獨立提交為最終版本。請查看下方或作品集中的結果。') : t('One independent attempt. Review carefully before submitting. After submission, this assessment cannot be edited or retried.', '一次獨立評估。提交前請仔細檢查。提交後無法修改或重試。')}</p></div>}{!!task.criteria?.length && <details className="rubric-preview"><summary>{t('How your work is reviewed', '評分方法')}<span>100 {t('points', '分')}</span></summary>{task.criteria.map(criterion => <div key={criterion.id}><strong>{criterion.label[locale]}<span>{criterion.points} {t('points', '分')}</span></strong><p>{criterion.description[locale]}</p></div>)}</details>}<fieldset disabled={assessmentFinal || !!busy}><WorkFiles key={attempt.id} files={attempt.attachments || []} locale={locale} roleId={role.id} taskId={task.taskId} disabled={!!busy || assessmentFinal || archived} reading={busy === 'upload'} onUpload={uploadFiles} onRemove={removeFile} /><details className="optional-decisions"><summary>{t('Optional decision worksheet', '選填決策工作紙')}<span>{t('Use instead of a file', '可代替檔案')}</span></summary><p>{t('Your finished file can answer these prompts. You do not need to repeat those answers here.', '完成檔案可回答以下問題，不必在這裏重複填寫。')}</p><span className="eyebrow">{t('Make your decisions', '作出你的決策')}</span><div className="question-list">{task.questions.map((question, index) => <div className="question" key={question.id}><label htmlFor={`q-${question.id}`}><span className="question-number">{index + 1}</span>{question.label[locale]}</label>{question.type === 'select' ? <select id={`q-${question.id}`} value={String(answers[question.id] ?? '')} onChange={e => { setAnswers(p => ({ ...p, [question.id]: e.target.value })); markDirty() }}><option value="">{t('Select your decision', '選擇你的決策')}</option>{question.options?.map(option => <option key={option.value} value={option.value}>{option.label[locale]}</option>)}</select> : question.type === 'multi' ? <fieldset id={`q-${question.id}`} aria-label={question.label[locale]} className="multi-options">{question.options?.map(option => { const checked = Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.value); return <label key={option.value}><input type="checkbox" checked={checked} onChange={() => { setAnswers(p => ({ ...p, [question.id]: checked ? (Array.isArray(p[question.id]) ? p[question.id] as string[] : []).filter(v => v !== option.value) : [...(Array.isArray(p[question.id]) ? p[question.id] as string[] : []), option.value] })); markDirty() }} />{option.label[locale]}</label> })}</fieldset> : <div className="number-input"><input id={`q-${question.id}`} type="number" step="any" value={typeof answers[question.id] === 'number' ? answers[question.id] as number : ''} onChange={e => { setAnswers(p => { const next = { ...p }; if (e.target.value === '') delete next[question.id]; else next[question.id] = Number(e.target.value); return next }); markDirty() }} />{question.unit && <span>{question.unit}</span>}</div>}</div>)}</div></details><div className="written-work"><label htmlFor="work-response">{t('Handover note', '交接說明')}<span>{generated ? t('Optional with a readable file', '已有可讀取檔案時可選填') : t('Saved as work evidence', '保留為工作證據')}</span></label><textarea id="work-response" aria-label={t('Handover note', '交接說明')} aria-describedby="work-evidence-guide" rows={4} value={work} maxLength={12000} placeholder={task.starter[locale]} onChange={e => { setWork(e.target.value); markDirty() }} /><div id="work-evidence-guide" className="textarea-footnote">{generated ? t('Explain the evidence behind your decisions here or in a file. At least 50 substantive characters in total.', '在這裏或檔案中說明決策依據，合計至少 50 個有實質內容的字元。') : t('Your writing stays in the language you use.', '你的文字會保留原來使用的語言。')}<span>{work.length.toLocaleString()}/12,000</span></div></div></fieldset></div><div className="work-actions"><button className="secondary-button" disabled={!!busy || assessmentFinal} onClick={() => action('save')}>{busy === 'save' ? <Loader2 size={15} className="spin" /> : <FileText size={15} />}{t('Save', '儲存')}</button>{task.coaching !== 'off' && <button className="secondary-button" disabled={!!busy || archived} onClick={() => action('check')}>{busy === 'check' ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />}{generated ? t('Get AI feedback', '取得 AI 回饋') : t('Run checks', '執行檢查')}</button>}<button className="primary-button" disabled={!!busy || assessmentFinal || archived} onClick={() => action('submit')}>{busy === 'submit' ? <Loader2 size={15} className="spin" /> : null}{generated ? t('Submit for AI review', '提交 AI 評估') : t('Submit work', '提交工作')}<ArrowRight size={15} /></button></div><p className="fine-print">{attempt.stage === 'assessment' ? t('Your independent assessment creates one final version in your private portfolio.', '獨立評估會在私人作品集中建立一個最終版本。') : t('Submissions create permanent versions in your private portfolio. You can revise and submit again.', '提交會在私人作品集中建立固定版本。你可以修改並再次提交。')}</p></div></section>
            <aside ref={teamRef} tabIndex={-1} id="workspace-team" className="colleague-panel panel"><div className="panel-heading"><span className="panel-glyph glyph-coral"><MessageCircle size={20} /></span><h2>{t('Your team', '你的團隊')}</h2><span className="online-dot" /></div>{task.coaching === 'off' ? <div className="assessment-note"><span className="assessment-lock"><LockKeyhole size={24} /></span><h3>{t('Your turn to take the lead.', '輪到你主導。')}</h3><p>{t('Coaching, colleague chat and practice checks are off for this assessment. Apply what you have learned and submit when ready.', '評估期間不提供教練、同事對話或練習檢查。運用所學，準備好就提交。')}</p><p className="fine-print">{t('Only assistance recorded in Lumio is disclosed. External help cannot be detected.', '只會披露 Lumio 記錄的協助，無法偵測外部協助。')}</p></div> : <><div className="persona-tabs"><button className={persona === 'coach' ? 'active' : ''} onClick={() => setPersona('coach')}><Sparkles size={14} />{t('Coach', '教練')}</button><button className={persona === 'manager' ? 'active' : ''} onClick={() => setPersona('manager')}><UserRound size={14} />{t('Manager', '主管')}</button></div><div className="ai-mode-label"><span className={profile?.aiMode === 'live' ? 'live-dot' : 'scripted-dot'} />{profile?.aiMode === 'live' ? t('Lumio · AI conversation', 'Lumio · AI 對話') : profile?.aiMode === 'unavailable' ? t('AI unavailable', 'AI 尚未啟用') : t('Scripted colleague mode', '預設同事模式')}</div><div className="conversation">{profile?.aiMode === 'unavailable' && <div className="ai-unavailable"><p>{t('AI is not configured on this deployment. You can read existing documents and save drafts. AI feedback is unavailable. Please try again later.', '此版本尚未設定 AI。你仍可閱讀現有文件及儲存草稿，但 AI 回饋暫不可用。請稍後再試。')}</p></div>}<div className="chat-welcome"><span className="coach-orb"><Sparkles size={21} /></span><strong>{persona === 'coach' ? t('Find your next step.', '找到你的下一步。') : t('Talk it through.', '一起釐清問題。')}</strong><p>{task.coaching === 'worked' ? t('Ask for a hint or a clearer explanation.', '需要提示或更清晰的解釋嗎？') : task.coaching === 'targeted' ? t('Targeted hints can help you reason through this stage.', '有針對性的提示，助你思考這個階段。') : t('You lead this stage. Ask for support only when you need it.', '這個階段由你主導。只在需要時尋求協助。')}</p></div>{attempt.messages.map(m => <div key={m.id} className={`chat-message ${m.role}`}><span>{m.role === 'user' ? t('You', '你') : m.persona === 'coach' ? t('Coach', '教練') : task.manager}{m.source === 'scripted' ? t(' · scripted', ' · 預設回覆') : ''}</span><ConversationText text={m.content} locale={locale}/></div>)}{busy === 'chat' && <div className="chat-loading" role="status"><Loader2 size={16} className="spin" />{t('Preparing a response…', '正在準備回覆…')}</div>}</div><form className="chat-form" onSubmit={sendChat}><label className="sr-only" htmlFor="chat-message">{t('Message your colleague', '傳送訊息給同事')}</label><textarea id="chat-message" disabled={profile?.aiMode === 'unavailable' || archived} value={message} maxLength={2000} rows={2} placeholder={persona === 'coach' ? t('Ask your coach…', '詢問教練…') : t('Ask your manager…', '詢問主管…')} onChange={e => setMessage(e.target.value)} /><button type="submit" disabled={!!busy || archived || !message.trim() || profile?.aiMode === 'unavailable'} aria-label={t('Send message', '傳送訊息')}><Send size={16} /></button></form><p className="chat-disclaimer">{generated ? t('AI supports your thinking and reviews work against a visible rubric.', 'AI 協助思考，並按公開標準評估工作。') : t('AI helps you think. Earlier tasks use authored checks.', 'AI 協助思考，較早任務使用預先編寫的檢查。')}</p></>}</aside>
          </div>
          {evaluation && <section ref={feedbackRef} tabIndex={-1} aria-label={t('Work review results', '工作評估結果')} className="feedback-panel panel"><div className="panel-heading"><span className="panel-glyph glyph-lime"><CircleCheck size={20} /></span><h2>{reportKind === 'practice' ? generated ? t('AI practice feedback', 'AI 練習回饋') : t('Practice check results', '練習檢查結果') : t('Submission feedback', '提交回饋')}</h2><span className="status-pill">{reportKind === 'practice' ? t('Not a submission', '尚未提交') : t('Saved in portfolio', '已儲存於作品集')}</span></div><div className="feedback-body"><CheckReport evaluation={evaluation} locale={locale} /></div></section>}
          {!profile?.email && <GuestNote locale={locale} disabled={!!busy} onAccount={() => setModal('account')} />}
        </>)}

        {view === 'portfolio' && <>
          <div className="page-intro"><div><p className="eyebrow">{t('Your practice record', '你的體驗紀錄')}</p><h1>{t('Your work portfolio', '你的工作作品集')}</h1><p className="page-description">{t('See how far your work has come.', '看看你的作品進步了多少。')}</p></div><button className="secondary-button" disabled={!!busy || !portfolio?.attempts.length} onClick={exportData}><ArrowDownToLine size={16} />{t('Export my data', '匯出資料')}</button></div>
          <p className="export-file-note">{t('Export includes file text and metadata. Download original files separately.', '匯出資料包含檔案文字及資料，請另行下載原始檔案。')}</p><div className="portfolio-stats"><div><span className="stat-icon"><BriefcaseBusiness size={21} /></span><div><strong>{new Set(portfolio?.attempts.map(a => a.roleId)).size}</strong><span>{t('Careers explored', '已探索職業')}</span></div></div><div><span className="stat-icon"><FileText size={21} /></span><div><strong>{portfolio?.attempts.reduce((sum, a) => sum + a.submissions.length, 0) || 0}</strong><span>{t('Work submissions', '工作提交')}</span></div></div><div><span className="stat-icon"><CircleCheck size={21} /></span><div><strong>{portfolio?.attempts.filter(a => a.submissions.some(s => s.evaluation.passed)).length || 0}</strong><span>{t('Tasks passed', '已通過任務')}</span></div></div><div className="privacy-stat"><ShieldCheck size={23} /><div><strong>{t('Private by default', '預設為私密')}</strong><span>{t('You decide what to share.', '由你決定分享內容。')}</span></div></div></div>
          {!profile?.email && <GuestNote locale={locale} disabled={!!busy} onAccount={() => setModal('account')} />}
          <div className="portfolio-grid"><section><div className="section-heading"><div><h2>{t('Your work history', '你的工作紀錄')}</h2><p>{t('Open a version to inspect its feedback and your original work.', '開啟版本，查看評估回饋及原本的工作內容。')}</p></div></div>{portfolio?.attempts.length ? <><div className="portfolio-filterbar" aria-label={t('Filter work history','篩選工作紀錄')}>
            <label>{t('Role','職位')}<select aria-label={t('Filter portfolio by role','按職位篩選作品集')} value={portfolioRole} onChange={event => { setPortfolioRole(event.target.value); setPortfolioTask('all') }}><option value="all">{t('All roles','所有職位')}</option>{portfolioRoles.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}</select></label>
            <label>{t('Task','任務')}<select aria-label={t('Filter portfolio by task','按任務篩選作品集')} value={portfolioTask} onChange={event => setPortfolioTask(event.target.value)}><option value="all">{t('All tasks','所有任務')}</option>{portfolioTasks.map(item => <option key={item.id} value={item.id}>{item.title[locale]}</option>)}</select></label>
            <label>{t('Status','狀態')}<select aria-label={t('Filter portfolio by status','按狀態篩選作品集')} value={portfolioStatus} onChange={event => setPortfolioStatus(event.target.value)}><option value="all">{t('All work','所有作品')}</option><option value="draft">{t('Draft','草稿')}</option><option value="passed">{t('Passed','通過')}</option><option value="revise">{t('Needs revision','需要改善')}</option></select></label>
          </div><div className="portfolio-filter-result" aria-live="polite"><span>{t(`${visiblePortfolio.length} work ${visiblePortfolio.length === 1 ? 'sample' : 'samples'}`, `${visiblePortfolio.length} 份作品`)}</span>{(portfolioRole !== 'all' || portfolioTask !== 'all' || portfolioStatus !== 'all') && <button className="text-button" onClick={() => { setPortfolioRole('all');setPortfolioTask('all');setPortfolioStatus('all') }}>{t('Clear filters','清除篩選')}</button>}</div><div className="evidence-list">{visiblePortfolio.map(a => <EvidenceCard key={a.id} attempt={a} locale={locale} selectable={a.submissions.length > 0} selected={selected.includes(a.id)} selectDisabled={selected.length >= 20 && !selected.includes(a.id)} onSelect={() => setSelected(p => p.includes(a.id) ? p.filter(id => id !== a.id) : p.length < 20 ? [...p, a.id] : p)} onOpen={() => { takeAttempt(a); setView('workspace') }} />)}{!visiblePortfolio.length && <div className="empty-history-filter"><Search size={22}/><p>{t('No work matches these filters.','沒有符合篩選的作品。')}</p><button className="text-button" onClick={() => {setPortfolioRole('all');setPortfolioTask('all');setPortfolioStatus('all')}}>{t('Show all work','顯示所有作品')}</button></div>}</div></> : <div className="empty-state panel"><FolderOpen size={35} /><h3>{t('Your first work sample goes here', '在這裏保留首份工作作品')}</h3><p>{t('Try a career task and your saved work will appear here.', '體驗職業任務，已儲存的工作便會出現在這裏。')}</p><button className="primary-button" onClick={() => navigate('discover')}>{t('Explore careers', '探索職業')}<ArrowRight size={16} /></button></div>}</section><aside className="portfolio-tools">{profile?.email && portfolio && <EmployerConsent locale={locale} shares={portfolio.shares}/>}<div className="panel share-panel"><span className="tool-icon"><Link2 size={23} /></span><h3>{t('Share your progress', '分享你的進展')}</h3><p>{t('Share selected task versions and their submitted files through a link you control.', '透過你控制的連結，分享已選取的任務版本及其提交檔案。')}</p><span className="selection-count">{selected.length}/20 {t('tasks selected', '個已選取任務')}</span><button className="primary-button" disabled={!!busy || selected.length === 0} onClick={share}>{busy === 'share' && <Loader2 size={15} className="spin" />}{t('Create sharing link', '建立分享連結')}<ArrowUpRight size={16} /></button>{shareUrl && <div className="new-share" role="status"><label htmlFor="share-url">{t('Your read-only link', '你的唯讀連結')}</label><input id="share-url" readOnly value={shareUrl} onFocus={e => e.target.select()} /><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(shareUrl); setNotice(t('Link copied.', '連結已複製。')) } catch { setNotice(t('Select the link above and copy it.', '請選取上方連結並複製。')) } }}>{t('Copy link', '複製連結')}</button><a href={shareUrl} target="_blank" rel="noreferrer">{t('Preview', '預覽')}<ArrowUpRight size={13} /></a></div>}{!!portfolio?.shares.length && <div className="active-shares"><h4>{t('Sharing links', '分享連結')}</h4>{portfolio.shares.map(s => <div key={s.id}><span>{t('Expires ', '到期：')}{new Date(s.expiresAt).toLocaleDateString(zh ? 'zh-HK' : 'en-GB')}</span><button disabled={!!busy} onClick={() => revoke(s.id)}>{t('Revoke', '撤銷')}</button></div>)}</div>}</div><div className="portfolio-note"><ShieldCheck size={19} /><p>{t('These are simulated workplace tasks, not professional qualifications. Reports show assistance recorded within Lumio.', '這些是模擬工作任務，不是專業資格。報告會顯示 Lumio 內記錄的協助。')}</p></div><details className="portfolio-data-controls"><summary>{t('Manage my data','管理我的資料')}</summary><button className="text-button reset-work-button" disabled={!!busy} onClick={() => { setError(''); setModal('reset') }}>{t('Reset task history', '重設任務紀錄')}</button><button className="erase-button" disabled={!!busy} onClick={() => { setError(''); setModal('erase') }}><Trash2 size={14} />{t('Delete my Lumio data', '刪除我的 Lumio 資料')}</button></details></aside></div>
        </>}
      </main>
    </div>
    {modal && <Dialog returnFocusTo={modalOpener.current} title={modal === 'role' && selectedRole ? selectedRole.title[locale] : modal === 'company' && selectedCompany ? selectedCompany.name[locale] : modal === 'account' ? profile?.email ? t('Your account', '你的帳戶') : t('Keep your work across devices', '跨裝置保留你的作品') : modal === 'consent' ? t('Before using AI assistance and review', '使用 AI 協助及評估之前') : modal === 'reset' ? t('Reset your task history?', '重設你的任務紀錄？') : t('Delete your Lumio data?', '刪除你的 Lumio 資料？')} onClose={() => { if (modal === 'company' || modal === 'role' || !busy) { consentAction.current = null; setModal(null); if (modal !== 'company' && modal !== 'role') setError('') } }}>
      {error && <div className="banner error-banner" role="alert">{error}</div>}
      {modal === 'role' && selectedRole && <RoleOverview role={selectedRole} locale={locale} variations={getTaskFamilies(selectedRole.id).flatMap(item => variations[catalogKey(selectedRole.id, 'taster', item.id)] || [])} attempts={profile?.attempts || []} busy={!!busy} guest={!profile?.email} onAccount={() => {setError('');setAuthMode('login');setModal('account')}} onStart={(taskId, variantId) => { setModal(null); void start(selectedRole.id, 'taster', { taskId, ...(variantId ? {variantId} : {}) }) }} onCompany={next => { setSelectedCompany(next); setModal('company') }} />}
      {modal === 'company' && selectedCompany && <CompanyDetails company={selectedCompany} locale={locale} onBack={selectedRole ? () => setModal('role') : undefined} />}
      {modal === 'account' && (profile?.email ? <div className="account-details"><div className="account-profile"><span className="avatar"><UserRound size={23} /></span><h3>{profile.name}</h3><p>{profile.email}</p></div><p>{t('Your work is linked to this account and available when you sign in on another device.', '工作已連結至此帳戶，在其他裝置登入後也可查看。')}</p><button className="secondary-button" disabled={!!busy} onClick={logout}><LogOut size={16} />{t('Sign out', '登出')}</button></div> : <><p className="dialog-description">{t('Guests can explore immediately. Guest work resets on refresh. Create an account for a fresh, persistent workspace.', '訪客可即時探索，重新整理後會重設工作。建立帳戶以使用全新、可持續保留的工作區。')}</p><div className="auth-tabs"><button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>{t('Create account', '建立帳戶')}</button><button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>{t('Sign in', '登入')}</button></div><form className="auth-form" onSubmit={authenticate}>{authMode === 'register' && <label>{t('Your name', '你的名字')}<input name="name" required maxLength={80} autoComplete="name" /></label>}<label>{t('Email', '電郵')}<input name="email" type="email" required autoComplete="email" /></label><label>{t('Password', '密碼')}<input name="password" type="password" required minLength={authMode === 'register' ? 12 : 1} maxLength={128} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} />{authMode === 'register' && <span>{t('Use at least 12 characters.', '請使用至少 12 個字元。')}</span>}</label><button className="primary-button" disabled={!!busy}>{busy === 'auth' && <Loader2 size={16} className="spin" />}{authMode === 'register' ? t('Create my account', '建立我的帳戶') : t('Sign in', '登入')}<ArrowRight size={16} /></button></form><p className="fine-print">{t('This prototype has no email verification or password reset. Store your password safely. New accounts start fresh. Guest work is not imported.', '此原型沒有電郵驗證或密碼重設服務。請妥善保管密碼。新帳戶由空白開始，不會匯入訪客工作。')}</p></>)}
      {modal === 'consent' && <><p className="dialog-description">{t('Your task, decisions, written work, readable attached-file contents and conversation messages are sent to an external AI service to generate guidance and assess your submission. Your email and account identity are not sent. This deployment is hosted in Los Angeles. AI processing may take place outside Hong Kong.', '任務、決策、書面工作、附加檔案的可讀取內容及對話訊息將傳送至外部 AI 服務，以生成指引及評估提交內容。不會傳送電郵或帳戶身份，此版本在洛杉磯託管，AI 處理可能在香港以外進行。')}</p><div className="consent-note"><ShieldCheck size={20} /><p>{t('Use synthetic task data. Do not upload employer secrets, client records or credentials. Only submit files you own or have permission to use. AI feedback can be wrong. Scores reflect this simulated task. Conversations are recorded as assistance in your private portfolio.', '請使用模擬任務資料。不要上載公司機密、客戶記錄或憑證，只提交你擁有或獲授權使用的檔案。AI 回饋可能有誤，分數只反映此模擬任務。對話會在私人作品集中記錄為協助。')}</p></div><div className="dialog-actions"><button className="secondary-button" onClick={() => { consentAction.current = null; setModal(null) }}>{t('Go back', '返回')}</button><button className="primary-button" onClick={() => { setConsent(true); setModal(null); const pending = consentAction.current; consentAction.current = null; pending?.() }}>{t('I understand, continue', '我明白，繼續')}<ArrowRight size={16} /></button></div></>}
      {modal === 'reset' && <><p className="dialog-description">{t('This removes your drafts, submissions, files and sharing links. Your account and sign-in stay. Download anything you want to keep first.', '這會移除草稿、提交內容、檔案及分享連結，帳戶及登入會保留。請先下載你想保留的內容。')}</p><div className="dialog-actions"><button className="secondary-button" disabled={!!busy} onClick={() => setModal(null)}>{t('Keep my work', '保留我的工作')}</button><button className="danger-button" disabled={!!busy} onClick={async () => { setBusy('reset'); setError(''); try { const next = await api<Profile>('/history/reset', 'POST', {scope:'task-history',confirm:true}); setProfile(next); setAttempt(null); setPortfolio(null); setDirty(false); setSelected([]); setShareUrl(''); setEvaluation(null); setModal(null); setView('discover'); setNotice(t('Your task history is reset. Your account is unchanged.', '任務紀錄已重設，帳戶保持不變。')) } catch(e) { setError((e as Error).message) } finally { setBusy('') } }}>{t('Reset my work', '重設我的工作')}</button></div></>}
      {modal === 'erase' && <><p className="dialog-description">{t('This permanently deletes your profile, saved drafts, submissions, uploaded files, conversation history and active sharing links. You cannot undo this action.', '這會永久刪除你的個人資料、草稿、提交內容、上載檔案、對話紀錄及有效分享連結。此操作無法復原。')}</p><p className="fine-print">{t('Export your data and download original files before deleting them.', '刪除前請匯出資料，並下載原始檔案。')}</p><div className="dialog-actions"><button className="secondary-button" disabled={!!busy} onClick={() => setModal(null)}>{t('Keep my data', '保留我的資料')}</button><button className="danger-button" disabled={!!busy} onClick={erase}>{busy === 'erase' ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}{t('Delete permanently', '永久刪除')}</button></div></>}
    </Dialog>}
  </div>
}

function NavButton({ active, icon, label, onClick, disabled }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) { return <button disabled={disabled} className={`nav-button ${active ? 'active' : ''}`} aria-label={label} aria-current={active ? 'page' : undefined} onClick={onClick}>{icon}<span className="nav-full-label">{label}</span><span className="nav-short-label">{{'Discover careers':'Explore','My workspace':'Work','My portfolio':'Portfolio'}[label] || label}</span>{active && <span className="nav-active-dot" />}</button> }

function GuestNote({ locale, onAccount, disabled }: { locale: Locale; onAccount: () => void; disabled?: boolean }) { return <div className="guest-note"><LockKeyhole size={16} /><p>{locale === 'zh' ? '重新整理後會重設訪客工作。開始前請先登入以保留作品。' : 'Guest work resets when you refresh. Sign in before starting to keep your work.'}</p><button className="text-button" disabled={disabled} onClick={onAccount}>{locale === 'zh' ? '建立帳戶' : 'Create an account'}<ArrowRight size={14} /></button></div> }

function EmptyWorkspace({ locale, onDiscover }: { locale: Locale; onDiscover: () => void }) { return <div className="empty-state panel"><BriefcaseBusiness size={35} /><h2>{locale === 'zh' ? '你的工作區準備好了。' : 'Your workspace is ready.'}</h2><p>{locale === 'zh' ? '選擇職業，開始你的第一個任務。' : 'Choose a career to start your first assignment.'}</p><button className="primary-button" onClick={onDiscover}>{locale === 'zh' ? '探索職業' : 'Discover careers'}<ArrowRight size={16} /></button></div> }

function SourceDocument({ body, locale }: { body: string; locale: Locale }) {
  const code = /```|[┌┐└┘│─]|^(?:function |const |let |def |class |SELECT |import |from |\s*\{)/m.test(body)
  if (code) return <><p className="source-scroll-hint">{locale === 'zh' ? '如內容較闊，可左右捲動。鍵盤使用者可聚焦內容後使用方向鍵。' : 'Scroll sideways for wide content. Keyboard users can focus the preview and use arrow keys.'}</p><pre className="source-code" tabIndex={0} role="region" aria-label={locale === 'zh' ? '可捲動的參考內容' : 'Scrollable source preview'}><code>{body}</code></pre></>
  const lines = body.split('\n')
  const blocks: { table: boolean; lines: string[] }[] = []
  for (const line of lines) {
    const table = line.includes(' | ') || /^\s*\|.+\|\s*$/.test(line)
    const previous = blocks.at(-1)
    if (previous?.table === table) previous.lines.push(line)
    else blocks.push({ table, lines: [line] })
  }
  const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(value => value.trim())
  return <>{blocks.map((block, index) => block.table && block.lines.length > 1 ? <div key={index} className="table-scroll source-table" tabIndex={0} role="region" aria-label={locale === 'zh' ? '可捲動的參考表格' : 'Scrollable source table'}><table><thead><tr>{cells(block.lines[0]).map((column, i) => <th key={i}>{column}</th>)}</tr></thead><tbody>{block.lines.slice(1).filter(line => !cells(line).every(value => /^:?-{2,}:?$/.test(value))).map((line, row) => <tr key={row}>{cells(line).map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}</tbody></table></div> : <div key={index} className="source-text">{block.lines.join('\n')}</div>)}</>
}

function WorkPreview({ roleId, task, answers, locale }: { roleId: string; task: Task; answers: Answers; locale: Locale }) {
  const zh = locale === 'zh'
  if (task.generation) return null
  if (roleId === 'ai-engineer' && ['fix', 'adapt', 'assessment'].includes(task.stage)) return <details className="configuration-preview" open><summary><Terminal size={14} />{zh ? '你的有效設定' : 'Your active configuration'}<span>{zh ? '由你的決策產生' : 'From your decisions'}</span></summary><div className="config-rows">{task.questions.filter(question => question.type !== 'multi').map(question => <div key={question.id}><span>{question.label[locale]}</span><code>{question.options?.find(option => option.value === answers[question.id])?.label[locale] || String(answers[question.id] ?? (zh ? '尚未設定' : 'Not set'))}{typeof answers[question.id] === 'number' && question.unit ? ` ${question.unit}` : ''}</code></div>)}</div><p>{zh ? '執行檢查會將設定套用至模擬政策個案。' : 'Checks apply this configuration to simulated policy cases.'}</p></details>
  if (roleId !== 'ux-designer') return null
  const explicitPrice = answers.priceSummary === 'before-confirmation'
  const visibleWindow = answers.deliveryWindow === 'visible-before-order'
  const action = task.questions.find(question => question.id === 'actionLabel')?.options?.find(option => option.value === answers.actionLabel)?.label[locale]
  const target = typeof answers.targetSize === 'number' ? Math.max(20, Math.min(64, answers.targetSize)) : 32
  return <div className="checkout-preview"><div className="preview-heading"><Palette size={14} /><span>{zh ? '結帳畫面預覽' : 'Checkout preview'}</span><span>{zh ? '隨你的決策更新' : 'Updates with your decisions'}</span></div><div className="mini-checkout"><div className="mini-checkout-top"><span>District Market</span><span>•••</span></div><h4>{zh ? '你的訂單' : 'Your order'}</h4><div className="sample-item"><span className="sample-product"><Leaf size={20} /></span><div><strong>{zh ? '每週蔬菜箱' : 'Weekly vegetable box'}</strong><span>{zh ? '1 件 · 示範商品' : '1 item · sample product'}</span></div><span>HK$188</span></div>{explicitPrice ? <div className="sample-price"><div><span>{zh ? '商品' : 'Items'}</span><span>HK$188</span></div><div><span>{zh ? '配送' : 'Delivery'}</span><span>HK$25</span></div><div><strong>{zh ? '合計' : 'Total'}</strong><strong>HK$213</strong></div></div> : <p className="preview-hidden">{zh ? '費用尚未顯示' : 'Charges are not visible yet'}</p>}{visibleWindow ? <div className="sample-delivery"><Clock3 size={12} />{zh ? '週五 18:00–20:00' : 'Friday, 18:00–20:00'}</div> : <p className="preview-hidden">{zh ? '配送時段尚未顯示' : 'Delivery window is not visible yet'}</p>}<button type="button" className={`sample-order ${answers.keyboardFocus === 'visible' ? 'sample-focus' : ''}`} style={{ minHeight: target }}>{action || (zh ? '選擇操作標籤' : 'Choose an action label')}</button><span className="sample-target">{target}px {zh ? '控制項 · 僅供預覽，不會付款' : 'control · preview only, no payment'}</span></div></div>
}

function Dialog({ title, children, onClose, returnFocusTo }: { title: string; children: ReactNode; onClose: () => void; returnFocusTo: HTMLElement | null }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { const node = ref.current; const before = returnFocusTo || document.activeElement as HTMLElement | null; node?.showModal(); return () => { node?.close(); if (before?.isConnected) before.focus({ preventScroll: true }) } }, [])
  useEffect(() => { if (ref.current) { ref.current.scrollTop = 0; ref.current.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }) } }, [title])
  return <dialog ref={ref} aria-labelledby={titleId} className="dialog" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close / 關閉" onClick={onClose}><X size={20} /></button></div>{children}</dialog>
}
