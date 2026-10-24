import { useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownUp, Download, ListFilter, RotateCcw, Search } from 'lucide-react'
import { Card, Empty, Notice, PageHeading, PatternChips, Score, TierBadge } from '../components'
import { useWorkspace } from '../context'
import { date, exportDecisions, number, rupiah } from '../lib'
import { PATTERNS, TYPE_NAMES } from '../types'
import type { Claim } from '../types'

type SortKey = 'risk_score' | 'faskes_id' | 'dx_name' | 'admit_date' | 'claim_total'
export default function Queue() {
  const { data, decisions, evaluation, storageError, selectClaim } = useWorkspace()
  const [search, setSearch] = useState(new URLSearchParams(location.hash.split('?')[1]).get('faskes') || '')
  const [tier, setTier] = useState(''), [pattern, setPattern] = useState(''), [facilityClass, setFacilityClass] = useState(''), [service, setService] = useState('')
  const [from, setFrom] = useState(''), [to, setTo] = useState('')
  const [sort, setSort] = useState<SortKey>('risk_score'), [ascending, setAscending] = useState(false)
  const parent = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => data.claims.filter(c =>
    (!search || `${c.claim_id} ${c.faskes_id}`.toLowerCase().includes(search.toLowerCase().trim())) &&
    (!tier || c.risk_tier === tier) && (!pattern || c.patterns.includes(pattern)) && (!facilityClass || c.faskes_class === facilityClass) &&
    (!service || c.service_type === service) && (!from || c.admit_date >= from) && (!to || c.admit_date <= to)
  ).sort((a, b) => { const av = a[sort], bv = b[sort]; const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'id'); return result * (ascending ? 1 : -1) || a.claim_id.localeCompare(b.claim_id) }), [data.claims, search, tier, pattern, facilityClass, service, from, to, sort, ascending])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 104, overscan: 5, getItemKey: i => rows[i].claim_id })
  const sortBy = (key: SortKey) => { if (sort === key) setAscending(!ascending); else { setSort(key); setAscending(key !== 'risk_score' && key !== 'claim_total') } }
  const sortHeader = (label: string, key: SortKey) => <button onClick={() => sortBy(key)} className={`sort-button ${sort === key ? 'active' : ''}`}>{label}<ArrowDownUp size={12} /></button>
  const reset = () => { setSearch(''); setTier(''); setPattern(''); setFacilityClass(''); setService(''); setFrom(''); setTo('') }
  const active = [search, tier, pattern, facilityClass, service, from, to].filter(Boolean).length
  return <>
    <PageHeading eyebrow="RUANG KERJA AUDITOR" title="Antrean audit" description="Periksa klaim teratas, pahami konteks, lalu tentukan tindak lanjut." action={<button className="button button-secondary" onClick={() => exportDecisions(decisions)} disabled={!Object.keys(decisions).length}><Download size={16} />Ekspor keputusan ({number(Object.keys(decisions).length)})</button>} />
    {evaluation && <Notice warning><b>Mode Evaluasi aktif.</b> Label sebenarnya pada data sintetis ditampilkan untuk pemeriksaan model; bukan masukan bagi model.</Notice>}
    {storageError && <Notice warning>{storageError}</Notice>}
    <Card className="filters"><div className="filter-top"><h2><ListFilter size={16} />Saring prioritas</h2><button className="text-link" onClick={reset} disabled={!active}><RotateCcw size={13} />Atur ulang {active > 0 && `(${active})`}</button></div><div className="filter-search"><Search size={17} /><input aria-label="Cari ID klaim atau faskes" placeholder="Cari ID klaim atau faskes…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="filter-grid">
      <label>Prioritas<select aria-label="Prioritas" value={tier} onChange={e => setTier(e.target.value)}><option value="">Semua prioritas</option><option value="high">Tinggi</option><option value="medium">Menengah</option><option value="low">Rendah</option></select></label>
      <label>Pola dugaan<select aria-label="Pola dugaan" value={pattern} onChange={e => setPattern(e.target.value)}><option value="">Semua pola</option>{PATTERNS.map(p => <option key={p}>{p}</option>)}</select></label>
      <label>Kelas faskes<select aria-label="Kelas faskes" value={facilityClass} onChange={e => setFacilityClass(e.target.value)}><option value="">Semua kelas</option>{['A', 'B', 'C', 'D'].map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Layanan<select aria-label="Layanan" value={service} onChange={e => setService(e.target.value)}><option value="">Semua layanan</option><option value="RITL">Rawat inap (RITL)</option><option value="RJTL">Rawat jalan (RJTL)</option></select></label>
      <label>Dari tanggal<input type="date" aria-label="Dari tanggal" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Sampai tanggal<input type="date" aria-label="Sampai tanggal" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
    </div>{from && to && from > to && <p role="alert" className="coral text-sm">Tanggal akhir harus sama atau setelah tanggal awal.</p>}</Card>
    <Card className="queue-card"><div className="queue-heading"><div><h2>Klaim untuk ditinjau <span className="count-badge">{number(rows.length)}</span></h2><p role="status">{number(rows.length)} dari {number(data.claims.length)} klaim ekspor · klik baris untuk membuka detail</p></div><span className="mini-label">{data.summary.data_source === 'sample' ? 'DATA CONTOH' : 'DATA SINTETIS'}</span></div>
      {rows.length ? <div className="queue-scroll" ref={parent} tabIndex={0} aria-label="Tabel antrean audit, dapat digulir"><div role="table" aria-label="Antrean klaim" aria-rowcount={rows.length + 1} className={`queue-table ${evaluation ? 'with-eval' : ''}`}><div role="rowgroup" className="queue-header"><div role="row" className="queue-row"><div role="columnheader" aria-sort={sort === 'risk_score' ? (ascending ? 'ascending' : 'descending') : 'none'}>{sortHeader('Skor / klaim', 'risk_score')}</div><div role="columnheader">Prioritas</div><div role="columnheader">{sortHeader('Faskes', 'faskes_id')}</div><div role="columnheader">{sortHeader('Diagnosis', 'dx_name')}</div><div role="columnheader">{sortHeader('Tanggal', 'admit_date')}</div><div role="columnheader">{sortHeader('Biaya klaim', 'claim_total')}</div><div role="columnheader">Pola dugaan</div>{evaluation && <div role="columnheader">Label sintetis</div>}</div></div><div role="rowgroup" style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map(v => { const c: Claim = rows[v.index]; return <div role="row" aria-rowindex={v.index + 2} tabIndex={0} key={c.claim_id} className="queue-row claim-row" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: v.size, transform: `translateY(${v.start}px)` }} onClick={() => selectClaim(c)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectClaim(c) } }} aria-label={`Buka klaim ${c.claim_id}`}><div role="cell" className="score-cell"><Score tier={c.risk_tier} value={c.risk_score} /><div><b>{c.claim_id}</b><small>{decisions[c.claim_id]?.decision || 'Belum ditinjau'}</small></div></div><div role="cell"><TierBadge tier={c.risk_tier} /></div><div role="cell"><b>{c.faskes_id}</b><small>Kelas {c.faskes_class} · {c.service_type}</small></div><div role="cell"><span className="diagnosis">{c.dx_name}</span><small>{c.dx} · Keparahan {c.severity}</small></div><div role="cell">{date(c.admit_date)}</div><div role="cell" className="cost-cell">{rupiah(c.claim_total)}</div><div role="cell"><PatternChips patterns={c.patterns} /></div>{evaluation && <div role="cell"><span className={c.eval?.label ? 'amber' : 'muted'}>{c.eval ? c.eval.label ? 'Pola disuntikkan' : 'Normal' : 'Tidak tersedia'}</span><small>{c.eval && c.eval.label ? TYPE_NAMES[c.eval.type] || c.eval.type : ''}</small></div>}</div> })}
      </div></div></div> : <Empty />}
      <div className="queue-footer"><span>Menampilkan klaim teratas yang diekspor, bukan seluruh data sumber.</span><span>Keputusan akhir ada pada auditor.</span></div>
    </Card>
  </>
}
