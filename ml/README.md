# KlaimGuard AI — ML

**Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Skor nantinya hanya rekomendasi prioritas; keputusan akhir tetap pada auditor manusia.**

Status: **Prompt 1 selesai, berhenti di Gate A dan menunggu konfirmasi Abil**. Pipeline benar-benar dijalankan dari CSV hingga lima JSON. Lihat [laporan Gate A lengkap](reports/GATE_A.md), [snapshot metrik](reports/model_report.json), dan [bukti reproduksi](reports/pipeline_manifest.json).

Keputusan Abil dan Claude: ekspektasi lama pada definisi simetris diganti karena kedua klaim dalam pasangan ikut tertandai. Definisi terarah dipilih **setelah membandingkan dua definisi pada data penuh**, bukan sebelum melihat data. Ini keputusan desain berbasis data yang membatasi independensi evaluasi dan akan dicantumkan pada laporan model. Dataset dan generator tidak diubah. [Laporan penghentian awal](reports/FEATURE_SANITY.md) disimpan sebagai riwayat.

## Lingkungan dan menjalankan pipeline

Gunakan **Python 3.12+** untuk requirements yang dipin pada hasil ini; sesi memakai Python 3.12.6. Batas awal brief adalah Python >=3.10, tetapi metadata NumPy 2.5.4, XGBoost 3.4.1, dan SHAP 0.54.1 yang terpasang mensyaratkan >=3.12. Versi terpasang dipin bersama dependensinya dalam `requirements.txt`.

```powershell
cd "C:\Users\diamo\Documents\VSC\Hackaton\BPJS Healtkathon\ml"
$env:PYTHONUTF8 = "1"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe run_all.py
```

Pipeline membaca CSV yang sudah tersedia, menghitung ulang seluruh tahap tanpa cache, dan tidak menjalankan generator. Sanity gate yang gagal menghentikan proses sebelum training. Paket utama yang benar-benar digunakan: NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, XGBoost 3.4.1, SHAP 0.54.1, PyArrow 26.0.0. `pip check` lolos; seluruh dependensi terpasang dipin.

Run penuh baru memakai direktori artefak terpisah dan dibandingkan dengan run per tahap sebelumnya:

```powershell
.\.venv\Scripts\python.exe run_all.py --artifact-dir artifacts/final_run --verify-against artifacts
```

Run final itu selesai dalam **212,897 detik**, sekitar 3 menit 33 detik, pada mesin sesi ini. Run penuh sebelumnya selesai dalam 197,553 detik; perbedaan durasi bergantung pada beban mesin. **27 pembandingan eksak lolos**: fitur, prediksi OOF, hold-out, dan SHAP identik bit demi bit; JSON sama selain timestamp/durasi. Pembandingan membutuhkan run referensi; perintah normal `run_all.py` tidak membutuhkan referensi atau cache. Reproduksibilitas lintas OS/versi paket tidak diklaim bitwise.

Untuk menjalankan tahap terpisah: `python -m src.features`, `python -m src.train`, `python -m src.evaluate`, `python -m src.export`, `python -m src.validate_export`. Regenerasi laporan setelah run dengan manifest reproduksi: `python -m src.report --artifact-dir artifacts/final_run`. Gunakan Python venv pada contoh di atas.

## Fitur: apa dan mengapa

Matriks berisi 23 fitur numerik dan empat kategorikal yang dikodekan, total 27 kolom. Semua transformasi memakai daftar input eksplisit tanpa label fraud. ID pasien dan faskes hanya dipakai untuk pengelompokan; ID mentah tidak menjadi fitur.

