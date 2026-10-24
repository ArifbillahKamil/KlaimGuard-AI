import { mkdir, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../public/data/', import.meta.url))
await mkdir(dir, { recursive: true })
try {
  const existing = JSON.parse(await (await import('node:fs/promises')).readFile(`${dir}/summary.json`, 'utf8'))
  if (existing.data_source !== 'sample') throw new Error('JSON hasil ML sudah ada; generator contoh dibatalkan agar data tidak tertimpa.')
} catch (error) { if (error.code !== 'ENOENT') throw error }
let seed = 42
const random = () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296 }
const patterns = [
  'Phantom billing (klaim palsu)', 'Repeat billing (klaim berulang)',
  'Manipulasi diagnosis dan/atau tindakan (upcoding)', 'Services unbundling / fragmentation',
  'Inflated bills (penggelembungan tagihan)', 'Cloning (penjiplakan klaim)',
]
const types = ['phantom', 'repeat', 'upcoding', 'unbundling', 'inflated', 'cloning']
const diagnoses = [['I50', 'Gagal jantung'], ['E11', 'Diabetes melitus tipe 2'], ['J18', 'Pneumonia'], ['N18', 'Penyakit ginjal kronis'], ['K35', 'Apendisitis akut'], ['I63', 'Infark serebral']]
const dictionary = [
  { feature: 'dx_peer_ratio', label: 'Rasio biaya vs peer', explain: 'Perbandingan biaya terhadap median diagnosis, kelas faskes, dan layanan sejenis.', template: 'Biaya {value} kali median faskes sejenis' },
  { feature: 'same_pat_fk_3d', label: 'Kunjungan berdekatan', explain: 'Jumlah klaim pasien yang berdekatan di faskes yang sama.', template: '{value} klaim berdekatan dalam 3 hari' },
  { feature: 'pair_rarity', label: 'Kelangkaan diagnosis–tindakan', explain: 'Seberapa jarang kombinasi diagnosis dan tindakan ditemukan.', template: 'Kombinasi diagnosis dan tindakan jarang ditemukan' },
  { feature: 'nn_dist', label: 'Kemiripan antar klaim', explain: 'Jarak terhadap klaim lain yang paling mirip.', template: 'Struktur biaya sangat mirip dengan klaim lain' },
  { feature: 'los', label: 'Durasi layanan', explain: 'Lama perawatan dibanding klaim lain.', template: 'Durasi layanan lebih wajar dibanding pola lain' },
]
const claims = Array.from({ length: 300 }, (_, i) => {
  const [dx, dx_name] = diagnoses[i % 6]
  const peer = Math.round((2400000 + random() * 13000000) / 10000) * 10000
  const ratio = i < 30 ? 1.35 + random() * 1.9 : 0.6 + random() * 0.8
  const claim_total = Math.round(peer * ratio / 10000) * 10000
  const risk_score = Math.round((299 - i) / 299 * 100)
  const label = i < 30 ? (i % 5 !== 3 ? 1 : 0) : (i % 59 === 0 ? 1 : 0)
  const p = i % 6
  return {
    claim_id: `C${String(123 + i).padStart(6, '0')}`,
    patient_ref: 'PX-' + createHash('sha1').update(`SAMPLE-P${i % 247}`).digest('hex').slice(0, 6),
    faskes_id: `RS${String(i % 12 + 1).padStart(3, '0')}`, faskes_class: ['A', 'B', 'C', 'D'][i % 4],
    faskes_ownership: i % 3 === 0 ? 'Pemerintah' : 'Swasta', service_type: i % 3 === 1 ? 'RJTL' : 'RITL',
    dx, dx_name, proc: ['88.72', '99.29', '87.44', '39.95', '47.09', '89.14'][p], severity: ['I', 'II', 'III'][i % 3],
    admit_date: `2025-${String(1 + i % 12).padStart(2, '0')}-${String(1 + i % 27).padStart(2, '0')}`, los: i % 3 === 1 ? 0 : 2 + i % 8,
    claim_total, peer_median: peer, est_excess: Math.max(0, claim_total - peer), risk_score,
    risk_tier: i < 9 ? 'high' : i < 30 ? 'medium' : 'low', if_score: Math.max(0, Math.min(100, risk_score - 16 + Math.round(random() * 29))),
    patterns: i < 55 ? [patterns[p], ...(i % 7 === 0 ? [patterns[(p + 2) % 6]] : [])] : [],
    reasons: [
      { feature: 'dx_peer_ratio', text: `Biaya ${ratio.toFixed(1).replace('.', ',')} kali median faskes sejenis untuk ${dx_name}`, shap: +(ratio * 0.73).toFixed(2), direction: 'up' },
      { feature: p % 2 ? 'nn_dist' : 'same_pat_fk_3d', text: p % 2 ? 'Struktur biaya berpotensi mirip dengan klaim lain' : 'Terdapat klaim berdekatan dalam 3 hari; perlu diperiksa', shap: +(0.2 + random()).toFixed(2), direction: 'up' },
      { feature: 'los', text: 'Durasi layanan menurunkan rekomendasi prioritas pemeriksaan', shap: -+(0.08 + random() * 0.4).toFixed(2), direction: 'down' },
    ],
    eval: { label, type: label ? types[p] : 'normal' },
  }
})
const faskes = Array.from({ length: 12 }, (_, i) => {
  const group = claims.filter(c => c.faskes_id === `RS${String(i + 1).padStart(3, '0')}`)
  return { faskes_id: group[0].faskes_id, faskes_class: group[0].faskes_class, faskes_ownership: group[0].faskes_ownership,
    n_claims: group.length, n_high: group.filter(c => c.risk_tier === 'high').length,
    high_rate: group.filter(c => c.risk_tier === 'high').length / group.length,
    avg_risk: group.reduce((n, c) => n + c.risk_score, 0) / group.length,
    est_excess_total: group.reduce((n, c) => n + c.est_excess, 0),
    pattern_counts: Object.fromEntries(patterns.map(p => [p, group.filter(c => c.patterns.includes(p)).length])), risk_rank: 0 }
}).sort((a, b) => b.high_rate - a.high_rate || b.avg_risk - a.avg_risk).map((f, i) => ({ ...f, risk_rank: i + 1 }))
const totalPositive = claims.filter(c => c.eval.label).length
const summary = {
  generated_at: '2026-10-24T12:00:00+07:00', data_source: 'sample',
  dataset: { n_claims: 300, n_faskes: 12, n_patients: 247, fraud_rate: totalPositive / 300, synthetic: true },
  kpi: { n_high: 9, n_medium: 21, n_low: 270, est_excess_total_idr: claims.reduce((n, c) => n + c.est_excess, 0), n_faskes_high_risk: faskes.filter(f => f.n_high > 0).length },
  tiers: { high_top_pct: 3, medium_top_pct: 10, score_cut_high: 97, score_cut_medium: 90 },
  score_hist: { bin_edges: Array.from({ length: 21 }, (_, i) => i * 5), counts: Array.from({ length: 20 }, (_, i) => claims.filter(c => c.risk_score >= i * 5 && (i === 19 ? c.risk_score <= 100 : c.risk_score < (i + 1) * 5)).length) },
  disclaimer: 'Data contoh sintetis. Bukan data peserta JKN. Skor dan metrik ilustratif; bukan hasil pelatihan atau klaim performa dunia nyata.',
}
const metrics = { if_only: 0.34, xgb_only: 0.61, hybrid: 0.68 }
const recall = (pct) => claims.slice(0, Math.ceil(300 * pct / 100)).filter(c => c.eval.label).length / totalPositive
const report = {
  config: { seed: 42, folds: 5, if_params: {}, xgb_params: {} },
  pr_auc: metrics,
  at_budget: Object.fromEntries([2, 5, 10].map(p => [p, { recall: { if_only: recall(p) * 0.63, xgb_only: recall(p) * 0.9, hybrid: recall(p) }, precision: { hybrid: claims.slice(0, p * 3).filter(c => c.eval.label).length / (p * 3) } }])),
  lift_curve: Array.from({ length: 101 }, (_, pct) => ({ pct, recall_hybrid: recall(pct), recall_random: pct / 100 })),
  per_type_recall_at_5: Object.fromEntries(types.map(t => { const subset = claims.filter(c => c.eval.type === t); const v = subset.filter(c => claims.indexOf(c) < 15).length / Math.max(1, subset.length); return [t, { if_only: v * 0.6, xgb_only: v * 0.85, hybrid: v }] })),
  holdout: Object.fromEntries(types.map((t, i) => [t, { if_only: 0.12 + i * 0.065, xgb_only: 0.10 + i * 0.04, hybrid: 0.15 + i * 0.07 }])),
  feature_importance: dictionary.map((d, i) => ({ feature: d.feature, label: d.label, importance: [0.35, 0.25, 0.2, 0.15, 0.05][i] })),
  notes: ['DATA CONTOH: seluruh metrik, kontribusi SHAP, dan hasil hold-out bersifat ilustratif untuk pengujian antarmuka; tidak ada model dilatih.', 'Rancangan pipeline: seed 42, skor hybrid out-of-fold 5-fold. Implementasi dan hasil aktual menunggu Prompt 1.', 'Klaim sintetis bukan data peserta JKN. Performa dunia nyata belum divalidasi.'],
}
for (const [name, data] of Object.entries({ summary, claims_flagged: claims, faskes_risk: faskes, model_report: report, feature_dictionary: dictionary })) {
  await writeFile(`${dir}/${name}.json`, JSON.stringify(data, null, 2) + '\n', 'utf8')
}
await access(`${dir}/summary.json`)
console.log(`Sample seed=42: ${claims.length} claims, ${faskes.length} facilities, ${totalPositive} illustrative labels. 5 JSON files written. No ML model trained.`)
