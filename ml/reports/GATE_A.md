# Gate A — KlaimGuard AI, hasil ML aktual

Seluruh data **sintetis**, bukan data peserta JKN. Angka performa **bukan klaim performa dunia nyata**. Skor merupakan rekomendasi prioritas; keputusan akhir tetap pada auditor manusia.

## 1. Ringkasan selesai dan belum selesai

Selesai: 27 fitur, Isolation Forest 300 tree pada 23 fitur numerik, XGBoost dan hybrid lima fold OOF, early stopping internal train, enam eksperimen hold-out lima fold, audit anti-kebocoran, SHAP setiap klaim dari model fold yang menilainya, aturan pola transparan, lima JSON aktual dan validator, serta `run_all.py` dari CSV tanpa cache.

Input: 62.711 klaim, 120 faskes, 23.171 pasien sintetis, 2.784 label fraud (4,4394%). Sepuluh unit test lolos; `pip check` tidak menemukan dependensi rusak.

Run penuh baru selesai dalam **212.897 detik**. Hasil lolos **27 pembandingan eksak** terhadap run per tahap sebelumnya: fitur, prediksi, hold-out dan SHAP identik bit demi bit; JSON sama kecuali `generated_at`/`duration_seconds`. Tidak mengklaim reproduksibilitas bitwise lintas versi paket/OS.

Belum dilakukan: QA integrasi dashboard dengan ekspor ML, pembaruan screenshot/dashboard README, dan deploy. Berhenti di Gate A; menunggu konfirmasi Abil. Semua berkas `web/` di luar lima JSON ekspor sama berdasarkan fingerprint sebelum/sesudah run.

## 2. Sanity check fitur

**13/13 lolos.** Pemeriksaan overlap terakhir menggabungkan dua syarat tegas, proporsi phantom >50% sekaligus enrichment >=10x. Jumlah terverifikasi: 253 total / 134 phantom / 92 normal / 27 lain.

| Pemeriksaan | Aktual | Ekspektasi | Deviasi relatif | Gate |
| --- | --- | --- | --- | --- |
| nn_dist < 0.015 \| cloning | 100.000% | 100.000% | 0.00% | PASS |
| nn_dist < 0.015 \| normal | 0.869% | <1.000% | 0.00% | PASS |
| same_pat_fk_3d >= 1 \| unbundling | 100.000% | 100.000% | 0.00% | PASS |
| same_pat_fk_3d >= 1 \| repeat | 19.748% | 20.000% | 1.26% | PASS |
| same_pat_fk_3d >= 1 \| normal | 0.214% | ~0%; bound <=1pp | n/a | PASS |
| median ratio_gap \| upcoding | 2.22519 | 2.30000 | 3.25% | PASS |
| median ratio_gap \| others | 0.99741 | 1.00000 | 0.26% | PASS |
| median pair_rarity \| upcoding | 0.99490 | 0.99000 | 0.49% | PASS |
| median pair_rarity \| normal | 0.02559 | 0.03000 | 14.69% | PASS |
| median dx_peer_ratio \| inflated | 1.27751 | 1.30000 | 1.73% | PASS |
| median dx_peer_ratio \| unbundling | 0.44955 | 0.45000 | 0.10% | PASS |
| median dx_peer_ratio \| others | 1.00000 | 1.00000 | 0.00% | PASS |
| phantom fraction \| inpatient_overlap=1 | 52.964%; enrichment 69.778x | >50.000%; enrichment >=10x | 0.00% | PASS |

Ekspektasi sekitar nol memakai batas absolut 1 poin persentase yang ditetapkan sebelum penghitungan; deviasi relatif terhadap nol tidak terdefinisi. Deviasi pemeriksaan batas hanya menghitung pelanggaran batas, bukan selisih terhadap target titik.