| Fitur | Definisi dan kegunaan |
| --- | --- |
| `dx_peer_ratio` | Biaya / median diagnosis × kelas faskes × layanan; fallback diagnosis jika kelompok <20 klaim. Membandingkan dengan peer sejenis. |
| `proc_peer_ratio` | Biaya / median prosedur × kelas faskes. |
| `ratio_gap` | Rasio prosedur / rasio diagnosis; menunjukkan ketidakseimbangan pembandingan diagnosis dan tindakan. |
| `comp_ratio_*` | Lima komponen biaya / median komponen per diagnosis; median nol diisi 1. |
| `comp_share_*` | Proporsi lima komponen terhadap biaya total. |
| `pair_rarity` | `1 - count(dx, proc) / count(dx)`; kelangkaan kombinasi diagnosis dan prosedur. |
| `los_ratio` | Lama rawat / median lama rawat per diagnosis; rawat jalan selalu 1. |
| `nn_dist` | Jarak relatif L-infinity terhadap klaim lain terdekat dalam faskes × diagnosis × prosedur. Dihitung eksak dengan blok untuk membatasi memori, self-match dikecualikan, singleton 1, pasangan nol/nol dianggap 0. |
| `patient_n_claims`, `patient_once` | Jumlah klaim pasien dan indikator hanya muncul sekali. |
| `same_pat_fk_3d` | Jumlah klaim lain di faskes sama dalam selisih tanggal masuk ±3 hari, tanpa menghitung dirinya sendiri. |
| `repeat_14d` | Ada klaim diagnosis/prosedur sama pada pasien sama 1–14 hari sebelumnya; tanggal masuk yang sama tidak termasuk tanggal sebelumnya. |
| `inpatient_overlap` | Terarah: rawat inap masuk lebih belakangan daripada rawat inap pasien sama di faskes berbeda yang masih tumpang tindih pada interval `[admit, discharge)`. Tanggal masuk sama menandai keduanya. Rawat jalan dikecualikan. |
| `fk_day_burst` | Jumlah klaim faskes pada hari itu / rata-rata klaim per hari pada seluruh rentang observasi kalender, termasuk hari tanpa klaim; denominator minimal 0,05. |
| `fk_loo_ratio` | Rata-rata `dx_peer_ratio` faskes dengan klaim sendiri dikeluarkan. Singleton diisi 1. |
| Kategorikal | Kelas D/C/B/A = 1/2/3/4; RJTL/RITL = 0/1; keparahan I/II/III = 1/2/3; Pemerintah/Swasta = 0/1. |

Median peer, tetangga dan hitungan riwayat menggunakan batch retrospektif tanpa label sesuai brief. Bersama IF yang dilatih pada seluruh batch, evaluasi bersifat transduktif; belum membuktikan performa pada klaim masa depan atau faskes baru.

## Model, alur data, dan alasan pemilihan

`CSV sintetis -> 27 fitur -> RobustScaler + Isolation Forest -> XGBoost OOF -> SHAP fold terkait -> aturan dugaan -> 5 JSON statis`.

- IF memakai 23 fitur numerik, 300 tree, contamination auto, seed 42, tanpa label. Keluaran adalah persentil `-score_samples`.
- XGBoost memakai semua 27 fitur; hybrid menambahkan persentil IF sebagai fitur ke-28. CPU, maksimum 400 tree, depth 5, learning rate 0,05, subsample/colsample 0,8, `scale_pos_weight=n_normal/n_fraud` pada partisi train terkait.
- Lima fold distratifikasi jenis fraud. Early stopping 30 putaran hanya melihat validasi internal 20% outer train; setelah tree count dipilih, model direfit pada seluruh outer train. Fold uji tidak dipakai fit atau pemilihan tree count. Tidak ada tuning berdasarkan hasil uji.
- Enam hold-out memakai fold sama; jenis T dibuang sebelum inner split dan refit supervised. Semua prediksi uji digabung lalu top 5% dipilih. IF dan referensi tanpa label tetap melihat kovariat T, sehingga ini bukan uji induktif atas jenis yang benar-benar belum terlihat.
- SHAP memakai `TreeExplainer` dan model hybrid fold yang menilai klaim. Output berupa log-odds, bukan persen probabilitas. Rekonstruksi probabilitas OOF maksimum meleset 6,18e-7.

## Hasil aktual

| Varian | PR-AUC / AP | Recall@2% | Recall@5% | Recall@10% |
| --- | ---: | ---: | ---: | ---: |
| IF | 0,258685 | 17,39% | 32,08% | 52,01% |
| XGBoost | 0,804339 | 44,29% | 77,69% | 87,86% |
| Hybrid | 0,799798 | 44,40% | 77,01% | 87,28% |

