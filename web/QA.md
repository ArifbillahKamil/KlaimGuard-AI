# Gate C — QA lokal dengan ekspor ML aktual

25 Oktober 2026. **Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir tetap pada auditor manusia.**

Gate A disetujui bersyarat. Evaluasi kelompok, integrasi dan QA selesai; **belum deploy**. Model tidak disetel dan skor OOF antrean tidak diganti. Enam hash terlindungi (empat JSON non-report, OOF NPZ, SHAP NPY) masih identik dengan sebelum evaluasi kelompok.

## Evaluasi kelompok

StratifiedGroupKFold lima fold, stratifikasi fraud_type, seed 42, shuffle=True. Validasi internal juga memisahkan kelompok, dengan aturan early stopping/refit dan parameter estimator tetap. Sebelas unit test ML lolos. Audit 20 model grouped menyatakan outer/inner groups disjoint; setiap klaim mendapat satu prediksi uji. IF dan referensi fitur tetap transduktif.

| Kelompok | Varian | AP | R@2% | P@2% | R@5% | P@5% | R@10% | P@10% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| faskes_id | xgb_only | 0,732999 | 43,46% | 96,41% | 71,70% | 63,65% | 79,42% | 35,25% |
| faskes_id | hybrid | 0,741866 | 43,79% | 97,13% | 72,45% | 64,32% | 80,46% | 35,71% |
| patient_id | xgb_only | 0,808862 | 44,22% | 98,09% | 78,05% | 69,29% | 88,18% | 39,14% |
| patient_id | hybrid | 0,804799 | 44,40% | 98,49% | 77,26% | 68,59% | 87,75% | 38,95% |

Recall per jenis lengkap ada di [laporan grouped](../ml/reports/GROUPED_EVAL.md), `model_report.json`, dan halaman Evaluasi. AP faskes terpisah turun, sedangkan AP pasien terpisah sedikit naik; tidak semua pemisahan kelompok otomatis menurunkan metrik. Hybrid tetap belum unggul pada evaluasi per klaim Gate A. Perbandingan ini belum membuktikan generalisasi prospektif karena referensi fitur/IF masih memakai batch penuh tanpa label.

## Hasil QA aktual

- Build bersih: TypeScript dan Vite v6.4.5 lolos; bundel awal sekitar 97,27 kB gzip. Vite membersihkan output build sebelum menulis hasil baru.
- 15 kelompok pemeriksaan browser lolos; **0 error console/runtime tak terduga** pada rute dan alur normal. Respons 503/JSON rusak sengaja disuntikkan di konteks browser terpisah untuk negative test.
- Data ML aktual: 62.711 klaim sumber, 3.000 klaim antrean, 120 faskes; schema, pola resmi, referensi pasien dan estimasi rupiah diperiksa.
- Lima rute langsung, semua filter, pencarian, pengurutan, panel detail berisi tiga SHAP aktual, fokus keyboard, keputusan + catatan, persistensi setelah reload dan CSV lolos.
- CSV diuji dengan UTF-8 BOM, koma, tanda kutip, newline dan awalan formula; tidak menjalankan formula.
- Mode Evaluasi nonaktif setelah muat/reload; label individual hanya muncul setelah opt-in. Matriks subset diberi peringatan.
- Kelima halaman desktop dan mobile 390 px lolos pemeriksaan otomatis axe WCAG A/AA, termasuk panel desktop; tidak ada overflow halaman pada 390 px. Ini tidak menggantikan audit manual aksesibilitas penuh.
- Dua belas PNG aktual diambil ulang: lima halaman + detail, desktop dan mobile. [Indeks screenshot](screenshots/README.md).
- Tabel virtual: maksimum **17 baris DOM** selama 100 frame pengguliran; median interval **16,7 ms**, p95 **17,4 ms**, maksimum **24,5 ms**. Pencarian **15 ms**. Angka lokal headless tanpa throttling, bukan jaminan pada seluruh perangkat.
- Storage kosong/rusak/ditolak, loading, empty, JSON gagal/retry, schema salah dan pemulihan rute tidak dikenal lolos.

## Lighthouse

Lighthouse 13.5.0, Chromium headless, data ML aktual. **Satu run per skenario**; seluruh hasil disimpan. Desktop 1440 × 1050, RTT 40 ms, throughput 10.240 Kbps, CPU 1x. Mobile 390 × 844, RTT 150 ms, throughput 1.638,4 Kbps, CPU 4x. Kategori yang diukur: Performance, Accessibility, Best Practices.

