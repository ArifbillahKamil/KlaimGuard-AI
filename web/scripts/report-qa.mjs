import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const qa = await read(`${root}/qa-results/results.json`)
const performance = await read(`${root}/qa-results/performance-results.json`)
const model = await read(`${root}/public/data/model_report.json`)
const summary = await read(`${root}/public/data/summary.json`)
const groupAudit = await read(`${root}/../ml/reports/grouped_eval_audit.json`)
assert.equal(qa.passed, 15); assert.equal(performance.results.length, 4)
assert.deepEqual(qa.runtimeErrors, []); assert.deepEqual(qa.consoleErrors, [])
const protectedHashes = {}
for (const [path, expected] of Object.entries(groupAudit.protected_sha256_before)) {
  const actual = createHash('sha256').update(await readFile(path)).digest('hex')
  assert.equal(actual.toUpperCase(), expected.toUpperCase(), `Protected original changed: ${path}`)
  protectedHashes[path] = actual
}
const fmt = (value, digits = 2) => value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n')
const metrics = []
for (const [group, result] of Object.entries(model.grouped_eval)) {
  for (const variant of ['xgb_only', 'hybrid']) {
    const values = [group, variant, fmt(result.pr_auc[variant], 6)]
    for (const budget of ['2', '5', '10']) values.push(fmt(result.at_budget[budget].recall[variant] * 100) + '%', fmt(result.at_budget[budget].precision[variant] * 100) + '%')
    metrics.push(values)
  }
}
const lh = performance.results.map(result => [result.page, result.device, result.categories.performance, result.categories.accessibility, result.categories['best-practices'], fmt(result.lcp_ms / 1000) + ' dtk', fmt(result.tbt_ms, 1) + ' ms', fmt(result.cls, 6)])
const v = qa.measurements.virtual_scroll
const changes = [
  'Ringkasan: kartu "Simulasi anggaran pemeriksaan 5%" membandingkan recall, precision/base rate, dan kebalikan rate; semua angka dihitung dari JSON.',
  'Angka performa: label "Data sintetis | validasi silang 5-fold" terlihat per kelompok metrik dan melekat pada setiap nilai lewat tooltip serta teks pembaca layar.',
  'Evaluasi: tabel AP/recall/precision ketiga varian dan catatan "Hybrid belum unggul atas xgb_only pada AP evaluasi per klaim ini".',
  'Hold-out: penjelasan "Pola yang belum pernah dilihat sebagian besar tidak tertangkap model supervised"; tidak mengklaim hybrid unggul secara umum.',
  'Evaluasi per kelompok: tabel faskes/pasien, recall per jenis, dan satu kalimat batas transduktif per skema.',
  'Batasan: data sintetis, pola disuntikkan, overlap terarah dipilih setelah melihat data penuh, evaluasi transduktif dan risiko false positive.',
  'Antrean: "3.000 klaim teratas dari 62.711" dari JSON; default Mode Evaluasi tetap tersembunyi; skor sama menjaga urutan ekspor.',
  'Matriks: menjelaskan subset ekspor dan bahwa nol FN/TN ketika seluruh subset diprioritaskan bukan bukti semua kasus dataset tertangkap.',
  'Tata Kelola: paragraf retraining berkala dan jalur anomali terpisah sebagai rencana pengembangan untuk pola baru.',
]
const text = `# Gate C — QA lokal dengan ekspor ML aktual

25 Oktober 2026. **Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir tetap pada auditor manusia.**

Gate A disetujui bersyarat. Evaluasi kelompok, integrasi dan QA selesai; **belum deploy**. Model tidak disetel dan skor OOF antrean tidak diganti. Enam hash terlindungi (empat JSON non-report, OOF NPZ, SHAP NPY) masih identik dengan sebelum evaluasi kelompok.

## Evaluasi kelompok

StratifiedGroupKFold lima fold, stratifikasi fraud_type, seed 42, shuffle=True. Validasi internal juga memisahkan kelompok, dengan aturan early stopping/refit dan parameter estimator tetap. Sebelas unit test ML lolos. Audit 20 model grouped menyatakan outer/inner groups disjoint; setiap klaim mendapat satu prediksi uji. IF dan referensi fitur tetap transduktif.

${table(['Kelompok', 'Varian', 'AP', 'R@2%', 'P@2%', 'R@5%', 'P@5%', 'R@10%', 'P@10%'], metrics)}

Recall per jenis lengkap ada di [laporan grouped](../ml/reports/GROUPED_EVAL.md), \x60model_report.json\x60, dan halaman Evaluasi. AP faskes terpisah turun, sedangkan AP pasien terpisah sedikit naik; tidak semua pemisahan kelompok otomatis menurunkan metrik. Hybrid tetap belum unggul pada evaluasi per klaim Gate A. Perbandingan ini belum membuktikan generalisasi prospektif karena referensi fitur/IF masih memakai batch penuh tanpa label.

## Hasil QA aktual

- Build bersih: TypeScript dan Vite v6.4.5 lolos; bundel awal sekitar 97,27 kB gzip. Vite membersihkan output build sebelum menulis hasil baru.
- ${qa.passed} kelompok pemeriksaan browser lolos; **0 error console/runtime tak terduga** pada rute dan alur normal. Respons 503/JSON rusak sengaja disuntikkan di konteks browser terpisah untuk negative test.
- Data ML aktual: ${summary.dataset.n_claims.toLocaleString('id-ID')} klaim sumber, ${qa.n_exported_claims.toLocaleString('id-ID')} klaim antrean, ${summary.dataset.n_faskes} faskes; schema, pola resmi, referensi pasien dan estimasi rupiah diperiksa.
- Lima rute langsung, semua filter, pencarian, pengurutan, panel detail berisi tiga SHAP aktual, fokus keyboard, keputusan + catatan, persistensi setelah reload dan CSV lolos.
- CSV diuji dengan UTF-8 BOM, koma, tanda kutip, newline dan awalan formula; tidak menjalankan formula.
- Mode Evaluasi nonaktif setelah muat/reload; label individual hanya muncul setelah opt-in. Matriks subset diberi peringatan.
- Kelima halaman desktop dan mobile 390 px lolos pemeriksaan otomatis axe WCAG A/AA, termasuk panel desktop; tidak ada overflow halaman pada 390 px. Ini tidak menggantikan audit manual aksesibilitas penuh.
- Dua belas PNG aktual diambil ulang: lima halaman + detail, desktop dan mobile. [Indeks screenshot](screenshots/README.md).
- Tabel virtual: maksimum **${v.max_dom_rows} baris DOM** selama ${v.frames} frame pengguliran; median interval **${fmt(v.median_ms, 1)} ms**, p95 **${fmt(v.p95_ms, 1)} ms**, maksimum **${fmt(v.max_ms, 1)} ms**. Pencarian **${qa.measurements.search_ms} ms**. Angka lokal headless tanpa throttling, bukan jaminan pada seluruh perangkat.
- Storage kosong/rusak/ditolak, loading, empty, JSON gagal/retry, schema salah dan pemulihan rute tidak dikenal lolos.

## Lighthouse

Lighthouse 13.5.0, Chromium headless, data ML aktual. **Satu run per skenario**; seluruh hasil disimpan. Desktop 1440 × 1050, RTT 40 ms, throughput 10.240 Kbps, CPU 1x. Mobile 390 × 844, RTT 150 ms, throughput 1.638,4 Kbps, CPU 4x. Kategori yang diukur: Performance, Accessibility, Best Practices.

${table(['Halaman', 'Perangkat', 'Performance', 'Accessibility', 'Best Practices', 'LCP', 'TBT', 'CLS'], lh)}

Mobile **belum mencapai 90** pada pengukuran ini. LCP mobile sekitar 3,7 detik, meskipun TBT rendah. Laporan mentah mencatat JavaScript yang belum terpakai dan permintaan CSS yang memblokir render; pengumpulan seluruh JSON juga masih berada pada jalur pemuatan awal. BFCache dinonaktifkan oleh flag browser pengujian. Hasil lokal/preview ini belum menggantikan pengujian hosting produksi atau perangkat riil.

## Daftar perubahan teks UI

${changes.map((change, index) => `${index + 1}. ${change}`).join('\n')}

## Temuan dan perbaikan

1. QA menemukan overflow mobile akibat teks pembaca layar pada angka di kolom tabel horizontal; posisi label dibatasi pada nilai terkait. Tabel simulasi kini menampilkan dua metode sekaligus pada 390 px.
2. Seluruh subset 3.000 ekspor masuk dalam budget 5% yang berisi 3.136 klaim; karena itu matriks subset dapat mempunyai FN/TN nol. UI sekarang menyatakannya eksplisit.
3. Pemisahan faskes menurunkan AP hybrid ke ${fmt(model.grouped_eval.faskes_id.pr_auc.hybrid, 6)}, sementara pasien terpisah menghasilkan ${fmt(model.grouped_eval.patient_id.pr_auc.hybrid, 6)}. Skor Antrean tetap OOF per klaim dari Gate A.
4. Desktop mendapat Performance 100, tetapi mobile hanya 88/89 pada kondisi throttling yang dicatat. Tidak dilakukan penyetelan model atau pemilihan skor Lighthouse terbaik.

## Reproduksi

Jalankan dari \x60web/\x60:

\x60\x60\x60powershell
npm ci
npm run build
npm run preview -- --port 4173 --strictPort
\x60\x60\x60

Di terminal lain dari folder yang sama:

\x60\x60\x60powershell
npm run qa
node scripts/performance.mjs
node scripts/report-qa.mjs
\x60\x60\x60

Evaluasi kelompok: dari \x60ml/\x60, \x60$env:PYTHONUTF8 = "1"\x60 lalu \x60.\\.venv\\Scripts\\python.exe -m src.evaluate --grouped-only --artifact-dir artifacts/final_run\x60.

Artefak terperinci lokal ada di \x60qa-results/\x60 (diabaikan Git); ringkasan terstruktur di \x60qa-report.json\x60. Skor dan sumber data tetap sama. **Berhenti di Gate C; deploy memerlukan konfirmasi Abil.**
`
await writeFile(`${root}/QA.md`, text, 'utf8')
await writeFile(`${root}/qa-report.json`, JSON.stringify({ generated_at: new Date().toISOString(), data_source: 'ml_oof', browser_qa: qa,
  performance, grouped_eval: model.grouped_eval, protected_originals_unchanged: true, protected_sha256: protectedHashes,
  model_tuning: false, deployment: 'not performed; waiting at Gate C', ui_text_changes: changes }, null, 2) + '\n', 'utf8')
console.log(`Gate C report saved: ${qa.passed} QA checks, 4 Lighthouse runs, 12 screenshots; original score hashes unchanged.`)
