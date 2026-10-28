'use client'

import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, FileText, Loader2, Presentation, Trash2, Upload } from 'lucide-react'
import type { Attachment, Locale } from '@/lib/types'

const formats = '.xlsx,.csv,.pptx,.docx,.txt,.py,.js,.ts,.tsx,.jsx,.sql,.json,.html,.css,.md'
const extensions = new Set(['xlsx', 'csv', 'pptx', 'docx', 'txt', 'py', 'js', 'ts', 'tsx', 'jsx', 'sql', 'json', 'html', 'css', 'md'])
const sizeLabel = (size: number) => size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`
const limitationCopy: Record<string, string> = {
  'Cell text, raw numeric values and saved formula results are reviewed. Formatting, dates represented as numeric serials, charts and images are not rendered.': '會評閱儲存格文字、原始數值及已儲存的公式結果，不會呈現格式、以數字序號表示的日期、圖表或圖片。',
  'Formulas are shown with their saved results. They are not calculated or verified by running the workbook.': '會顯示公式及已儲存結果，但不會執行活頁簿以計算或核實結果。',
  'CSV cells are read as text. Formula-like cells are not executed.': 'CSV 儲存格以文字讀取，類似公式的內容不會執行。',
  'Document text and table text are reviewed. Images, formatting and tracked-change presentation are not rendered.': '會評閱文件及表格文字，不會呈現圖片、格式或修訂顯示方式。',
  'Slide text and table text are reviewed in presentation order. Images, animations, layout and speaker notes are not rendered.': '會按簡報次序評閱投影片及表格文字，不會呈現圖片、動畫、佈局或演講備註。',
}

export function AttachmentList({ files, locale, onRemove, disabled = false }: { files: Attachment[]; locale: Locale; onRemove?: (file: Attachment) => Promise<void>; disabled?: boolean }) {
  const zh = locale === 'zh'
  if (!files.length) return null
  return <div className="attachment-list">{files.map(file => <article className="attachment-file" data-attachment-id={file.id} key={file.id}><div className="attachment-heading"><span className="attachment-glyph">{file.format === 'xlsx' || file.format === 'csv' ? <FileSpreadsheet size={20} /> : file.format === 'pptx' ? <Presentation size={20} /> : <FileText size={20} />}</span><div><strong>{file.fileName}</strong><span>{file.format.toUpperCase()} · {sizeLabel(file.size)} · {zh ? '文字已讀取' : 'Text ready'}</span></div><a href={file.downloadUrl} download className="icon-button" aria-label={`${zh ? '下載' : 'Download'} ${file.fileName}`}><Download size={18} /></a>{onRemove && <button type="button" className="icon-button attachment-remove" disabled={disabled} aria-label={`${zh ? '移除' : 'Remove'} ${file.fileName}`} onClick={() => { void onRemove(file) }}><Trash2 size={18} /></button>}</div><details className="attachment-preview"><summary>{zh ? '預覽 AI 可讀取的內容' : 'Preview AI-readable content'}</summary><pre tabIndex={0} aria-label={`${zh ? '已讀取的文字' : 'Extracted text'}: ${file.fileName}`}>{file.extractedText}</pre>{file.limitations.length > 0 && <div className="attachment-limitations"><strong>{zh ? '評閱範圍' : 'Review scope'}</strong>{file.limitations.map((limitation, index) => <p key={index}>{zh ? limitationCopy[limitation] || limitation : limitation}</p>)}</div>}</details></article>)}</div>
}

export function WorkFiles({ files, locale, roleId, taskId, disabled, reading, onUpload, onRemove }: { files: Attachment[]; locale: Locale; roleId: string; taskId?: string; disabled: boolean; reading: boolean; onUpload: (files: File[]) => Promise<void>; onRemove: (file: Attachment) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [permission, setPermission] = useState(false)
  const [dragging, setDragging] = useState(false)
  const zh = locale === 'zh'
  const t = (en: string, chinese: string) => zh ? chinese : en
  const spreadsheet = taskId ? /yield-audit|capacity-plan|bank-reconciliation|invoice-control|channel-economics|quality-audit|metric-decision|experiment-interpretation|carbon-budget|claim-audit|design-rules|qc-release|report-correction|monitoring-evidence|quality-uncertainty|cost-comparison|requirements-priority|campaign-metrics|experiment-decision|tolerance-review|reorder-plan|supplier-comparison|capacity-allocation|service-recovery|unit-economics|budget-variance|dependency-schedule|change-control/.test(taskId) : ['data-analyst', 'financial-analyst', 'sustainability-analyst', 'laboratory-analyst', 'supply-chain-planner', 'operations-planner', 'pcb-designer', 'environmental-scientist'].includes(roleId)
  const presentation = ['business-analyst', 'product-manager', 'ux-designer', 'project-coordinator', 'digital-marketing-analyst', 'research-analyst', 'core-marketing-analyst'].includes(roleId)
  async function add(selected: File[]) {
    setError('')
    if (disabled || !selected.length) return
    if (!permission) { setError(t('Confirm that you can use these files and that they contain no confidential data before uploading.', '上載前，請確認你可使用檔案，且當中不含機密資料。')); return }
    if (selected.length + files.length > 3) { setError(t('Keep up to three files in this task. Remove a file before adding another.', '每項任務最多保留三個檔案，請先移除檔案再加入新的檔案。')); return }
    const invalid = selected.find(file => !extensions.has(file.name.split('.').at(-1)?.toLowerCase() || '') || !file.size || file.size > 5 * 1024 * 1024)
    if (invalid) { setError(t(`Use a supported Office, data or code file up to 5 MB. Check ${invalid.name}.`, `請使用不超過 5 MB 的受支援 Office、資料或程式碼檔案。請檢查 ${invalid.name}。`)); return }
    try { await onUpload(selected) } catch (e) { setError((e as Error).message) }
  }
  async function remove(file: Attachment) {
    setError('')
    try { await onRemove(file) } catch (e) { setError((e as Error).message) }
  }
  return <section className="work-files" aria-label={t('Work files', '工作檔案')}><div className="work-files-title"><h3>{t('Upload your finished work', '上載完成的作品')}</h3><span>{files.length}/3 {t('files', '個檔案')}</span></div><p>{spreadsheet ? t('A spreadsheet works well for calculations and evidence.', '試算表適合展示計算及證據。') : presentation ? t('A short deck or document works well for your recommendation.', '簡短簡報或文件適合展示你的建議。') : t('Use a document or text file for your handover and verification notes.', '可使用文件或文字檔案提交交接說明及核實記錄。')}</p><label className="upload-permission"><input type="checkbox" checked={permission} disabled={disabled} onChange={event => { setPermission(event.target.checked); setError('') }} />{t('I can use these files. They contain no company secrets, personal records or credentials.', '我獲准使用這些檔案，當中不含公司機密、個人記錄或憑證。')}</label><input ref={input} id="work-file-upload" aria-label={t('Upload work files', '上載工作檔案')} type="file" tabIndex={-1} accept={formats} multiple disabled={disabled || !permission || files.length >= 3} className="sr-only" onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void add(selected) }} /><div className={`file-dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void add(Array.from(event.dataTransfer.files)) }}><button type="button" className="secondary-button" disabled={disabled || !permission || files.length >= 3} onClick={() => input.current?.click()}>{reading ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}{reading ? t('Reading your file…', '正在讀取檔案…') : t('Choose files', '選擇檔案')}</button><span>{t('or drop files here', '或將檔案拖到這裏')}</span></div><details className="file-scope-details"><summary>{t('Supported files and review scope', '支援格式及評閱範圍')}</summary><p className="file-format-guide">{t('Office files, CSV, text and code. Up to 5 MB each. AI reads content. It does not run your code or workbook formulas, or judge slide design.', 'Office、CSV、文字及程式碼，每個檔案最多 5 MB。AI 只讀取內容，不會執行程式碼或試算表公式，也不評估投影片設計。')}</p></details>{error && <p className="file-error" role="alert">{error}</p>}<AttachmentList files={files} locale={locale} onRemove={remove} disabled={disabled} /></section>
}
