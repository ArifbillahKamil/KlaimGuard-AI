import { Component, lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, ArrowUpRight, Building2, ChartNoAxesCombined, ChevronRight, CircleHelp, FlaskConical, LayoutDashboard, ListChecks, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { WorkspaceContext } from './context'
import { loadData, readDecisions, STORAGE_KEY } from './lib'
import type { Claim, Data, Decision, DecisionValue } from './types'
import Overview from './pages/Overview'
import Queue from './pages/Queue'
import Governance from './pages/Governance'
import ClaimDrawer from './ClaimDrawer'

const Facilities = lazy(() => import('./pages/Facilities'))
const Evaluation = lazy(() => import('./pages/Evaluation'))
const routes = [
  { path: '/', name: 'Ringkasan', icon: LayoutDashboard, caption: 'Gambaran prioritas' },
  { path: '/antrean', name: 'Antrean Audit', icon: ListChecks, caption: 'Tinjau setiap klaim' },
  { path: '/faskes', name: 'Faskes', icon: Building2, caption: 'Perspektif fasilitas' },
  { path: '/evaluasi', name: 'Evaluasi Model', icon: ChartNoAxesCombined, caption: 'Bukti & batasan' },
  { path: '/tata-kelola', name: 'Tata Kelola', icon: ShieldCheck, caption: 'Prinsip & tanggung jawab' },
]
function currentRoute() { return (location.hash.slice(1) || '/').split('?')[0] }
export function Skeleton() { return <div className="loading-state" role="status" aria-label="Memuat data dashboard"><div className="skeleton skeleton-heading" /><div className="metrics-grid">{[1, 2, 3, 4].map(n => <div key={n} className="skeleton skeleton-card" />)}</div><div className="skeleton skeleton-chart" /><span className="sr-only">Sedang memuat data sintetis…</span></div> }
class PageBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="error-state"><CircleHelp size={32} /><h1>Halaman belum dapat ditampilkan.</h1><p>Periksa struktur JSON atau muat ulang untuk mencoba kembali.</p><button className="button button-primary" onClick={() => location.reload()}>Muat ulang</button></div> : this.props.children }
}
export default function App() {
  const [route, setRoute] = useState(currentRoute)
  const [routeKey, setRouteKey] = useState(location.hash)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(''), [reload, setReload] = useState(0)
  const [menu, setMenu] = useState(false), [evaluation, setEvaluation] = useState(false)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 760px)').matches)
  const [initialStorage] = useState(readDecisions)
  const [decisions, setDecisions] = useState(initialStorage.decisions)
  const [storageError, setStorageError] = useState(initialStorage.error)
  const [selected, setSelected] = useState<Claim | null>(null)
  const closeDrawer = useCallback(() => setSelected(null), [])
  useEffect(() => {
    const change = () => { setRoute(currentRoute()); setRouteKey(location.hash); setMenu(false); setSelected(null); window.scrollTo(0, 0) }
    addEventListener('hashchange', change)
    return () => removeEventListener('hashchange', change)
  }, [])
  const current = routes.find(r => r.path === route)
  useEffect(() => { document.title = `${current?.name || 'Halaman tidak ditemukan'} · KlaimGuard AI` }, [current])
  useEffect(() => {
    const controller = new AbortController()
    setError('')
    loadData(controller.signal).then(setData).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Terjadi gangguan saat membaca data.') })
    return () => controller.abort()
  }, [reload])
  useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }; document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape) }, [])
  useEffect(() => { const media = matchMedia('(max-width: 760px)'); const change = () => setMobile(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change) }, [])
  const saveDecision = (claim: Claim, decision: DecisionValue, note: string) => {
    const updated: Record<string, Decision> = { ...decisions, [claim.claim_id]: { claim_id: claim.claim_id, decision, note, updated_at: new Date().toISOString() } }
    setDecisions(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); setStorageError('') } catch { setStorageError('Penyimpanan lokal gagal. Keputusan tersedia selama sesi ini; ekspor CSV sebelum menutup halaman.') }
  }
  const page = route === '/' ? <Overview /> : route === '/antrean' ? <Queue key={routeKey} /> : route === '/faskes' ? <Facilities /> : route === '/evaluasi' ? <Evaluation /> : route === '/tata-kelola' ? <Governance /> : <div className="empty"><h1>Halaman tidak ditemukan</h1><p>Pilih halaman dari navigasi.</p><a className="button button-primary" href="#/">Kembali ke Ringkasan</a></div>
  const shell = <>
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus() }}>Lewati ke konten utama</a>
    {menu && <button className="nav-backdrop" aria-label="Tutup navigasi" onClick={() => setMenu(false)} />}
    <aside inert={mobile && !menu} className={`sidebar ${menu ? 'open' : ''}`}><a href="#/" className="brand"><span className="brand-symbol"><ShieldCheck size={27} strokeWidth={1.8} /></span><span>KlaimGuard<span className="brand-ai">AI</span><small>INTELIJENSI AUDIT KLAIM</small></span></a><button className="mobile-close icon-button" aria-label="Tutup navigasi" onClick={() => setMenu(false)}><X size={20} /></button><div className="nav-section-label">RUANG KERJA</div><nav aria-label="Navigasi utama">{routes.map(r => <a key={r.path} href={`#${r.path}`} className={`nav-item ${route === r.path ? 'active' : ''}`} aria-current={route === r.path ? 'page' : undefined}><r.icon size={19} strokeWidth={1.7} /><span>{r.name}</span>{route === r.path && <ChevronRight size={14} />}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span className="sidebar-note-icon"><ShieldCheck size={20} /></span><h3>Asisten bagi auditor.</h3><p>Rekomendasi berbasis risiko.<br />Keputusan tetap pada manusia.</p><a href="#/tata-kelola">Prinsip tata kelola <ArrowUpRight size={13} /></a></div><div className="project-tag"><span className="project-avatar">AK</span><div><b>Prototipe Healthkathon</b><small>KlaimGuard AI · 2026</small></div><span className="status-dot teal" /></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="Buka navigasi" aria-expanded={menu} onClick={() => setMenu(!menu)}><Menu size={22} /></button><span>Ruang kerja auditor</span><ChevronRight size={13} /><b>{current?.name || 'Halaman'}</b></div><div className="topbar-status">{evaluation && <a href="#/evaluasi" className="evaluation-pill"><FlaskConical size={13} />Mode Evaluasi</a>}<span className="connection-dot" /><span>Prototipe lokal</span><span className="topbar-avatar">AK</span></div></header>
      <div className="data-banner"><span><Activity size={14} /><b>{data?.summary.data_source === 'sample' ? 'Data contoh sintetis' : 'Data sintetis'}</b><span className="banner-dot">·</span>Skor adalah rekomendasi prioritas</span><span className="banner-right">{data?.summary.data_source === 'sample' ? 'Angka & SHAP ilustratif · bukan hasil ML' : 'Bukan klaim performa dunia nyata'}</span></div>
      <main id="main-content" tabIndex={-1}><PageBoundary key={routeKey}>{error ? <div className="error-state" role="alert"><CircleHelp size={36} /><h1>Data belum dapat dimuat.</h1><p>{error}</p><p>Pastikan lima file JSON tersedia di folder public/data.</p><button className="button button-primary" onClick={() => { setData(null); setReload(n => n + 1) }}><RefreshCw size={15} />Coba lagi</button></div> : !data ? <Skeleton /> : <Suspense fallback={<Skeleton />}>{page}</Suspense>}</PageBoundary></main>
      <footer className="app-footer"><span><ShieldCheck size={14} />Data sintetis · Bukan data peserta JKN.</span><span>Angka performa bukan klaim performa dunia nyata. Keputusan akhir ada pada auditor.</span></footer>
    </div>
    {data && selected && <ClaimDrawer key={selected.claim_id} claim={selected} onClose={closeDrawer} />}
  </>
  return data ? <WorkspaceContext value={{ data, decisions, storageError, evaluation, setEvaluation, saveDecision, selectClaim: setSelected }}>{shell}</WorkspaceContext> : shell
}