**Riwayat perubahan penting:** overlap simetris awal menghasilkan 359 klaim, 134 phantom, 183 normal, 42 lain; ekspektasi mayoritas phantom pada definisi itu dinyatakan keliru oleh Abil dan Claude. Definisi diganti menjadi terarah: klaim masuk lebih belakangan ditandai; tanggal masuk sama menandai keduanya; hanya rawat inap lintas faskes, interval `[admit, discharge)`. **Definisi terarah dipilih setelah membandingkan kedua definisi pada data penuh**, sehingga merupakan keputusan desain berbasis data dan membatasi independensi evaluasi. Tidak mengubah atau meregenerasi dataset/generator.

## 3. Metrik tiga varian

PR-AUC dilaporkan sebagai **average precision (AP)**. Fold distratifikasi `fraud_type`, seed 42. Budget membulatkan ke atas: top 2/5/10% masing-masing 1255/3136/6272 klaim. Tie diurutkan berdasarkan urutan sumber, tanpa label.

| Varian | PR-AUC / AP | Recall@2% | Recall@5% | Recall@10% |
| --- | --- | --- | --- | --- |
| if_only | 0,258685 | 17,39% | 32,08% | 52,01% |
| xgb_only | 0,804339 | 44,29% | 77,69% | 87,86% |
| hybrid | 0,799798 | 44,40% | 77,01% | 87,28% |

| Varian | Precision@2% | Precision@5% | Precision@10% |
| --- | --- | --- | --- |
| if_only | 38,57% | 28,48% | 23,09% |
| xgb_only | 98,25% | 68,97% | 39,00% |
| hybrid | 98,49% | 68,37% | 38,74% |

`if_only` adalah persentil skor IF tanpa label yang dilatih pada seluruh batch. `xgb_only` dan `hybrid` adalah prediksi supervised OOF. Early stopping memakai 20% inner validation dari outer train, lalu refit seluruh outer train memakai jumlah tree terpilih; fold uji tidak masuk fit/early stopping. Parameter maksimum 400 tree, depth 5, learning rate 0,05, subsample/colsample 0,8; tidak disetel berdasarkan hasil uji.

Kurva lift mencakup 0–100%, termasuk seluruh titik 1–20% yang diwajibkan. Pada top 5%, hybrid menangkap 77,01% kasus sintetis berlabel dibanding ekspektasi sampling acak 5%.

## 4. Recall per jenis dan hold-out

Recall per jenis pada top 5% klaim, dari OOF biasa:

| Jenis pola sintetis | IF | XGBoost | Hybrid |
| --- | --- | --- | --- |
| Phantom billing (klaim palsu) | 17,65% | 61,34% | 63,24% |
| Repeat billing (klaim berulang) | 31,72% | 100,00% | 100,00% |
| Manipulasi diagnosis dan/atau tindakan (upcoding) | 42,68% | 84,46% | 83,75% |
| Services unbundling / fragmentation | 72,03% | 98,27% | 98,02% |
| Inflated bills (penggelembungan tagihan) | 18,42% | 37,78% | 36,84% |
| Cloning (penjiplakan klaim) | 8,93% | 96,43% | 91,07% |

Hold-out: untuk setiap T, semua baris T dibuang dari outer train **sebelum** inner train/validation dan refit; baris normal pada outer train tetap tersedia. Lima fold uji yang sama memuat T. Prediksi uji digabung, top 5% seluruh cohort dipilih, kemudian recall T dihitung. Audit 60 model hold-out menyatakan tidak ada T dalam supervised train dan tidak menggunakan outer test untuk early stopping.

| T dikeluarkan dari train supervised | IF | XGBoost | Hybrid |
| --- | --- | --- | --- |
| Phantom billing (klaim palsu) | 17,65% | 5,88% | 7,14% |
| Repeat billing (klaim berulang) | 31,72% | 16,60% | 40,34% |
| Manipulasi diagnosis dan/atau tindakan (upcoding) | 42,68% | 13,04% | 11,96% |
| Services unbundling / fragmentation | 72,03% | 4,95% | 17,08% |
| Inflated bills (penggelembungan tagihan) | 18,42% | 6,77% | 7,33% |
| Cloning (penjiplakan klaim) | 8,93% | 3,57% | 2,08% |

