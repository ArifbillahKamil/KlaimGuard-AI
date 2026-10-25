# Evaluasi kelompok KlaimGuard AI

Semua data sintetis; angka bukan klaim performa dunia nyata.

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
