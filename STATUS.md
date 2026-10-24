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
- [x] `features.py` + sanity check fitur — definisi terarah: 13/13 lolos, 253 overlap (134 phantom/92 normal/27 lain), enrichment 69,778x; tujuh tes lolos
- [x] Isolation Forest (`if_score`)
- [x] XGBoost 5-fold OOF: `if_only`, `xgb_only`, `hybrid`
- [x] Evaluasi + eksperimen hold-out per jenis fraud
- [x] SHAP + teks alasan + aturan pola dugaan
- [x] Ekspor JSON ke `web/public/data/` + validasi
- [ ] `run_all.py`, `requirements.txt` (pin), `ml/README.md`
- [ ] **GATE A: lapor ke Abil dan tunggu konfirmasi**

Catatan Prompt 1 (24 Oktober 2026): preflight berhasil, Python 3.12.6; venv `ml/.venv`; NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, XGBoost 3.4.1, SHAP 0.54.1, PyArrow 26.0.0. Versi terpasang dipin di `ml/requirements.txt`. Perubahan dashboard dilarang selain lima JSON ekspor di `web/public/data/`. Training hanya dilanjutkan jika sanity check fitur tidak meleset lebih dari 20%; dataset dan generator tidak diregenerasi atau diubah.

Checkpoint fitur: 62.711 klaim -> 27 fitur, seluruhnya berhingga; lima tes lolos termasuk pengubahan/penghapusan label tidak mengubah fitur. Durasi tahap fitur 1,236 detik. Sanity `inpatient_overlap`: phantom 134/359 = 37,326%, sedangkan dokumen mengharapkan mayoritas (>50%); deviasi dari batas 50% = 25,35%, di luar toleransi. Klaim overlap juga mencakup 183 normal dan 42 jenis lain. Implementasi menandai kedua klaim dalam pasangan rawat inap lintas faskes yang tumpang tindih, tanpa memilih berdasarkan label. **Berhenti sebelum training sesuai instruksi Abil; Gate A belum tercapai.** Tidak ada model/OOF/hold-out/SHAP/ekspor atau `run_all.py` yang dijalankan/dibuat. `web/` tetap tidak berubah. Laporan: `ml/reports/FEATURE_SANITY.md` dan `ml/reports/feature_sanity.json`; cara reproduksi: `ml/README.md`. Batas absolut 1 poin persentase dipakai untuk ekspektasi sekitar 0% karena deviasi relatif terhadap nol tidak terdefinisi. Hash kedua CSV dan generator sama sebelum/sesudah tahap fitur.

Revisi disetujui Abil dan Claude: ekspektasi lama pada overlap simetris dinyatakan salah dan hasil awal diverifikasi independen. Fitur diganti menjadi terarah: tandai rawat inap yang masuk lebih belakangan; tanggal masuk sama menandai keduanya; interval setengah terbuka dan hanya lintas faskes. Sanity terakhir mensyaratkan proporsi phantom >50% sekaligus enrichment >=10x. Ekspektasi jumlah: 253 total / 134 phantom / 92 normal / 27 lain. Definisi ini dipilih **setelah membandingkan dua definisi pada data penuh**, sehingga merupakan keputusan desain berbasis data dan membatasi independensi evaluasi. Dokumen Prompt 1 dan unit test diperbarui; dataset/generator tetap tidak diubah.

Training awal selesai: 27,976 detik; IF 300 tree pada 23 fitur numerik setelah RobustScaler, tanpa label. Supervised OOF lima fold distratifikasi `fraud_type`; early stopping memakai split validasi 20% di dalam train, kemudian refit seluruh outer train dengan jumlah tree terpilih. Fold uji tidak dipakai fit/early stopping. PR-AUC/AP: IF 0,258685; XGBoost 0,804339; hybrid 0,799798. Recall@5%: 32,0761% / 77,6940% / 77,0115%. Hybrid sedikit lebih rendah; parameter tidak disetel berdasarkan hasil ini. Hold-out enam jenis sedang dijalankan. IF dan fitur peer/history mengikuti seluruh batch tanpa label sesuai brief, sehingga evaluasi bersifat transduktif; bukan validasi prospektif independen.

Evaluasi/hold-out awal selesai dalam 157,330 detik (enam jenis, lima fold per jenis; T dihapus sebelum inner split dan refit supervised). Hybrid lebih baik dari XGBoost pada hold-out repeat (40,336% vs 16,597%) dan unbundling (17,079% vs 4,950%); lebih rendah pada upcoding dan cloning. Tidak ada klaim hybrid unggul secara umum. SHAP seluruh 62.711 klaim memakai model fold yang menghasilkan prediksi masing-masing; rekonstruksi probabilitas OOF maksimal 6,18e-7. Audit penuh: label/claim_id dihapus atau diganti -> matriks fitur identik; tidak ada label/ID mentah pada 10 model tersimpan; pemicu performa terlalu bagus tidak aktif. Lima JSON aktual tervalidasi: 3.000 klaim, 120 faskes, 2.803.310 byte; hanya lima JSON dalam `web/public/data/` diubah. Sepuluh unit test lolos. `run_all.py` tersedia dan akan dijalankan dari CSV ke direktori artefak baru untuk pembandingan reproduksibilitas.

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
