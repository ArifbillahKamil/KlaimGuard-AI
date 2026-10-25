# Format Laporan Checkpoint & Definition of Done

Dipakai di Gate A dan setiap laporan tahap.


Agent melapor singkat dengan struktur ini sebelum lanjut:
1. Ringkasan: apa yang selesai, apa yang tidak.
2. Hasil sanity check fitur (tabel angka vs ekspektasi).
3. Tabel metrik: PR-AUC, recall@2/5/10% untuk `if_only`, `xgb_only`, `hybrid`.
4. Recall per jenis fraud (anggaran 5%) dan hasil hold-out.
5. Temuan mengejutkan, kebocoran yang dicurigai, atau keterbatasan.
6. Perintah untuk mereproduksi hasil, dan daftar file yang dihasilkan.
Jangan memoles angka. Jika sesuatu tidak berhasil, katakan apa adanya.

## Definition of Done
- [ ] `python run_all.py` menghasilkan semua JSON dari CSV tanpa intervensi manual
- [ ] Hasil hybrid, xgb_only, if_only dilaporkan jujur beserta eksperimen hold-out
- [ ] Dashboard 5 halaman, Bahasa Indonesia, mode evaluasi, keputusan auditor, ekspor CSV
- [ ] Terdeploy di Vercel dan lolos QA
- [ ] README menjelaskan arsitektur, batasan, dan bahwa data sintetis
- [ ] Screenshot siap untuk PPT dan video demo
