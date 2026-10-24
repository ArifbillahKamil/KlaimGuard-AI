# Checkpoint Prompt 2 — Dashboard contoh

24 Oktober 2026. Semua data sintetis; angka performa ML pada UI adalah ilustrasi, bukan klaim performa dunia nyata.

## 1. Selesai dan belum selesai

Lima halaman berjalan menggunakan Vite + React + TypeScript + Tailwind. Antrean memiliki tabel virtual, pencarian, filter, pengurutan, panel detail dengan alasan SHAP, pembandingan median peer, keputusan auditor, catatan lokal, dan ekspor CSV. Mode Evaluasi menampilkan label sintetis dan matriks sederhana. Halaman Faskes dan Evaluasi dimuat secara lazy. Font Inter disajikan lokal. Kondisi loading, error, retry, empty, serta penyimpanan lokal rusak/ditolak telah diuji.

Belum: integrasi JSON aktual dari Prompt 1 dan deployment. `ml/` tidak diubah. Pada `STATUS.md`, hanya bagian Prompt 2 yang diperbarui. Ini bukan laporan Gate A atau persetujuan Gate C.

## 2. Sanity check data contoh

Ini pemeriksaan kontrak fixture frontend, **bukan sanity check fitur ML**.

| Pemeriksaan | Hasil nyata | Ekspektasi |
| --- | ---: | --- |
| Jumlah klaim | 300 | 300 |
| Jumlah faskes | 12 | 12 |
| Seed generator | 42 | 42 |
| Klaim tier tinggi / menengah / rendah | 9 / 21 / 270 | 3% / 7% / 90% |
| Jumlah histogram | 300 | Sama dengan jumlah klaim |
| Pola resmi | Lolos | Hanya enam label dalam kontrak |
| Referensi pasien | Lolos | `PX-` + 6 karakter hash; tidak menampilkan `patient_id` |
| Urutan skor | Lolos | Menurun |
| Alasan per klaim | 3 | 3; fitur tercantum pada kamus |
| Estimasi selisih biaya | Lolos | `max(0, claim_total - peer_median)` |
| Semua sumber data | Sintetis | `dataset.synthetic = true` |

Generator menolak menimpa JSON yang bukan fixture `data_source: "sample"`. Lima JSON bisa diganti bersama-sama dengan ekspor Prompt 1 tanpa perubahan kode UI.

## 3. Metrik dan QA yang benar-benar dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run build` | Lolos TypeScript dan build produksi |
| `npm run dev` | Berjalan; HTTP 200 untuk lima JSON; Ringkasan, Antrean, panel detail lolos smoke test |
| `npm run qa` | 14 kelompok pemeriksaan lolos; 0 error runtime tak terduga |
| Aksesibilitas otomatis axe | 0 pelanggaran WCAG A/AA pada lima halaman desktop dan mobile, serta panel detail desktop |
| Responsif | Tidak ada overflow halaman pada 390 px; tabel lebar dapat digulir dengan sentuhan dan keyboard |
| Lighthouse desktop, Ringkasan | Performance 100 / Accessibility 100 / Best Practices 100 |
| FCP / LCP / CLS | Sekitar 0,4 dtk / 0,5 dtk / 0 |
| Audit npm | 0 kerentanan pada akhir pembaruan dependensi |
| Screenshot | 12 PNG: lima halaman + detail, masing-masing desktop dan mobile |

Lighthouse diuji lokal dengan 300 klaim contoh, bukan 3.000 klaim ekspor ML. Hasil dapat berubah pada mesin lain, ukuran JSON lengkap, dan hosting produksi. Pengujian otomatis tidak menggantikan pemeriksaan aksesibilitas manual penuh.

Lingkungan eksekusi build/QA: Windows, PowerShell, Node.js v24.20.0, Vite v6.4.5, Playwright Chromium. Node v22.11.0 terbaca di sandbox; pembatasan sandbox menyebabkan `EPERM` pada pembacaan direktori induk sehingga eksekusi memakai izin di luar sandbox. Lighthouse 13.5 membutuhkan Node >=22.19.

## 4. Recall, PR-AUC dan hold-out ML

**Belum ada hasil eksperimen ML aktual dalam pekerjaan agent kedua ini.** PR-AUC tiga varian, recall pada anggaran 2/5/10%, recall per jenis dan tabel hold-out telah diuji sebagai tampilan fixture. Angka contoh tidak membuktikan keunggulan hybrid. Hasil model nyata dan sanity check fitur tetap tanggung jawab Prompt 1 / Gate A.

## 5. Temuan dan batasan

- Pengujian menemukan dan memperbaiki label filter, atribut ARIA baris Faskes, serta fokus keyboard pada tabel horizontal dan navigasi ponsel tertutup.
- Warna cincin mengikuti tier eksplisit agar pembulatan persentil tidak salah memberi warna pada skor yang sama.
- CSV telah diuji untuk koma, tanda kutip, baris baru, UTF-8 BOM, dan awalan formula. Keputusan tetap tersedia selama sesi ketika storage ditolak.
- Matriks evaluasi hanya mencakup klaim ekspor berlabel; tidak diklaim sebagai matriks seluruh dataset saat ekspor dibatasi.
- Pseudonim SHA1 pendek untuk demo bukan jaminan anonimitas produksi. Penyimpanan lokal bukan audit trail terpusat.
- Tidak ada tuning model, regenerasi dataset ML, akses data JKN riil, atau deployment dalam tahap ini.

## 6. Reproduksi dan artefak

```powershell
cd "C:\Users\diamo\Documents\VSC\Hackaton\BPJS Healtkathon\web"
npm ci
npm run build
npm run preview -- --port 4173
```

Di terminal lain dari `web/`:

```powershell
npx playwright install chromium
npm run qa
node scripts/performance.mjs
```

Smoke test mode pengembangan: jalankan `npm run dev -- --port 5173`, lalu `node scripts/smoke-dev.mjs`.

Artefak: `src/`, lima JSON di `public/data/`, `README.md`, 12 PNG dan indeks di `screenshots/`, `qa-report.json`, serta skrip generator/QA/smoke/Lighthouse di `scripts/`. Output pengujian rinci, CSV uji, serta laporan Lighthouse lengkap tersimpan lokal di `qa-results/` dan diabaikan Git.
