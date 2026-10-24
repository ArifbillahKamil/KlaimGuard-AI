import { useState } from 'react'
import { ArrowRight, FlaskConical, Info } from 'lucide-react'
import { BudgetStatement, Card, LiftChart, Notice, PageHeading } from '../components'
import { useWorkspace } from '../context'
import { number, percent } from '../lib'
import { TYPE_NAMES } from '../types'
import type { Variants } from '../types'

const variants = [{ key: 'if_only', label: 'Isolation Forest', description: 'Mendeteksi pola yang menyimpang tanpa label.' }, { key: 'xgb_only', label: 'XGBoost', description: 'Mempelajari sinyal dari contoh berlabel.' }, { key: 'hybrid', label: 'Hybrid', description: 'Menggabungkan sinyal anomali dan fitur klaim.' }] as const
function VariantTable({ rows, metric }: { rows: Record<string, Variants>; metric: string }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={metric}><table className="metrics-table"><caption className="sr-only">{metric}</caption><thead><tr><th scope="col">Jenis pola sintetis</th><th scope="col">Isolation Forest</th><th scope="col">XGBoost</th><th scope="col" className="teal">Hybrid</th></tr></thead><tbody>{Object.entries(rows).map(([type, v]) => <tr key={type}><th scope="row">{TYPE_NAMES[type] || type}</th><td>{percent(v.if_only)}</td><td>{percent(v.xgb_only)}</td><td className="teal font-semibold">{percent(v.hybrid)}</td></tr>)}</tbody></table></div>
}
export default function Evaluation() {
  const { data, evaluation, setEvaluation } = useWorkspace()
  const { report, summary } = data
  const [budget, setBudget] = useState('5')
  const selectedBudget = report.at_budget[budget]
  const sample = summary.data_source === 'sample'
  const matrix = { tp: 0, fp: 0, fn: 0, tn: 0 }
  const topCount = Math.ceil(summary.dataset.n_claims * Number(budget) / 100)
  data.claims.slice().sort((a, b) => b.risk_score - a.risk_score).forEach((c, i) => {
    if (!c.eval) return
    const positive = i < topCount
    if (positive && c.eval.label) matrix.tp++
    else if (positive) matrix.fp++
    else if (c.eval.label) matrix.fn++
    else matrix.tn++
  })
  return <>
    <PageHeading eyebrow="TRANSPARANSI MODEL" title="Evaluasi model" description="Bandingkan pendekatan, pahami batasan, dan periksa apa yang belum terjawab." />
    <div className="evaluation-toggle"><div><FlaskConical size={21} /><div><h2>Mode Evaluasi (data sintetis)</h2><p>Tampilkan label sebenarnya pada antrean dan matriks evaluasi.</p></div></div><button role="switch" aria-checked={evaluation} aria-label="Mode Evaluasi (data sintetis)" className={`switch ${evaluation ? 'on' : ''}`} onClick={() => setEvaluation(!evaluation)}><span /></button></div>
    {sample && <Notice warning><b>Seluruh angka berikut adalah contoh ilustratif.</b> PR-AUC, recall, SHAP, dan hold-out belum berasal dari pelatihan atau eksperimen ML. Angka ini hanya menguji tampilan dashboard.</Notice>}
    <div className="model-cards">{variants.map(v => <Card key={v.key} className={v.key === 'hybrid' ? 'model-card model-hybrid' : 'model-card'}><div className="model-card-head"><span>{v.label}</span>{v.key === 'hybrid' && <span className="badge tier-low">Arsitektur utama</span>}</div><div className="model-value">{report.pr_auc[v.key].toLocaleString('id-ID', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}<span>PR-AUC</span></div><p>{v.description}</p><small>{sample ? 'Metrik ilustratif' : 'Evaluasi data sintetis'}</small></Card>)}</div>
    <div className="evaluation-grid"><Card title="Recall pada anggaran audit" subtitle="Proporsi kasus berlabel yang tercakup"><div className="budget-controls" role="group" aria-label="Anggaran audit">{['2', '5', '10'].map(b => <button key={b} aria-pressed={budget === b} className={budget === b ? 'active' : ''} onClick={() => setBudget(b)}>Top {b}%</button>)}</div><div className="recall-bars">{variants.map(v => <div key={v.key}><div><span>{v.label}</span><b className={v.key === 'hybrid' ? 'teal' : ''}>{percent(selectedBudget?.recall[v.key] ?? 0)}</b></div><div className="bar-track"><i style={{ width: `${(selectedBudget?.recall[v.key] ?? 0) * 100}%`, background: v.key === 'hybrid' ? 'var(--teal)' : 'var(--slate)' }} /></div></div>)}</div><p className="chart-caption">Precision hybrid pada top {budget}%: <b>{percent(selectedBudget?.precision.hybrid ?? 0)}</b>. Anggaran audit bukan threshold hasil tuning test.</p></Card><Card title="Kurva lift" subtitle={sample ? 'Simulasi cakupan berdasarkan data contoh' : 'Pemeriksaan prioritas dibanding sampling acak'}><LiftChart report={report} compact /><div className="lift-insight"><BudgetStatement report={report} /></div></Card></div>
    <Card title="Recall per jenis pola" subtitle="Anggaran pemeriksaan 5% · pola disuntikkan pada data sintetis"><VariantTable rows={report.per_type_recall_at_5} metric="Recall per jenis pola pada anggaran 5%" /></Card>
    <Card title="Eksperimen hold-out per jenis pola" subtitle={sample ? 'Tabel ilustratif · eksperimen aktual belum dijalankan' : 'Satu jenis pola dikeluarkan dari label pelatihan, lalu diuji'}><VariantTable rows={report.holdout} metric="Hasil hold-out per jenis pola" /><div className="holdout-note"><Info size={17} /><p><b>Apa yang dibuktikan hybrid?</b> {sample ? 'Belum ada bukti dari data contoh; eksperimen ML aktual akan menguji apakah sinyal anomali membantu menangkap pola yang tidak dilihat model supervised saat pelatihan.' : 'Eksperimen ini menguji apakah tambahan sinyal anomali membantu menangkap jenis pola yang tidak dilihat supervised saat pelatihan; hasil lebih rendah tetap perlu dilaporkan.'}</p></div></Card>
    {evaluation && <Card title="Matriks evaluasi sederhana" subtitle={`Anggaran top ${budget}% dari ${number(summary.dataset.n_claims)} klaim sumber`}><Notice>Hanya mencakup {number(data.claims.filter(c => c.eval).length)} klaim ekspor berlabel; bukan matriks seluruh dataset jika ekspor dibatasi. Keputusan positif berarti direkomendasikan untuk diperiksa.</Notice><div className="confusion-matrix"><div><span>Pola disuntikkan · diprioritaskan</span><b className="teal">{number(matrix.tp)}</b><small>Positif benar (TP)</small></div><div><span>Normal · diprioritaskan</span><b className="amber">{number(matrix.fp)}</b><small>Positif keliru (FP)</small></div><div><span>Pola disuntikkan · tidak diprioritaskan</span><b className="coral">{number(matrix.fn)}</b><small>Negatif keliru (FN)</small></div><div><span>Normal · tidak diprioritaskan</span><b>{number(matrix.tn)}</b><small>Negatif benar (TN)</small></div></div></Card>}
    <div className="evaluation-grid"><Card title="Kontribusi fitur global" subtitle="Pentingnya fitur berbeda dengan alasan per klaim"><div className="pattern-bars">{report.feature_importance.map(f => <div className="pattern-bar" key={f.feature}><div><span>{f.label}</span><b>{number(f.importance)}</b></div><div className="bar-track"><i style={{ width: `${f.importance / Math.max(...report.feature_importance.map(x => x.importance), 0.01) * 100}%` }} /></div></div>)}</div></Card><Card title="Alur yang dapat ditelusuri" subtitle={`Konfigurasi: seed ${report.config.seed} · ${report.config.folds} fold`}><div className="pipeline">{['Input sintetis', 'Fitur klaim & median peer', 'Isolation Forest + XGBoost', 'Penjelasan SHAP', 'Auditor manusia'].map((s, i) => <div key={s}><span>{String(i + 1).padStart(2, '0')}</span><b>{s}</b>{i < 4 && <ArrowRight size={15} />}</div>)}</div><p className="chart-caption">Rancangan skor: persentil probabilitas hybrid out-of-fold 5-fold. Label dan ID mentah tidak menjadi fitur.</p></Card></div>
    <Card title="Batasan" className="limitations"><ul><li>Seluruh data sintetis. Pola fraud disuntikkan; angka performa bukan klaim performa dunia nyata.</li><li>Performa pada data riil harus divalidasi ulang di lingkungan dengan izin resmi.</li><li>Faskes yang menangani kasus kompleks dapat menerima false positive; biaya tinggi perlu dilihat dengan konteks medis.</li><li>Cloning sintetis dapat terlalu mudah terdeteksi. Phantom billing bisa memiliki sinyal lemah.</li><li>Skor adalah peringkat prioritas, bukan probabilitas fraud atau keputusan otomatis.</li></ul>{report.notes.map((n, i) => <p key={i} className="model-note">{n}</p>)}</Card>
  </>
}
