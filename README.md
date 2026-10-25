# KlaimGuard AI

Prototipe prioritas audit klaim BPJS Kesehatan untuk Healthkathon 2026. **Seluruh data sintetis, bukan data peserta JKN. Angka evaluasi bukan klaim performa dunia nyata.** Skor membantu auditor menentukan klaim yang berpotensi perlu diperiksa; keputusan akhir selalu pada auditor manusia.

Dataset: 62.711 klaim, 120 faskes dan 23.171 pasien sintetis; 2.784 klaim berlabel pola yang disuntikkan (4,44%). Antrean menampilkan 3.000 klaim teratas. Enam pola mencakup phantom, repeat, upcoding, unbundling, inflated bills dan cloning; label resmi ada pada [kontrak data](docs/00_KONTEKS_DAN_KONTRAK.md).

## Arsitektur

Pipeline Python menghitung 27 fitur, termasuk rasio biaya terhadap median faskes sejenis, lalu menggabungkan skor anomali Isolation Forest dengan fitur pada XGBoost. Prediksi supervised memakai validasi silang lima fold out-of-fold (OOF), seed 42, dan validasi internal untuk early stopping. SHAP menjelaskan tiap klaim menggunakan model fold yang menghasilkan skornya. Lima JSON menghubungkan pipeline dengan dashboard statis Vite, React dan TypeScript; Vercel menyajikan hasil build tanpa Python atau backend. Keputusan auditor disimpan di browser dan dapat diekspor CSV.

```text
CSV sintetis -> 27 fitur -> Isolation Forest -> skor anomali
                    |                              |
                    +---------> XGBoost hybrid <----+
                                  |
                       skor supervised OOF 5-fold
                                  |
                      SHAP + aturan pola dugaan
                                  |
                  web/public/data/ (5 berkas JSON)
                                  |
                 Dashboard statis -> auditor -> CSV
```

Ringkasan memuat data agregat dan metrik saja. `claims_flagged.json` baru dimuat ketika Antrean dibuka, lalu disimpan di memori sesi. Mode Evaluasi nonaktif secara default. Skor 0–100 adalah persentil prioritas, bukan probabilitas fraud.

## Hasil evaluasi aktual

**Data sintetis | validasi silang 5-fold.** AP = average precision. Anggaran 5% berarti 3.136 klaim dari seluruh cohort, bukan 5% dari subset ekspor.

| Varian | AP | Recall@2% | Recall@5% | Precision@5% | Recall@10% |
|---|---:|---:|---:|---:|---:|
| Isolation Forest | 0,258685 | 17,39% | 32,08% | 28,48% | 52,01% |
| XGBoost | 0,804339 | 44,29% | 77,69% | 68,97% | 87,86% |
| Hybrid | 0,799798 | 44,40% | 77,01% | 68,37% | 87,28% |

Hybrid belum unggul atas XGBoost pada AP evaluasi per klaim ini. Arsitektur dipertahankan tanpa tuning berdasarkan hasil uji.

Evaluasi tambahan memakai StratifiedGroupKFold, stratifikasi `fraud_type`, seed 42; kelompok outer train/uji dan inner validasi terpisah. IF dan referensi fitur tetap memakai batch penuh tanpa label, sehingga evaluasi masih transduktif.

| Kelompok ditahan | Varian | AP | Recall@5% | Precision@5% |
|---|---|---:|---:|---:|
| Faskes | XGBoost | 0,732999 | 71,70% | 63,65% |
| Faskes | Hybrid | 0,741866 | 72,45% | 64,32% |
| Pasien | XGBoost | 0,808862 | 78,05% | 69,29% |
| Pasien | Hybrid | 0,804799 | 77,26% | 68,59% |

Pemisahan faskes menurunkan AP hybrid, sedangkan pemisahan pasien sedikit menaikkannya. Evaluasi kelompok tidak mengganti skor OOF antrean. Semua anggaran dan recall per jenis ada pada [laporan grouped](ml/reports/GROUPED_EVAL.md); hold-out dan sanity 13/13 ada pada [Gate A](ml/reports/GATE_A.md). Pola yang belum pernah dilihat sebagian besar tidak tertangkap model supervised; hold-out juga belum menguji jenis baru secara induktif karena IF masih melihat kovariat tanpa label.

## Batasan

- Data sintetis dengan pola disuntikkan; cloning ber-jitter kecil bisa terlalu mudah dan sebagian jenis masih sulit. Hasil tidak memvalidasi performa dunia nyata.
- IF, median peer, nearest-neighbor dan hitungan riwayat memakai batch penuh tanpa label. Evaluasi waktu/prospektif dan validasi berizin masih diperlukan.
- Definisi overlap rawat inap terarah dipilih setelah membandingkan dua definisi pada data penuh; keputusan berbasis data ini membatasi independensi evaluasi.
- Label dan ID mentah tidak masuk fitur. SHAP dan aturan dugaan bukan bukti pelanggaran atau sebab-akibat.
- Antrean hanya subset 3.000 teratas. Nol FN/TN pada subset yang seluruhnya masuk anggaran bukan bukti seluruh kasus dataset tertangkap.
- Estimasi selisih terhadap median peer bukan kerugian terkonfirmasi. Pseudonim pendek bukan jaminan anonimitas produksi; localStorage bukan audit trail terpusat.
- Pola baru memerlukan retraining berkala dan pengembangan jalur anomali. Autentikasi, peran akses dan audit trail terpusat masih rencana.

## Menjalankan ML

Gunakan **Python 3.12+** untuk paket yang dipin. Pipeline membaca CSV yang disertakan dan tidak meregenerasi data. Perintah ini membangun ulang model/JSON; tidak diperlukan untuk menjalankan dashboard.

```powershell
cd "<folder proyek>/ml"
$env:PYTHONUTF8 = "1"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe run_all.py --artifact-dir artifacts/final_run
.\.venv\Scripts\python.exe -m src.evaluate --grouped-only --artifact-dir artifacts/final_run
.\.venv\Scripts\python.exe -m src.validate_export
```

Run penuh yang diverifikasi sebelumnya: 212,897 detik, 27 pembandingan eksak lolos pada lingkungan yang sama. Evaluasi grouped terpisah: 161,530 detik. Reproduksibilitas bitwise lintas OS/paket tidak dijamin. Model dan artefak diabaikan Git; lihat [README ML](ml/README.md).

## Menjalankan dashboard

Node.js **20+**, disarankan **24.x** sesuai build/QA. Lighthouse 13.5 membutuhkan Node >=22.19. Lima JSON sudah di-commit; tanpa environment variable atau layanan eksternal.

```powershell
cd "<folder proyek>/web"
npm ci
npm run dev
```

Build dan preview produksi lokal:

```powershell
npm run build
npm run preview -- --port 4173 --strictPort
```

Di terminal lain dari `web/`:

```powershell
npx playwright install chromium
npm run qa
node scripts/performance.mjs --mobile-only --label=local
```

Enam belas kelompok QA memeriksa rute, simulasi, lazy loading, filter, tabel virtual, SHAP, keputusan/CSV, error/retry, aksesibilitas otomatis dan mobile 390 px. Lihat [QA](web/QA.md), [README dashboard](web/README.md), dan [screenshot](web/screenshots/README.md).

## Publikasi oleh Abil

Gate C sudah disetujui setelah persiapan repo. **Agent tidak push atau deploy.** Langkah GitHub dan Vercel ada di [DEPLOY.md](DEPLOY.md). Keputusan dan progres ada pada [STATUS.md](STATUS.md).
