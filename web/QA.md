# QA lokal final — persiapan publikasi oleh Abil

25 Oktober 2026. **Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir tetap pada auditor manusia.**

Gate C disetujui. Agent selesai pada commit lokal; **tidak push dan tidak deploy**. Abil melanjutkan melalui [DEPLOY.md](../DEPLOY.md). Model dan seluruh skor OOF tidak diubah. Kelima JSON ekspor identik SHA256 dengan checkpoint Gate C setelah normalisasi LF/CRLF Git; hash mentah disimpan terpisah. Empat JSON non-report serta OOF/SHAP lokal juga dibandingkan langsung dengan hash mentah audit sebelumnya jika artefaknya tersedia.

## Build dan QA terakhir

- Output dist dan metadata build TypeScript dibersihkan sebelum instalasi/build. npm ci memasang 200 paket dari lockfile, audit 201 paket, 0 vulnerabilities; exit code 0. Ada warning deprecation sdk-trace-base dan kebijakan install-script esbuild; build berikutnya tetap berhasil tanpa perubahan dependensi.
- npm run build: TypeScript dan Vite 6.4.5 lolos; bundel awal 97,74 kB gzip. Hash bundel sama dengan build yang dipakai untuk Lighthouse sesudah lazy.
- npm run qa setelah instalasi bersih: **16 kelompok lolos; 0 error console/runtime tak terduga**. Negative test jaringan 503/JSON rusak sengaja dipisah dari alur normal.
- Lima rute desktop/mobile 390 px, filter, pencarian, sort, SHAP, panel detail, fokus keyboard, keputusan persisten, CSV BOM/kutip/newline/penetralan formula, storage ditolak/rusak, loading/empty/error/retry lolos. Pemeriksaan axe WCAG A/AA lolos; bukan audit manual aksesibilitas penuh.
- Lazy: tidak ada request claims_flagged.json pada empat rute selain Antrean; cache sesi, tautan langsung, request dibatalkan saat pindah rute dan retry diperiksa. Evaluasi pada kunjungan pertama memberi penjelasan, bukan matriks nol. Mode Evaluasi tetap nonaktif setelah reload.
- Tabel 3.000 klaim: maksimum 17 baris DOM selama 100 frame; median 16,6 ms, p95 18,8 ms, maksimum 23,4 ms. Pencarian 14 ms pada mesin lokal, tanpa throttling.
- Dua belas screenshot aktual diambil ulang; lihat [indeks](screenshots/README.md). Ringkasan memuat dua skema validasi dan satu baseline acak. Ini bukan data contoh frontend.

## Lighthouse mobile sebelum/sesudah

Optimasi dibatasi 30 menit; percobaan dan verifikasi selesai sekitar lima menit (05:22:18–05:27:04 UTC). Satu run per halaman untuk masing-masing kondisi, seluruh hasil disimpan. Baseline sudah memakai kartu simulasi baru; hanya perubahan lazy yang dibandingkan. Lighthouse 13.5.0, Chromium headless, viewport 390 × 844, RTT 150 ms, 1.638,4 Kbps, CPU 4x; browser baru per skenario.

| Kondisi | Halaman | Performance | Accessibility | Best Practices | LCP (dtk) | TBT (ms) | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sebelum lazy | ringkasan | 87 | 100 | 100 | 3,927 | 10,0 | 0,000016 |
| Sebelum lazy | antrean | 88 | 100 | 100 | 3,850 | 23,0 | 0,000020 |
| Sesudah lazy | ringkasan | 98 | 100 | 100 | 2,270 | 0,0 | 0,000000 |
| Sesudah lazy | antrean | 88 | 100 | 100 | 3,760 | 8,0 | 0,000020 |

