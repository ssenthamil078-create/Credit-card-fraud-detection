import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  formatCompact,
  formatCurrency,
  modelContributorsFrom,
  navItems,
  toAuditEntries,
  toFraudCase,
  type AuditEntry,
  type CaseStatus,
  type FraudDataset,
  type FraudCase,
  type ViewName,
} from './fraudData'

type Role = 'L1 Analyst' | 'L2 Analyst' | 'Admin'
type User = { id: string; name: string; initials: string; role: Role }

const USERS: User[] = [
  { id: 'u1', name: 'A. Rivera', initials: 'AR', role: 'L1 Analyst' },
  { id: 'u2', name: 'M. Chen', initials: 'MC', role: 'L2 Analyst' },
  { id: 'u3', name: 'S. Patel', initials: 'SP', role: 'Admin' },
]

const iconPaths: Record<string, string> = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  inbox: 'M4 6.5h16v12H4zM8 4h8v2.5H8zM9 11h6M9 15h4',
  pulse: 'M3 12h3l2.2-6 4.1 12 2.2-6H21',
  history: 'M4 12a8 8 0 1 0 2.34-5.66L4 8.67M4 4v4.67h4.67M12 8v4l2.7 1.7',
  bell: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8.5h18C21 16 18 16 18 9ZM10 21h4',
  search: 'm20 20-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  chevron: 'm9 18 6-6-6-6',
  play: 'm8 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2M5 10h14v10H5z',
  shield: 'M12 3 20 6v5c0 5.2-3.3 8.8-8 10-4.7-1.2-8-4.8-8-10V6l8-3Z',
  close: 'M6 6l12 12M18 6 6 18',
  filter: 'M4 6h16M7 12h10M10 18h4',
  bolt: 'm13 2-9 12h7l-1 8 9-12h-7l1-8Z',
  external: 'M14 4h6v6M20 4l-9 9M18 13v6H4V5h6',
  check: 'm5 12 4 4L19 6',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M8 14v6',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  dot: 'M12 12h.01',
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg aria-hidden="true" className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={iconPaths[name] ?? iconPaths.dot} />
    </svg>
  )
}

function RiskBadge({ score, compact = false }: { score: number; compact?: boolean }) {
  const band = score >= 90 ? 'critical' : score >= 75 ? 'high' : score >= 45 ? 'review' : 'low'
  const label = score >= 90 ? 'Critical' : score >= 75 ? 'High' : score >= 45 ? 'Review' : 'Low'
  return <span className={`risk-badge risk-${band} ${compact ? 'is-compact' : ''}`}><span className="risk-dot" />{label} <strong>{score}</strong></span>
}

function MetricCard({ label, value, detail, trend, tone = 'mint', icon }: { label: string; value: string; detail: string; trend: string; tone?: string; icon: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-topline"><span className="eyebrow">{label}</span><span className="metric-icon"><Icon name={icon} size={16} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottomline"><span>{detail}</span><span className="metric-trend">{trend}</span></div>
    </article>
  )
}

function PanelHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return <div className="panel-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>
}

function SignalBar({ label, value, color = 'mint', detail }: { label: string; value: number; color?: string; detail?: string }) {
  return (
    <div className="signal-row">
      <div className="signal-meta"><span>{label}</span><strong>{detail ?? `${value}%`}</strong></div>
      <div className="signal-track"><span className={`signal-fill fill-${color}`} style={{ width: `${value}%` }} /></div>
    </div>
  )
}