IF dan referensi fitur tanpa label tetap memakai seluruh batch, termasuk kovariat T, sesuai brief. Ini **bukan** uji jenis yang benar-benar baru pada lingkungan induktif/prospektif. IF sebagai baseline tidak dilatih ulang per T karena tidak memakai label.

## 5. Temuan, audit, dan batasan

- Hybrid belum unggul secara keseluruhan: AP 0,799798 vs XGBoost 0,804339; recall@5% juga sedikit lebih rendah. Parameter dipertahankan dan hasil tidak dipoles.
- Pada hold-out, hybrid membantu dibanding XGBoost untuk repeat dan unbundling, sedikit untuk phantom/inflated, tetapi lebih rendah untuk upcoding dan cloning. IF sendiri sering lebih tinggi; tambahan skor anomali tidak otomatis menghasilkan generalisasi terbaik.
- Inflated menjadi jenis paling sulit pada evaluasi OOF biasa (hybrid 36,84%), lebih rendah daripada phantom (63,24%), berbeda dari ekspektasi awal.
- Cloning memiliki fitur jarak sangat mudah (100% melewati sanity threshold), tetapi recall hybrid saat jenis cloning dikeluarkan dari train hanya 2,08%. Fitur yang mudah tidak menjamin model menangkap pola yang belum dilatih.
- Pemicu AP >0,99 atau setidaknya lima jenis recall >=95%: **False**. Audit tetap dijalankan: fitur tanpa label dan setelah penggantian label/claim_id identik pada seluruh 62.711 baris; tidak ada fitur label atau ID mentah pada model tersimpan; tidak ada kolom identik dengan target atau komplemennya.
- Peer median, tetangga dan riwayat serta IF memakai batch penuh tanpa label. Evaluasi transduktif dan split per klaim dapat berbagi pasien/faskes/klaim berelasi lintas fold; perlu evaluasi per kelompok dan waktu untuk klaim generalisasi baru.
- Data sintetis dan pola disuntikkan; perubahan definisi overlap dilakukan setelah meninjau data penuh. Tidak ada validasi dunia nyata atau bukti penghematan terkonfirmasi.
- SHAP memakai TreeExplainer pada model OOF terkait dan output raw log-odds. Rekonstruksi probabilitas maksimum **6.18e-07**. Tiga alasan dipilih dari kontribusi positif terbesar; jika kurang dari tiga, diisi kontribusi negatif nonnol terbesar dengan arah yang benar. Kontribusi bukan sebab-akibat.
- Pola dugaan mengikuti enam aturan tetap, tanpa label; maksimum dua, diurutkan menurut |SHAP| fitur terkait. Median peer rupiah dibulatkan, estimasi = selisih positif terhadap median yang diekspor; bukan kerugian terbukti.
- Referensi pasien adalah SHA1 enam karakter untuk demo; bukan jaminan anonimitas produksi. Keputusan tetap pada auditor manusia.

Global feature importance: kolom pertama rata-rata |SHAP| OOF dalam log-odds; kolom kedua rata-rata gain yang dinormalisasi per model. Besarnya importance tidak membuktikan perbaikan AP.

