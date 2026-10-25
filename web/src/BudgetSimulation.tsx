import { Card, PerformanceLabel, PerformanceValue } from './components'
import { useWorkspace } from './context'
import { number, percent } from './lib'

export default function BudgetSimulation() {
  const { data } = useWorkspace()
  const budget = 5
  const baseline = data.summary.dataset.fraud_rate
  const hybrid = data.report.at_budget[String(budget)]
  if (!hybrid) return null
  const inverse = (rate: number) => rate > 0 ? number(1 / rate) : 'Tidak tersedia'
  const rows = [
    ['Kasus berlabel yang tertangkap', percent(budget / 100, 2), percent(hybrid.recall.hybrid, 2)],
    ['Proporsi klaim terperiksa yang berlabel bermasalah', percent(baseline, 2), percent(hybrid.precision.hybrid, 2)],
    ['Klaim diperiksa per kasus ditemukan', inverse(baseline), inverse(hybrid.precision.hybrid)],
  ]
  return <Card title={`Simulasi anggaran pemeriksaan ${number(budget)}%`} subtitle="Perbandingan pada jumlah pemeriksaan yang sama" className="budget-simulation">
    <PerformanceLabel />
    <div className="table-scroll" role="region" aria-label="Simulasi anggaran pemeriksaan, dapat digulir" tabIndex={0}>
      <table className="metrics-table budget-table"><thead><tr><th>Indikator</th><th>Sampling acak</th><th>KlaimGuard (hybrid)</th></tr></thead><tbody>{rows.map(([label, random, priority]) => <tr key={label}><th scope="row">{label}</th><td><PerformanceValue>{random}</PerformanceValue></td><td className="teal"><PerformanceValue>{priority}</PerformanceValue></td></tr>)}</tbody></table>
    </div>
    <p className="chart-caption">Sampling acak memakai nilai harapan dari base rate; ini simulasi pada data sintetis dan belum menunjukkan performa atau penghematan di dunia nyata.</p>
  </Card>
}
