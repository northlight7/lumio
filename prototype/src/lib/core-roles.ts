import type { Role, Text } from './types'

const t = (en: string, zh: string): Text => ({ en, zh })

/** Transferable industry practice. These contexts do not represent an employer. */
export const coreRoles: Role[] = [
  {
    id: 'core-manufacturing-analyst', collection: 'core',
    title: t('Manufacturing analyst', '製造業分析師'), field: t('Operations & logistics', '營運與物流'),
    description: t('Turn production records into a clear quality or capacity recommendation.', '把生產記錄轉化為清晰品質或產能建議。'),
    skills: [t('Production metrics', '生產指標'), t('Capacity analysis', '產能分析'), t('Evidence handover', '證據交接')],
    interests: ['numbers', 'problem-solving'], icon: 'Cog', color: '#83DFEC', duration: 20,
    learningObjective: t('Use synthetic manufacturing records to distinguish a quality problem from a capacity problem. Supply all units, denominators, shift lengths, downtime rules and decision conditions. Make a calculated recommendation and a practical verification handover. No real factory process, safety certification or proprietary design is represented.', '利用合成製造記錄區分品質及產能問題。提供所有單位、分母、輪班時長、停機規則及決策條件。提出經計算建議及實際核實交接，不代表真實工廠流程、安全認證或專有設計。'),
    company: t('Core practice', '核心練習'), tasks: [],
  },
  {
    id: 'core-accounting-assistant', collection: 'core',
    title: t('Accounting assistant', '會計助理'), field: t('Finance & accounting', '財務與會計'),
    description: t('Reconcile payments and invoices using explicit rules and an auditable working file.', '按明確規則及可追溯工作檔案核對付款與發票。'),
    skills: [t('Reconciliation', '對賬'), t('Invoice controls', '發票控制'), t('Audit trail', '審計追蹤')],
    interests: ['numbers', 'problem-solving'], icon: 'Wallet', color: '#D5F778', duration: 20,
    learningObjective: t('Reconcile invented transaction records or review invoice approval evidence using a supplied accounting convention. Provide complete balances, dates, amounts, timing rules and authorization limits. Explain reconciling items and a review handover. Do not supply real accounting, tax or investment advice or actual bank/customer information.', '按提供的會計規則核對虛構交易記錄或發票審批證據。提供完整餘額、日期、金額、時間規則及授權限額。解釋對賬項目及審查交接，不提供真實會計、稅務或投資意見，亦不使用真實銀行或客戶資料。'),
    company: t('Core practice', '核心練習'), tasks: [],
  },
  {
    id: 'core-marketing-analyst', collection: 'core',
    title: t('Marketing analyst', '市場營銷分析師'), field: t('Marketing', '市場營銷'),
    description: t('Compare campaign economics and turn customer evidence into a focused experiment.', '比較推廣成本效益，並把客戶證據轉化為聚焦實驗。'),
    skills: [t('Campaign economics', '推廣成本效益'), t('Audience research', '受眾研究'), t('Experiment planning', '實驗規劃')],
    interests: ['numbers', 'design', 'people'], icon: 'Megaphone', color: '#F3A5D8', duration: 20,
    learningObjective: t('Analyze a synthetic campaign or anonymized fictional customer-research table. Supply every denominator, attribution caveat, budget and experiment acceptance condition. Produce an evidence-based recommendation with measurable next steps. No real audience identifiers, advertising spend or company-specific playbook is used.', '分析合成推廣或匿名虛構客戶研究表。提供所有分母、歸因限制、預算及實驗接納條件。提出有證據支持的建議及可量度下一步，不使用真實受眾識別資料、廣告開支或公司專有指引。'),
    company: t('Core practice', '核心練習'), tasks: [],
  },
].map(role => ({
  ...role,
  tasks: [{
    stage: 'taster', title: role.title, brief: role.learningObjective!,
    manager: 'Practice team lead', managerRole: t('Team lead', '團隊主管'), duration: 20,
    documents: [{ id: 'industry-guideline', kind: 'brief', title: t('Industry practice guideline', '行業練習指引'), body: role.learningObjective! }],
    questions: [], starter: t('Evidence and calculations:\nRecommendation:\nVerification and handover:', '證據及計算：\n建議：\n核實及交接：'), coaching: 'worked',
  }],
})) as Role[]
