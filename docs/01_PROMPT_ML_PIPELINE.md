# Prompt 1 — ML Pipeline

Prasyarat: baca `docs/00_KONTEKS_DAN_KONTRAK.md`. Berhenti di **Gate A** setelah selesai.


**Peran:** kamu adalah ML engineer. Bangun pipeline di folder `ml/` yang menghasilkan semua file pada kontrak data di `docs/00_KONTEKS_DAN_KONTRAK.md`.

**Input:** `ml/data/claims_synthetic.csv` (kolom: claim_id, patient_id, faskes_id, faskes_class, faskes_ownership, service_type, dx, severity, proc, admit_date, discharge_date, los, cost_room, cost_procedure, cost_drug, cost_labrad, cost_other, fraud_label, fraud_type, claim_total) dan `ml/data/faskes.csv`. Referensi nama diagnosis: ada di `ml/src/generate_claims.py` (list `DX`). Pakai itu untuk `dx_name`.

### Langkah 1 — Feature engineering (`features.py`)
Hitung fitur berikut. Semuanya berbasis data, tanpa label.

| Fitur | Definisi |
|---|---|
| `dx_peer_ratio` | `claim_total` / median `claim_total` pada grup (dx, faskes_class, service_type). Jika grup < 20 klaim, pakai grup dx saja |
| `proc_peer_ratio` | `claim_total` / median pada grup (proc, faskes_class) |
| `ratio_gap` | `proc_peer_ratio / dx_peer_ratio` (upcoding: biaya terlalu tinggi untuk prosedur, tapi tampak wajar untuk diagnosis yang diklaim) |
| `comp_ratio_{room,procedure,drug,labrad,other}` | komponen / median komponen pada grup dx. Jika median 0, isi 1.0 |
| `comp_share_{...}` | komponen / `claim_total` |
| `pair_rarity` | `1 − count(dx,proc) / count(dx)` (pasangan diagnosis–tindakan yang janggal) |
| `los_ratio` | `los` / median `los` per dx (RJTL = 1.0) |
| `nn_dist` | untuk tiap klaim: jarak relatif L∞ pada 5 komponen biaya ke klaim terdekat di grup (faskes_id, dx, proc) yang sama. Jarak antara vektor a, b = `max_i |a_i − b_i| / max(a_i, b_i)`. Jika klaim sendirian di grup, isi 1.0 |
| `patient_n_claims`, `patient_once` | jumlah klaim pasien; flag 1 jika hanya sekali |
| `same_pat_fk_3d` | jumlah klaim lain pasien yang sama di faskes yang sama dengan selisih tanggal masuk ≤ 3 hari |
| `repeat_14d` | 1 jika ada klaim sebelumnya (pasien, dx, proc sama) dalam 14 hari sebelum `admit_date` |
| `inpatient_overlap` | Terarah: 1 jika klaim rawat inap masuk lebih belakangan daripada rawat inap lain pasien yang sama di faskes berbeda yang masih tumpang tindih; interval `[admit, discharge)`. Jika tanggal masuk sama, tandai keduanya. Rawat jalan tidak disertakan |
| `fk_day_burst` | jumlah klaim faskes pada `admit_date` yang sama / (rata-rata klaim per hari faskes itu, batas bawah 0,05) |
| `fk_loo_ratio` | rata-rata `dx_peer_ratio` faskes, **leave-one-out** (tanpa klaim itu sendiri) |
| kategorikal | `faskes_class` (ordinal A>B>C>D), `service_type`, `severity`, `faskes_ownership` |

**Pemeriksaan kewarasan wajib** (cetak di log; angka kira-kira, tolerans ±20%):
- `nn_dist < 0.015`: ~100% klaim cloning vs < 1% klaim normal.
- `same_pat_fk_3d ≥ 1`: ~100% unbundling, ~20% repeat, ~0% normal.
- median `ratio_gap`: upcoding ≈ 2,3, lainnya ≈ 1,0. Median `pair_rarity` upcoding ≈ 0,99 vs ≈ 0,03 normal.
- median `dx_peer_ratio`: inflated ≈ 1,3; unbundling ≈ 0,45; lainnya ≈ 1,0.
- `inpatient_overlap` terarah: dua syarat sekaligus, proporsi phantom di antara klaim bertanda 1 **>50%** dan enrichment terhadap base rate phantom **>=10x**. Base rate pada dataset ini sekitar 0,76%. Verifikasi dataset tetap: total 253 klaim bertanda 1, terdiri atas 134 phantom, 92 normal, dan 27 jenis lain.

Keputusan Abil dan Claude setelah pemeriksaan awal: ekspektasi mayoritas pada definisi overlap simetris sebelumnya tidak tepat karena kedua anggota pasangan ditandai. Definisi terarah dipilih **setelah membandingkan kedua definisi pada data penuh**. Catat keputusan berbasis data ini sebagai keterbatasan evaluasi, bukan validasi independen. Tidak mengubah atau meregenerasi dataset.
Jika sanity check ini tidak terpenuhi, perbaiki implementasi fitur, jangan ubah data.

### Langkah 2 — Isolation Forest (`train.py`)
- Fitur numerik saja (tanpa kategorikal), di-scale dengan `RobustScaler`.
- `IsolationForest(n_estimators=300, contamination="auto", random_state=42)` dilatih pada **semua** klaim tanpa label.
- `if_score` = persentil peringkat (0–100) dari `−score_samples`. Skor lebih tinggi = lebih janggal.
- Opsional (stretch, hanya jika semua langkah lain sudah selesai): autoencoder sederhana (MLP reconstruction error) sebagai pembanding `ae_score`. Jangan memperlambat jadwal.

