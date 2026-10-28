import type { TaskFamily, Text } from './types'
const t = (en: string, zh: string): Text => ({ en, zh })
type Spec = [string,string,string,string,string,string,string]
const specs: Spec[] = [
  [
    "ai-engineer",
    "quality-benchmark",
    "Read an AI quality benchmark",
    "解讀 AI 品質基準",
    "Calculate evaluation measures from frozen model predictions and ground-truth labels to produce a bounded benchmark report.",
    "從固定模型預測及真實標籤計算評估指標，以製作有限度基準報告。",
    "A: two fictional model versions with complete positive/negative predictions and established ground-truth labels for four to six test records. B: two versions with a different error tradeoff and explicit abstentions among four to six test records. Supply small input-only CSV, exact definitions and formulas for true/false positives, precision, recall and coverage, zero-denominator treatment, a minimum recall/coverage eligibility gate and a deterministic ranking rule. Predictions and ground truth are ALREADY provided: learners measure model errors, not apply an inventory/routing policy to choose case labels. Deliver a confusion-count/metric comparison report and bounded error-analysis follow-up. Keep four meaningful questions about measured quantities and the supported model. No retrieval/prompt repair, availability predicates or per-customer routing. Entire benchmark and labels are fictional."
  ],
  [
    "ai-engineer",
    "inference-budget",
    "Budget an AI workflow",
    "規劃 AI 工作流程成本",
    "Calculate supplied token costs, latency and a feasible inference configuration.",
    "計算提供的 token 成本、延遲及可行推論設定。",
    "A: daily request volumes and token tiers. B: batching and retry overhead. Invent prices, define additive cost and latency assumptions and one eligible cheapest plan."
  ],
  [
    "ai-engineer",
    "monitoring-plan",
    "Specify AI service monitoring",
    "定義 AI 服務監察",
    "Specify quality and latency monitoring from synthetic aggregate time windows with explicit alert and review rules.",
    "按合成彙總時間視窗及明確警報與審查規則定義品質及延遲監察。",
    "A: four aggregate service windows with checked-response counts, error counts and supplied latency values. B: unequal-size windows with weighted aggregate error rate and a predeclared consecutive-window alert condition. Supply input-only CSV with all window counts and units, exact numerator/denominator and rolling-window definitions, thresholds, alert destination and review owner. Deliver a monitoring specification listing metric formulas, windows, alert conditions and review actions, plus calculations showing how the supplied windows behave. P95 latency may be supplied directly, do not require percentile estimation from insufficient aggregates. Do NOT classify customer cases, route requests by confidence, repair retrieval or prompt rules, or set product availability. This is aggregate operational observability, not another configuration-repair/routing exercise. No live deployment or alert is performed."
  ],
  [
    "data-analyst",
    "join-integrity",
    "Audit a data join",
    "審查資料連結",
    "Reconcile table keys and join cardinality without silently duplicating or losing records.",
    "核對資料表鍵值及連結基數，避免靜默重複或遺失記錄。",
    "A: orders and duplicate merchant keys. B: unmatched service-event keys. Supply two tiny CSV tables, exact join semantics, valid output totals and unmatched handling."
  ],
  [
    "data-analyst",
    "forecast-error",
    "Compare forecast errors",
    "比較預測誤差",
    "Calculate defined forecast errors and select the supported forecast under a fixed rule.",
    "計算明確定義的預測誤差，並按固定規則選擇有證據支持的預測。",
    "A: absolute errors over equal demand periods. B: bias and maximum-error constraints. Supply actuals and forecasts, all formulas and a tie-break rule. Do not train a model."
  ],
  [
    "data-analyst",
    "metric-specification",
    "Specify a dashboard metric",
    "定義儀表板指標",
    "Turn a metric brief into an auditable calculation, inclusion rule and display specification.",
    "把指標簡介轉化為可追溯計算、納入規則及顯示規格。",
    "A: completed-order time windows. B: active-merchant deduplication. Supply event records, exact dates and inclusion/exclusion rules, not a generic dashboard redesign."
  ],
  [
    "customer-operations",
    "complaint-routing",
    "Categorise customer complaints",
    "分類客戶投訴",
    "Classify synthetic complaints under a supplied taxonomy and route each to the accountable team.",
    "按提供分類表分類合成投訴，並轉交各個負責團隊。",
    "A: booking, billing and listing categories. B: multi-topic tickets with explicit precedence. Supply complete category definitions and routing owners."
  ],
  [
    "customer-operations",
    "sla-priority",
    "Prioritise a support queue",
    "排列支援隊列",
    "Calculate remaining response windows and prioritise cases by explicit service rules.",
    "計算剩餘回覆時限，並按明確服務規則排列個案。",
    "A: created times and urgency tiers. B: paused tickets and an escalation threshold. Supply one absolute query time, pause arithmetic and deterministic tie-breaks."
  ],
  [
    "customer-operations",
    "knowledge-handover",
    "Improve a support article",
    "改善支援文章",
    "Revise a fictional support article to match an approved source and verification checklist.",
    "修訂虛構支援文章，以符合獲批准來源及核實清單。",
    "A: outdated booking steps. B: missing refund-status explanation. Supply authoritative steps, article excerpt and approval owner. Do not resolve another booking ticket."
  ],
  [
    "ux-designer",
    "information-architecture",
    "Test an information structure",
    "測試資訊結構",
    "Interpret a small tree-test result and recommend a navigation grouping with a measurable check.",
    "解讀小型樹狀測試結果，並建議資訊分組及可量度檢查。",
    "A: ticket and journey labels. B: station facility hierarchy. Supply task successes, denominators, labels and a predefined criterion. Focus on categorization, not a general usability priority list."
  ],
  [
    "ux-designer",
    "microcopy-localisation",
    "Review bilingual microcopy",
    "審查雙語介面文字",
    "Repair supplied interface text to preserve meaning, action clarity and state-specific guidance.",
    "修正提供介面文字，以保留語意、行動清晰度及狀態指引。",
    "A: route-saving confirmation and undo. B: journey-alert opt-in copy. Supply English and Traditional Chinese text, exact supported actions and brand limits."
  ],
  [
    "ux-designer",
    "prototype-validation",
    "Plan a prototype check",
    "規劃原型驗證",
    "Choose a bounded prototype test with measurable acceptance and a recruitment plan.",
    "選擇有限度原型測試，定義可量度接納及招募計劃。",
    "A: navigation recognition tasks. B: alert comprehension tasks. Supply target participants, available sessions, budget, measure and pass gate. Do not claim a study was executed."
  ],
  [
    "sustainability-analyst",
    "inventory-boundary",
    "Set a resource inventory boundary",
    "界定資源盤點範圍",
    "Classify resource records by an explicit reporting boundary and reconcile the included inventory.",
    "按明確報告範圍分類資源記錄，並核對納入盤點。",
    "A: common-area versus tenant electricity records. B: event versus office material purchases. Supply units, scope rules and conversion factors. No legal reporting claim."
  ],
  [
    "sustainability-analyst",
    "supplier-evidence",
    "Check supplier evidence",
    "核對供應商證據",
    "Compare fictional supplier statements to a required evidence checklist and hold unsupported claims.",
    "按所需證據清單比較虛構供應商聲明，並暫停無依據聲明。",
    "A: recycled-content records. B: packaging traceability records. Supply dated evidence, validity rules and review owner. Produce a vendor evidence-completeness checklist and approval/hold recommendation, not edited green-marketing copy or another resource-impact calculation. Do not infer actual supplier certifications."
  ],
  [
    "sustainability-analyst",
    "target-tracking",
    "Track a resource target",
    "追蹤資源目標",
    "Calculate progress against a defined baseline and target with complete scope and variance rules.",
    "按完整範圍及差異規則計算相對明確基準及目標的進度。",
    "A: water intensity with activity units. B: waste-per-attendee target. Supply denominators, time periods and missing-data handling, no causal claim."
  ],
  [
    "software-developer",
    "pure-refactor",
    "Refactor a small function",
    "重構小型函數",
    "Produce a behavior-preserving refactor against a complete public function contract.",
    "按完整公開函數合約提出保留行為的重構。",
    "A: price-band classification with repeated branches. B: normalized filename eligibility with repeated checks. Supply complete callable TypeScript, exact boundary outputs and at least four input traces. Reference is full replacement code, no runtime imports. The starter already returns correct contract outputs: the defect is duplicated logic, not wrong behavior. Preserve every output while removing duplicated logic. Do not introduce a functional bug to turn this into the old defect-patch task."
  ],
  [
    "software-developer",
    "schema-compatibility",
    "Keep a schema change compatible",
    "維持資料結構相容",
    "Patch a pure record mapper to support an explicit old-to-new schema migration contract.",
    "修正純記錄映射函數，以支援明確新舊資料結構遷移合約。",
    "A: optional display-name field with backward fallback. B: renamed quantity field with explicit precedence. Supply complete pure TypeScript and old/new record inputs. No database access or SQL migration action."
  ],
  [
    "software-developer",
    "dependency-contract",
    "Adapt a dependency contract",
    "適應依賴合約",
    "Repair a small adapter when a supplied fictional dependency changes its return contract.",
    "在提供的虛構依賴回傳合約改變時修正小型適配器。",
    "A: an old string result becomes a tagged object. B: a nullable result becomes a tagged success/error union. Implement the dependency as a complete local supplied helper, no package imports or imagined external APIs."
  ],
  [
    "full-stack-developer",
    "search-contract",
    "Connect a search contract",
    "連結搜尋合約",
    "Align a client query mapper and response handler to one explicit search API contract.",
    "把客戶端查詢映射及回應處理與明確搜尋 API 合約對齊。",
    "A: trimmed query and empty results. B: page cursor and unavailable filter. Supply self-contained pure TypeScript functions, literal input/output fixtures and full helper definitions. No DOM, fetch or database dependencies."
  ],
  [
    "full-stack-developer",
    "audit-consistency",
    "Reconcile audit events",
    "核對審核事件",
    "Correct a pure event builder to represent confirmed changes once with consistent fields.",
    "修正純事件建立函數，使已確認改動只出現一次並維持欄位一致。",
    "A: accepted merchant update versus validation failure. B: unchanged versus confirmed state transition. Explicit event contract, complete pure TypeScript, caller-supplied transaction result. No concurrent transaction or checkout task."
  ],
  [
    "full-stack-developer",
    "cache-freshness",
    "Review cached responses",
    "審查快取回應",
    "Patch a pure cache-selection function to respect explicit expiry and tenant boundaries.",
    "修正純快取選擇函數，以遵守明確到期及租戶邊界。",
    "A: exact expiry timestamp boundary. B: fresh record from another tenant. Complete callable TypeScript, supplied now value and every cache record, no runtime server/network dependencies."
  ],
  [
    "pcb-designer",
    "bom-substitution",
    "Screen component substitutions",
    "篩選零件替代方案",
    "Compare a fictional component matrix against every supplied board requirement and record eligible substitutes.",
    "按所有提供電路板要求比較虛構零件表，並記錄合資格替代方案。",
    "A: package, resistance tolerance and low-voltage rating. B: connector pins, footprint and height. Supply all requirements, explicit allowed equalities and vendor-independent synthetic specifications. Paper only."
  ],
  [
    "pcb-designer",
    "power-budget",
    "Check a low-voltage power budget",
    "核對低電壓功率預算",
    "Calculate a fictional low-voltage current budget under explicit operating-state assumptions.",
    "按明確運行狀態假設計算虛構低電壓電流預算。",
    "A: simultaneously active modules. B: explicitly exclusive operating modes. Supply every current, supply limit and additive rule. No mains voltage, construction or real safety approval."
  ],
  [
    "pcb-designer",
    "fabrication-package",
    "Audit a board release package",
    "審查電路板發布文件",
    "Check a documentary fabrication package against a complete fictional file and revision checklist.",
    "按完整虛構檔案及修訂清單核對文件化製板資料。",
    "A: layer-map and drill file mismatch. B: assembly notes and BOM missing required revision. Supply a file manifest and checklist, no actual manufacturing or standards certification."
  ],
  [
    "laboratory-analyst",
    "result-rounding",
    "Review reported precision",
    "審查報告精度",
    "Format established synthetic result values under explicit decimal-place and significant-digit display rules.",
    "按明確小數位及有效數字顯示規則格式化已確立的合成結果數值。",
    "A: format established individual raw results to a specified number of decimal places with positive-decimal round-half-up and required trailing zeros. B: format established individual raw results to a specified number of significant digits with explicit permitted scientific notation. Supply at most six raw decimal-string result rows and a complete display/rounding policy. Prefer unique single-choice questions whose answer labels preserve the correct formatting and meaningful zeros. Deliver a corrected report display column plus an unchanged raw-result column. Do NOT compute averages, replicate precision, QC trends, calibration, acceptance thresholds, pass/fail or release disposition. Do NOT convert units. This is representation precision and formatting, not a QC-release decision or unit-conversion/report-version correction. No real testing procedure."
  ],
  [
    "laboratory-analyst",
    "qc-trend",
    "Read a QC trend log",
    "解讀品控趨勢記錄",
    "Apply a complete fictional run-pattern rule to consecutive QC records and explain the review flag.",
    "按完整虛構連續趨勢規則審查品控記錄，並解釋審查標記。",
    "A: consecutive observations above an explicit centerline. B: a defined monotonic trend count. Supply all records and exact inclusive rules. The deliverable is an annotated sequential trend log identifying run intervals and pattern flags, not a batch acceptance/release decision. Do not calculate replicate averages, compare to product acceptance limits, or hold/release samples. Do not reuse single-batch QC-release decision or statistical certification."
  ],
  [
    "laboratory-analyst",
    "batch-scheduling",
    "Schedule documentary review batches",
    "規劃文件審查批次",
    "Assign fictional report-review batches within stated capacity and priority constraints.",
    "在明確容量及優先限制內安排虛構報告審查批次。",
    "A: review minutes and report deadlines. B: priority queue and reserved review slots. Supply exact durations, order rules and no actual laboratory operating procedure."
  ],
  [
    "environmental-scientist",
    "sampling-coverage",
    "Check monitoring coverage",
    "核對監測覆蓋",
    "Identify location and time coverage gaps against a documentary monitoring plan.",
    "按文件監測計劃找出地點及時間覆蓋缺口。",
    "A: planned locations versus returned records. B: planned periods versus missing records. Supply complete plan, IDs and validity rules. No field collection instructions or health/safety judgment."
  ],
  [
    "environmental-scientist",
    "source-scope",
    "Reconcile environmental source scope",
    "核對環境來源範圍",
    "Classify synthetic source records under explicit inventory categories and reconcile supported totals.",
    "按明確盤點類別分類合成來源記錄，並核對獲支持總數。",
    "A: operational discharge record categories. B: monitoring-region record boundaries. All categories, inclusion rules, units and dates supplied. No regulatory emissions conclusion."
  ],
  [
    "environmental-scientist",
    "monitoring-communication",
    "Write a monitoring update",
    "撰寫監測進度通知",
    "Turn a factual monitoring status log into a clear audience-specific update and follow-up.",
    "把事實監測狀態記錄轉化為清晰對象通知及跟進。",
    "A: incomplete quarterly records for a manager. B: revised timetable for a fictional client. Supply exact status, known limits, review owner and actions. Focus on operational project communication with explicit delivery items, dates, owners and next check. Do not interpret scientific readings, compare environmental thresholds, infer measurement quality or make/edit environmental outcome claims. This is a status-message work product, not another environmental claim audit."
  ],
  [
    "business-analyst",
    "decision-rights",
    "Clarify decision ownership",
    "釐清決策責任",
    "Audit and correct a formal RACI matrix under explicit responsibility and separation-of-duty rules.",
    "按明確責任及職責分離規則審查並修正正式 RACI 矩陣。",
    "A: a three-decision by four-role RACI matrix with duplicate Accountable assignments or a missing Responsible assignment. B: a three-decision by five-role RACI matrix with explicit separation of requester, Responsible executor and Accountable approver. Supply small complete input-only CSV matrix with stable decision IDs and R/A/C/I cell values, exact definitions of all four labels and the authorized RACI assignment for each decision. The completed work product is the corrected responsibility matrix plus a validation checklist, not a cost total or request-routing handover. Four single-choice questions may ask correct Accountable/Responsible/Consulted assignment and the complete sufficient matrix correction. Do NOT classify operational event logs, find booking workflow gaps, sum costs or route requests by cost thresholds. No timeline or service-performance metrics. Every required role/authority must be public and fictional."
  ],
  [
    "business-analyst",
    "requirements-traceability",
    "Trace requirements to evidence",
    "追溯需求證據",
    "Link approved requirements to supplied acceptance evidence and identify missing or conflicting trace links.",
    "把獲批准需求連結至提供接納證據，並找出欠缺或衝突連結。",
    "A: requirement-test IDs. B: changed requirement versions versus evidence. Supply tables with stable IDs and complete traceability rules, no prioritization or generic acceptance drafting."
  ],
  [
    "business-analyst",
    "exception-reconciliation",
    "Reconcile process exceptions",
    "核對流程例外",
    "Reconcile observed exception records against an explicit end-state and owner contract.",
    "按明確完成狀態及負責人合約核對觀察例外記錄。",
    "A: cancelled requests still showing pending handover. B: reopened requests missing final-owner assignment. Supply lifecycle rules, event order and exact query time."
  ],
  [
    "digital-marketing-analyst",
    "lifecycle-funnel",
    "Inspect a lifecycle funnel",
    "檢視生命週期漏斗",
    "Calculate stage progression from disjoint lifecycle cohorts and identify a bounded intervention.",
    "從互不重疊生命週期群組計算階段進度，並找出有限度改善。",
    "A: email onboarding stage counts. B: trial-to-renewal stages. Supply cohort denominators, exact funnel formulas and eligibility, distinguish funnel diagnosis from channel campaign metrics."
  ],
  [
    "digital-marketing-analyst",
    "content-capacity",
    "Plan a content calendar",
    "規劃內容日曆",
    "Select a feasible fictional content schedule under supplied audience, capacity and approval constraints.",
    "按提供受眾、容量及審批限制選擇可行虛構內容日程。",
    "A: bilingual production hours and deadlines. B: channel cadence with shared review capacity. Supply all effort, priorities and exact scheduling/ranking rules. No real publication."
  ],
  [
    "digital-marketing-analyst",
    "campaign-tagging",
    "Audit campaign tracking tags",
    "審查推廣追蹤標籤",
    "Repair a fictional tracking taxonomy and reconcile attribution labels without inventing impact.",
    "修正虛構追蹤分類表，並核對歸因標籤，避免編造影響。",
    "A: source/medium naming mismatch. B: missing campaign IDs and duplicate labels. Supply allowed values, URL records and treatment of missing tags."
  ],
  [
    "frontend-developer",
    "semantic-navigation",
    "Repair semantic navigation",
    "修正語意導覽",
    "Correct supplied navigation markup and a pure helper against explicit focus and current-page rules.",
    "按明確焦點及當前頁面規則修正提供導覽標記及純函數。",
    "A: link semantics and current-page labeling. B: in-page navigation and skip-target contract. Supply complete minimal HTML plus callable pure TypeScript helper and literal outputs, no React imports. Native anchors with href activate with Enter, not Space. Native buttons activate with Enter and Space. onclick does not add Space activation to an anchor. Any fictional rule must agree with these actual platform semantics. A plain focusable div has no native keyboard activation. Do not claim every policy rule is broken unless the actual source violates each one."
  ],
  [
    "frontend-developer",
    "table-state",
    "Keep table state consistent",
    "維持表格狀態一致",
    "Patch a pure table-state function to keep sorting, filtering and paging outputs consistent.",
    "修正純表格狀態函數，以維持排序、篩選及分頁輸出一致。",
    "A: sort change resets page under explicit rule. B: filtering shrinks last page and clamps index. Complete pure TypeScript, tiny row inputs, explicit sorting/tie-break/paging contract."
  ],
  [
    "frontend-developer",
    "design-tokens",
    "Apply design tokens consistently",
    "一致應用設計標記",
    "Repair a supplied component styling map against an explicit token and state contract.",
    "按明確設計標記及狀態合約修正提供元件樣式表。",
    "A: button state colors and spacing. B: alert semantic tokens and labels. Supply complete token values, small CSS and a callable pure style-mapping TypeScript function. This tests token consistency, not responsive layout."
  ],
  [
    "qa-engineer",
    "fixture-isolation",
    "Isolate test fixtures",
    "隔離測試資料",
    "Identify shared-state contamination in supplied test traces and define an independent fixture contract.",
    "從提供測試追蹤找出共享狀態污染，並定義獨立測試資料合約。",
    "A: mutable array reused across tests. B: clock fixture leaking between tests. Provide complete small test snippets and actual trace values. Proposed fixes, not claimed executed tests."
  ],
  [
    "qa-engineer",
    "assertion-strength",
    "Strengthen test assertions",
    "加強測試斷言",
    "Compare supplied implementation mutations against test assertions and propose a discriminating test.",
    "按測試斷言比較提供實作改動，並提出能識別問題的測試。",
    "A: boundary condition mutation survives weak assertions. B: wrong field mapping survives shape-only check. Supply exact code, inputs and outputs and explicit expected behavior. Do not ask aggregate bug counts."
  ],
  [
    "qa-engineer",
    "compatibility-matrix",
    "Build a compatibility matrix",
    "建立相容性矩陣",
    "Select documentary compatibility coverage under an explicit supported-environment policy.",
    "按明確支援環境政策選擇文件相容性覆蓋。",
    "A: browser/device pair coverage. B: locale/input-method combinations. Supply supported combinations, observations, constraints and deterministic coverage gate. No real browser execution claim."
  ],
  [
    "product-manager",
    "roadmap-dependencies",
    "Sequence a product roadmap",
    "排列產品路線圖",
    "Select a feasible feature sequence using explicit product dependencies and value constraints.",
    "按明確產品相依關係及價值限制選擇可行功能次序。",
    "A: prerequisite merchant features. B: capacity-constrained milestone bundles. Supply value scores, costs, prerequisites and exact ranking rule. Focus on roadmap portfolio, not project duration arithmetic."
  ],
  [
    "product-manager",
    "usage-segments",
    "Interpret feature usage segments",
    "解讀功能使用分組",
    "Compare defined adoption cohorts and recommend a bounded product follow-up without causal inference.",
    "比較明確採用群組，並建議有限度產品跟進，避免推斷因果。",
    "A: new versus established merchants. B: small versus large catalogs with minimum-cohort condition. Supply cohort definitions, eligible totals and usage counts, no randomized experiment claim."
  ],
  [
    "product-manager",
    "sunset-migration",
    "Plan a feature sunset",
    "規劃功能退場",
    "Apply a fictional migration gate to user cohorts, replacement readiness and communication obligations.",
    "按虛構遷移門檻審查用戶群組、替代準備及溝通責任。",
    "A: a retiring export format. B: an obsolete notification channel. Supply affected cohorts, migration status, blocker rules, deadlines and approval owner. No actual product shutdown."
  ],
  [
    "security-analyst",
    "retention-review",
    "Review data retention",
    "審查資料保留",
    "Classify synthetic records against a supplied retention policy and document deletion or exception decisions.",
    "按提供保留政策分類合成記錄，並記錄刪除或例外決策。",
    "A: expired access logs with a legal-hold learning assumption. B: support attachments with different retention categories. Supply exact query date, retention periods and precedence. Scenario policy is not legal advice."
  ],
  [
    "security-analyst",
    "vendor-questionnaire",
    "Review vendor security evidence",
    "審查供應商保安證據",
    "Evaluate a fictional vendor questionnaire against explicit documentary evidence requirements.",
    "按明確文件證據要求評估虛構供應商問卷。",
    "A: unverified encryption and backup claims. B: stale incident-response and access-review evidence. Supply a checklist, validity dates and approval owner. No actual vendor attestation or offensive testing."
  ],
  [
    "security-analyst",
    "recovery-evidence",
    "Audit recovery evidence",
    "審查復原證據",
    "Compare a synthetic recovery report to fixed completeness, integrity and timing requirements.",
    "按固定完整性、完整度及時間要求比較合成復原報告。",
    "A: missing table verification. B: checksum and elapsed-time mismatch. Supply every baseline/test result and deterministic gate. No live system recovery action."
  ],
  [
    "mechanical-design-engineer",
    "material-matrix",
    "Compare enclosure materials",
    "比較外殼材料",
    "Select a fictional low-load material option using explicit documentary requirements and ranking.",
    "按明確文件要求及排名選擇虛構低負荷材料方案。",
    "A: density, cost and thickness constraints. B: dimensional stability and price constraints. Supply all fictional properties, units and acceptance thresholds, no certification/load-bearing assurance."
  ],
  [
    "mechanical-design-engineer",
    "mass-cost-estimate",
    "Estimate component mass and cost",
    "估算零件質量及成本",
    "Calculate a synthetic component mass and material cost from supplied dimensions and constants.",
    "按提供尺寸及常數計算合成零件質量及材料成本。",
    "A: rectangular plate minus a rectangular cutout. B: two rectangular parts with explicit waste factor. Supply all units, density and price, exact geometric formulas and rounding. Paper arithmetic only."
  ],
  [
    "mechanical-design-engineer",
    "assembly-documentation",
    "Clarify assembly documentation",
    "釐清組裝文件",
    "Reconcile a fictional assembly sequence with explicit prerequisites and documentary verification.",
    "按明確前提及文件核實要求核對虛構組裝次序。",
    "A: low-load enclosure closure before inspection. B: cable label check before cover handover. Supply every step, prerequisite and evidence record. No real machinery/safety instructions."
  ],
  [
    "supply-chain-planner",
    "forecast-reconciliation",
    "Reconcile demand forecasts",
    "核對需求預測",
    "Reconcile forecast versions and confirmed demand under an explicit planning rule.",
    "按明確規劃規則核對預測版本及已確認需求。",
    "A: regional forecast versions and duplicate orders. B: canceled orders versus frozen forecasts. Supply all horizon dates, inclusion rules and demand units, not a reorder calculation."
  ],
  [
    "supply-chain-planner",
    "inbound-exceptions",
    "Handle inbound delivery exceptions",
    "處理來貨例外",
    "Match fictional arrival records to commitments and prioritize a documentary response.",
    "把虛構到貨記錄與承諾配對，並排列文件跟進優先。",
    "A: short shipment with reserved demand. B: late shipment with substitute eligibility. Supply quantities, dates, service rules and owners, no actual supplier contact."
  ],
  [
    "supply-chain-planner",
    "stock-aging",
    "Review aging inventory",
    "審查老化庫存",
    "Classify inventory age and choose eligible actions under a fictional stock policy.",
    "按虛構庫存政策分類庫齡，並選擇合資格行動。",
    "A: slow-moving component lots. B: review-date and hold-status exceptions. Supply exact query date, receipt dates, aging thresholds and approval rules, no real disposal instructions."
  ],
  [
    "operations-planner",
    "shift-handover",
    "Reconcile an operations handover",
    "核對營運交接",
    "Reconcile open items, owner assignments and completion evidence across shift logs.",
    "核對輪班記錄的未完成項目、負責人及完成證據。",
    "A: unresolved merchant requests. B: reopened service exceptions. Supply explicit ownership/status rules and event order, no real workforce management."
  ],
  [
    "operations-planner",
    "queue-throughput",
    "Measure queue throughput",
    "量度隊列吞吐量",
    "Calculate queue balance and throughput from complete arrivals and completion records.",
    "按完整到達及完成記錄計算隊列結餘及吞吐量。",
    "A: hourly service queue arrivals/completions. B: transfers and canceled items with exact counting rules. Supply initial balance and no double-counting convention. Not a capacity allocation task."
  ],
  [
    "operations-planner",
    "control-exceptions",
    "Review process control exceptions",
    "審查流程控制例外",
    "Apply a supplied operational control checklist to synthetic exception records and route follow-up.",
    "按提供營運控制清單審查合成例外記錄，並分流跟進。",
    "A: missing confirmation check. B: reconciliation interval exceeded. Supply exact thresholds, time query and responsible owners, no live operational action."
  ],
  [
    "financial-analyst",
    "scenario-sensitivity",
    "Test a financial sensitivity",
    "測試財務敏感度",
    "Calculate a supplied scenario model under defined input changes and compare bounded outcomes.",
    "在明確輸入改變下計算提供情境模型，並比較有限度結果。",
    "A: demand and price sensitivity. B: cost and utilization sensitivity. Supply complete baseline/formula and exact ranking, no investment/tax advice."
  ],
  [
    "financial-analyst",
    "cash-runway",
    "Build a cash runway schedule",
    "建立現金可用期表",
    "Calculate fictional closing cash by period using explicit receipts, payments and minimum-balance rules.",
    "按明確收款、付款及最低結餘規則計算虛構各期結餘。",
    "A: fixed monthly receipts/payments. B: one-time payment and delayed receipt. Supply positive opening cash and sign conventions. No real treasury or lending recommendation."
  ],
  [
    "financial-analyst",
    "cost-allocation",
    "Allocate shared service costs",
    "分配共享服務成本",
    "Allocate synthetic pooled costs by a declared driver and reconcile totals.",
    "按聲明分配基準分配合成共同成本，並核對總額。",
    "A: support minutes by service team. B: usage units with an exempt category. Supply all pool values, driver totals and rounding/remainder policy, no professional accounting advice."
  ],
  [
    "research-analyst",
    "source-traceability",
    "Trace research claims to sources",
    "追溯研究聲明來源",
    "Check whether documentary claims match supplied source excerpts, versions and scope.",
    "核對文件聲明是否符合提供來源摘錄、版本及範圍。",
    "A: misattributed report citation. B: outdated source version and missing qualifier. Provide all fictional excerpts and claim IDs, no external research needed."
  ],
  [
    "research-analyst",
    "coding-consistency",
    "Review qualitative coding",
    "審查質性編碼",
    "Apply a complete codebook to fictional excerpts and reconcile inconsistent labels.",
    "按完整編碼指引分類虛構摘錄，並核對不一致標籤。",
    "A: single-label categories with precedence. B: allowed multiple labels with explicit definitions. Supply anonymized invented excerpts and unambiguous coding rules, avoid real participant data."
  ],
  [
    "research-analyst",
    "missing-data-sensitivity",
    "Bound a missing-data result",
    "界定缺失資料結果",
    "Calculate supported lower and upper bounds under explicit missing-observation assumptions.",
    "按明確缺失觀察假設計算獲支持下限及上限。",
    "A: binary outcome missing records. B: bounded rating values. Supply total planned observations, observed outcomes and all bounds. Do not invent confidence intervals or causal claims."
  ],
  [
    "project-coordinator",
    "status-raid",
    "Prepare a project status update",
    "準備項目狀態報告",
    "Classify project risks, assumptions, issues and dependencies and produce a factual status update.",
    "分類項目風險、假設、問題及相依關係，並提出事實狀態報告。",
    "A: unresolved approval and emerging delay. B: delivered item with missing acceptance and resource risk. Supply exact category rules, owners and traffic-light status gate."
  ],
  [
    "project-coordinator",
    "controlled-documents",
    "Prepare a controlled handover",
    "準備受控文件交接",
    "Audit project document versions, approval and audience permissions to create a controlled handover manifest.",
    "審查項目文件版本、審批及受眾權限，以建立受控交接清單。",
    "A: a four-file documentary package with conflicting revision labels and missing approval metadata. B: a four-file package with audience classification and expired approval metadata at an explicit query date. Supply an input-only CSV file manifest, the required-file checklist, exact approved revision IDs, permitted audience/classification mapping, approval validity and named release owner. Use revision strings such as R2 or R3 instead of bare decimal numbers. Deliver a corrected controlled release manifest and hold list with the applicable approval/access reasons. Four questions should assess eligible file set, approved revision selection, audience-permission decision and the complete sufficient release/hold handover. This is documentary metadata review only, actual underlying report files are not needed. Do NOT calculate task schedules, dependencies, durations, float or budget. No real property operation, construction or safety approval."
  ],
  [
    "project-coordinator",
    "action-closure",
    "Close meeting actions",
    "完成會議跟進項目",
    "Reconcile action-register claims with required evidence, due dates and ownership.",
    "按所需證據、到期日及責任核對行動記錄聲明。",
    "A: marked-complete actions missing evidence. B: reassigned actions with unclear approval. Supply absolute query date, completion rules and owner matrix, no meeting messages sent."
  ],
  [
    "core-manufacturing-analyst",
    "scrap-cost",
    "Explain scrap cost drivers",
    "解釋報廢成本原因",
    "Calculate synthetic scrap costs and identify the supported cost concentration.",
    "計算合成報廢成本，並找出有證據支持的成本集中項目。",
    "A: scrapped units and unit material costs. B: recoverable value offsets by category. Supply small input-only CSV, full formula and category/eligibility rules. No inferred production root cause."
  ],
  [
    "core-manufacturing-analyst",
    "downtime-pareto",
    "Prioritise downtime evidence",
    "排列停機證據",
    "Aggregate documentary downtime categories and select the explicitly defined highest-impact review.",
    "彙總文件停機類別，並選擇明確定義最高影響的審查。",
    "A: minutes by event category. B: repeated event IDs and planned exclusions. Supply input-only CSV, duration units, deduplication and tie-break rules. No real maintenance instructions."
  ],
  [
    "core-manufacturing-analyst",
    "dispatch-sequencing",
    "Sequence production dispatches",
    "排列生產派工",
    "Apply a fictional dispatch rule to complete job records and explain the supported sequence.",
    "按完整工單記錄應用虛構派工規則，並解釋獲支持次序。",
    "A: earliest due day with priority tie-break. B: promised day and ready-state eligibility. Supply input-only CSV, relative days and exact deterministic order. No factory operation/safety instruction."
  ],
  [
    "core-accounting-assistant",
    "accrual-prepayment",
    "Prepare an expense timing schedule",
    "準備費用時點表",
    "Classify fictional prepaid and accrued expense amounts under supplied period-allocation rules.",
    "按提供期間分配規則分類虛構預付及應計費用金額。",
    "A: prepaid service covering equal months. B: received service with unpaid invoice. Supply input-only CSV, exact period boundaries, positive amounts and explicit recognition formulas. No tax/professional advice."
  ],
  [
    "core-accounting-assistant",
    "receivables-aging",
    "Review aged receivables",
    "審查逾期應收款",
    "Calculate invoice aging and select a documentary follow-up under an explicit fictional policy.",
    "按明確虛構政策計算發票逾期日數，並選擇文件跟進。",
    "A: due dates and unpaid amounts. B: partial settlements and disputed invoices. Supply input-only CSV, exact query date and inclusive overdue convention. No real customer identifiers or collection action."
  ],
  [
    "core-accounting-assistant",
    "expense-policy",
    "Review expense submissions",
    "審查開支申報",
    "Apply a supplied expense eligibility and approval policy to synthetic claims and document holds.",
    "按提供開支資格及審批政策審查合成申報，並記錄暫停項目。",
    "A: receipt and category cap requirements. B: duplicate references and prior approval. Supply input-only CSV, all limits and review owner, no actual reimbursement."
  ],
  [
    "core-marketing-analyst",
    "funnel-dropoff",
    "Find a funnel drop-off",
    "找出漏斗流失",
    "Calculate adjacent-stage conversion and locate the explicitly defined largest drop-off.",
    "計算相鄰階段轉換率，並找出明確定義最大流失。",
    "A: landing/signup/activation counts. B: trial/use/renewal counts. Supply input-only CSV, one disjoint cohort per table, all denominators and exact ranking. No causal claim."
  ],
  [
    "core-marketing-analyst",
    "budget-pacing",
    "Review campaign budget pacing",
    "審查推廣預算進度",
    "Calculate spend pacing against an explicit elapsed-time budget rule and recommend a bounded adjustment.",
    "按明確經過時間預算規則計算開支進度，並建議有限度調整。",
    "A: linear daily pacing. B: predeclared weighted-week schedule. Supply input-only CSV, total budget, full horizon and exact query day. No real advertising spend."
  ],
  [
    "core-marketing-analyst",
    "message-audience",
    "Match messages to an audience",
    "配對受眾訊息",
    "Select a supported message using fictional audience evidence and a supplied approval rule.",
    "按虛構受眾證據及提供審批規則選擇有證據支持的訊息。",
    "A: ranked needs by opt-in audience segment. B: evidence strength and prohibited claim constraints. Supply input-only CSV, exact evidence thresholds, complete candidate copy and approval owner. No real identifiers or inferred consent."
  ]
]