Hybrid sedikit lebih rendah pada evaluasi biasa. Pada hold-out, hybrid membantu untuk repeat dan unbundling dibanding XGBoost, tetapi tidak selalu lebih baik untuk jenis lain. IF sendiri sering lebih tinggi pada hold-out. Inflated lebih sulit pada evaluasi biasa daripada phantom. Tabel lengkap per jenis, precision, hold-out, gain, dan mean |SHAP| ada di [laporan Gate A](reports/GATE_A.md). PR-AUC memakai average precision (AP); definisinya dicatat secara konsisten dalam JSON dan laporan.

Sanity terarah **13/13 lolos**: 253 overlap = 134 phantom + 92 normal + 27 lain; proporsi phantom 52,964%, enrichment 69,778x. Sepuluh unit test lolos, termasuk klaim masuk lebih awal tidak ditandai, tie tanggal menandai keduanya, batas discharge, anti-label-leakage, budget dan pola heuristik.

## Skor, alasan dan aturan dugaan

Skor dashboard adalah persentil peringkat probabilitas hybrid OOF (0–100, integer), bukan probabilitas fraud. Tie diurutkan stabil menurut baris sumber, tanpa label. Tier tinggi adalah top 3%, menengah top 3–10%; jumlah dibulatkan ke atas (1.882 tinggi, 4.390 menengah, 56.439 rendah). Pembulatan skor bisa membuat angka sama berada pada tier berbeda; gunakan `risk_tier` eksplisit.

Tiga alasan dipilih dari kontribusi SHAP positif terbesar; jika kurang dari tiga, kontribusi negatif nonnol terbesar mengisi sisanya dengan `direction` yang benar. Teks menyatakan nilai fitur aktual, termasuk ketika kondisi biner tidak ada. Kontribusi SHAP bukan sebab-akibat atau bukti pelanggaran.

Pola adalah **heuristik tanpa label**, maksimum dua, diurutkan berdasarkan |SHAP| fitur terkait:

- `nn_dist < 0.015`: Cloning (penjiplakan klaim).
- `repeat_14d == 1`: Repeat billing (klaim berulang).
- `same_pat_fk_3d >= 1` dan `dx_peer_ratio < 0.8`: Services unbundling / fragmentation.
- `pair_rarity >= 0.9` atau `ratio_gap >= 1.6`: Manipulasi diagnosis dan/atau tindakan (upcoding).
- `dx_peer_ratio >= 1.25`: Inflated bills (penggelembungan tagihan).
- `inpatient_overlap == 1` atau `patient_once == 1` dan `fk_day_burst >= 3`: Phantom billing (klaim palsu).

Median peer diekspor dengan pembulatan rupiah; estimasi selisih = `max(0, claim_total - peer_median)` memakai median yang diekspor. Estimasi bukan kerugian terkonfirmasi. `patient_ref` adalah `PX-` + enam karakter SHA1, bukan ID pasien asli dan bukan jaminan anonimitas produksi.

## Audit dan batasan

Audit tetap dijalankan meskipun pemicu AP hybrid >0,99 atau hampir semua jenis recall >=95% tidak aktif. Pada seluruh 62.711 baris, menghapus/mengganti label dan `claim_id` tidak mengubah fitur. Tidak ada `fraud_label`, `fraud_type`, turunannya dari label, atau ID mentah dalam fitur model; metadata label hanya untuk stratifikasi/evaluasi dan `eval` pada ekspor.

Seluruh sumber dan generator sama berdasarkan SHA256. Split per klaim dapat berbagi pasien/faskes atau klaim berelasi lintas fold. IF dan fitur referensi memakai batch penuh tanpa label. Definisi overlap dipilih setelah membandingkan dua definisi pada data penuh. Karena itu, skor OOF ini bukan validasi prospektif independen; evaluasi per waktu/kelompok dan data dunia nyata berizin tetap diperlukan. Data disuntikkan dengan pola yang diketahui; cloning ber-jitter kecil dapat terlalu mudah.

## Artefak dan batas Gate A