| Fitur | Mean \|SHAP\| | Mean normalized gain |
| --- | --- | --- |
| Persentil anomali Isolation Forest | 1,022483 | 0,116817 |
| Kemiripan komponen biaya | 0,655339 | 0,067819 |
| Kecenderungan biaya faskes | 0,554260 | 0,040802 |
| Rasio biaya vs peer prosedur | 0,293119 | 0,049668 |
| Rasio biaya vs peer diagnosis | 0,213240 | 0,030924 |
| Durasi vs median diagnosis | 0,205566 | 0,030372 |
| Lonjakan klaim harian faskes | 0,183875 | 0,016605 |
| Kelangkaan diagnosis–tindakan | 0,179487 | 0,064814 |
| Klaim berdekatan dalam 3 hari | 0,144494 | 0,122951 |
| Porsi komponen kamar | 0,132269 | 0,017462 |
| Porsi komponen tindakan | 0,115320 | 0,017426 |
| Kelas faskes | 0,111520 | 0,030109 |
| Rasio komponen obat | 0,100545 | 0,025398 |
| Porsi komponen laboratorium/radiologi | 0,097925 | 0,015300 |
| Pengulangan dalam 14 hari | 0,077410 | 0,040640 |
| Tingkat keparahan | 0,076528 | 0,025988 |
| Porsi komponen obat | 0,073616 | 0,016060 |
| Rawat inap tumpang tindih terarah | 0,062793 | 0,087599 |
| Rasio komponen lainnya | 0,061537 | 0,012950 |
| Rasio komponen laboratorium/radiologi | 0,060105 | 0,012208 |
| Ketidakseimbangan rasio diagnosis–prosedur | 0,058042 | 0,029063 |
| Porsi komponen lainnya | 0,054703 | 0,013548 |
| Kepemilikan faskes | 0,051418 | 0,028716 |
| Rasio komponen tindakan | 0,048680 | 0,012641 |
| Jumlah klaim pasien | 0,048091 | 0,019974 |
| Rasio komponen kamar | 0,042560 | 0,012738 |
| Pasien muncul sekali | 0,004953 | 0,024539 |
| Tipe layanan | 0,002105 | 0,016871 |

Durasi tahap run penuh:

| Tahap | Detik |
| --- | --- |
| features | 1.301 |
| training | 28.223 |
| evaluation_holdouts | 162.713 |
| audit_shap_export | 19.462 |

## 6. Reproduksi dan berkas

```powershell
cd "<folder proyek>\ml"
$env:PYTHONUTF8 = "1"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe run_all.py
```

Run penuh yang diverifikasi pada sesi ini:

```powershell
.\.venv\Scripts\python.exe run_all.py --artifact-dir artifacts/final_run --verify-against artifacts
```

Referensi `artifacts/` berasal dari run per tahap sebelumnya; perbandingan baru membutuhkan referensi tersebut. Run normal `run_all.py` tidak membutuhkan cache atau reference. Generator tidak dijalankan. Paket dipin dalam `requirements.txt`; versi dan hash sumber tercantum pada snapshot manifest. Gunakan Python 3.12+ untuk requirements ini: metadata NumPy/XGBoost/SHAP terpasang membutuhkan >=3.12; sesi memakai Python 3.12.6 dan memenuhi batas awal preflight >=3.10.

Ukuran ekspor tervalidasi: **2,803,328 byte**, di bawah batas konservatif 6.000.000 byte; 3.000 klaim dan 120 faskes.

| JSON | Byte payload JSON (sebelum newline akhir) |
| --- | --- |
| summary.json | 800 |
| claims_flagged.json | 2723209 |
| faskes_risk.json | 55635 |
| model_report.json | 16453 |
| feature_dictionary.json | 7221 |

Kode: `src/features.py`, `train.py`, `evaluate.py`, `audit.py`, `export.py`, `validate_export.py`, `report.py`, `run_all.py`, serta `tests/`. Lima JSON aktual ada pada `web/public/data/`. Model 10 fold, IF/scaler, fitur, OOF/hold-out, SHAP dan audit rinci tersimpan pada `artifacts/` yang tidak di-deploy. Snapshot untuk review ada di `reports/`.

Hash input sebelum/sesudah sama:

| Sumber | SHA256 |
| --- | --- |
| data/claims_synthetic.csv | f6dbf500f78a81370d742f7d33e5390661a0ab920792df9930bfcc22384e21fe |
| data/faskes.csv | 8de0f64cf9d495aa969228c76f10e70f8a201c0b4b852041758642813fb31c15 |
| src/generate_claims.py | 85988f94bbfc325b4976188c964dcc1df7bb018475b15c8961a8f3569a8c1625 |

**Gate A: laporan lengkap siap; berhenti dan menunggu konfirmasi Abil.**
