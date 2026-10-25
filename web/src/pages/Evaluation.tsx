import { useState } from 'react'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { BudgetStatement, Card, LiftChart, Notice, PageHeading, PerformanceLabel, PerformanceValue } from '../components'
import { useWorkspace } from '../context'
import { number, percent } from '../lib'
import { TYPE_NAMES } from '../types'
import type { GroupedEvaluation, SupervisedVariants, Variants } from '../types'

const variants = [
  { key: 'if_only', label: 'Isolation Forest', description: 'Mendeteksi pola yang menyimpang tanpa label.' },
  { key: 'xgb_only', label: 'XGBoost', description: 'Mempelajari sinyal dari contoh berlabel.' },
  { key: 'hybrid', label: 'Hybrid', description: 'Menggabungkan fitur klaim dan persentil anomali.' },
] as const
const ap = (value: number) => value.toLocaleString('id-ID', { minimumFractionDigits: 6, maximumFractionDigits: 6 })

function VariantTable({ rows, metric, supervisedOnly = false, folds }: {
  rows: Record<string, Variants | SupervisedVariants>; metric: string; supervisedOnly?: boolean; folds?: number
}) {
  const shown = supervisedOnly ? variants.filter(v => v.key !== 'if_only') : variants
  return <><PerformanceLabel folds={folds} /><div className="table-scroll" tabIndex={0} role="region" aria-label={metric}>
    <table className="metrics-table"><caption className="sr-only">{metric}</caption><thead><tr><th scope="col">Jenis pola sintetis</th>{shown.map(v => <th scope="col" key={v.key}>{v.label}</th>)}</tr></thead><tbody>{Object.entries(rows).map(([type, values]) => <tr key={type}><th scope="row">{TYPE_NAMES[type] || type}</th>{shown.map(v => <td key={v.key}><PerformanceValue folds={folds}>{percent((values as Variants)[v.key], 2)}</PerformanceValue></td>)}</tr>)}</tbody></table>
  </div></>
}

function GroupedTables({ result, label }: { result: GroupedEvaluation; label: string }) {
  return <section className="grouped-section"><h3>{label} · {number(result.n_groups)} kelompok</h3><p className="grouped-note">{result.note}</p><PerformanceLabel folds={result.folds} />
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`Metrik kelompok ${label}, dapat digulir`}><table className="metrics-table grouped-metrics"><thead><tr><th>Varian</th><th>AP</th>{['2', '5', '10'].flatMap(b => [<th key={`r${b}`}>Recall@{b}%</th>, <th key={`p${b}`}>Precision@{b}%</th>])}</tr></thead><tbody>{(['xgb_only', 'hybrid'] as const).map(v => <tr key={v}><th scope="row">{v === 'hybrid' ? 'Hybrid' : 'XGBoost'}</th><td><PerformanceValue folds={result.folds}>{ap(result.pr_auc[v])}</PerformanceValue></td>{['2', '5', '10'].flatMap(b => [<td key={`r${b}`}><PerformanceValue folds={result.folds}>{percent(result.at_budget[b].recall[v], 2)}</PerformanceValue></td>, <td key={`p${b}`}><PerformanceValue folds={result.folds}>{percent(result.at_budget[b].precision[v], 2)}</PerformanceValue></td>])}</tr>)}</tbody></table></div>
    <h4>Recall per jenis pada anggaran 5%</h4><VariantTable rows={result.per_type_recall_at_5} metric={`Recall per jenis kelompok ${label}`} supervisedOnly folds={result.folds} />
  </section>
}

