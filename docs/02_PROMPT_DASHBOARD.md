# Prompt 2 — Dashboard

Prasyarat: baca `docs/00_KONTEKS_DAN_KONTRAK.md`. Boleh dimulai dengan data contoh, lalu disambungkan ke data asli dari Prompt 1.


**Peran:** kamu adalah frontend engineer dengan selera desain kuat. Bangun dashboard **KlaimGuard AI** di folder `web/`.

**Stack:** Vite + React + TypeScript + Tailwind CSS. Chart: Recharts (atau SVG manual jika lebih ringan). Tidak ada backend: data dibaca dari `public/data/*.json` lewat `fetch`. Routing memakai **hash router** agar aman di Vercel tanpa rewrite. Target: bundle awal ringan (halaman Evaluasi dan Faskes di-lazy-load), tabel di-virtualisasi, Lighthouse performance ≥ 90 pada desktop.

**Mulai dengan data contoh** yang mengikuti kontrak (buat skrip kecil untuk membangkitkannya, ~300 klaim, 12 faskes). Ganti dengan data asli dari Prompt 1 tanpa mengubah kode UI.

### Arah visual
Tema gelap, serius tapi hangat, selaras dengan deck proposal: latar navy (≈ `#0B1F2B`), permukaan kartu sedikit lebih terang, aksen teal (≈ `#2FD3C6`), amber (≈ `#F2A65A`) untuk peringatan menengah, coral (≈ `#E05A4F`) untuk risiko tinggi, teks krem (≈ `#F4EFE6`). Tipografi sans modern dari Google Fonts (mis. Plus Jakarta Sans atau Inter), angka memakai tabular figures. Hindari tampilan "template dashboard generik": beri hierarki jelas, ruang napas, dan satu elemen khas (mis. skor risiko sebagai cincin/gauge kecil di tiap baris). Jangan menambahkan garis aksen dekoratif di bawah judul atau di tepi kartu. Pastikan kontras teks memenuhi WCAG AA dan fokus keyboard terlihat. Responsif: nyaman di laptop dan terbaca di ponsel.

### Halaman
1. **Ringkasan** (`#/`): kartu KPI (klaim dinilai, klaim risiko tinggi, faskes berisiko tinggi, estimasi potensi kelebihan bayar, selalu berlabel "estimasi"); histogram distribusi skor; komposisi pola dugaan; kurva lift "Memeriksa X% klaim teratas menangkap Y% kasus, dibanding sampling acak". Banner tipis: "Data sintetis • Skor adalah rekomendasi prioritas".
2. **Antrean Audit** (`#/antrean`): inti produk. Tabel klaim dengan kolom skor (cincin kecil + angka), tier, faskes, diagnosis, tanggal, biaya, pola dugaan (chip). Filter: tier, pola, kelas faskes, tipe layanan, rentang tanggal; pencarian claim_id/faskes; urut kolom. Klik baris membuka **panel detail**: skor hybrid dan skor Isolation Forest, 3 alasan (bar kontribusi SHAP berarah naik/turun), perbandingan biaya klaim vs median peer, pola dugaan, dan ringkasan klaim. Di panel ada tombol keputusan auditor: **Perlu diperiksa / Wajar / Eskalasi** + kolom catatan. Simpan di `localStorage` (bungkus try/catch, tampilkan benar saat storage kosong). Tombol ekspor keputusan ke CSV. Teks penegas: "Keputusan akhir ada pada auditor."
3. **Faskes** (`#/faskes`): ranking faskes menurut risiko (tabel + bar), detail faskes: komposisi pola, jumlah klaim tinggi, estimasi kelebihan bayar, daftar klaim teratas faskes itu.
4. **Evaluasi Model** (`#/evaluasi`): ringkasan metrik dari `model_report.json`: PR-AUC tiga varian, recall pada anggaran 2/5/10%, kurva lift, recall per jenis fraud, dan **tabel eksperimen hold-out** dengan penjelasan satu kalimat "Apa yang dibuktikan hybrid". Diagram alur sederhana Input → Fitur → Isolation Forest + XGBoost → SHAP → Auditor. Sakelar **Mode Evaluasi (data sintetis)** yang menampilkan kolom `eval` (label sebenarnya) pada antrean dan matriks konfusi sederhana. Wajib ada kotak "Batasan" yang jujur: data sintetis, pola fraud disuntikkan, performa di data riil harus divalidasi, risiko false positive pada faskes kasus kompleks.
5. **Tata Kelola** (`#/tata-kelola`): ringkas dan jelas: perlindungan data (sintetis, patient_ref di-hash, rencana on-premise untuk produksi), bias dan batasan, peran manusia, mitigasi risiko.

### Perilaku & kualitas
- State loading (skeleton), error (pesan ramah jika JSON gagal dimuat), dan empty state.
- Semua angka diformat lokal Indonesia (`id-ID`), uang `Rp` dengan pemisah ribuan, ringkas (juta/miliar) pada kartu.
- Judul halaman dan `<title>` per rute; favicon emoji perisai.
- Semua teks UI Bahasa Indonesia.

### Deliverable Prompt 2
`web/` yang berjalan dengan `npm run dev` dan `npm run build`, README singkat, screenshot tiap halaman (desktop dan mobile) di `web/screenshots/` untuk bahan PPT dan video.
