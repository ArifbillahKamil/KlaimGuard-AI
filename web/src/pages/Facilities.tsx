import { useState } from 'react'
import { ArrowRight, Building2, CircleDollarSign, ScanLine } from 'lucide-react'
import { Card, Empty, Metric, PageHeading, TopClaims } from '../components'
import { useWorkspace } from '../context'
import { compactMoney, number, percent } from '../lib'

export default function Facilities() {
  const { data } = useWorkspace()
  const [id, setId] = useState(data.facilities[0]?.faskes_id || '')
  const selected = data.facilities.find(f => f.faskes_id === id)
  if (!selected) return <><PageHeading eyebrow="PERSPEKTIF FASILITAS" title="Risiko faskes" description="Lihat pola agregat sebagai bahan pemeriksaan." /><Card><Empty title="Belum ada data faskes." text="Periksa kembali hasil ekspor JSON." /></Card></>
  const max = Math.max(...data.facilities.map(f => f.high_rate), 0.01)
  const patterns = Object.entries(selected.pattern_counts).sort((a, b) => b[1] - a[1])
  return <>
    <PageHeading eyebrow="PERSPEKTIF FASILITAS" title="Risiko faskes" description="Lihat konsentrasi prioritas pemeriksaan, dengan konteks tiap fasilitas." />
    <div className="facility-layout"><Card title="Peringkat prioritas" subtitle="Prioritas agregat per fasilitas" className="facility-ranking"><div className="facility-table" role="table" aria-label="Peringkat faskes"><div className="facility-rank-header" role="row"><span role="columnheader">Faskes</span><span role="columnheader">Rasio klaim tinggi</span><span role="columnheader">Jumlah</span></div>{data.facilities.slice().sort((a, b) => a.risk_rank - b.risk_rank).map(f => <button role="row" key={f.faskes_id} className={`facility-row ${f.faskes_id === id ? 'selected' : ''}`} aria-label={`Lihat ${f.faskes_id}`} aria-selected={f.faskes_id === id} onClick={() => setId(f.faskes_id)}><span role="cell" className="facility-id"><span className="rank-number">{String(f.risk_rank).padStart(2, '0')}</span><span><b>{f.faskes_id}</b><small>Kelas {f.faskes_class} · {f.faskes_ownership}</small></span></span><span role="cell" className="facility-bar"><span>{percent(f.high_rate)}</span><span className="bar-track"><i style={{ width: `${f.high_rate / max * 100}%` }} /></span></span><span role="cell" className="text-right"><b>{number(f.n_high)}</b><small>dari {number(f.n_claims)}</small></span></button>)}</div></Card>
      <div className="facility-detail"><div className="facility-profile"><span className="facility-profile-icon"><Building2 size={25} /></span><div><div className="eyebrow">DETAIL FASKES SINTETIS</div><h2>{selected.faskes_id}</h2><p>Kelas {selected.faskes_class} · {selected.faskes_ownership}</p></div><span className="count-badge">#{selected.risk_rank}</span></div><div className="facility-metrics"><Metric label="Prioritas tinggi" value={number(selected.n_high)} description={`${percent(selected.high_rate)} dari klaim faskes`} icon={<ScanLine size={16} />} color="coral" /><Metric label="Estimasi kelebihan bayar" value={compactMoney(selected.est_excess_total)} description="Selisih terhadap median peer" icon={<CircleDollarSign size={16} />} color="amber" /></div>
        <Card title="Pola yang perlu ditinjau" subtitle={`Rata-rata skor ${number(selected.avg_risk)} · ${number(selected.n_claims)} klaim`}><div className="pattern-bars">{patterns.filter(([, n]) => n > 0).map(([p, n]) => <div className="pattern-bar" key={p}><div><span>{p}</span><b>{number(n)}</b></div><div className="bar-track"><i style={{ width: `${n / Math.max(...patterns.map(([, v]) => v), 1) * 100}%` }} /></div></div>)}{!patterns.some(([, n]) => n > 0) && <Empty title="Belum ada pola dugaan." text="Klaim tetap dapat diperiksa berdasarkan konteksnya." />}</div></Card>
        <Card title="Klaim teratas faskes ini" action={<a className="text-link" href={`#/antrean?faskes=${selected.faskes_id}`}>Antrean <ArrowRight size={14} /></a>}>{data.claimsLoaded ? <TopClaims claims={data.claims.filter(c => c.faskes_id === id).slice().sort((a, b) => b.risk_score - a.risk_score).slice(0, 4)} /> : <p className="chart-caption">Buka Antrean untuk meninjau klaim faskes ini beserta alasan SHAP dan keputusan auditor.</p>}</Card><p className="muted text-xs">Peringkat adalah prioritas tinjauan, bukan penilaian bersalah. Kompleksitas kasus dapat memengaruhi biaya.</p>
      </div>
    </div>
  </>
}