export default function Evaluation() {
  const { data, evaluation, setEvaluation } = useWorkspace()
  const { report, summary } = data
  const [budget, setBudget] = useState('5')
  const selectedBudget = report.at_budget[budget]
  const matrix = { tp: 0, fp: 0, fn: 0, tn: 0 }
  const topCount = Math.ceil(summary.dataset.n_claims * Number(budget) / 100)
  data.claims.forEach((claim, index) => {
    if (!claim.eval) return
    const positive = index < topCount
    if (positive && claim.eval.label) matrix.tp++
    else if (positive) matrix.fp++
    else if (claim.eval.label) matrix.fn++
    else matrix.tn++
  })
  const hybridLower = report.pr_auc.hybrid <= report.pr_auc.xgb_only
  return <>
    <PageHeading eyebrow="TRANSPARANSI MODEL" title="Evaluasi model" description="Bandingkan hasil aktual, termasuk penurunan performa dan keterbatasannya." />
    <div className="evaluation-toggle"><div><FlaskConical size={21} /><div><h2>Mode Evaluasi (data sintetis)</h2><p>Tampilkan label sebenarnya pada antrean dan matriks subset ekspor.</p></div></div><button role="switch" aria-checked={evaluation} aria-label="Mode Evaluasi (data sintetis)" className={`switch ${evaluation ? 'on' : ''}`} onClick={() => setEvaluation(!evaluation)}><span /></button></div>
    <Notice warning>{hybridLower ? 'Hybrid belum unggul atas xgb_only pada AP evaluasi per klaim ini. Semua hasil ditampilkan apa adanya.' : 'Perbandingan ini terbatas pada data sintetis; hasil AP belum menunjukkan performa dunia nyata.'} Parameter model tidak disetel berdasarkan fold uji.</Notice>
    <div className="model-cards">{variants.map(v => <Card key={v.key} className="model-card"><div className="model-card-head"><span>{v.label}</span>{v.key === 'hybrid' && <span className="badge tier-low">Arsitektur utama</span>}</div><div className="model-value"><PerformanceValue>{ap(report.pr_auc[v.key])}</PerformanceValue><span>AP</span></div><p>{v.description}</p><PerformanceLabel /></Card>)}</div>
    <Card title="Perbandingan tiga varian" subtitle="AP = average precision; skor IF transduktif, XGBoost dan hybrid OOF"><PerformanceLabel /><div className="table-scroll" tabIndex={0} role="region" aria-label="Perbandingan tiga varian, dapat digulir"><table className="metrics-table grouped-metrics"><thead><tr><th>Varian</th><th>AP</th>{['2', '5', '10'].flatMap(b => [<th key={`r${b}`}>Recall@{b}%</th>, <th key={`p${b}`}>Precision@{b}%</th>])}</tr></thead><tbody>{variants.map(v => <tr key={v.key}><th scope="row">{v.label}</th><td><PerformanceValue>{ap(report.pr_auc[v.key])}</PerformanceValue></td>{['2', '5', '10'].flatMap(b => [<td key={`r${b}`}><PerformanceValue>{percent(report.at_budget[b].recall[v.key], 2)}</PerformanceValue></td>, <td key={`p${b}`}><PerformanceValue>{percent(report.at_budget[b].precision[v.key], 2)}</PerformanceValue></td>])}</tr>)}</tbody></table></div></Card>
    <div className="evaluation-grid"><Card title="Recall pada anggaran audit" subtitle="Proporsi kasus berlabel yang tercakup"><PerformanceLabel /><div className="budget-controls" role="group" aria-label="Anggaran audit">{['2', '5', '10'].map(b => <button key={b} aria-pressed={budget === b} className={budget === b ? 'active' : ''} onClick={() => setBudget(b)}>Top {b}%</button>)}</div><div className="recall-bars">{variants.map(v => <div key={v.key}><div><span>{v.label}</span><b><PerformanceValue>{percent(selectedBudget?.recall[v.key] ?? 0, 2)}</PerformanceValue></b></div><div className="bar-track"><i style={{ width: `${(selectedBudget?.recall[v.key] ?? 0) * 100}%`, background: 'var(--slate)' }} /></div></div>)}</div><p className="chart-caption">Precision hybrid pada top {budget}%: <PerformanceValue>{percent(selectedBudget?.precision.hybrid ?? 0, 2)}</PerformanceValue>. Anggaran audit ditetapkan sebelum evaluasi.</p></Card><Card title="Kurva lift" subtitle="Prioritas pada data sintetis dibanding ekspektasi sampling acak"><PerformanceLabel /><LiftChart report={report} compact /><div className="lift-insight"><BudgetStatement report={report} /></div></Card></div>
    <Card title="Recall per jenis pola" subtitle="Anggaran pemeriksaan 5%; pola disuntikkan"><VariantTable rows={report.per_type_recall_at_5} metric="Recall per jenis pola pada anggaran 5%" /></Card>
    <Card title="Eksperimen hold-out per jenis pola" subtitle="Jenis T dikeluarkan dari train supervised sebelum validasi internal"><VariantTable rows={report.holdout} metric="Hasil hold-out per jenis pola" /><div className="holdout-note"><p><b>Pola yang belum pernah dilihat sebagian besar tidak tertangkap model supervised.</b> Tambahan sinyal IF membantu beberapa jenis, tetapi belum memberi keunggulan yang konsisten; IF dan fitur referensi tetap transduktif.</p></div></Card>
    <Card title="Evaluasi per kelompok" subtitle="Parameter tetap; kelompok tidak berbagi outer train/uji maupun inner train/validasi">{report.grouped_eval ? Object.entries(report.grouped_eval).map(([key, result]) => <GroupedTables key={key} result={result} label={key === 'faskes_id' ? 'Faskes terpisah' : 'Pasien terpisah'} />) : <Notice>Evaluasi per kelompok belum tersedia pada JSON yang dimuat.</Notice>}</Card>
    {evaluation && <Card title="Matriks evaluasi sederhana" subtitle={`Anggaran top ${budget}% dari ${number(summary.dataset.n_claims)} klaim sumber`}><PerformanceLabel /><Notice>Hanya {number(data.claims.filter(c => c.eval).length)} klaim ekspor berlabel; bukan matriks seluruh dataset. {topCount >= data.claims.length && 'Seluruh subset ekspor berada dalam anggaran ini, sehingga nol FN/TN di subset bukan bukti semua kasus tertangkap.'}</Notice><div className="confusion-matrix">{[['Pola disuntikkan · diprioritaskan', matrix.tp, 'Positif benar (TP)'], ['Normal · diprioritaskan', matrix.fp, 'Positif keliru (FP)'], ['Pola disuntikkan · tidak diprioritaskan', matrix.fn, 'Negatif keliru (FN)'], ['Normal · tidak diprioritaskan', matrix.tn, 'Negatif benar (TN)']].map(([label, value, note]) => <div key={label}><span>{label}</span><b><PerformanceValue>{number(Number(value))}</PerformanceValue></b><small>{note}</small></div>)}</div></Card>}
    <div className="evaluation-grid"><Card title="Kontribusi fitur global" subtitle="Rata-rata |SHAP| OOF dalam log-odds; bukan ukuran akurasi"><PerformanceLabel /><div className="pattern-bars">{report.feature_importance.map(f => <div className="pattern-bar" key={f.feature}><div><span>{f.label}</span><b><PerformanceValue>{number(f.importance)}</PerformanceValue></b></div><div className="bar-track"><i style={{ width: `${f.importance / Math.max(...report.feature_importance.map(x => x.importance), 0.01) * 100}%` }} /></div></div>)}</div></Card><Card title="Alur yang dapat ditelusuri" subtitle={`Seed ${report.config.seed} · ${report.config.folds} fold`}><div className="pipeline">{['Input sintetis', 'Fitur klaim & median peer', 'Isolation Forest + XGBoost', 'Penjelasan SHAP', 'Auditor manusia'].map((s, i) => <div key={s}><span>{String(i + 1).padStart(2, '0')}</span><b>{s}</b>{i < 4 && <ArrowRight size={15} />}</div>)}</div><p className="chart-caption">Skor antrean mempertahankan persentil hybrid OOF per klaim. Evaluasi kelompok tidak mengganti skor ini.</p></Card></div>
    <Card title="Batasan" className="limitations"><ul><li>Seluruh data sintetis dan pola fraud disuntikkan. Angka performa bukan klaim performa dunia nyata.</li><li>Overlap terarah dipilih setelah membandingkan definisi pada data penuh; keputusan ini membatasi independensi evaluasi.</li><li>IF, median peer, tetangga dan riwayat menggunakan batch penuh tanpa label: evaluasi transduktif, termasuk pada skema kelompok.</li><li>Biaya tinggi pada faskes kasus kompleks dapat wajar; false positive perlu diperiksa oleh auditor manusia.</li><li>Performa pada data riil, kelompok baru dan masa depan harus divalidasi ulang dengan izin resmi.</li><li>Skor adalah peringkat prioritas, bukan probabilitas fraud. Keputusan akhir ada pada auditor.</li></ul>{report.notes.map((note, i) => <p key={i} className="model-note">{note}</p>)}</Card>
  </>
}
