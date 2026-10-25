import { Card, PerformanceLabel, PerformanceValue } from './components'
import { useWorkspace } from './context'
import { number, percent } from './lib'

export default function BudgetSimulation() {
  const { data } = useWorkspace()
  const budget = 5
  const baseline = data.summary.dataset.fraud_rate
  const hybrid = data.report.at_budget[String(budget)]
  const heldFacility = data.report.grouped_eval?.faskes_id.at_budget[String(budget)]
  if (!hybrid) return null
  const inverse = (rate: number) => rate > 0 ? number(1 / rate) : 'Tidak tersedia'
  const rows = [
    { label: 'Sampling acak', recall: budget / 100, precision: baseline },
    { label: 'KlaimGuard — Validasi per klaim', recall: hybrid.recall.hybrid, precision: hybrid.precision.hybrid },
    ...(heldFacility ? [{ label: 'KlaimGuard — Validasi faskes ditahan (lebih ketat)', recall: heldFacility.recall.hybrid, precision: heldFacility.precision.hybrid }] : []),
  ]
  return <Card title={`Simulasi anggaran pemeriksaan ${number(budget)}%`} subtitle="Perbandingan pada jumlah pemeriksaan yang sama" className="budget-simulation">
    <PerformanceLabel />
    <div className="table-scroll" role="region" aria-label="Simulasi anggaran pemeriksaan, dapat digulir" tabIndex={0}>
      <table className="metrics-table budget-table budget-methods"><thead><tr><th>Metode / validasi</th><th>Kasus berlabel yang tertangkap</th><th>Proporsi klaim terperiksa yang berlabel bermasalah</th><th>Klaim diperiksa per kasus ditemukan</th></tr></thead><tbody>{rows.map(({ label, recall, precision }) => <tr key={label}><th scope="row">{label}</th>{[percent(recall, 2), percent(precision, 2), inverse(precision)].map((value, i) => <td key={i} className={label === 'Sampling acak' ? '' : 'teal'}><PerformanceValue>{value}</PerformanceValue></td>)}</tr>)}</tbody></table>
    </div>
    <p className="chart-caption">Sampling acak memakai nilai harapan dari base rate; ini simulasi pada data sintetis dan belum menunjukkan performa atau penghematan di dunia nyata.</p>
    <p className="chart-caption">Validasi faskes ditahan memisahkan faskes pada pelatihan dan pengujian supervised; IF dan referensi fitur tetap transduktif. Hasil ini tidak mengganti skor antrean.</p>
  </Card>
}
