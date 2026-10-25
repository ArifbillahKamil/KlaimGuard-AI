import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const project = resolve(root, '..')
const read = async path => JSON.parse(await readFile(path, 'utf8'))
const qa = await read(`${root}/qa-results/results.json`)
const historicalComparison = await read(`${root}/performance-comparison.json`).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
const historicalRun = async (label, fallback) => read(`${root}/qa-results/performance-${label}.json`).catch(error => { if (error.code !== 'ENOENT' || !fallback) throw error; return fallback })
const before = await historicalRun('before-lazy', historicalComparison?.before)
const after = await historicalRun('after-lazy', historicalComparison?.after)
const repo = await read(`${root}/qa-results/repo-check.json`)
const model = await read(`${root}/public/data/model_report.json`)
const groupAudit = await read(`${project}/ml/reports/grouped_eval_audit.json`)
assert.equal(qa.passed, 16)
assert.equal(before.results.length, 2); assert.equal(after.results.length, 2)
assert.deepEqual(qa.runtimeErrors, []); assert.deepEqual(qa.consoleErrors, [])
const protectedHashes = {}, artifactChecks = {}
for (const [stored, expected] of Object.entries(groupAudit.protected_sha256_before)) {
  const path = stored.startsWith('<folder proyek>') ? resolve(project, stored.slice('<folder proyek>'.length).replaceAll('\\', '/').replace(/^\//, '')) : stored
  const name = relative(project, path).replaceAll('\\', '/')
  try {
    const actual = createHash('sha256').update(await readFile(path)).digest('hex')
    assert.equal(actual.toUpperCase(), expected.toUpperCase(), `Protected file changed: ${name}`)
    protectedHashes[name] = actual
    artifactChecks[name] = 'unchanged'
  } catch (error) {
    if (error.code !== 'ENOENT' || !name.startsWith('ml/artifacts/')) throw error
    artifactChecks[name] = 'not checked: local artifact absent in this checkout'
  }
}
assert.equal(repo.all_five_export_files_unchanged, true)
const fmt = (n, digits = 2) => n.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const table = (headers, rows) => ['| ' + headers.join(' | ') + ' |', '| ' + headers.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + row.join(' | ') + ' |')].join('\n')
const mobile = [before, after].flatMap((run, index) => run.results.map(r => [index ? 'Sesudah lazy' : 'Sebelum lazy', r.page, r.categories.performance,
  r.categories.accessibility, r.categories['best-practices'], fmt(r.lcp_ms / 1000, 3), fmt(r.tbt_ms, 1), fmt(r.cls, 6)]))
const grouped = Object.entries(model.grouped_eval).flatMap(([group, result]) => ['xgb_only', 'hybrid'].map(variant => [group, variant, fmt(result.pr_auc[variant], 6),
  ...['2', '5', '10'].flatMap(b => [fmt(result.at_budget[b].recall[variant] * 100) + '%', fmt(result.at_budget[b].precision[variant] * 100) + '%'])]))
const changes = [
  'Simulasi 5%: satu baris acak, KlaimGuard validasi per klaim, dan KlaimGuard validasi faskes ditahan (lebih ketat); recall/precision dan kebalikan precision dihitung dari JSON.',
  'Ringkasan: tautan ke Antrean mengganti daftar detail klaim agar payload klaim tidak diminta di jalur awal.',
  'Faskes dan Evaluasi: jelaskan saat klaim belum dimuat; matriks tidak menampilkan nol palsu dan dapat dibuka setelah mengunjungi Antrean.',
  'Label performa tetap Data sintetis | validasi silang 5-fold; hybrid belum unggul atas xgb_only pada AP evaluasi per klaim.',
  'Hold-out, batas transduktif, overlap yang dipilih setelah melihat data penuh, subset matriks dan rencana retraining/jalur anomali tetap dinyatakan jujur.',
]
const v = qa.measurements.virtual_scroll
const text = `# QA lokal final — persiapan publikasi oleh Abil

25 Oktober 2026. **Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir tetap pada auditor manusia.**

Gate C disetujui. Agent selesai pada commit lokal; **tidak push dan tidak deploy**. Abil melanjutkan melalui [DEPLOY.md](../DEPLOY.md). Model dan seluruh skor OOF tidak diubah. Kelima JSON ekspor identik SHA256 dengan checkpoint Gate C setelah normalisasi LF/CRLF Git; hash mentah disimpan terpisah. Empat JSON non-report serta OOF/SHAP lokal juga dibandingkan langsung dengan hash mentah audit sebelumnya jika artefaknya tersedia.

## Build dan QA terakhir

- Output dist dan metadata build TypeScript dibersihkan sebelum instalasi/build. npm ci memasang 200 paket dari lockfile, audit 201 paket, 0 vulnerabilities; exit code 0. Ada warning deprecation sdk-trace-base dan kebijakan install-script esbuild; build berikutnya tetap berhasil tanpa perubahan dependensi.
- npm run build: TypeScript dan Vite 6.4.5 lolos; bundel awal 97,74 kB gzip. Hash bundel sama dengan build yang dipakai untuk Lighthouse sesudah lazy.
- npm run qa setelah instalasi bersih: **${qa.passed} kelompok lolos; 0 error console/runtime tak terduga**. Negative test jaringan 503/JSON rusak sengaja dipisah dari alur normal.
- Lima rute desktop/mobile 390 px, filter, pencarian, sort, SHAP, panel detail, fokus keyboard, keputusan persisten, CSV BOM/kutip/newline/penetralan formula, storage ditolak/rusak, loading/empty/error/retry lolos. Pemeriksaan axe WCAG A/AA lolos; bukan audit manual aksesibilitas penuh.
- Lazy: tidak ada request claims_flagged.json pada empat rute selain Antrean; cache sesi, tautan langsung, request dibatalkan saat pindah rute dan retry diperiksa. Evaluasi pada kunjungan pertama memberi penjelasan, bukan matriks nol. Mode Evaluasi tetap nonaktif setelah reload.
- Tabel 3.000 klaim: maksimum ${v.max_dom_rows} baris DOM selama ${v.frames} frame; median ${fmt(v.median_ms, 1)} ms, p95 ${fmt(v.p95_ms, 1)} ms, maksimum ${fmt(v.max_ms, 1)} ms. Pencarian ${qa.measurements.search_ms} ms pada mesin lokal, tanpa throttling.
- Dua belas screenshot aktual diambil ulang; lihat [indeks](screenshots/README.md). Ringkasan memuat dua skema validasi dan satu baseline acak. Ini bukan data contoh frontend.

## Lighthouse mobile sebelum/sesudah

Optimasi dibatasi 30 menit; percobaan dan verifikasi selesai sekitar lima menit (05:22:18–05:27:04 UTC). Satu run per halaman untuk masing-masing kondisi, seluruh hasil disimpan. Baseline sudah memakai kartu simulasi baru; hanya perubahan lazy yang dibandingkan. Lighthouse 13.5.0, Chromium headless, viewport 390 × 844, RTT 150 ms, 1.638,4 Kbps, CPU 4x; browser baru per skenario.

${table(['Kondisi', 'Halaman', 'Performance', 'Accessibility', 'Best Practices', 'LCP (dtk)', 'TBT (ms)', 'CLS'], mobile)}

Lazy dipertahankan: Ringkasan membaik, Antrean tidak turun pada skor Performance, dan QA lolos. Antrean tetap belum mencapai 90. Ini pengukuran lokal satu run, bukan jaminan pada perangkat atau hosting produksi. JavaScript yang belum terpakai, CSS pemblokir render dan rantai request masih tercatat; BFCache dinonaktifkan flag pengujian. Hasil desktop 100/100/100 pada kedua halaman berasal dari checkpoint Gate C sebelumnya dan tidak diukur ulang pada tugas ini.

## Evaluasi kelompok yang dipertahankan

StratifiedGroupKFold lima fold, stratifikasi fraud_type, seed 42; kelompok terpisah pada outer dan inner split. Parameter/rule training tetap, IF dan referensi fitur masih transduktif. Tidak ada training ulang pada tugas ini.

${table(['Kelompok', 'Varian', 'AP', 'R@2%', 'P@2%', 'R@5%', 'P@5%', 'R@10%', 'P@10%'], grouped)}

Recall per jenis: [GROUPED_EVAL.md](../ml/reports/GROUPED_EVAL.md). Skor antrean tetap OOF per klaim. Faskes terpisah menurunkan AP hybrid; pasien terpisah tidak otomatis menurunkannya. Data sintetis dan pemilihan overlap setelah melihat data penuh tetap membatasi interpretasi.

## Perubahan UI

${changes.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Matriks hanya subset ekspor 3.000; anggaran 5% seluruh cohort berisi 3.136 klaim, sehingga nol FN/TN subset bukan bukti seluruh kasus tertangkap.

## Kesiapan repo

.gitignore mengecualikan ml/artifacts, qa-results, node_modules, .venv, web/dist dan .env*. README root dan panduan deploy memakai placeholder folder proyek. Dokumen/snapshot audit tidak memuat path pengguna lokal.

Pemindaian heuristik: ${repo.publication_files_scanned} path publikasi dan ${repo.historical_blobs_scanned} blob riwayat Git, **0 temuan pola kredensial**, seluruh contoh ignore lolos. Tidak mencetak nilai kredensial. Pemeriksaan pola tidak menjamin mendeteksi semua bentuk rahasia. Detail terstruktur ada pada qa-report.json; ukuran objek Git adalah snapshot sebelum commit akhir.

## Reproduksi

Dari web/: npm ci, npm run build, lalu npm run preview -- --port 4173 --strictPort. Di terminal lain: npm run qa. Lighthouse mobile: node scripts/performance.mjs --mobile-only --label=local. Pemindaian repo dari root: python scripts/check_repo.py. Bukti perbandingan sebelum/sesudah disimpan pada performance-comparison.json; laporan Lighthouse lengkap tetap lokal di qa-results/ dan diabaikan Git.

Push/deploy hanya dilakukan Abil sesuai [DEPLOY.md](../DEPLOY.md). Tidak ada token atau environment variable yang dibutuhkan aplikasi.
`
const comparison = { experiment_start_utc: '2026-10-25 05:22:18 UTC', experiment_end_utc: '2026-10-25 05:27:04 UTC',
  timebox_minutes: 30, decision: 'keep: overview improves, queue performance unchanged, QA passes', before, after }
await writeFile(`${root}/performance-comparison.json`, JSON.stringify(comparison, null, 2) + '\n', 'utf8')
await writeFile(`${root}/QA.md`, text, 'utf8')
await writeFile(`${root}/qa-report.json`, JSON.stringify({ generated_at: new Date().toISOString(), data_source: 'ml_oof', browser_qa: qa,
  performance_comparison: comparison, grouped_eval: model.grouped_eval, repository_audit: repo, protected_sha256: protectedHashes, local_artifact_checks: artifactChecks,
  model_tuning: false, gate_c: 'approved', deployment: 'not performed by agent; Abil will publish', ui_text_changes: changes }, null, 2) + '\n', 'utf8')
console.log(`Final handoff saved: ${qa.passed} QA groups, mobile before/after, five exports unchanged; no push/deploy.`)
