export type RiskBand = 'Critical' | 'High' | 'Review' | 'Low'
export type CaseStatus = 'Open' | 'Needs review' | 'Cleared' | 'Escalated'
export type ViewName = 'overview' | 'cases' | 'analytics' | 'audit'

export type FeatureSignal = {
  label: string
  value: string
  weight: number
  tone: 'danger' | 'warning' | 'neutral' | 'positive'
}

export type DatasetTransaction = {
  transaction_id: string
  timestamp: string
  card_id: string
  card_label: string
  customer_alias: string
  device_fingerprint: string
  merchant: string
  category: string
  amount: number
  city: string
  state: string
  location: string
  zip: string
  latitude: number
  longitude: number
  merchant_latitude: number
  merchant_longitude: number
  city_population: number
  distance_km: number
  merchant_distance_km: number
  minutes_since_previous: number
  travel_speed_kmh: number
  velocity_5m: number
  velocity_1h: number
  amount_deviation: number
  risk_score: number
  risk_band: RiskBand
  case_status: CaseStatus
  model_confidence: number
  reason: string
  feature_signals: FeatureSignal[]
  is_fraud: boolean
  source: string
}

export type DatasetSummary = {
  row_count: number
  fraud_count: number
  fraud_rate: number
  total_amount: number
  average_amount: number
  median_amount: number
  average_risk_score?: number
  blocked_estimate: number
  review_estimate: number
  velocity_alerts: number
  geo_velocity_alerts: number
  risk_distribution: Record<string, number>
  category_counts: Record<string, number>
  state_counts: Record<string, number>
  evaluation: { precision: number; recall: number; true_positive: number; false_positive: number; true_negative: number; false_negative: number }
}

export type FraudDataset = {
  metadata: { source_file: string; source_rows: number; sample_rows_in_browser: number; removed_columns: string[]; synthetic_columns: string[]; derived_columns: string[]; label_column: string; risk_score_note: string; preprocessing: string[] }
  summary: DatasetSummary
  transactions: DatasetTransaction[]
}

export type FraudCase = {
  id: string
  card: string
  merchant: string
  category: string
  amount: number
  location: string
  distance: string
  time: string
  risk: number
  band: RiskBand
  status: CaseStatus
  modelConfidence: number
  velocity: string
  reason: string
  source: string
  features: FeatureSignal[]
  timestamp: string
  transactionId: string
  isFraud: boolean
  customerAlias: string
  deviceFingerprint: string
  distanceKm: number
  travelSpeedKmh: number
  amountDeviation: number
  remediation?: 'Card locked' | 'Step-up authentication required'
  feedback?: 'Confirmed fraud' | 'False positive' | 'Needs review'
}

export type AuditEntry = {
  id: string
  time: string
  action: string
  subject: string
  detail: string
  actor: string
  latency: string
  tone: 'danger' | 'warning' | 'positive' | 'neutral'
}

export const navItems: Array<{ id: ViewName; label: string; icon: string; count?: string }> = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'cases', label: 'Case queue', icon: 'inbox' },
  { id: 'analytics', label: 'Model signals', icon: 'pulse' },
  { id: 'audit', label: 'Audit trail', icon: 'history' },
]

export const formatCurrency = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
export const formatCompact = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)
export const riskLabel = (score: number): RiskBand => score >= 90 ? 'Critical' : score >= 75 ? 'High' : score >= 45 ? 'Review' : 'Low'

const formatTime = (timestamp: string) => new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }).format(new Date(timestamp))

export const toFraudCase = (item: DatasetTransaction): FraudCase => ({
  id: item.transaction_id.slice(0, 8).toUpperCase(),
  card: item.card_label,
  merchant: item.merchant,
  category: item.category.replace(/_/g, ' '),
  amount: item.amount,
  location: item.location,
  distance: item.travel_speed_kmh > 0 ? `${item.distance_km.toFixed(0)} km / ${item.minutes_since_previous.toFixed(0)} min` : '—',
  time: formatTime(item.timestamp),
  risk: item.risk_score,
  band: item.risk_band,
  status: item.case_status,
  modelConfidence: item.model_confidence,
  velocity: `${item.velocity_5m} tx / 5 min`,
  reason: item.reason,
  source: item.source,
  features: item.feature_signals,
  timestamp: item.timestamp,
  transactionId: item.transaction_id,
  isFraud: item.is_fraud,
  customerAlias: item.customer_alias,
  deviceFingerprint: item.device_fingerprint,
  distanceKm: item.distance_km,
  travelSpeedKmh: item.travel_speed_kmh,
  amountDeviation: item.amount_deviation,
})

export const toAuditEntries = (items: DatasetTransaction[], limit = 12): AuditEntry[] => items.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit).map((item, index) => ({
  id: `DS-${String(index + 1).padStart(4, '0')}`,
  time: formatTime(item.timestamp),
  action: item.is_fraud ? 'Fraud label observed' : item.risk_score >= 45 ? 'Risk review flagged' : 'Transaction evaluated',
  subject: item.transaction_id.slice(0, 8).toUpperCase(),
  detail: `${item.reason} · risk ${item.risk_score}`,
  actor: item.source,
  latency: 'local',
  tone: item.is_fraud ? 'danger' : item.risk_score >= 45 ? 'warning' : 'neutral',
}))

export const modelContributorsFrom = (items: DatasetTransaction[]) => {
  const size = Math.max(items.length, 1)
  const average = (selector: (item: DatasetTransaction) => number) => Math.round(items.reduce((sum, item) => sum + selector(item), 0) / size)
  return [
    { label: 'Spend deviation', value: Math.min(98, average((item) => item.amount_deviation * 7)), color: 'mint' },
    { label: 'Velocity window', value: Math.min(98, average((item) => item.velocity_5m * 18)), color: 'cyan' },
    { label: 'Geo-velocity', value: Math.min(98, average((item) => item.travel_speed_kmh / 20)), color: 'amber' },
    { label: 'Merchant context', value: Math.min(72, average((item) => item.feature_signals[item.feature_signals.length - 1]?.weight ?? 20)), color: 'slate' },
  ]
}
