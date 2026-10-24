# KlaimGuard AI — ML

**Semua data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Skor nantinya hanya rekomendasi prioritas; keputusan akhir tetap pada auditor manusia.**

Status saat ini: **berhenti pada sanity gate fitur sebelum training**. Implementasi fitur selesai; 12 dari 13 sanity check lolos. Proporsi phantom pada klaim rawat inap yang overlap adalah 37,326%, meleset 25,35% terhadap batas mayoritas 50%. Lihat [laporan checkpoint lengkap](reports/FEATURE_SANITY.md).

## Lingkungan dan menjalankan tahap fitur

Python 3.12.6 digunakan pada sesi ini; minimal Python 3.10. Versi terpasang dipin bersama dependensinya dalam `requirements.txt`.

```powershell
cd "C:\Users\diamo\Documents\VSC\Hackaton\BPJS Healtkathon\ml"
$env:PYTHONUTF8 = "1"
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
.\.venv\Scripts\python.exe -m src.features
```

Tahap fitur membaca CSV yang sudah tersedia dan tidak menjalankan generator. Exit code bukan nol berarti sanity check di luar toleransi dan training harus ditahan. Paket utama yang berhasil diimpor: NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, XGBoost 3.4.1, SHAP 0.54.1, PyArrow 26.0.0.

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
| `inpatient_overlap` | Ada rawat inap pasien sama di faskes berbeda yang tumpang tindih pada interval setengah terbuka. Kedua anggota pasangan konflik ditandai. |
| `fk_day_burst` | Jumlah klaim faskes pada hari itu / rata-rata klaim per hari pada seluruh rentang observasi kalender, termasuk hari tanpa klaim; denominator minimal 0,05. |
| `fk_loo_ratio` | Rata-rata `dx_peer_ratio` faskes dengan klaim sendiri dikeluarkan. Singleton diisi 1. |
| Kategorikal | Kelas D/C/B/A = 1/2/3/4; RJTL/RITL = 0/1; keparahan I/II/III = 1/2/3; Pemerintah/Swasta = 0/1. |

Median peer dan hitungan riwayat menggunakan batch retrospektif tanpa label sesuai brief. Evaluasi model nanti perlu menyebut sifat transduktif ini; belum membuktikan performa pada klaim masa depan atau faskes baru.

## Hasil nyata sejauh ini

- Lima pengujian fitur lolos, termasuk anti-label-leakage, definisi jarak relatif, overlap dua arah, batas tanggal, median nol, dan leave-one-out.
- 62.711 klaim menghasilkan 27 fitur berhingga.
- Durasi tahap fitur 1,236 detik, bukan durasi pipeline lengkap.
- CSV dan `generate_claims.py` tetap sama berdasarkan SHA256 sebelum/sesudah proses.
- Satu sanity check di luar toleransi, sehingga tidak ada pelatihan, prediksi OOF, hold-out, perhitungan SHAP, maupun ekspor JSON aktual.

Belum tersedia `train.py`, `evaluate.py`, `export.py`, atau `run_all.py`. Model belum dilatih; Gate A belum tercapai. Dashboard dan JSON contoh tidak diubah.

## Artefak

`artifacts/` diabaikan Git dan berisi matriks fitur Parquet, metadata median peer, serta JSON sanity check. `reports/` menyimpan snapshot hasil checkpoint untuk review. Daftar kolom, whitelist input, komposisi overlap, dan hash sumber lengkap tercantum dalam `reports/feature_sanity.json`.