/** Additional competencies have new identities. Existing families and snapshots stay fixed. */
export const expansionTaskFamilies: TaskFamily[] = specs.map(([roleId,suffix,en,zh,objectiveEn,objectiveZh,seeds]) => {
  const id = `${roleId}-${suffix}`
  const objective = t(objectiveEn,objectiveZh)
  return {
    id, roleId, title:t(en,zh), description:objective, objective, duration:20,
    criteria:[
      {id:'domain-accuracy',label:t('Decision accuracy','決策準確度'),description:t(`Correctly applies the supplied rules and calculations. ${objectiveEn}`,`正確應用提供的規則及計算。${objectiveZh}`),points:25},
      {id:'source-reasoning',label:t('Evidence and reasoning','證據及推理'),description:t('Connects decisions to specific supplied records and explains the reasoning.','把決策連結至具體提供記錄，並解釋推理。'),points:25},
      {id:'verification-plan',label:t('Verification and next steps','核實及下一步'),description:t('Proposes concrete checks and next actions that test the stated requirements.','提出具體檢查及下一步，以測試聲明要求。'),points:20},
      {id:'bounded-claims',label:t('Scope and uncertainty','範圍及不確定性'),description:t('Acknowledges missing evidence and limits claims to the fictional scenario and assumptions.','承認欠缺證據，並把聲明限於虛構情境及假設。'),points:15},
      {id:'usable-handover',label:t('Clear working handover','清晰工作交接'),description:t('Writes an actionable handover with decisions, evidence and applicable ownership or escalation.','撰寫可行交接，列明決策、證據及適用責任或轉交。'),points:15},
    ],
    rubricVersion:`lumio-family-2026-10-12.1:${id}`,
    variationGuideline:t(`${seeds} Use a small complete input-only CSV data table wherever the exercise uses numeric or tabular evidence, with stable identifiers, explicit units and all source values in both locales. Do not prefill the correct result in source files. Every source document body, including a CSV or code-only extract, must include a short meaningful Traditional Chinese explanation in its Chinese version. Preserve machine identifiers and code/data values unchanged while translating the surrounding explanation. All policy and acceptance rules must be public. Create four meaningful questions and a finished-file/handover deliverable. Each variant requires fresh reasoning and materially different correct outputs. Cosmetic name/date/option changes alone do not count. Keep the family objective and fixed rubric.`, `使用少量完整 CSV 原始資料表，列明穩定識別碼、單位及所有雙語原始數值，不預填正確結果。所有政策及接納規則須公開。建立四條有意義問題及完成檔案與交接成果。每個變體須重新推理，並產生實質不同的正確結果。只改名稱、日期或選項次序不足夠，須保留任務目標及固定評分準則。情境種子：${seeds}`),
  }
})
