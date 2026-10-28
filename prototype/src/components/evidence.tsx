'use client'

import { CheckCircle2, Circle, ChevronDown, FileCheck2, Sparkles } from 'lucide-react'
import type { Attempt, Evaluation, Locale, Submission, Task } from '@/lib/types'
import { getRole, getTask } from '@/lib/content'
import { RoleArt } from './role-art'
import { AttachmentList } from './work-files'
import { getTaskFamily } from '@/lib/task-families'
import './learner-navigation.css'

export function CheckReport({ evaluation, locale }: { evaluation: Evaluation; locale: Locale }) {
  const zh = locale === 'zh'
  const ai = evaluation.source === 'deepseek'
  const labels: Record<string,string> = {approve:'批准',decline:'拒絕',review:'職員審核',suspend:'暫停',unconfigured:'未設定','operations-clearance':'營運部批准'}
  const outcome = (value:string) => zh ? labels[value] || value : value
  return <div className="check-report">
    <div className={`score-banner ${evaluation.passed ? 'passed' : ''}`}>
      <div className="score-number">{evaluation.score}<span>/100</span></div>
      <div><strong>{evaluation.passed ? (zh ? '已達到任務要求' : 'Task requirements met') : (zh ? '還有改善空間' : 'A little more work to do')}</strong><p>{ai ? zh ? '按任務標準評估你的決策及書面理據。' : 'Your decisions and reasoning were reviewed against the task criteria.' : zh ? '較早版本，由預先編寫的檢查評分。' : 'Earlier task scored by authored checks.'}</p></div>
    </div>
    {evaluation.summary && <div className="ai-review-summary"><span className="eyebrow">{zh ? '整體回饋' : 'Overall feedback'}</span><p>{evaluation.summary[locale]}</p></div>}
    <details className="review-breakdown"><summary>{zh ? '查看各項評分' : 'See score breakdown'}<ChevronDown size={18} /></summary><div className="check-list">{evaluation.checks.map(check => <div className="check-item" key={check.id}>
      {check.passed ? <CheckCircle2 size={18} className="positive" /> : <Circle size={18} className="muted" />}
      <div><strong>{check.label[locale]}</strong><p>{check.feedback[locale]}</p></div>
      <span className={`check-state ${check.passed ? 'positive' : ''}`}>{ai ? `${check.awarded ?? (check.passed ? check.points : 0)}/${check.points}` : check.passed ? (zh ? '通過' : 'Passed') : (zh ? '重試' : 'Revisit')}</span>
    </div>)}</div></details>
    {evaluation.nextSteps && <div className="ai-next-steps"><Sparkles size={17} /><div><strong>{zh ? '下一步' : 'Your next step'}</strong><p>{evaluation.nextSteps[locale]}</p></div></div>}
    {ai && <p className="ai-grade-provenance"><Sparkles size={13} />{zh ? 'AI 評估' : 'AI reviewed'}{evaluation.gradedAt ? ` · ${new Date(evaluation.gradedAt).toLocaleString(zh ? 'zh-HK' : 'en-GB')}` : ''}</p>}
    {!!evaluation.simulations?.length && <div className="simulation-results"><h4>{zh ? '政策模擬器 · 實際測試結果' : 'Policy simulator · actual test results'}</h4><div className="table-scroll"><table><thead><tr><th>{zh ? '個案' : 'Case'}</th><th>{zh ? '你的設定產生的結果' : 'Your configuration produced'}</th><th>{zh ? '政策預期結果' : 'Policy expectation'}</th><th>{zh ? '結果' : 'Result'}</th></tr></thead><tbody>{evaluation.simulations.map(simulation => <tr key={simulation.id}><td>{simulation.label[locale]}</td><td>{outcome(simulation.actual)}</td><td>{outcome(simulation.expected)}</td><td className={simulation.passed ? 'positive' : ''}>{simulation.passed ? (zh ? '通過' : 'Pass') : (zh ? '失敗' : 'Fail')}</td></tr>)}</tbody></table></div></div>}
    <p className="fine-print">{zh ? '此結果只適用於模擬任務，不代表就業資格。' : 'This result applies to a simulated task, not an employment credential. '}</p>
  </div>
}