- `src/`: fitur, training, evaluasi/hold-out, audit, SHAP/ekspor, validasi dan pembuat laporan.
- `artifacts/`: fitur Parquet, IF/scaler, 10 model fold, OOF dan hold-out NPZ, SHAP NPY, manifest dan audit; diabaikan Git dan tidak di-deploy.
- `reports/`: laporan Gate A, snapshot metrik, sanity terarah, manifest reproduksi, audit dan riwayat simetris.
- `web/public/data/`: lima JSON aktual tervalidasi, 3.000 klaim, 120 faskes, sekitar 2,80 MB (<6 MB). Summary/faskes mencakup seluruh cohort; antrean hanya 3.000 teratas. Matriks evaluasi UI tidak boleh diklaim mewakili seluruh dataset bila hanya memakai subset ini.

Seluruh berkas dashboard di luar lima JSON tetap sama. **QA integrasi dashboard, pembaruan screenshot/dokumentasi frontend dan deploy belum dijalankan; menunggu konfirmasi Gate A.**

<!-- grouped-eval -->
## Evaluasi tambahan per kelompok (25 Oktober 2026)

Data sintetis | validasi silang 5-fold. Tidak ada penyetelan parameter atau penggantian skor OOF antrean.

Outer dan inner validation memakai StratifiedGroupKFold, stratifikasi fraud_type, shuffle=True, seed=42; IF dan referensi fitur tetap memakai batch penuh tanpa label sehingga evaluasi masih transduktif.

| Kelompok | Varian | AP | R@2% | P@2% | R@5% | P@5% | R@10% | P@10% |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| faskes_id | xgb_only | 0.732999 | 43.46% | 96.41% | 71.70% | 63.65% | 79.42% | 35.25% |
| faskes_id | hybrid | 0.741866 | 43.79% | 97.13% | 72.45% | 64.32% | 80.46% | 35.71% |
| patient_id | xgb_only | 0.808862 | 44.22% | 98.09% | 78.05% | 69.29% | 88.18% | 39.14% |
| patient_id | hybrid | 0.804799 | 44.40% | 98.49% | 77.26% | 68.59% | 87.75% | 38.95% |

**faskes_id** — Kelompok faskes terpisah pada outer train/uji dan inner validasi; IF dan referensi fitur tetap memakai batch penuh tanpa label sehingga evaluasi masih transduktif.

| Jenis sintetis | XGBoost recall@5% | Hybrid recall@5% |
|---|---:|---:|
| phantom | 46.22% | 52.73% |
| repeat | 100.00% | 100.00% |
| upcoding | 78.57% | 78.21% |
| unbundling | 97.52% | 96.53% |
| inflated | 26.32% | 27.07% |
| cloning | 97.02% | 94.64% |

**patient_id** — Kelompok pasien terpisah pada outer train/uji dan inner validasi; IF dan referensi fitur tetap memakai batch penuh tanpa label sehingga evaluasi masih transduktif.

| Jenis sintetis | XGBoost recall@5% | Hybrid recall@5% |
|---|---:|---:|
| phantom | 63.03% | 61.76% |
| repeat | 100.00% | 100.00% |
| upcoding | 84.11% | 83.04% |
| unbundling | 98.27% | 98.27% |
| inflated | 37.78% | 38.16% |
| cloning | 97.62% | 94.05% |

Outer train/uji dan inner train/validasi tidak berbagi kelompok; cakupan setiap baris uji tepat sekali.
Durasi 161.530 detik. Skor/SHAP/antrean/summary/faskes/kamus terlindungi oleh pembandingan SHA256 sebelum/sesudah.

Temuan: generalisasi ke faskes terpisah lebih rendah; pasien terpisah tidak otomatis menurunkan AP. Hasil ini belum menghilangkan pengaruh fitur transduktif atau pemilihan definisi overlap setelah melihat data penuh.

Reproduksi setelah pipeline dasar: `python -m src.evaluate --grouped-only --artifact-dir artifacts/final_run`. Perintah ini hanya menambahkan grouped_eval pada model_report dan tidak mengganti skor antrean. Setelah menjalankan pipeline dasar ulang, jalankan kembali perintah kelompok untuk memperbarui blok tambahan.
