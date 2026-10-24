# Checkpoint fitur — berhenti sebelum training

> Riwayat checkpoint awal dengan definisi simetris. Sudah digantikan oleh keputusan Abil/Claude untuk overlap terarah dan pipeline telah selesai. Lihat [laporan Gate A terkini](GATE_A.md). Angka simetris lama disimpan pada [feature_sanity_symmetric.json](feature_sanity_symmetric.json); `feature_sanity.json` sekarang berisi hasil terarah yang disetujui.

24 Oktober 2026. Seluruh data sintetis, bukan data peserta JKN. Hasil berikut bukan klaim performa dunia nyata.

## Ringkasan

Preflight dan implementasi 27 fitur selesai. Lima pengujian fitur lolos. Sanity check dijalankan terhadap 62.711 klaim yang sudah tersedia: **12 dari 13 pemeriksaan lolos**, satu meleset lebih dari 20%. Sesuai instruksi Abil, **tidak ada training, evaluasi model, eksperimen hold-out, SHAP, maupun ekspor JSON yang dijalankan**. Gate A belum tercapai.

## Tabel sanity check

Deviasi untuk nilai target = `abs(aktual - ekspektasi) / ekspektasi`. Untuk batas atas/bawah, hanya pelanggaran batas yang dihitung. Pada ekspektasi sekitar nol, deviasi relatif tidak terdefinisi; batas absolut 1 poin persentase ditetapkan sebelum penghitungan. Catatan ini juga tersimpan dalam JSON laporan.

| Pemeriksaan | Aktual | Ekspektasi dokumen | Deviasi | Gate 20% |
| --- | ---: | ---: | ---: | --- |
| Cloning: `nn_dist < 0.015` | 100,000% | ~100% | 0,00% | Lolos |
| Normal: `nn_dist < 0.015` | 0,869% | <1% | Tidak melanggar batas | Lolos |
| Unbundling: `same_pat_fk_3d >= 1` | 100,000% | ~100% | 0,00% | Lolos |
| Repeat: `same_pat_fk_3d >= 1` | 19,748% | ~20% | 1,26% | Lolos |
| Normal: `same_pat_fk_3d >= 1` | 0,214% | ~0% | Di bawah batas absolut 1 pp | Lolos |
| Median `ratio_gap`, upcoding | 2,22519 | ~2,3 | 3,25% | Lolos |
| Median `ratio_gap`, selain upcoding | 0,99741 | ~1,0 | 0,26% | Lolos |
| Median `pair_rarity`, upcoding | 0,99490 | ~0,99 | 0,49% | Lolos |
| Median `pair_rarity`, normal | 0,02559 | ~0,03 | 14,69% | Lolos |
| Median `dx_peer_ratio`, inflated | 1,27751 | ~1,3 | 1,73% | Lolos |
| Median `dx_peer_ratio`, unbundling | 0,44955 | ~0,45 | 0,10% | Lolos |
| Median `dx_peer_ratio`, selain inflated/unbundling | 1,00000 | ~1,0 | 0,00% | Lolos |
| Proporsi phantom di antara klaim `inpatient_overlap=1` | **37,326%** | **Mayoritas (>50%)** | **25,35% di bawah batas 50%** | **BERHENTI** |

Durasi tahap fitur, termasuk pembacaan input dan penghitungan sanity check: **1,236 detik**. Ini bukan durasi pipeline lengkap CSV hingga JSON.

## Temuan overlap

| Label evaluasi sintetis | Jumlah klaim | `inpatient_overlap=1` |
| --- | ---: | ---: |
| Normal (`none`) | 59.927 | 183 |
| Phantom | 476 | 134 |
| Repeat | 476 | 8 |
| Upcoding | 560 | 11 |
| Unbundling | 404 | 9 |
| Inflated | 532 | 7 |
| Cloning | 336 | 7 |
| Total | 62.711 | 359 |

Fitur mengikuti definisi: klaim rawat inap bertanda 1 jika interval `[admit_date, discharge_date)` bertumpang tindih dengan rawat inap pasien yang sama di faskes berbeda. Kedua klaim dalam pasangan konflik ditandai. Hari keluar yang sama dengan hari masuk klaim berikutnya tidak dianggap overlap. Klaim rawat jalan tidak dimasukkan.

Karena penandaan berlaku dua arah, klaim normal juga dapat ditandai bersama klaim yang berpotensi menyimpang. Data aktual berisi 183 klaim normal bertanda 1, 134 phantom, dan 42 dari jenis lain. Definisi fitur tidak dapat memilih hanya pasangan berlabel phantom tanpa memakai informasi label. Ini mengindikasikan ekspektasi komposisi label pada pemeriksaan overlap perlu ditinjau bersama pemilik proyek; implementasi dan ambang tidak diubah untuk mengejar kelulusan sanity check.

## Audit label dan data

- Pembentukan fitur hanya membaca daftar kolom input eksplisit; `fraud_label`, `fraud_type`, dan `claim_id` tidak dibaca.
- `patient_id` dan `faskes_id` hanya menentukan kelompok hitung, bukan kolom fitur model.
- Pengujian membuktikan perubahan total atau penghapusan label dan `claim_id` tidak mengubah matriks fitur.
- Seluruh fitur berhingga; bentuk matriks `62711 x 27`.
- SHA256 input diperiksa sebelum dan sesudah tahap fitur. CSV dan generator tidak diubah atau diregenerasi.
- Statistik peer dan riwayat mengikuti batch retrospektif tanpa label, sesuai brief. Ini bersifat transduktif; bukan bukti generalisasi prospektif.

## Metrik tiga varian

| Varian | PR-AUC | Recall@2% | Recall@5% | Recall@10% |
| --- | --- | --- | --- | --- |
| `if_only` | Belum dijalankan | Belum dijalankan | Belum dijalankan | Belum dijalankan |
| `xgb_only` | Belum dijalankan | Belum dijalankan | Belum dijalankan | Belum dijalankan |
| `hybrid` | Belum dijalankan | Belum dijalankan | Belum dijalankan | Belum dijalankan |

Recall per jenis fraud dan hold-out untuk keenam jenis belum tersedia. Tidak ada angka model yang direkayasa. Angka di dashboard tetap fixture ilustratif dari Prompt 2.

## Reproduksi dan artefak

```powershell
cd "C:\Users\diamo\Documents\VSC\Hackaton\BPJS Healtkathon\ml"
$env:PYTHONUTF8 = "1"
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m src.features
```

Perintah terakhir sengaja keluar dengan kode bukan nol ketika sanity gate gagal. Ia tidak melatih model dan tidak menulis ke `web/`.

Artefak lokal: `artifacts/features.parquet`, `artifacts/feature_metadata.parquet`, `artifacts/feature_sanity.json`. Salinan hasil checkpoint yang di-commit: `reports/feature_sanity.json` dan laporan ini. `run_all.py` belum dibuat karena pekerjaan berhenti sebelum training; reproducibility pipeline lengkap belum dapat diklaim.
