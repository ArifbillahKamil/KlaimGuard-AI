# KlaimGuard AI — Dashboard

Prototipe statis untuk memprioritaskan pemeriksaan klaim. **Seluruh data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata. Keputusan akhir selalu pada auditor manusia.**

Versi ini memakai **300 klaim contoh, 12 faskes, seed 42**. Skor, kontribusi SHAP, PR-AUC, recall, dan hold-out adalah **ilustrasi antarmuka**, bukan hasil pelatihan ML. Penanda ini muncul pada setiap halaman. Dataset dalam `ml/` tidak digunakan atau diubah oleh generator contoh.

## Menjalankan lokal

Node.js 20+ dan npm. Versi dependensi yang terpasang dikunci dalam `package-lock.json`.

Pengukuran Lighthouse memakai alat QA Lighthouse 13.5 yang membutuhkan Node.js >=22.19; pengukuran sesi ini dijalankan dengan Node.js 24.20.0. Aplikasi Vite 6 sendiri tetap mendukung Node 20+. Inter dari Google Fonts disajikan lokal melalui Fontsource; tidak ada permintaan font ke layanan eksternal saat dashboard dibuka.

```powershell
cd "C:\Users\diamo\Documents\VSC\Hackaton\BPJS Healtkathon\web"
npm ci
npm run dev
```

Buka URL lokal yang dicetak Vite. Untuk build produksi lokal:

```powershell
npm run build
npm run preview -- --port 4173
```

Tidak ada backend, akun, API data eksternal, atau deployment. Lima halaman memakai hash router agar dapat dibuka langsung pada hosting statis.

## Komponen utama

| Halaman | Fungsi |
| --- | --- |
| Ringkasan | KPI, distribusi persentil skor, komposisi dugaan, kurva lift, dan klaim prioritas. |
| Antrean Audit | Tabel virtual, tujuh filter, pencarian, pengurutan, panel detail, tiga alasan SHAP, pembandingan median peer, keputusan dan CSV. |
| Faskes | Ranking dari `risk_rank`, rasio klaim tinggi, pola, estimasi selisih biaya, dan klaim teratas per faskes. |
| Evaluasi Model | Perbandingan tiga varian, recall 2/5/10%, lift, recall per pola, hold-out, fitur, alur, dan batasan. |
| Tata Kelola | Data sintetis, pseudonim pasien, bias, peran manusia, mitigasi dan batas rencana produksi. |

Halaman Faskes dan Evaluasi dimuat secara lazy. Grafik memakai SVG agar tidak membutuhkan pustaka chart besar. Antrean memakai TanStack Virtual agar jumlah elemen DOM tetap kecil saat ekspor ML berisi 3.000 klaim.

Mode Evaluasi di halaman Evaluasi membuka kolom label sintetis pada Antrean dan matriks sederhana. Mode normal tidak menampilkan `eval`. Matriks hanya mencakup klaim ekspor yang berlabel, sehingga tidak mewakili seluruh dataset apabila ekspor terpotong. Skor adalah persentil rekomendasi, bukan probabilitas fraud.

Keputusan disimpan pada `localStorage` dengan key `klaimguard:auditor-decisions:v1`. Penyimpanan kosong, data rusak, dan akses yang ditolak ditangani. Jika penyimpanan gagal, keputusan tetap tersedia selama sesi dan bisa diekspor. CSV memakai UTF-8 BOM, quote escaping, dan penetralan formula pada awal sel. Penyimpanan ini bukan audit trail terpusat.

## Kontrak JSON dan penggantian data contoh

UI melakukan `fetch` terhadap lima berkas di `public/data/`:

- `summary.json`
- `claims_flagged.json`
- `faskes_risk.json`
- `model_report.json`
- `feature_dictionary.json`

Struktur mengikuti `../docs/00_KONTEKS_DAN_KONTRAK.md`. `summary.data_source: "sample"` adalah metadata tambahan untuk menampilkan peringatan contoh. Ekspor ML tidak perlu menambahkan properti ini. Ketika semua JSON diganti bersama-sama dengan ekspor Prompt 1, kode UI tidak perlu diubah. Tetap wajib `dataset.synthetic: true`. Jangan menghilangkan penanda contoh dari fixture tanpa mengganti semua skor dan metrik dengan hasil ML yang sebenarnya.

Generator tidak berjalan otomatis saat dev atau build. Untuk membangkitkan ulang contoh:

```powershell
npm run data:sample
```

Perintah itu menolak menimpa `summary.json` yang bukan data contoh. Tidak membaca atau mengubah `ml/`.

## Pemeriksaan browser dan screenshot

Jalankan preview pada port 4173, lalu di terminal lain:

```powershell
npx playwright install chromium
npm run qa
```

Pengukuran Lighthouse desktop (preview port 4173 tetap berjalan):

```powershell
node scripts/performance.mjs
```

QA memeriksa kontrak data, kelima rute, virtualisasi, semua filter, empty/error/loading state, penyimpanan keputusan, CSV, Mode Evaluasi, tautan faskes, serta layar 390 px. Screenshot lima halaman dan panel detail dibuat untuk desktop dan mobile dalam `screenshots/`. Hasil terperinci lokal disimpan ke `qa-results/` (diabaikan Git).

## Batas yang belum selesai

- Integrasi dengan JSON hasil pipeline ML menunggu Prompt 1. Tidak ada klaim pengujian model atau sanity check fitur ML dalam pekerjaan frontend ini.
- Produksi on-premise, akses berbasis peran, audit trail terpusat, dan validasi data riil baru rencana.
- Tidak ada deployment Vercel; Gate C tetap berlaku untuk pekerjaan deploy terpisah.