| Halaman | Perangkat | Performance | Accessibility | Best Practices | LCP | TBT | CLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ringkasan | desktop | 100 | 100 | 100 | 0,77 dtk | 0,0 ms | 0,000059 |
| antrean | desktop | 100 | 100 | 100 | 0,76 dtk | 0,0 ms | 0,000062 |
| ringkasan | mobile | 88 | 100 | 100 | 3,77 dtk | 3,0 ms | 0,000016 |
| antrean | mobile | 89 | 100 | 100 | 3,70 dtk | 50,0 ms | 0,000020 |

Mobile **belum mencapai 90** pada pengukuran ini. LCP mobile sekitar 3,7 detik, meskipun TBT rendah. Laporan mentah mencatat JavaScript yang belum terpakai dan permintaan CSS yang memblokir render; pengumpulan seluruh JSON juga masih berada pada jalur pemuatan awal. BFCache dinonaktifkan oleh flag browser pengujian. Hasil lokal/preview ini belum menggantikan pengujian hosting produksi atau perangkat riil.

## Daftar perubahan teks UI

1. Ringkasan: kartu "Simulasi anggaran pemeriksaan 5%" membandingkan recall, precision/base rate, dan kebalikan rate; semua angka dihitung dari JSON.
2. Angka performa: label "Data sintetis | validasi silang 5-fold" terlihat per kelompok metrik dan melekat pada setiap nilai lewat tooltip serta teks pembaca layar.
3. Evaluasi: tabel AP/recall/precision ketiga varian dan catatan "Hybrid belum unggul atas xgb_only pada AP evaluasi per klaim ini".
4. Hold-out: penjelasan "Pola yang belum pernah dilihat sebagian besar tidak tertangkap model supervised"; tidak mengklaim hybrid unggul secara umum.
5. Evaluasi per kelompok: tabel faskes/pasien, recall per jenis, dan satu kalimat batas transduktif per skema.
6. Batasan: data sintetis, pola disuntikkan, overlap terarah dipilih setelah melihat data penuh, evaluasi transduktif dan risiko false positive.
7. Antrean: "3.000 klaim teratas dari 62.711" dari JSON; default Mode Evaluasi tetap tersembunyi; skor sama menjaga urutan ekspor.
8. Matriks: menjelaskan subset ekspor dan bahwa nol FN/TN ketika seluruh subset diprioritaskan bukan bukti semua kasus dataset tertangkap.
9. Tata Kelola: paragraf retraining berkala dan jalur anomali terpisah sebagai rencana pengembangan untuk pola baru.

## Temuan dan perbaikan

1. QA menemukan overflow mobile akibat teks pembaca layar pada angka di kolom tabel horizontal; posisi label dibatasi pada nilai terkait. Tabel simulasi kini menampilkan dua metode sekaligus pada 390 px.
2. Seluruh subset 3.000 ekspor masuk dalam budget 5% yang berisi 3.136 klaim; karena itu matriks subset dapat mempunyai FN/TN nol. UI sekarang menyatakannya eksplisit.
3. Pemisahan faskes menurunkan AP hybrid ke 0,741866, sementara pasien terpisah menghasilkan 0,804799. Skor Antrean tetap OOF per klaim dari Gate A.
4. Desktop mendapat Performance 100, tetapi mobile hanya 88/89 pada kondisi throttling yang dicatat. Tidak dilakukan penyetelan model atau pemilihan skor Lighthouse terbaik.

## Reproduksi

Jalankan dari `web/`:

```powershell
npm ci
npm run build
npm run preview -- --port 4173 --strictPort
```

Di terminal lain dari folder yang sama:

```powershell
npm run qa
node scripts/performance.mjs
node scripts/report-qa.mjs
```

Evaluasi kelompok: dari `ml/`, `$env:PYTHONUTF8 = "1"` lalu `.\.venv\Scripts\python.exe -m src.evaluate --grouped-only --artifact-dir artifacts/final_run`.

Artefak terperinci lokal ada di `qa-results/` (diabaikan Git); ringkasan terstruktur di `qa-report.json`. Skor dan sumber data tetap sama. **Berhenti di Gate C; deploy memerlukan konfirmasi Abil.**
