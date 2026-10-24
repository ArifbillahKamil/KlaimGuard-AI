# STATUS — KlaimGuard AI

Terakhir diperbarui: 24 Oktober 2026 (oleh Claude, sebelum handoff ke agent pembangun)
Deadline: **1 November 2026** (target submit 31 Oktober)

> Agent: perbarui file ini setelah setiap tahap (centang, tanggal, temuan, keputusan).

## Progres

### Selesai (persiapan)
- [x] Proposal lolos seleksi; saran reviewer: hybrid Isolation Forest/Autoencoder + XGBoost + SHAP per flag
- [x] Desain data sintetis dan generator (`ml/src/generate_claims.py`, seed 42, path relatif)
- [x] Dataset terbentuk: 62.711 klaim, 120 faskes, ~23.170 pasien, fraud 4,44% (2.784 klaim)
- [x] Cek kewarasan data (kebocoran label dan duplikat sudah diperbaiki, lihat Catatan Data)
- [x] Workspace, AGENTS.md, dan brief/prompt disiapkan

### Prompt 1 — ML pipeline (`docs/01_PROMPT_ML_PIPELINE.md`)
- [ ] `features.py` + sanity check fitur
- [ ] Isolation Forest (`if_score`)
- [ ] XGBoost 5-fold OOF: `if_only`, `xgb_only`, `hybrid`
- [ ] Evaluasi + eksperimen hold-out per jenis fraud
- [ ] SHAP + teks alasan + aturan pola dugaan
- [ ] Ekspor JSON ke `web/public/data/` + validasi
- [ ] `run_all.py`, `requirements.txt` (pin), `ml/README.md`
- [ ] **GATE A: lapor ke Abil dan tunggu konfirmasi**

Catatan Prompt 1 (24 Oktober 2026): preflight berhasil, Python 3.12.6; venv `ml/.venv`; NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, XGBoost 3.4.1, SHAP 0.54.1, PyArrow 26.0.0. Versi terpasang dipin di `ml/requirements.txt`. Perubahan dashboard dilarang selain lima JSON ekspor di `web/public/data/`. Training hanya dilanjutkan jika sanity check fitur tidak meleset lebih dari 20%; dataset dan generator tidak diregenerasi atau diubah.

### Prompt 2 — Dashboard (`docs/02_PROMPT_DASHBOARD.md`)
- [x] Scaffold Vite + React + TS + Tailwind, data contoh sesuai kontrak
- [x] Ringkasan, Antrean Audit (panel detail + keputusan auditor + ekspor CSV)
- [x] Faskes, Evaluasi Model (Mode Evaluasi), Tata Kelola
- [ ] Sambungkan ke data asli dari Prompt 1
- [x] Screenshot desktop + mobile di `web/screenshots/`

Catatan agent kedua (24 Oktober 2026): pekerjaan dibatasi pada `web/` dan bagian Prompt 2 ini; `ml/` tidak disentuh, tidak deploy. Generator contoh sudah dijalankan: 300 klaim, 12 faskes, seed 42, lima JSON. Skor, SHAP, dan seluruh metrik/hold-out bersifat ilustratif, bukan hasil ML. Metadata tambahan `summary.data_source = "sample"` menampilkan peringatan contoh; generator menolak menimpa ekspor ML. Lima halaman, tabel virtual, filter, pengurutan, panel detail, keputusan lokal, CSV, Mode Evaluasi dan kondisi loading/error/empty sudah berjalan. Halaman Faskes dan Evaluasi dimuat secara lazy; font Inter disajikan lokal. Vite 6 dipilih agar cocok dengan Node v22.11.0 yang terbaca di sandbox; eksekusi build/QA di luar sandbox memakai Node v24.20.0. Lighthouse 13.5 (alat QA opsional) membutuhkan Node >=22.19. Build berhasil; QA browser 14 kelompok pemeriksaan lolos, termasuk penyimpanan kosong/rusak/ditolak dan CSV aman dari formula. Artefak final: 12 screenshot (lima halaman + detail, desktop dan mobile), indeks screenshot, web/QA.md, dan web/qa-report.json. Lighthouse desktop Ringkasan: Performance 100, Accessibility 100, Best Practices 100, LCP sekitar 0,5 detik pada 300 data contoh; bukan pengukuran data ML lengkap. Audit npm akhir: 0 kerentanan. Pemeriksaan aksesibilitas otomatis WCAG A/AA lima halaman desktop/mobile dan panel detail desktop lolos. npm run dev juga diuji: lima JSON HTTP 200 dan 0 error runtime pada smoke test. Integrasi JSON hasil ML tetap menunggu Prompt 1.

### Prompt 3 — Deploy & QA (`docs/03_PROMPT_DEPLOY_VERCEL_QA.md`)
- [ ] QA lokal (build bersih, rute, filter, ekspor, mobile 390 px)
- [ ] **GATE C: tunjukkan hasil QA, minta konfirmasi**
- [ ] Deploy Vercel (Root Directory = `web`), uji URL produksi

## Jadwal target
| Tanggal | Pekerjaan |
|---|---|
| 24-25 Okt | Fitur, Isolation Forest, XGBoost hybrid, evaluasi |
| 26 Okt | SHAP, ekspor JSON, Gate A |
| 27-29 Okt | Dashboard |
| 29-30 Okt | Deploy, PPT revisi, script dan rekaman video |
| 31 Okt | Buffer dan submit |

## Keputusan yang sudah dibuat
- Dashboard **statis** (Vite + React), tanpa backend, hash router. Alasan: Vercel serverless read-only + library ML terlalu berat untuk runtime.
- Skor dashboard = persentil dari probabilitas hybrid OOF. Tier: high = top 3%, medium = top 3-10%.
- Pola dugaan dari aturan transparan (heuristik), bukan dari label.
- Nama solusi: **KlaimGuard AI**. Palet: navy `#0B1F2B`, teal `#2FD3C6`, amber `#F2A65A`, coral `#E05A4F`, krem `#F4EFE6`.

## Catatan data (hasil cek kewarasan)
- Fraud terkonsentrasi di sekitar 15% faskes "nakal" (disengaja).
- Yang sudah diperbaiki: fraud dulu salinan klaim normal (kebocoran duplikat), overlap rawat inap palsu pada data normal, ID pasien hantu berawalan "G", phantom/repeat berbiaya identik persis, burst phantom global (sekarang per faskes).
- Sinyal terverifikasi (kira-kira): cloning `nn_dist < 0,015` ~100% vs < 1% normal; unbundling `same_pat_fk_3d ≥ 1` 100%; upcoding median `ratio_gap` ~2,3 dan `pair_rarity` ~0,99; inflated median `dx_peer_ratio` ~1,3; unbundling ~0,45.
- Phantom paling lemah sinyalnya (overlap + pasien muncul sekali + burst per faskes). Ekspektasi: recall phantom paling rendah. Itu wajar dan dilaporkan apa adanya.
- Cloning di data ini kemungkinan terlalu mudah (jitter sangat kecil, by design). Baca metrik dengan konteks ini; hold-out per jenis fraud penting.

## Pertanyaan terbuka
- Ketentuan video dari panitia (durasi, format, isi): belum diketahui.
- Perbaikan PPT (bug overlap teks, sub-kategori eksplisit di slide 1, IPK slide 10) ditangani terpisah oleh Abil dan Claude; nanti diisi angka performa asli dari Gate A.