export function EvidenceCard({ attempt, locale, selectable, selected, selectDisabled, onSelect, onOpen }: { attempt: Attempt; locale: Locale; selectable?: boolean; selected?: boolean; selectDisabled?: boolean; onSelect?: () => void; onOpen?: () => void }) {
  const role = getRole(attempt.roleId)
  const task = attempt.task || getTask(attempt.roleId, attempt.stage)
  const zh = locale === 'zh'
  if (!role || !task) return null
  const latest = attempt.submissions.at(-1)
  const helpExchanges = Math.max(attempt.messages?.filter(message => message.role === 'assistant').length || 0, latest?.assistance || 0)
  const family = task.taskId ? getTaskFamily(attempt.roleId, task.taskId) : undefined
  const advancedAssignment = !task.taskId && task.stage !== 'taster'
  const date = new Date(attempt.updatedAt).toLocaleDateString(zh ? 'zh-HK' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return <article className="evidence-card">
    <div className="evidence-heading">
      {selectable && <label className="evidence-select"><input aria-label={`${zh ? '選取' : 'Select'} ${task.title[locale]}`} type="checkbox" disabled={selectDisabled} checked={selected} onChange={onSelect} /></label>}
      <RoleArt roleId={attempt.roleId} className="evidence-role-art" />
      <div className="grow">{task.company && <span className="evidence-company">{task.company.name[locale]}</span>}<span className="eyebrow">{role.title[locale]}</span>{family && family.title[locale] !== task.title[locale] && <span className="evidence-task-type">{family.title[locale]}</span>}<h3>{task.title[locale]}</h3>{(attempt.retired || !task.generation) && <span className="evidence-archived">{zh ? '已封存變化 · 工作證據保留' : 'Archived variation · evidence preserved'}</span>}{task.generation && <span className="evidence-variation">{advancedAssignment ? zh ? '任務' : 'Assignment' : zh ? '變化' : 'Variation'} {task.generation.variation} · {zh ? 'AI 生成任務' : 'AI-created task'}</span>}</div>
      <span className={`status-pill ${attempt.status === 'submitted' && latest?.evaluation.passed ? 'positive-pill' : ''}`}>{attempt.status === 'draft' ? (zh ? '草稿' : 'Draft') : latest ? latest.evaluation.passed ? (zh ? '通過' : 'Passed') : (zh ? '需要改善' : 'Needs revision') : (zh ? '草稿' : 'Draft')}</span>
    </div>
    <div className="evidence-meta"><span>{date}</span><span>{attempt.submissions.length} {zh ? '個提交版本' : attempt.submissions.length === 1 ? 'submission version' : 'submission versions'}</span><span><Sparkles size={13} /> {helpExchanges} {zh ? '次協助' : helpExchanges === 1 ? 'help exchange' : 'help exchanges'}</span></div>
    {latest && <div className="evidence-latest-result"><div><span>{zh ? '最新評估' : 'Latest review'}</span><strong>{latest.evaluation.score}<small>/100</small></strong></div><p>{latest.evaluation.summary?.[locale] || (zh ? '按任務標準評估的工作證據。' : 'Work evidence assessed against the task criteria.')}</p></div>}
    {latest && <div className="versions"><SubmissionEvidence submission={latest} locale={locale} task={task}/>{attempt.submissions.length > 1 && <details className="older-versions"><summary>{zh ? `另外 ${attempt.submissions.length - 1} 個提交版本` : `${attempt.submissions.length - 1} earlier submission version${attempt.submissions.length === 2 ? '' : 's'}`}<ChevronDown size={16}/></summary>{[...attempt.submissions].slice(0,-1).reverse().map(submission => <SubmissionEvidence key={submission.id} submission={submission} locale={locale} task={task}/>)}</details>}</div>}
    {!attempt.submissions.length && !!attempt.attachments?.length && <AttachmentList files={attempt.attachments} locale={locale} />}
    {onOpen && <button className="text-button evidence-open" onClick={onOpen}>{zh ? '繼續工作' : 'Open workspace'} <span aria-hidden>→</span></button>}
  </article>
}

function SubmissionEvidence({ submission, locale, task }: { submission: Submission; locale: Locale; task: Task }) {
  const zh = locale === 'zh'
  return <details className="submission-detail"><summary><span>{zh ? '版本' : 'Version'} {submission.version}</span><span>{submission.evaluation.source === 'deepseek' ? zh ? 'AI 評估' : 'AI review' : `${submission.evaluation.checks.filter(c => c.passed).length}/${submission.evaluation.checks.length} ${zh ? '項檢查通過' : 'checks passed'}`}</span><strong>{submission.evaluation.score}/100</strong><ChevronDown size={16} /></summary>
    <div className="submission-body"><p className="fine-print">{new Date(submission.createdAt).toLocaleString(zh ? 'zh-HK' : 'en-GB')} · {submission.assistance} {zh ? '次已記錄協助。Lumio 無法偵測外部協助。' : submission.assistance === 1 ? 'recorded help exchange. Lumio cannot detect outside assistance.' : 'recorded help exchanges. Lumio cannot detect outside assistance.'}</p><CheckReport evaluation={submission.evaluation} locale={locale} /><h4>{zh ? '提交的決策' : 'Submitted decisions'}</h4><div className="submitted-decisions">{task.questions.map(question => { const answer = submission.answers[question.id]; const choices = Array.isArray(answer) ? answer : answer === undefined ? [] : [answer]; return <div key={question.id}><span>{question.label[locale]}</span><strong>{choices.map(value => question.options?.find(option => option.value === value)?.label[locale] || `${value}${question.unit ? ` ${question.unit}` : ''}`).join(', ') || (zh ? '未回答' : 'Not answered')}</strong></div> })}</div><h4>{zh ? '提交的工作' : 'Submitted work'}</h4><p className="preserved-work">{submission.work || (zh ? '沒有補充文字，請查看下方附加作品。' : 'No additional text. See attached work below.')}</p>{!!submission.attachments?.length && <section className="submitted-files"><h4>{zh ? '此版本提交的檔案' : 'Files submitted with this version'}</h4><AttachmentList files={submission.attachments} locale={locale} /></section>}</div>
  </details>
}
