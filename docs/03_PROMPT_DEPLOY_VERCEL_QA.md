# Prompt 3 — Deploy ke Vercel & QA

Gate C sudah disetujui Abil setelah QA lokal dan persiapan repo. Agent berhenti setelah commit; **push dan deploy dijalankan Abil sendiri**, sesuai instruksi terakhir. Panduan aktual: [DEPLOY.md](../DEPLOY.md). Daftar berikut adalah checklist publikasi.


1. Pastikan `web/public/data/*.json` sudah di-commit (Vercel tidak menjalankan Python). Total ukuran data ≤ 6 MB.
2. Di Vercel: Import repo, set **Root Directory = `web`**, Framework Preset = Vite, Build Command `npm run build`, Output Directory `dist`. Tanpa environment variable.
3. Jalankan `npm run build` lokal, pastikan tanpa error TypeScript atau warning besar.
4. QA di URL preview dan produksi: setiap rute terbuka dari tautan langsung, tabel dengan 3.000 baris tetap lancar, filter dan panel detail bekerja, ekspor CSV berfungsi, tidak ada error di console, tampilan mobile (lebar 390 px) tidak terpotong.
5. Cek bahwa tidak ada data riil, ID asli pasien, atau kunci rahasia di repo.
6. Hasilkan: URL produksi, daftar hasil QA (centang), dan 6–8 screenshot terbaik.
