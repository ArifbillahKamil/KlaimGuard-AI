import { useEffect, useRef, useState } from 'react'
import { Check, Save, X } from 'lucide-react'
import { useWorkspace } from './context'
import { Notice, PatternChips, Score, ShapReasons, TierBadge } from './components'
import { date, number, rupiah } from './lib'
import type { Claim, DecisionValue } from './types'

export default function ClaimDrawer({ claim, onClose }: { claim: Claim; onClose: () => void }) {
  const { data, decisions, saveDecision, storageError, evaluation } = useWorkspace()
  const saved = decisions[claim.claim_id]
  const [decision, setDecision] = useState<DecisionValue | ''>(saved?.decision || '')
  const [note, setNote] = useState(saved?.note || '')
  const [notice, setNotice] = useState('')
  const panel = useRef<HTMLDivElement>(null)
  const dirty = (decision !== (saved?.decision || '') || note !== (saved?.note || ''))
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const list = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], [tabindex="0"]')
        if (!list?.length) return
        const first = list[0], last = list[list.length - 1]
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [onClose])
  const close = () => { if (!dirty || window.confirm('Ada perubahan yang belum disimpan. Tutup panel?')) onClose() }
  return <div className="drawer-backdrop" onClick={close}><div className="drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title" tabIndex={-1} ref={panel} onClick={e => e.stopPropagation()}>
    <div className="drawer-header"><div><span className="eyebrow">TINJAU KLAIM</span><h2 id="detail-title">{claim.claim_id}</h2></div><button className="icon-button" aria-label="Tutup detail klaim" onClick={close}><X size={21} /></button></div>
    <div className="drawer-body"><div className="drawer-score"><Score tier={claim.risk_tier} value={claim.risk_score} large /><div><TierBadge tier={claim.risk_tier} /><h3>Prioritas pemeriksaan</h3><p>Skor hybrid {number(claim.risk_score)}/100</p><p>Isolation Forest {number(claim.if_score)}/100</p></div></div>
      {data.summary.data_source === 'sample' && <Notice warning>Data contoh: skor, pola, dan SHAP ilustratif. Belum berasal dari model ML.</Notice>}
      <section><h3>Ringkasan klaim</h3><dl className="detail-grid"><div><dt>Faskes</dt><dd>{claim.faskes_id} · Kelas {claim.faskes_class}</dd></div><div><dt>Referensi pasien sintetis</dt><dd>{claim.patient_ref}</dd></div><div><dt>Diagnosis</dt><dd>{claim.dx} · {claim.dx_name}</dd></div><div><dt>Tindakan · Keparahan</dt><dd>{claim.proc} · {claim.severity}</dd></div><div><dt>Layanan</dt><dd>{claim.service_type} · {claim.los} hari</dd></div><div><dt>Tanggal masuk</dt><dd>{date(claim.admit_date)}</dd></div></dl></section>
      <section><h3>Perbandingan biaya</h3><div className="cost-compare"><div><span>Biaya klaim</span><b>{rupiah(claim.claim_total)}</b><div className="bar-track"><i className="bg-coral" style={{ width: `${claim.claim_total / Math.max(claim.claim_total, claim.peer_median, 1) * 100}%` }} /></div></div><div><span>Median peer sejenis</span><b>{rupiah(claim.peer_median)}</b><div className="bar-track"><i className="bg-teal" style={{ width: `${claim.peer_median / Math.max(claim.claim_total, claim.peer_median, 1) * 100}%` }} /></div></div></div><div className="excess"><span>Estimasi kelebihan bayar</span><b>{rupiah(claim.est_excess)}</b></div><p className="muted text-xs">Peer: diagnosis × kelas faskes × tipe layanan. Selisih biaya bukan bukti kerugian.</p></section>
      <section><h3>Mengapa perlu diperiksa?</h3><ShapReasons claim={claim} /></section>
      <section><h3>Pola yang berpotensi muncul</h3><PatternChips patterns={claim.patterns} /><p className="muted text-xs mt-3">Dugaan berbasis aturan transparan; perlu verifikasi auditor.</p></section>
      {evaluation && claim.eval && <Notice warning>Label sintetis: {claim.eval.label ? 'Pola disuntikkan' : 'Normal'} · {claim.eval.type}. Hanya untuk evaluasi.</Notice>}
      <section className="decision-section"><h3>Keputusan auditor</h3><p className="muted text-sm">Keputusan akhir ada pada auditor.</p><div className="decision-options" role="group" aria-label="Pilih keputusan auditor">{(['Perlu diperiksa', 'Wajar', 'Eskalasi'] as DecisionValue[]).map(d => <button key={d} className={`decision-option ${decision === d ? 'selected' : ''}`} aria-pressed={decision === d} onClick={() => { setDecision(d); setNotice('') }}>{decision === d && <Check size={13} />}{d}</button>)}</div><label htmlFor="audit-note">Catatan pemeriksaan</label><textarea id="audit-note" value={note} maxLength={2000} rows={4} onChange={e => { setNote(e.target.value); setNotice('') }} placeholder="Tuliskan konteks dan tindak lanjut yang diperlukan…" /><p className="muted text-xs">Disimpan di peramban ini. Ekspor CSV untuk membuat salinan.</p><button className="button button-primary w-full" disabled={!decision} onClick={() => { if (decision) { saveDecision(claim, decision, note); setNotice('Keputusan diperbarui.') } }}><Save size={16} />Simpan keputusan</button><p role="status" className="save-notice">{notice || (saved ? `Keputusan terakhir: ${saved.decision}` : 'Belum ada keputusan tersimpan.')}</p>{storageError && <Notice warning>{storageError}</Notice>}</section>
    </div><div className="drawer-footer"><ShieldLabel /></div>
  </div></div>
}
function ShieldLabel() { return <span>Data sintetis · Rekomendasi prioritas, keputusan oleh manusia.</span> }
