# KlaimGuard AI — Dashboard terintegrasi

Prototipe statis untuk rekomendasi prioritas pemeriksaan klaim. **Seluruh data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir selalu pada auditor manusia.**

Versi 25 Oktober 2026 memakai lima JSON hasil pipeline ML: 62.711 klaim sumber, 120 faskes, dan **3.000 klaim teratas** pada Antrean. Skor hybrid OOF, SHAP dan keputusan tier dari Gate A dipertahankan. Evaluasi tambahan per kelompok hanya menambah `model_report.grouped_eval`.

## Menjalankan lokal

Node.js 20+ dan npm untuk aplikasi; alat QA Lighthouse 13.5 membutuhkan Node.js >=22.19. Sesi QA memakai Node.js 24.20.0. Versi dependensi dikunci pada `package-lock.json`.

```powershell
cd "<folder proyek>\web"
npm ci
npm run dev
```

Build bersih dan preview:

```powershell
npm run build
npm run preview -- --port 4173 --strictPort
```

Tidak ada backend, akun atau API data eksternal. Hash router mendukung tautan langsung. Inter dari Google Fonts disajikan lokal melalui Fontsource.

## Halaman dan alur

| Halaman | Fungsi |
|---|---|
| Ringkasan | KPI seluruh cohort, simulasi anggaran pemeriksaan 5%, histogram persentil, komposisi dugaan, lift dan klaim teratas. |
| Antrean Audit | 3.000 klaim ekspor, tabel virtual, filter/pencarian/pengurutan, panel SHAP, median peer, keputusan auditor dan CSV. |
| Faskes | Ranking seluruh faskes dengan area gulir, detail dan tautan ke antrean terfilter. |
| Evaluasi Model | AP/recall/precision tiga varian; recall per jenis; hold-out; evaluasi faskes/pasien; batasan dan Mode Evaluasi. |
| Tata Kelola | Perlindungan data, peran manusia, bias, batas produksi, serta rencana retraining dan jalur anomali untuk pola baru. |

Faskes dan Evaluasi dimuat secara lazy; grafik memakai SVG. TanStack Virtual membatasi jumlah baris DOM pada Antrean. Skor yang sama mempertahankan urutan ekspor saat diurutkan berdasarkan skor, sehingga pembulatan persentil tidak mengubah urutan prioritas sumber.

## Semua angka dari JSON

UI membaca empat JSON agregat/metrik saat awal: `summary.json`, `faskes_risk.json`, `model_report.json`, `feature_dictionary.json`. `claims_flagged.json` baru diminta ketika rute Antrean dibuka, dengan cache memori sesi serta abort/retry. Ringkasan mengarahkan pemeriksaan klaim ke Antrean; Faskes dan matriks Evaluasi memberi penjelasan bila klaim belum dimuat. Tidak ada hardcode metrik atau jumlah klaim dalam komponen. Pilihan anggaran 2/5/10% adalah skenario yang ditetapkan; nilainya dibaca dari JSON.

Simulasi anggaran 5% dihitung saat render:

- Satu baris acak: recall `5/100`, precision `dataset.fraud_rate`.
- KlaimGuard validasi per klaim: recall/precision dari `model_report.at_budget["5"]`, varian hybrid.
- KlaimGuard validasi faskes ditahan (lebih ketat): recall/precision dari `model_report.grouped_eval.faskes_id.at_budget["5"]`, varian hybrid.
- Klaim diperiksa per kasus ditemukan: kebalikan base rate atau precision; denominator nol ditampilkan sebagai tidak tersedia.

Simulasi bukan eksperimen sampling baru, proyeksi penghematan, atau klaim performa dunia nyata. Label **"Data sintetis | validasi silang 5-fold"** terlihat pada setiap kelompok angka performa; tiap nilai juga membawa label itu pada tooltip dan teks pembaca layar. Fold dibaca dari konfigurasi JSON.

Evaluasi per klaim menampilkan bahwa hybrid belum unggul atas `xgb_only` pada AP. Hasil kelompok dapat berbeda: kelompok faskes/pasien terpisah pada outer dan inner split, tetapi IF dan fitur referensi tetap menggunakan batch penuh tanpa label. Tabel kelompok tidak mengganti skor Antrean. Definisi overlap terarah dipilih setelah meninjau data penuh; keputusan ini dijelaskan di kotak Batasan.

## Evaluasi dan keputusan manusia

Mode Evaluasi **nonaktif secara default** dan reset setelah reload. Label individual `eval` hanya terlihat setelah diaktifkan. Matriks dibatasi pada subset ekspor; pada anggaran yang mencakup seluruh subset, nol FN/TN tidak membuktikan semua kasus dataset tertangkap.

Keputusan dan catatan disimpan pada `localStorage`, key `klaimguard:auditor-decisions:v1`. Storage kosong/rusak/ditolak ditangani. Jika storage gagal, keputusan tetap tersedia selama sesi dan bisa diekspor. CSV memakai UTF-8 BOM, escaping koma/kutip/baris baru, dan penetralan formula. Penyimpanan lokal bukan audit trail terpusat.

## QA dan screenshot

Dengan preview port 4173 berjalan, di terminal lain:

```powershell
npx playwright install chromium
npm run qa
node scripts/performance.mjs
```

QA memakai data ML aktual: kontrak dan perhitungan simulasi, semua rute, filter, pengurutan, gulir 3.000 klaim, panel detail, keputusan, CSV, Mode Evaluasi, storage gagal, JSON gagal, loading/empty, aksesibilitas otomatis serta mobile 390 px. Negative test jaringan dijalankan terpisah dari pemeriksaan console normal.

Skrip Lighthouse default mengukur Ringkasan dan Antrean desktop/mobile; `--mobile-only --label=local` membatasi dua skenario mobile dan menyimpan hasil terpisah. Tugas optimasi terakhir mengukur satu run sebelum dan satu sesudah untuk setiap halaman mobile; seluruhnya tersimpan pada [performance-comparison.json](performance-comparison.json). Ringkasan 87 -> 98; Antrean 88 -> 88. Desktop 100/100/100 adalah hasil Gate C sebelumnya, tidak diukur ulang pada tugas optimasi ini. Desktop: RTT 40 ms / 10.240 Kbps / CPU 1x. Mobile: RTT 150 ms / 1.638,4 Kbps / CPU 4x, viewport 390 × 844. Ini bukan pemilihan skor terbaik dari beberapa run.

Hasil dan batas pengukuran: [QA.md](QA.md), `qa-report.json`; 12 screenshot aktual dan indeks di [screenshots/](screenshots/README.md). Laporan mentah Lighthouse dan CSV uji ada pada `qa-results/` yang diabaikan Git.

Generator contoh lama tidak dijalankan oleh dev/build dan menolak menimpa ekspor ML. Data yang digunakan QA memiliki `data_source: "ml_oof"`.

## Batas pekerjaan

Data sintetis dengan pola disuntikkan, evaluasi transduktif, dan perubahan overlap berdasarkan data penuh belum memvalidasi performa dunia nyata. Penerapan on-premise, akses berbasis peran dan audit trail terpusat masih rencana. **Gate C disetujui. Agent tidak push atau deploy; Abil melanjutkan melalui [DEPLOY.md](../DEPLOY.md).**