Lazy dipertahankan: Ringkasan membaik, Antrean tidak turun pada skor Performance, dan QA lolos. Antrean tetap belum mencapai 90. Ini pengukuran lokal satu run, bukan jaminan pada perangkat atau hosting produksi. JavaScript yang belum terpakai, CSS pemblokir render dan rantai request masih tercatat; BFCache dinonaktifkan flag pengujian. Hasil desktop 100/100/100 pada kedua halaman berasal dari checkpoint Gate C sebelumnya dan tidak diukur ulang pada tugas ini.

## Evaluasi kelompok yang dipertahankan

StratifiedGroupKFold lima fold, stratifikasi fraud_type, seed 42; kelompok terpisah pada outer dan inner split. Parameter/rule training tetap, IF dan referensi fitur masih transduktif. Tidak ada training ulang pada tugas ini.

| Kelompok | Varian | AP | R@2% | P@2% | R@5% | P@5% | R@10% | P@10% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| faskes_id | xgb_only | 0,732999 | 43,46% | 96,41% | 71,70% | 63,65% | 79,42% | 35,25% |
| faskes_id | hybrid | 0,741866 | 43,79% | 97,13% | 72,45% | 64,32% | 80,46% | 35,71% |
| patient_id | xgb_only | 0,808862 | 44,22% | 98,09% | 78,05% | 69,29% | 88,18% | 39,14% |
| patient_id | hybrid | 0,804799 | 44,40% | 98,49% | 77,26% | 68,59% | 87,75% | 38,95% |

Recall per jenis: [GROUPED_EVAL.md](../ml/reports/GROUPED_EVAL.md). Skor antrean tetap OOF per klaim. Faskes terpisah menurunkan AP hybrid; pasien terpisah tidak otomatis menurunkannya. Data sintetis dan pemilihan overlap setelah melihat data penuh tetap membatasi interpretasi.

## Perubahan UI

1. Simulasi 5%: satu baris acak, KlaimGuard validasi per klaim, dan KlaimGuard validasi faskes ditahan (lebih ketat); recall/precision dan kebalikan precision dihitung dari JSON.
2. Ringkasan: tautan ke Antrean mengganti daftar detail klaim agar payload klaim tidak diminta di jalur awal.
3. Faskes dan Evaluasi: jelaskan saat klaim belum dimuat; matriks tidak menampilkan nol palsu dan dapat dibuka setelah mengunjungi Antrean.
4. Label performa tetap Data sintetis | validasi silang 5-fold; hybrid belum unggul atas xgb_only pada AP evaluasi per klaim.
5. Hold-out, batas transduktif, overlap yang dipilih setelah melihat data penuh, subset matriks dan rencana retraining/jalur anomali tetap dinyatakan jujur.

Matriks hanya subset ekspor 3.000; anggaran 5% seluruh cohort berisi 3.136 klaim, sehingga nol FN/TN subset bukan bukti seluruh kasus tertangkap.

## Kesiapan repo

.gitignore mengecualikan ml/artifacts, qa-results, node_modules, .venv, web/dist dan .env*. README root dan panduan deploy memakai placeholder folder proyek. Dokumen/snapshot audit tidak memuat path pengguna lokal.

Pemindaian heuristik: 94 path publikasi dan 166 blob riwayat Git, **0 temuan pola kredensial**, seluruh contoh ignore lolos. Tidak mencetak nilai kredensial. Pemeriksaan pola tidak menjamin mendeteksi semua bentuk rahasia. Detail terstruktur ada pada qa-report.json; ukuran objek Git adalah snapshot sebelum commit akhir.

## Reproduksi

Dari web/: npm ci, npm run build, lalu npm run preview -- --port 4173 --strictPort. Di terminal lain: npm run qa. Lighthouse mobile: node scripts/performance.mjs --mobile-only --label=local. Pemindaian repo dari root: python scripts/check_repo.py. Bukti perbandingan sebelum/sesudah disimpan pada performance-comparison.json; laporan Lighthouse lengkap tetap lokal di qa-results/ dan diabaikan Git.

Push/deploy hanya dilakukan Abil sesuai [DEPLOY.md](../DEPLOY.md). Tidak ada token atau environment variable yang dibutuhkan aplikasi.
