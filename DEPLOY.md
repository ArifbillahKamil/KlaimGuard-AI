# Publikasi KlaimGuard AI oleh Abil

**Semua data sintetis, bukan data peserta JKN. Metrik bukan klaim performa dunia nyata.** Dashboard statis; tanpa Python, backend, token API atau environment variable di Vercel. Agent berhenti setelah commit lokal; push dan deploy dijalankan Abil.

## 1. Buat repo GitHub kosong

Di GitHub pilih **New repository**, beri nama misalnya `klaimguard-ai`, lalu pilih visibilitas. Jangan tambahkan README, `.gitignore` atau license otomatis karena repo lokal sudah memiliki commit. Salin URL HTTPS tanpa token.

Ganti placeholder pada perintah berikut, lalu jalankan dari root proyek:

```powershell
cd "<folder proyek>"
git status
git branch -M main
git remote -v
git remote add origin https://github.com/<username>/klaimguard-ai.git
git push -u origin main
```

Jika `origin` sudah ada, periksa URL dahulu; bila perlu gunakan `git remote set-url origin https://github.com/<username>/klaimguard-ai.git`. Autentikasi melalui browser/Git Credential Manager; jangan tulis token dalam URL atau file repo. Pastikan lima JSON di `web/public/data/` ikut terunggah.

## 2. Import di Vercel

Pilih **Add New → Project**, hubungkan GitHub dan import repo. Atur sebelum menekan Deploy:

| Pengaturan | Nilai |
|---|---|
| Root Directory | `web` |
| Framework Preset | `Vite` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 20 atau lebih baru; disarankan 24.x sesuai QA lokal |
| Environment Variables | Kosong; tidak diperlukan |

Jangan menjalankan pipeline ML pada build Vercel. JSON yang sudah di-commit disalin Vite ke `dist/data/`. Hash router tidak memerlukan rewrite SPA khusus. Periksa konfigurasi lalu pilih **Deploy**. Setelah selesai, catat URL produksi di `STATUS.md`.

## 3. QA URL produksi

Buka tiap tautan langsung pada host deployment:

```text
/#/
/#/antrean
/#/faskes
/#/evaluasi
/#/tata-kelola
```

Ringkasan harus menampilkan tiga baris simulasi. Panel Network tidak meminta `claims_flagged.json` sampai Antrean dibuka. Antrean menampilkan 3.000 dari 62.711 klaim; coba filter, detail SHAP, keputusan dan CSV. Mode Evaluasi nonaktif setelah reload. Periksa tampilan 390 px, keyboard, console dan lima JSON di `/data/`.

QA otomatis pada deployment, dari `web/`:

```powershell
$env:QA_URL = "https://<alamat deployment>"
npm run qa
Remove-Item Env:QA_URL
```

QA melakukan negative test jaringan dan menyimpan screenshot lokal; keputusan uji hanya ada pada browser pengujian. Lighthouse lokal belum membuktikan performa hosting produksi. Push berikutnya ke branch produksi dapat memicu deployment otomatis; periksa status di Vercel.

## 4. Jika build gagal

Periksa Root Directory `web`, Node 24.x, lockfile, Build Command dan Output Directory. Jalankan `npm ci` lalu `npm run build` dari `web/`. Jangan memasukkan `.venv`, `node_modules`, `ml/artifacts`, `web/dist`, `.env*` atau token untuk mengatasi masalah build. JSON harus berasal dari ekspor sintetis yang disetujui.
