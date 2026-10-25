import { ArrowRight, Building2, CircleDollarSign, Files, ScanLine, ShieldCheck } from 'lucide-react'
import { useWorkspace } from '../context'
import { BudgetStatement, Card, LiftChart, Metric, PageHeading, TopClaims, PerformanceLabel } from '../components'
import BudgetSimulation from '../BudgetSimulation'
import { compactMoney, number } from '../lib'
import { PATTERNS } from '../types'

export default function Overview() {
  const { data } = useWorkspace()
  const { summary, claims, report } = data
  const counts = PATTERNS.map(p => ({ name: p, count: data.facilities.reduce((n, f) => n + (f.pattern_counts[p] || 0), 0) })).sort((a, b) => b.count - a.count)
  const hist = summary.score_hist
  const max = Math.max(...hist.counts, 1)
  const maxPattern = Math.max(...counts.map(p => p.count), 1)
  return <>
    <PageHeading eyebrow="PUSAT PEMANTAUAN" title="Audit yang lebih terarah." description="Kenali prioritas. Pahami alasannya. Putuskan dengan bukti." action={<a className="button button-primary" href="#/antrean">Buka antrean audit <ArrowRight size={16} /></a>} />
    <div className="overview-intro"><div><span className="intro-label"><ShieldCheck size={15} />PENILAIAN RISIKO KLAIM</span><p>Setiap klaim punya konteks.<br /><b>Fokuskan pemeriksaan pada yang perlu.</b></p></div><div className="intro-meta"><span>Isolation Forest + XGBoost</span><b>Prioritas dengan penjelasan SHAP</b><small>{`Data sintetis | validasi silang ${report.config.folds}-fold`}</small></div></div>
    <div className="metrics-grid"><Metric label="Klaim dinilai" value={number(summary.dataset.n_claims)} description={`${number(summary.dataset.n_faskes)} faskes dalam data sintetis`} icon={<Files size={18} />} /><Metric label="Prioritas tinggi" value={number(summary.kpi.n_high)} description={`Top ${summary.tiers.high_top_pct}% untuk ditinjau lebih awal`} icon={<ScanLine size={18} />} color="coral" /><Metric label="Faskes prioritas tinggi" value={number(summary.kpi.n_faskes_high_risk)} description="Memiliki klaim berisiko tinggi" icon={<Building2 size={18} />} color="amber" /><Metric label="Estimasi kelebihan bayar" value={compactMoney(summary.kpi.est_excess_total_idr)} description="Selisih positif biaya vs median peer" icon={<CircleDollarSign size={18} />} color="amber" /></div>
    <BudgetSimulation />
    <div className="overview-charts"><Card title="Sebaran skor risiko" subtitle="Persentil skor, bukan probabilitas fraud" action={<span className="mini-label">SKOR 0–100</span>}><div className="histogram"><div className="hist-y"><span>{number(max)}</span><span>{number(Math.round(max / 2))}</span><span>0</span></div><div className="hist-columns">{hist.counts.map((n, i) => <div className="hist-col" key={i} title={`Skor ${hist.bin_edges[i]}–${hist.bin_edges[i + 1]}: ${n} klaim`}><div style={{ height: `${n / max * 100}%`, background: hist.bin_edges[i] >= 95 ? 'var(--coral)' : hist.bin_edges[i] >= 90 ? 'var(--amber)' : 'var(--teal)' }} /><span>{i % 4 === 0 ? hist.bin_edges[i] : ''}</span></div>)}</div></div><div className="tier-summary"><span><i className="legend-dot bg-teal" />Rendah <b>{number(summary.kpi.n_low)}</b></span><span><i className="legend-dot bg-amber" />Menengah <b>{number(summary.kpi.n_medium)}</b></span><span><i className="legend-dot bg-coral" />Tinggi <b>{number(summary.kpi.n_high)}</b></span></div><p className="chart-caption">Skor berupa peringkat relatif; tidak menunjukkan peluang suatu klaim bermasalah.</p></Card>
      <Card title="Komposisi pola dugaan" subtitle="Pola yang berpotensi perlu diperiksa"><div className="pattern-bars">{counts.map((p, i) => <div className="pattern-bar" key={p.name}><div><span>{p.name}</span><b>{number(p.count)}</b></div><div className="bar-track"><i style={{ width: `${p.count / maxPattern * 100}%`, background: ['#2FD3C6', '#56B9B5', '#F2A65A', '#DAB483', '#EE8C81', '#779EAC'][i] }} /></div></div>)}</div><p className="chart-caption">Satu klaim dapat memiliki lebih dari satu pola dugaan.</p></Card></div>
    <div className="overview-bottom"><Card title="Pemeriksaan berbasis prioritas" subtitle="Cakupan kasus berlabel pada data sintetis"><PerformanceLabel /><LiftChart report={report} compact /><div className="lift-insight"><BudgetStatement report={report} /></div></Card><Card title="Mulai dari prioritas teratas" subtitle="Buka klaim untuk melihat alasan dan konteks" action={<a className="text-link" href="#/antrean">Lihat semua <ArrowRight size={14} /></a>}><TopClaims claims={claims.slice(0, 4)} /><div className="human-note"><ShieldCheck size={16} /><span>Skor memberi arah. Auditor memegang keputusan.</span></div></Card></div>
  </>
}