function CaseRow({ item, onSelect }: { item: FraudCase; onSelect: (item: FraudCase) => void }) {
  return (
    <button className="case-row" onClick={() => onSelect(item)}>
      <span className="case-id"><span className={`case-status-dot status-${item.status.toLowerCase().replace(' ', '-')}`} />{item.id}<small className="case-state-label">{item.remediation ?? item.feedback ?? item.status}</small></span>
      <span className="case-merchant"><strong>{item.merchant}</strong><small>{item.category}</small></span>
      <span className="case-location"><strong>{item.location}</strong><small>{item.time} · {item.velocity}</small></span>
      <span className="case-amount"><strong>{formatCurrency(item.amount)}</strong><small>{item.source}</small></span>
      <span className="case-risk"><RiskBadge score={item.risk} compact /></span>
      <span className="case-arrow"><Icon name="chevron" size={16} /></span>
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="check" size={18} /></div><p>{message}</p></div>
}

function App() {
  const [activeView, setActiveView] = useState<ViewName>('overview')
  const [streaming, setStreaming] = useState(true)
  const [liveTick, setLiveTick] = useState(0)
  const [dataset, setDataset] = useState<FraudDataset | null>(null)
  const [loadError, setLoadError] = useState('')
  const [cases, setCases] = useState<FraudCase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [riskFilter, setRiskFilter] = useState('All risk')
  const [statusFilter, setStatusFilter] = useState('All status')
  const [search, setSearch] = useState('')
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [toast, setToast] = useState('')
  const [currentUser, setCurrentUser] = useState<User>(USERS[0])
  const [showUserMenu, setShowUserMenu] = useState(false)

  useEffect(() => {
    let mounted = true
    const api = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    fetch(api ? `${api}/api/dataset` : '/data/fraud_dataset.json')
      .catch(() => fetch('/data/fraud_dataset.json'))
      .then((response) => {
        if (!response.ok) throw new Error(`Dataset request failed (${response.status})`)
        return response.json() as Promise<FraudDataset>
      })
      .then((payload) => {
        if (!mounted) return
        setDataset(payload)
        setCases(payload.transactions.map(toFraudCase))
        setAudit(toAuditEntries(payload.transactions))
      })
      .catch((error: unknown) => {
        if (mounted) setLoadError(error instanceof Error ? error.message : 'Unable to load processed dataset')
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!streaming) return
    const interval = window.setInterval(() => setLiveTick((tick) => tick + 1), 4800)
    return () => window.clearInterval(interval)
  }, [streaming])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 3300)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const selectedCase = cases.find((item) => item.id === selectedId) ?? null
  const filteredCases = useMemo(() => cases.filter((item) => {
    const matchesRisk = riskFilter === 'All risk' || item.band === riskFilter
    const matchesStatus = statusFilter === 'All status' || item.status === statusFilter
    const query = search.trim().toLowerCase()
    const matchesSearch = !query || [item.id, item.card, item.merchant, item.location].join(' ').toLowerCase().includes(query)
    return matchesRisk && matchesStatus && matchesSearch
  }), [cases, riskFilter, statusFilter, search])

  const datasetEvents = useMemo(() => cases.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((item) => ({
    id: item.id,
    time: item.time,
    merchant: item.merchant,
    amount: formatCurrency(item.amount),
    location: item.location,
    score: item.risk,
    label: item.status === 'Cleared' ? 'OBSERVED' : item.status === 'Needs review' ? 'REVIEW' : 'FLAGGED',
    tone: item.status === 'Cleared' ? 'positive' as const : item.risk >= 75 ? 'danger' as const : 'warning' as const,
  })), [cases])
  const visibleEvents = useMemo(() => {
    if (!datasetEvents.length) return []
    const offset = liveTick % datasetEvents.length
    return [...datasetEvents.slice(offset), ...datasetEvents.slice(0, offset)].slice(0, 5)
  }, [datasetEvents, liveTick])

  const openCount = cases.filter((item) => item.status === 'Open' || item.status === 'Needs review').length
  const blockedCount = dataset?.summary.blocked_estimate ?? 0
  const modelContributors = useMemo(() => modelContributorsFrom(dataset?.transactions ?? []), [dataset])
  const analytics = useMemo(() => {
    const items = dataset?.transactions ?? []
    const summary = dataset?.summary
    const categoryCounts = summary?.category_counts ?? {}
    const topCategory = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)[0]
    const hourCounts = items.reduce<Record<string, number>>((counts, item) => {
      const hour = new Date(item.timestamp).getUTCHours().toString().padStart(2, '0')
      counts[hour] = (counts[hour] ?? 0) + 1
      return counts
    }, {})
    const typicalHour = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'
    const average = (selector: (item: typeof items[number]) => number) => items.length ? items.reduce((total, item) => total + selector(item), 0) / items.length : 0
    const normalItems = items.filter((item) => !item.is_fraud)
    const averageNormalRisk = normalItems.length ? normalItems.reduce((total, item) => total + item.risk_score, 0) / normalItems.length : 0
    const fraudRatio = summary?.fraud_count ? Math.round((summary.row_count - summary.fraud_count) / summary.fraud_count) : 0
    return {
      topCategory: topCategory ? topCategory[0].replace(/_/g, ' ') : '—',
      topCategoryShare: topCategory && summary?.row_count ? Math.round((topCategory[1] / summary.row_count) * 100) : 0,
      typicalHour,
      normalConfidence: Math.round(Math.max(0, Math.min(100, 100 - averageNormalRisk))),
      averageVelocity5m: average((item) => item.velocity_5m),
      averageVelocity1h: average((item) => item.velocity_1h),
      maxTravelDistance: Math.max(0, ...items.map((item) => item.distance_km)),
      maxTravelSpeed: Math.max(0, ...items.map((item) => item.travel_speed_kmh)),
      fraudRatio,
      latestRisk: items.length ? items[items.length - 1].risk_score : 0,
    }
  }, [dataset])
  const summary = dataset?.summary
  const selectedViewTitle = activeView === 'overview' ? 'Operational overview' : activeView === 'cases' ? 'Case queue' : activeView === 'analytics' ? 'Model signals' : 'Audit trail'
  const selectedViewSubtitle = activeView === 'overview' ? 'Real-time transaction intelligence' : activeView === 'cases' ? 'Review, explain, and resolve flagged activity' : activeView === 'analytics' ? 'Behavioral baselines and ensemble diagnostics' : 'Decision history, latency, and model lineage'

  const addAudit = (entry: { action: string; subject: string; detail: string; actor: string; tone: 'danger' | 'warning' | 'positive' | 'neutral' }) => {
    setAudit((current) => [{ id: `AU-${Date.now()}`, time: 'just now', latency: '—', ...entry }, ...current])
  }

  const updateSelectedCase = (status: CaseStatus, message: string, action: string, tone: 'danger' | 'warning' | 'positive' | 'neutral', changes: Partial<Pick<FraudCase, 'remediation' | 'feedback'>> = {}) => {
    if (!selectedCase) return
    setCases((current) => current.map((item) => item.id === selectedCase.id ? { ...item, status, ...changes } : item))
    addAudit({ action, subject: selectedCase.id, detail: message, actor: currentUser.name, tone })
    const api = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    if (api) fetch(`${api}/api/cases/${selectedCase.id}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, status, detail: message, actor: currentUser.name, role: currentUser.role, feedback: changes.feedback ?? null }) }).catch(() => {})
    setToast(message)
  }

  const handleSelectCase = (item: FraudCase) => setSelectedId(item.id)
  const handleClearAlert = () => updateSelectedCase('Cleared', 'Alert cleared · case marked resolved', 'Alert cleared', 'positive', { remediation: undefined })
  const handleLockCard = () => updateSelectedCase('Escalated', 'Card locked · transaction activity blocked', 'Card locked', 'danger', { remediation: 'Card locked' })
  const handleStepUp = () => updateSelectedCase('Needs review', 'Step-up authentication required · case held for verification', 'Step-up requested', 'warning', { remediation: 'Step-up authentication required' })
  const handleFeedback = (kind: 'Confirmed fraud' | 'False positive' | 'Needs review') => {
    const status = kind === 'False positive' ? 'Cleared' : kind === 'Confirmed fraud' ? 'Escalated' : 'Needs review'
    updateSelectedCase(status, `Feedback recorded · ${kind.toLowerCase()}`, 'Analyst feedback', kind === 'False positive' ? 'positive' : kind === 'Confirmed fraud' ? 'danger' : 'warning', { feedback: kind, remediation: undefined })
  }
  const handleExportReport = () => {
    if (!dataset) return
    const report = {
      report_type: 'FraudOps case and transaction report',
      generated_at: new Date().toISOString(),
      source: dataset.metadata.source_file,
      summary: dataset.summary,
      metadata: dataset.metadata,
      cases: cases.map((item) => ({
        case_id: item.id,
        transaction_id: item.transactionId,
        timestamp: item.timestamp,
        merchant: item.merchant,
        category: item.category,
        card: item.card,
        amount: item.amount,
        location: item.location,
        risk_score: item.risk,
        risk_band: item.band,
        status: item.status,
        remediation: item.remediation ?? null,
        analyst_feedback: item.feedback ?? null,
        reason: item.reason,
        feature_signals: item.features,
        labeled_fraud: item.isFraud,
      })),
      audit_trail: audit,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fraudops-report-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setToast(`Report exported · ${cases.length.toLocaleString()} cases included`)
    addAudit({ action: 'Report exported', subject: 'DATASET', detail: `${cases.length.toLocaleString()} browser cases and current audit trail downloaded`, actor: currentUser.name, tone: 'positive' })
  }

  if (loadError) return <div className="data-state"><span className="eyebrow">FraudOps / dataset error</span><h1>Could not load the processed dataset.</h1><p>{loadError}</p><button className="secondary-button" onClick={() => window.location.reload()}>Retry dataset load</button></div>
  if (!dataset) return <div className="data-state"><span className="eyebrow accent-eyebrow"><span className="live-dot" />Loading uploaded dataset</span><h1>Preparing the signal layer.</h1><p>Reading the processed transaction payload and derived fraud features.</p></div>

  const canLockCard = currentUser.role === 'Admin';
  const canStepUp = currentUser.role === 'L2 Analyst' || currentUser.role === 'Admin';
  const canClearAlert = currentUser.role === 'L2 Analyst' || currentUser.role === 'Admin';
  const canConfirmFraud = currentUser.role === 'L2 Analyst' || currentUser.role === 'Admin';

  const renderOverview = () => (
    <>
      <section className="hero-grid">
        <div className="hero-copy">
          <span className="eyebrow accent-eyebrow"><span className="live-dot" />Dataset live · processed upload</span>
          <h1>Intercept the outlier<br /><em>before it becomes a loss.</em></h1>
          <p>Explainable fraud decisions across every signal, from card velocity to behavioral drift.</p>
          <div className="hero-meta"><span><i className="mini-dot dot-mint" />Derived heuristic v1</span><span><i className="mini-dot dot-cyan" />{summary.evaluation.recall}% recall</span><span><i className="mini-dot dot-slate" />{formatCompact(summary.row_count)} source rows</span></div>
        </div>
        <div className="hero-signal-card">
          <div className="hero-signal-top"><span className="eyebrow">Current signal load</span><span className="signal-live"><span className="live-dot" />streaming</span></div>
          <div className="trace-visual"><span className="trace-axis" /><div className="trace-bars">{[34, 52, 42, 74, 58, 88, 66, 93, 61, 76, 48, 82].map((height, index) => <i key={index} style={{ height: `${height}%`, animationDelay: `${index * 80}ms` }} />)}</div></div>
          <div className="hero-signal-bottom"><strong>{formatCompact(summary.row_count)}</strong><span>transactions in file</span><span className="signal-latency">{summary.fraud_rate}% labeled fraud</span></div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="Transactions loaded" value={formatCompact(summary.row_count)} detail="from uploaded file" trend={`${cases.length} in browser`} tone="mint" icon="pulse" />
        <MetricCard label="Fraud labels" value={formatCompact(summary.fraud_count)} detail="observed in dataset" trend={`${summary.fraud_rate}% rate`} tone="coral" icon="shield" />
        <MetricCard label="Average amount" value={formatCurrency(summary.average_amount)} detail="across all traffic" trend={`median ${formatCurrency(summary.median_amount)}`} tone="cyan" icon="bolt" />
        <MetricCard label="Open cases" value={openCount.toString().padStart(2, '0')} detail="derived risk queue" trend={`${formatCompact(summary.review_estimate)} review`} tone="amber" icon="inbox" />
      </section>

      <section className="content-grid overview-content">
        <div className="panel live-panel">
          <PanelHeading eyebrow="Stream / 01" title="Live transaction feed" action={<button className="text-button" onClick={() => setStreaming((current) => !current)}><Icon name={streaming ? 'pause' : 'play'} size={14} />{streaming ? 'Pause stream' : 'Resume stream'}</button>} />
          <div className="stream-summary"><div><strong>{streaming ? 'Dataset replay active' : 'Dataset replay paused'}</strong><span>{streaming ? 'Cycling through uploaded transactions · no synthetic events' : 'Resume to continue browsing the uploaded records'}</span></div><div className={`stream-pill ${streaming ? 'is-live' : 'is-paused'}`}><span className="live-dot" />{streaming ? 'REPLAY' : 'PAUSED'}</div></div>
          <div className="event-list">{visibleEvents.map((event) => <div className="event-row" key={event.id}><span className="event-time">{event.time}</span><span className="event-merchant"><strong>{event.merchant}</strong><small>{event.location} · {event.id}</small></span><span className="event-amount">{event.amount}</span><span className="event-score"><RiskBadge score={event.score} compact /></span><span className={`event-action action-${event.tone}`}>{event.label}</span></div>)}</div>
          <div className="panel-footnote"><span><i className="mini-dot dot-mint" />Velocity checks derived</span><span><i className="mini-dot dot-cyan" />Geo-velocity derived</span><span><i className="mini-dot dot-slate" />Record {String(liveTick + 1).padStart(2, '0')}</span></div>
        </div>
        <aside className="panel health-panel">
          <PanelHeading eyebrow="System / 02" title="Model health" action={<button className="icon-button" aria-label="Open analytics" onClick={() => setActiveView('analytics')}><Icon name="external" size={15} /></button>} />
          <div className="health-score"><div className="health-ring"><span>{summary.evaluation.precision}<span>%</span></span></div><div><strong>Dataset scored</strong><p>Derived risk heuristic evaluated against the uploaded fraud label.</p></div></div>
          <div className="health-list"><div><span>Precision</span><strong className="text-mint">{summary.evaluation.precision}%</strong></div><div><span>Recall</span><strong>{summary.evaluation.recall}%</strong></div><div><span>Velocity alerts</span><strong className="text-amber">{formatCompact(summary.velocity_alerts)}</strong></div><div><span>Geo-velocity alerts</span><strong>{formatCompact(summary.geo_velocity_alerts)}</strong></div></div>
          <div className="health-footer"><span className="model-chip">Heuristic v1</span><span className="model-chip">SMOTE ready</span><span className="model-chip">Faker fields</span></div>
        </aside>
      </section>

      <section className="panel case-panel">
        <PanelHeading eyebrow="Queue / 03" title="Flagged transactions" action={<button className="text-button" onClick={() => setActiveView('cases')}>Open case queue <Icon name="arrow" size={14} /></button>} />
        <div className="case-table-head"><span>Case</span><span>Merchant</span><span>Location / velocity</span><span>Amount</span><span>Risk</span><span /></div>
        <div className="case-list">{cases.slice().sort((a, b) => b.risk - a.risk).slice(0, 4).map((item) => <CaseRow key={item.id} item={item} onSelect={handleSelectCase} />)}</div>
      </section>
    </>
  )

  const renderCases = () => (
    <section className="page-section">
      <div className="page-intro"><div><span className="eyebrow accent-eyebrow">Analyst workspace</span><h1>Case queue</h1><p>Prioritize the highest-signal outliers, inspect the why, and leave a trace.</p></div><div className="queue-stat"><span className="eyebrow">Unresolved</span><strong>{openCount.toString().padStart(2, '0')}</strong><span>cases</span></div></div>
      <div className="panel case-panel full-case-panel">
        <div className="filter-bar"><div className="search-field"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search case, card, merchant..." aria-label="Search cases" /></div><div className="filter-group"><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} aria-label="Filter by risk"><option>All risk</option><option>Critical</option><option>High</option><option>Review</option><option>Low</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status"><option>All status</option><option>Open</option><option>Needs review</option><option>Escalated</option><option>Cleared</option></select><button className="filter-button" onClick={() => { setRiskFilter('All risk'); setStatusFilter('All status'); setSearch('') }}><Icon name="filter" size={15} />Reset</button></div></div>
        <div className="case-table-head case-table-head-full"><span>Case</span><span>Merchant</span><span>Location / velocity</span><span>Amount</span><span>Risk</span><span /></div>
        <div className="case-list case-list-full">{filteredCases.length ? filteredCases.map((item) => <CaseRow key={item.id} item={item} onSelect={handleSelectCase} />) : <EmptyState message="No cases match the current filters." />}</div>
        <div className="table-footer"><span>Showing {filteredCases.length} of {cases.length} cases</span><span>Sorted by risk score <Icon name="chevron" size={13} /></span></div>
      </div>
    </section>
  )

  const renderAnalytics = () => (
    <section className="page-section">
      <div className="page-intro"><div><span className="eyebrow accent-eyebrow">Signal lab</span><h1>Model signals</h1><p>Every risk score is a conversation between behavior, context, and ensemble models.</p></div><div className="analytics-toggle"><button className="is-active">Live signals</button><button>Diagnostics</button></div></div>
      <div className="analytics-grid">
        <div className="panel analytics-panel behavior-panel"><PanelHeading eyebrow="Profile / 01" title="Behavioral baseline" action={<span className="status-label status-good"><span className="live-dot" />Learning</span>} /><div className="baseline-copy"><strong>Normal pattern confidence <span>{analytics.normalConfidence}%</span></strong><p>Confidence is derived from the average risk of non-fraud transactions.</p></div><div className="baseline-chart"><div className="chart-y"><span>$4k</span><span>$2k</span><span>$0</span></div><div className="chart-grid"><i /><i /><i /><i /><i /><span className="baseline-line" /><span className="baseline-point point-1" /><span className="baseline-point point-2" /><span className="baseline-point point-3" /><span className="baseline-point point-4" /><span className="baseline-point point-5" /><span className="baseline-point point-6" /></div><div className="chart-x"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Now</span></div></div><div className="mini-stat-grid"><div><span>Avg. spend</span><strong>{formatCurrency(summary.average_amount)}</strong><small>per transaction</small></div><div><span>Top category</span><strong>{analytics.topCategory}</strong><small>{analytics.topCategoryShare}% of activity</small></div><div><span>Typical hour</span><strong>{analytics.typicalHour}:00</strong><small>UTC mode</small></div></div></div>
        <div className="panel analytics-panel velocity-panel"><PanelHeading eyebrow="Context / 02" title="Velocity & geo-velocity" action={<span className="status-label status-warn"><span className="live-dot" />{formatCompact(summary.geo_velocity_alerts)} alerts</span>} /><div className="velocity-map"><div className="radar-grid"><span /><span /><span /><span /><i className="radar-center" /><i className="radar-point radar-a" /><i className="radar-point radar-b" /><i className="radar-point radar-c" /></div><div className="velocity-callout"><strong>{formatCompact(analytics.maxTravelDistance)} km</strong><span>maximum card travel distance</span></div></div><div className="velocity-stats"><div><span>5 min window</span><strong>{analytics.averageVelocity5m.toFixed(1)} <small>tx / card</small></strong></div><div><span>1 hr window</span><strong>{analytics.averageVelocity1h.toFixed(1)} <small>tx / card</small></strong></div><div><span>Distance check</span><strong className="text-coral">{formatCompact(summary.geo_velocity_alerts)} <small>alerts</small></strong></div></div></div>
        <div className="panel analytics-panel vector-panel"><PanelHeading eyebrow="Similarity / 03" title="Vector anomaly" action={<span className="model-chip">derived score</span>} /><div className="vector-score"><div className="vector-number">{(1 - analytics.latestRisk / 100).toFixed(2)}</div><div><span>similarity to normal</span><strong>{analytics.latestRisk >= 75 ? 'Outlier cluster' : 'Within baseline'} <i className={`mini-dot ${analytics.latestRisk >= 75 ? 'dot-coral' : 'dot-mint'}`} /></strong></div></div><div className="vector-orbit"><span className="orbit orbit-1" /><span className="orbit orbit-2" /><span className="orbit orbit-3" /><i className="orbit-point o1" /><i className="orbit-point o2" /><i className="orbit-point o3" /><i className="orbit-point o4" /><i className="orbit-point o5" /><b className="orbit-core">TX</b></div><div className="vector-footer"><span><i className="mini-dot dot-cyan" />Historical pattern</span><span><i className="mini-dot dot-coral" />Latest transaction</span></div></div>
        <div className="panel analytics-panel ensemble-panel"><PanelHeading eyebrow="Ensemble / 04" title="Feature contribution" action={<span className="status-label status-good">heuristic v1</span>} /><div className="ensemble-summary"><strong>Dynamic risk score</strong><span>aggregated from derived features</span><b>{analytics.latestRisk} <small>/ 100</small></b></div><div className="signal-list">{modelContributors.map((item) => <SignalBar key={item.label} label={item.label} value={item.value} color={item.color} />)}</div><div className="ensemble-models"><span>Spend deviation <b>derived</b></span><span>Velocity window <b>derived</b></span><span>Geo-velocity <b>derived</b></span></div></div>
      </div>
      <div className="analytics-bottom-grid"><div className="panel smote-panel"><PanelHeading eyebrow="Preprocessing / 05" title="Imbalance handling" action={<span className="status-label status-good">SMOTE active</span>} /><div className="smote-visual"><div className="smote-before"><span>Before</span><i /><i /><i /><i className="minor" /><i className="minor" /></div><Icon name="arrow" size={20} /><div className="smote-after"><span>Balanced</span><i /><i /><i /><i /><i /><i /></div></div><p>Rare-event samples are synthetically balanced before ensemble scoring. Current fraud ratio <strong>1 : {analytics.fraudRatio}</strong>.</p></div><div className="panel feedback-panel"><PanelHeading eyebrow="Feedback loop / 06" title="Analyst tuning" action={<button className="text-button" onClick={() => setActiveView('audit')}>View history <Icon name="arrow" size={14} /></button>} /><div className="feedback-summary"><div><strong>{summary.evaluation.precision}%</strong><span>label agreement proxy</span></div><div><strong>{formatCompact(summary.fraud_count)}</strong><span>labeled fraud cases</span></div><div><strong>{summary.evaluation.recall}%</strong><span>fraud recall</span></div></div><div className="feedback-meter"><span style={{ width: `${summary.evaluation.precision}%` }} /></div><p>Derived from the uploaded labels and local heuristic scoring.</p></div></div>
    </section>
  )

  const renderAudit = () => (
    <section className="page-section">
      <div className="page-intro"><div><span className="eyebrow accent-eyebrow">Governance layer</span><h1>Audit trail</h1><p>Decisions, model lineage, and response latency — all in one reviewable stream.</p></div><button className="secondary-button" onClick={handleExportReport}><Icon name="external" size={15} />Export report</button></div>
      <div className="audit-grid"><div className="panel audit-panel"><PanelHeading eyebrow="Decision log / 01" title="Recent activity" action={<span className="model-chip">Today · UTC</span>} /><div className="audit-list">{audit.map((entry) => <div className="audit-row" key={entry.id}><span className={`audit-marker marker-${entry.tone}`}><Icon name={entry.tone === 'positive' ? 'check' : entry.tone === 'danger' ? 'shield' : entry.tone === 'warning' ? 'bolt' : 'dot'} size={14} /></span><span className="audit-time">{entry.time}<small>{entry.id}</small></span><span className="audit-detail"><strong>{entry.action}</strong><span>{entry.subject} · {entry.detail}</span></span><span className="audit-actor">{entry.actor}</span><span className="audit-latency">{entry.latency}</span></div>)}</div></div><aside className="panel report-panel"><PanelHeading eyebrow="Reporting / 02" title="System record" /><div className="report-block"><span>Current model</span><strong>heuristic-v1</strong><small>derived from uploaded data</small></div><div className="report-block"><span>Decisions logged</span><strong>{formatCompact(summary.row_count)}</strong><small>100% source-row coverage</small></div><div className="report-block"><span>Average response</span><strong>local</strong><small>browser-derived processing</small></div><div className="report-note"><Icon name="shield" size={16} /><span>Processed dataset only. No account or financial action is performed.</span></div></aside></div>
    </section>
  )

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><i /><i /></span><span className="brand-name">FRAUD<span>OPS</span></span><span className="brand-beta">LAB</span></div>
        <div className="sidebar-section"><span className="sidebar-label">Command center</span><nav>{navItems.map((item) => <button key={item.id} className={`nav-item ${activeView === item.id ? 'is-active' : ''}`} onClick={() => setActiveView(item.id)}><Icon name={item.icon} size={17} /><span>{item.label}</span>{item.count && <b>{item.count}</b>}</button>)}</nav></div>
        <div className="sidebar-section sidebar-lower"><span className="sidebar-label">Signal stack</span><div className="stack-list"><span><i className="stack-icon stack-mint" /><span>Stream processor</span><b>live</b></span><span><i className="stack-icon stack-cyan" /><span>Feature store</span><b>synced</b></span><span><i className="stack-icon stack-amber" /><span>Policy engine</span><b>ready</b></span></div></div>
        <div className="sidebar-footer"><div className="operator" style={{position: 'relative'}}><span className="avatar">{currentUser.initials}</span><span><strong>{currentUser.name}</strong><small>{currentUser.role}</small></span><button className="icon-button" aria-label="Operator menu" onClick={() => setShowUserMenu(!showUserMenu)}><Icon name="chevron" size={15} /></button>{showUserMenu && <div className="user-menu" style={{ position: 'absolute', bottom: '100%', right: '0', background: '#1a2128', border: '1px solid var(--line)', borderRadius: '6px', padding: '6px', zIndex: 100, marginBottom: '8px', width: '200px' }}>{USERS.map(u => <button key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px', background: 'transparent', border: 'none', color: u.id === currentUser.id ? 'var(--ink)' : 'var(--muted)', cursor: 'pointer', textAlign: 'left', borderRadius: '4px' }} onClick={() => { setCurrentUser(u); setShowUserMenu(false); }} onMouseOver={(e) => e.currentTarget.style.background = 'var(--surface-hover)'} onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}><span className="avatar avatar-small" style={{flex: 'none'}}>{u.initials}</span><span style={{ display: 'flex', flexDirection: 'column' }}><span style={{ fontSize: '12px', fontWeight: 500 }}>{u.name}</span><span style={{ fontSize: '9px', fontFamily: 'var(--mono)' }}>{u.role}</span></span></button>)}</div>}</div><div className="sidebar-build"><span>build 4.2.0-demo</span><span><i className="mini-dot dot-mint" />systems nominal</span></div></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="topbar-title"><span className="eyebrow">FraudOps / {activeView === 'overview' ? '01' : activeView === 'cases' ? '02' : activeView === 'analytics' ? '03' : '04'}</span><h2>{selectedViewTitle}</h2><span className="topbar-subtitle">{selectedViewSubtitle}</span></div><div className="topbar-actions"><span className="topbar-time"><span className="live-dot" />11:42:08 UTC</span><button className="icon-button notification-button" aria-label="Notifications"><Icon name="bell" size={17} /><i /></button><button className="operator-button" onClick={() => setShowUserMenu(!showUserMenu)}><span className="avatar avatar-small">{currentUser.initials}</span><span>{currentUser.name}</span><Icon name="chevron" size={14} /></button></div></header>
        <div className="main-scroll">{activeView === 'overview' ? renderOverview() : activeView === 'cases' ? renderCases() : activeView === 'analytics' ? renderAnalytics() : renderAudit()}</div>
      </main>
      {selectedCase && <div className="drawer-backdrop" onClick={() => setSelectedId(null)}><aside className="case-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div><span className="eyebrow">Case detail / {selectedCase.id}</span><h2>{selectedCase.merchant}</h2><span className="drawer-subtitle">{selectedCase.category} · {selectedCase.time} UTC</span>{(selectedCase.remediation || selectedCase.feedback || selectedCase.status) && <div className="drawer-action-state"><strong>Current state</strong><span>{selectedCase.remediation ?? selectedCase.feedback ?? selectedCase.status}</span></div>}</div><button className="icon-button" aria-label="Close case detail" onClick={() => setSelectedId(null)}><Icon name="close" size={18} /></button></div><div className="drawer-score-block"><div className="score-ring" style={{ background: `conic-gradient(#ff6d70 ${selectedCase.risk * 3.6}deg, #252b32 0deg)` }}><div><strong>{selectedCase.risk}</strong><span>/ 100</span></div></div><div><RiskBadge score={selectedCase.risk} /><p>{selectedCase.reason}</p><span className="confidence">Model confidence <strong>{selectedCase.modelConfidence}%</strong></span></div></div><div className="drawer-context"><div><span>Card</span><strong>{selectedCase.card}</strong></div><div><span>Amount</span><strong>{formatCurrency(selectedCase.amount)}</strong></div><div><span>Location</span><strong>{selectedCase.location}</strong></div><div><span>Velocity</span><strong>{selectedCase.velocity}</strong></div></div><div className="drawer-section"><div className="drawer-section-title"><span className="eyebrow">Explainability</span><span>feature contribution</span></div><div className="drawer-signals">{selectedCase.features.map((feature) => <div className="drawer-signal" key={feature.label}><div><span>{feature.label}</span><strong>{feature.value}</strong></div><div className="signal-track"><span className={`signal-fill fill-${feature.tone === 'danger' ? 'coral' : feature.tone === 'warning' ? 'amber' : feature.tone === 'positive' ? 'mint' : 'slate'}`} style={{ width: `${feature.weight}%` }} /></div></div>)}</div></div><div className="drawer-actions"><span className="eyebrow">Remediation</span><div className="action-grid"><button className="danger-button" onClick={handleLockCard} disabled={!canLockCard || selectedCase.remediation === 'Card locked' || selectedCase.status === 'Cleared'} title={!canLockCard ? "Requires Admin role" : ""}><Icon name="lock" size={15} />{selectedCase.remediation === 'Card locked' ? 'Card locked' : 'Lock card'}</button><button className="warning-button" onClick={handleStepUp} disabled={!canStepUp || selectedCase.remediation === 'Step-up authentication required' || selectedCase.status === 'Cleared'} title={!canStepUp ? "Requires L2 Analyst or Admin role" : ""}><Icon name="shield" size={15} />{selectedCase.remediation === 'Step-up authentication required' ? 'Step-up pending' : 'Step-up auth'}</button></div><button className="clear-button" onClick={handleClearAlert} disabled={!canClearAlert || selectedCase.status === 'Cleared'} title={!canClearAlert ? "Requires L2 Analyst or Admin role" : ""}><Icon name="check" size={15} />{selectedCase.status === 'Cleared' ? 'Alert cleared' : 'Clear this alert'}</button></div><div className="drawer-feedback"><span className="eyebrow">Analyst feedback</span><div><button className={selectedCase.feedback === 'Confirmed fraud' ? 'is-selected' : ''} onClick={() => handleFeedback('Confirmed fraud')} disabled={!canConfirmFraud} title={!canConfirmFraud ? "Requires L2 Analyst or Admin role" : ""}>Confirmed fraud</button><button className={selectedCase.feedback === 'False positive' ? 'is-selected' : ''} onClick={() => handleFeedback('False positive')}>False positive</button><button className={selectedCase.feedback === 'Needs review' ? 'is-selected' : ''} onClick={() => handleFeedback('Needs review')}>Needs review</button></div></div></aside></div>}
      {toast && <div className="toast"><span className="toast-icon"><Icon name="check" size={14} /></span><span>{toast}</span><button onClick={() => setToast('')} aria-label="Dismiss notification"><Icon name="close" size={13} /></button></div>}
    </div>
  )
}

export default App