### Langkah 3 — XGBoost hybrid (`train.py`)
- Tiga varian dibandingkan: `if_only` (skor IF saja), `xgb_only` (semua fitur tanpa `if_score`), `hybrid` (semua fitur + `if_score`).
- Parameter awal: `n_estimators=400, max_depth=5, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8, eval_metric="aucpr", scale_pos_weight = n_normal/n_fraud, early_stopping_rounds=30`.
- Pakai CPU. Disarankan memasang `xgboost-cpu` bila tersedia agar instalasi ringan.
- **5-fold stratified CV** (stratifikasi pada `fraud_type`). Simpan prediksi **out-of-fold** untuk semua klaim. Skor dashboard memakai OOF hybrid.
- Early stopping memakai validation split dari data train di dalam tiap fold, bukan fold test.

### Langkah 4 — Evaluasi (`evaluate.py`)
Laporkan untuk `if_only`, `xgb_only`, `hybrid`:
- PR-AUC.
- Recall dan precision pada anggaran pemeriksaan **2%, 5%, 10%** klaim teratas.
- Kurva lift: recall pada 1%–20% klaim teratas vs baseline sampling acak (recall acak = persentase yang diperiksa).
- Recall per jenis fraud pada anggaran 5%.
- **Eksperimen hold-out per jenis fraud** (bukti manfaat hybrid): untuk tiap jenis fraud T, latih ulang `xgb_only` dan `hybrid` dengan **membuang semua baris berlabel T dari data latih** (baris normal tetap), lalu ukur recall T pada anggaran 5% di data uji. Bandingkan juga dengan `if_only`. Tujuannya melihat apakah komponen unsupervised membantu menangkap pola yang tidak pernah dilihat saat pelatihan.
- Feature importance (gain) dan rata-rata |SHAP|.

**Ekspektasi (hanya untuk deteksi kebocoran, bukan target):** cloning, unbundling, repeat, dan upcoding relatif mudah. Inflated sedang. Phantom paling sulit. Jika PR-AUC hybrid > 0,99 atau recall semua jenis mendekati 100%, curigai kebocoran dan audit fitur sebelum melaporkan.

### Langkah 5 — SHAP dan teks alasan (`export.py`)
- Hitung SHAP memakai `TreeExplainer` dari model fold yang menilai klaim tersebut (konsisten dengan skor OOF).
- Ambil 3 fitur dengan |SHAP| terbesar yang berkontribusi menaikkan risiko. Tampilkan `direction` ("up"/"down") sesuai tanda SHAP.
- Ubah menjadi teks Indonesia lewat template per fitur, misalnya:
  - `dx_peer_ratio` → "Biaya {x:.1f}× median faskes sejenis untuk {dx_name}"
  - `ratio_gap` → "Biaya terlalu tinggi untuk prosedur {proc}, tidak sesuai dengan diagnosis yang diklaim"
  - `pair_rarity` → "Pasangan diagnosis dan tindakan jarang ditemukan"
  - `nn_dist` → "Komponen biaya hampir identik dengan klaim lain di faskes yang sama (selisih {x:.1%})"
  - `same_pat_fk_3d` → "Pasien yang sama punya {n} klaim lain di faskes ini dalam 3 hari"
  - `repeat_14d` → "Diagnosis dan tindakan sama sudah diklaim pasien ini dalam 14 hari terakhir"
  - `inpatient_overlap` → "Rawat inap tumpang tindih dengan rawat inap di faskes lain"
  - `patient_once` / `fk_day_burst` → "Pasien hanya muncul sekali; faskes mengajukan lonjakan klaim pada hari yang sama"
  - `comp_ratio_*` → "Komponen {nama komponen} {x:.1f}× median peer"
  - `fk_loo_ratio` → "Faskes ini cenderung menagih di atas median peer"
  - fitur lain: teks generik dari `feature_dictionary.json`.

### Langkah 6 — Pola dugaan (aturan, bukan label)
Tentukan `patterns` memakai aturan transparan berikut (satu klaim boleh memenuhi lebih dari satu; simpan maksimum 2, urut sesuai |SHAP| fitur terkait):
- `nn_dist < 0.015` → Cloning (penjiplakan klaim)
- `repeat_14d == 1` → Repeat billing (klaim berulang)
- `same_pat_fk_3d ≥ 1` dan `dx_peer_ratio < 0.8` → Services unbundling / fragmentation
- `pair_rarity ≥ 0.9` atau `ratio_gap ≥ 1.6` → Manipulasi diagnosis dan/atau tindakan (upcoding)
- `dx_peer_ratio ≥ 1.25` → Inflated bills (penggelembungan tagihan)
- `inpatient_overlap == 1` atau (`patient_once == 1` dan `fk_day_burst ≥ 3`) → Phantom billing (klaim palsu)
Aturan ini hanya memberi petunjuk dan **tidak memakai label**. Catat di README bahwa ini heuristik.

### Langkah 7 — Ekspor
Hasilkan semua file kontrak data ke `web/public/data/`. Validasi dengan skrip kecil (jumlah klaim = 3.000, field wajib ada, tidak ada NaN, semua `patterns` memakai label resmi, ukuran total folder data ≤ 6 MB). Sediakan `python run_all.py` yang menjalankan seluruh pipeline dari CSV hingga JSON.

### Deliverable Prompt 1
`ml/` lengkap, `requirements.txt` (versi dipin), `README.md` (cara jalan, definisi fitur, hasil evaluasi, keterbatasan), dan JSON di `web/public/data/`. Lapor memakai format di `docs/04_CHECKPOINT_DAN_DOD.md`.
