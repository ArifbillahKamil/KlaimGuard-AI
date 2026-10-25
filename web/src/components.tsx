import { ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Info, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { date, number, percent, rupiah } from './lib'
import type { Claim, Report, Tier } from './types'
import { useWorkspace } from './context'

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}
export function Card({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{title && <div className="card-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>}{children}</section>
}
export function Score({ value, large = false, tier }: { value: number; large?: boolean; tier?: Tier }) {
  const radius = large ? 43 : 17
  const length = 2 * Math.PI * radius
  const size = large ? 104 : 44
  const color = tier ? ({ high: 'var(--coral)', medium: 'var(--amber)', low: 'var(--teal)' })[tier] : value >= 97 ? 'var(--coral)' : value >= 90 ? 'var(--amber)' : 'var(--teal)'
  return <span className={`score ${large ? 'score-large' : ''}`} style={{ color }} aria-label={`Skor ${number(value)} dari 100`}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={large ? 6 : 3} /><circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={large ? 6 : 3} strokeDasharray={`${length * value / 100} ${length}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg><b>{number(value)}</b>
  </span>
}
export function TierBadge({ tier }: { tier: Tier }) { return <span className={`badge tier-${tier}`}><span className="status-dot" />{({ high: 'Tinggi', medium: 'Menengah', low: 'Rendah' })[tier]}</span> }
export function PatternChips({ patterns }: { patterns: string[] }) { return <div className="pattern-chips">{patterns.length ? patterns.map(p => <span className="pattern-chip" key={p} title={p}>{p}</span>) : <span className="muted text-xs">Belum ada pola dugaan</span>}</div> }
export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) { return <div className={`notice ${warning ? 'notice-warning' : ''}`}><Info size={17} aria-hidden="true" /><div>{children}</div></div> }
export function PerformanceLabel({ folds }: { folds?: number }) {
  const { data } = useWorkspace()
  return <p className="performance-label">Data sintetis | validasi silang {folds ?? data.report.config.folds}-fold</p>
}
export function PerformanceValue({ children, folds }: { children: ReactNode; folds?: number }) {
  const { data } = useWorkspace()
  const label = `Data sintetis | validasi silang ${folds ?? data.report.config.folds}-fold`
  return <span className="performance-value" title={label} data-performance-label={label}>{children}<span className="sr-only"> · {label}</span></span>
}
export function Empty({ title = 'Belum ada klaim yang cocok.', text = 'Coba ubah filter atau kata pencarian.' }: { title?: string; text?: string }) { return <div className="empty"><ShieldCheck size={36} /><h3>{title}</h3><p>{text}</p></div> }
export function Metric({ label, value, description, icon, color = 'teal' }: { label: string; value: ReactNode; description: string; icon: ReactNode; color?: string }) {
  return <div className="card metric"><div className="metric-label">{label}<span className={`metric-icon ${color}`}>{icon}</span></div><div className="metric-value">{value}</div><p>{description}</p></div>
}
export function TopClaims({ claims }: { claims: Claim[] }) {
  const { selectClaim, decisions } = useWorkspace()
  return claims.length ? <div className="top-claims">{claims.map(c => <button className="top-claim" key={c.claim_id} onClick={() => selectClaim(c)}><Score tier={c.risk_tier} value={c.risk_score} /><div><b>{c.claim_id} <span className="muted font-normal">· {c.faskes_id}</span></b><span>{c.dx_name}</span></div><span className="top-claim-cost">{rupiah(c.claim_total)}<small>{date(c.admit_date)}</small></span>{decisions[c.claim_id] ? <Check size={17} className="teal" aria-label="Keputusan tersimpan" /> : <ChevronRight size={17} className="muted" />}</button>)}</div> : <Empty />
}
export function LiftChart({ report, compact = false }: { report: Report; compact?: boolean }) {
  const points = report.lift_curve
  const x = (v: number) => 45 + v * 5.7
  const y = (v: number) => 213 - v * 180
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.pct)},${y(p.recall_hybrid)}`).join(' ')
  const randomPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.pct)},${y(p.recall_random)}`).join(' ')
  return <div className={compact ? 'chart chart-compact' : 'chart'}><div className="chart-legend"><span><i className="legend-dot bg-teal" />Hybrid</span><span><i className="legend-dash" />Sampling acak</span></div><svg viewBox="0 0 650 260" role="img" aria-label="Kurva lift: cakupan kasus terhadap anggaran pemeriksaan">
    {[0, 0.25, 0.5, 0.75, 1].map(t => <g key={t}><line x1="45" x2="615" y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 5" /><text x="32" y={y(t) + 4} textAnchor="end">{t * 100}%</text></g>)}
    {[0, 20, 40, 60, 80, 100].map(t => <text key={t} x={x(t)} y="235" textAnchor="middle">{t}%</text>)}
    <path d={randomPath} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="5 6" /><path d={path} fill="none" stroke="var(--teal)" strokeWidth="3" strokeLinejoin="round" />
    <text x="330" y="257" textAnchor="middle">Anggaran pemeriksaan (% klaim)</text>
  </svg></div>
}
export function ShapReasons({ claim }: { claim: Claim }) {
  const { data } = useWorkspace()
  const max = Math.max(...claim.reasons.map(r => Math.abs(r.shap)), 0.01)
  return <div className="shap-reasons">{claim.reasons.map((r, i) => <div className="reason" key={`${r.feature}-${i}`}><div className="reason-top"><b>{data.dictionary.find(f => f.feature === r.feature)?.label || r.feature}</b><span className={r.direction === 'up' ? 'coral' : 'teal'}>{r.direction === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}{r.shap > 0 ? '+' : ''}{number(r.shap)}</span></div><div className="shap-track"><div className="shap-half shap-left">{r.direction === 'down' && <i style={{ width: `${Math.abs(r.shap) / max * 100}%` }} />}</div><div className="shap-half shap-right">{r.direction === 'up' && <i style={{ width: `${Math.abs(r.shap) / max * 100}%` }} />}</div></div><p>{r.text}</p></div>)}<div className="shap-axis"><span>← Menurunkan prioritas</span><span>Menaikkan prioritas →</span></div><p className="muted text-xs">Kontribusi SHAP menjelaskan keluaran model, bukan bukti sebab-akibat.</p></div>
}
export function BudgetStatement({ report }: { report: Report }) {
  const budget = 5
  return <span>Memeriksa <b className="teal">{percent(budget / 100)}</b> klaim teratas menangkap <b className="teal"><PerformanceValue>{percent(report.at_budget[String(budget)]?.recall.hybrid ?? 0)}</PerformanceValue></b> kasus berlabel, dibanding ekspektasi <b><PerformanceValue>{percent(budget / 100)}</PerformanceValue></b> pada sampling acak.</span>
}
