'use client'

import { useEffect, useState } from 'react'
import { Download, Clock3, FileSpreadsheet, FileCode2, FileText, FolderDown, ShieldCheck } from 'lucide-react'
import type { Attempt, Locale } from '@/lib/types'

type Material = { id: string; fileName: string; label: string; format: string; size: number; downloadUrl: string }

export function WorkMaterials({ attemptId, locale }: { attemptId: string; locale: Locale }) {
  const [manifest, setManifest] = useState<{files: Material[]; packUrl: string} | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const zh = locale === 'zh'
  useEffect(() => {
    let active = true
    setManifest(null); setError('')
    fetch(`/api/attempts/${attemptId}/materials?locale=${locale}`).then(async response => {
      const value = await response.json()
      if (!response.ok) throw new Error(value.error || 'Materials unavailable')
      if (active) setManifest(value)
    }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [attemptId, locale, retry])
  return <section className="work-materials" aria-label={zh ? '下載任務檔案' : 'Download task files'}><div className="materials-title"><span className="panel-glyph glyph-cyan"><FolderDown size={22}/></span><div><h3>{zh ? '你的任務檔案' : 'Your task files'}</h3><p>{zh ? '下載檔案，在你熟悉的工具完成工作。' : 'Download. Work in the tools you know.'}</p></div></div>{manifest ? <><a className="secondary-button pack-download" href={manifest.packUrl} download><Download size={18}/>{zh ? '下載全部檔案 ZIP' : 'Download workpack ZIP'}</a><details className="material-file-list"><summary>{zh ? `查看 ${manifest.files.length} 個檔案` : `View ${manifest.files.length} files`}</summary>{manifest.files.map(file => <a href={file.downloadUrl} download key={file.id}><span className="material-file-glyph">{['csv','xlsx'].includes(file.format) ? <FileSpreadsheet size={18}/> : ['py','js','ts','tsx','jsx','sql','json','html','css'].includes(file.format) ? <FileCode2 size={18}/> : <FileText size={18}/>}</span><span><strong>{file.label}</strong><small>{file.fileName} · {file.format.toUpperCase()} · {Math.max(1,Math.round(file.size/1024))} KB</small></span><Download size={16}/></a>)}</details></> : error ? <div role="alert"><p>{error}</p><button className="text-button" onClick={() => setRetry(value => value + 1)}>{zh ? '重試下載檔案' : 'Retry materials'}</button></div> : <p role="status">{zh ? '正在準備檔案…' : 'Preparing files…'}</p>}<p className="material-privacy"><ShieldCheck size={15}/>{zh ? '模擬資料，不含公司的機密文件。' : 'Synthetic sources. No confidential company files.'}</p></section>
}

export function DeadlineCard({ attempt, locale }: { attempt: Attempt; locale: Locale }) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const zh = locale === 'zh'
  useEffect(() => {
    if (!attempt.deadlineAt) { setRemaining(null); return }
    let active=true,received=performance.now(),wallReceived=Date.now()
    let server=Date.parse(attempt.serverNow || new Date().toISOString())
    const tick=()=>setRemaining(Math.min(Math.ceil((Date.parse(attempt.deadlineAt!) - Date.parse(attempt.startedAt || attempt.deadlineAt!))/1000),Math.ceil((Date.parse(attempt.deadlineAt!) - server - Math.max(performance.now()-received,Date.now()-wallReceived))/1000)))
    const sync=async()=>{
      if(document.visibilityState==='hidden')return
      try{const response=await fetch(`/api/attempts/${attempt.id}/clock`,{cache:'no-store'});if(!response.ok)return;const clock=await response.json();if(active){server=Date.parse(clock.serverNow);received=performance.now();wallReceived=Date.now();tick()}}catch{/* Server receipt remains authoritative if temporarily offline. */}
    }
    tick()
    const timer=window.setInterval(tick,1000),refresh=window.setInterval(sync,30000)
    window.addEventListener('focus',sync);window.addEventListener('online',sync);document.addEventListener('visibilitychange',sync)
    return()=>{active=false;window.clearInterval(timer);window.clearInterval(refresh);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);document.removeEventListener('visibilitychange',sync)}

  }, [attempt.id, attempt.deadlineAt, attempt.serverNow])
  const timing = attempt.submissions.at(-1)?.timing
  const late = remaining !== null && remaining < 0
  const value = remaining === null ? null : Math.abs(remaining)
  const minutes = value === null ? '' : `${Math.floor(value/60).toString().padStart(2,'0')}:${(value%60).toString().padStart(2,'0')}`
  return <section className={`deadline-card ${late ? 'deadline-late' : ''} ${!attempt.deadlineAt ? 'deadline-untimed' : ''}`} aria-label={zh ? '任務期限' : 'Task deadline'}><span className="deadline-icon"><Clock3 size={24}/></span><div><span className="deadline-caption">{remaining === null ? zh ? '較早任務' : 'Earlier assignment' : late ? zh ? '已超時' : 'Past deadline' : zh ? '剩餘時間' : 'Time remaining'}</span><strong className="deadline-value" aria-label={remaining === null ? undefined : zh ? `${Math.floor(value!/60)} 分 ${value!%60} 秒` : `${Math.floor(value!/60)} minutes ${value!%60} seconds`}>{remaining === null ? zh ? '沒有計時' : 'Untimed' : `${late ? '+' : ''}${minutes}`}</strong></div><div className="deadline-details"><p>{attempt.deadlineAt ? `${zh ? '截止 ' : 'Due '}${new Date(attempt.deadlineAt).toLocaleTimeString(zh ? 'zh-HK' : 'en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}` : zh ? '已儲存的工作保留原有設定。' : 'Your saved work keeps its original settings.'}</p><span>{!attempt.deadlineAt ? zh ? '此任務不計時。' : 'This assignment is untimed.' : timing ? timing.onTime ? zh ? '上次提交準時' : 'Last submission on time' : zh ? '上次提交已超時' : 'Last submission late' : zh ? '離開頁面後時間仍繼續。超時仍可提交。' : 'Runs while you are away. Late work is accepted.'}</span></div></section>
}
