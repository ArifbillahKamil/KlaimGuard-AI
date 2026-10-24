import type { Data, Decision } from './types'

export const number = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(n)
export const percent = (n: number, digits = 1) => new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: digits }).format(n)
export const rupiah = (n: number) => 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(n)
export const compactMoney = (n: number) => n >= 1e12 ? `Rp${number(n / 1e12)} triliun` : n >= 1e9 ? `Rp${number(n / 1e9)} miliar` : n >= 1e6 ? `Rp${number(n / 1e6)} juta` : rupiah(n)
export const date = (value: string) => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
export const STORAGE_KEY = 'klaimguard:auditor-decisions:v1'

export async function loadData(signal?: AbortSignal): Promise<Data> {
  const names = ['summary', 'claims_flagged', 'faskes_risk', 'model_report', 'feature_dictionary']
  const [summary, claims, facilities, report, dictionary] = await Promise.all(names.map(async name => {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`, { signal })
    if (!response.ok) throw new Error(`${name}.json tidak dapat dimuat (HTTP ${response.status}).`)
    try { return await response.json() } catch { throw new Error(`Format ${name}.json tidak valid.`) }
  }))
  if (!summary?.dataset?.synthetic) throw new Error('Dashboard ini hanya menerima data sintetis sesuai kontrak proyek.')
  if (!Array.isArray(claims) || !Array.isArray(facilities) || !Array.isArray(dictionary) || !Array.isArray(summary.score_hist?.counts) || !Array.isArray(report?.lift_curve)) throw new Error('Struktur JSON belum sesuai kontrak data. Periksa file ekspor.')
  return { summary, claims, facilities, report, dictionary }
}

export function readDecisions(): { decisions: Record<string, Decision>; error: string } {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    const entries = Object.entries(value).filter(([id, d]) => {
      const v = d as Decision
      return v && v.claim_id === id && ['Perlu diperiksa', 'Wajar', 'Eskalasi'].includes(v.decision) && typeof v.note === 'string' && typeof v.updated_at === 'string'
    })
    return { decisions: Object.fromEntries(entries) as Record<string, Decision>, error: entries.length !== Object.keys(value).length ? 'Sebagian keputusan lokal tidak valid dan diabaikan.' : '' }
  } catch { return { decisions: {}, error: 'Penyimpanan lokal tidak dapat dibaca. Keputusan baru tetap bisa dipakai selama sesi ini.' } }
}

export function exportDecisions(decisions: Record<string, Decision>) {
  const cell = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value.trimStart()) ? "'" : '') + value.replaceAll('"', '""')}"`
  const content = '\uFEFF' + [['claim_id', 'keputusan', 'catatan', 'waktu'], ...Object.values(decisions).map(d => [d.claim_id, d.decision, d.note, d.updated_at])].map(row => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a'); a.href = url; a.download = 'klaimguard-keputusan-auditor.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
