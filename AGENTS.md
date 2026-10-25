# AGENTS.md — KlaimGuard AI (Healthkathon 2026)

Kamu adalah agent pembangun untuk proyek **KlaimGuard AI**, prototipe sistem prioritas audit klaim BPJS Kesehatan untuk kompetisi Healthkathon 2026. Pemilik proyek: **Abil** (solo). Proposal sudah lolos seleksi; kita sekarang di fase **build**. Deadline pengumpulan **1 November 2026**, target submit **31 Oktober**.

## Mulai dari sini (urutan wajib)
1. Baca `STATUS.md`: tahu apa yang sudah selesai dan tahap berikutnya.
2. Baca `docs/00_KONTEKS_DAN_KONTRAK.md` sebelum menyentuh kode apa pun. Isinya aturan, struktur repo, dan kontrak data ML → dashboard.
3. Kerjakan tahap sesuai dokumen prompt, berurutan:
   - `docs/01_PROMPT_ML_PIPELINE.md`
   - `docs/02_PROMPT_DASHBOARD.md`
   - `docs/03_PROMPT_DEPLOY_VERCEL_QA.md`
4. Format laporan dan Definition of Done: `docs/04_CHECKPOINT_DAN_DOD.md`.

## Apa yang dibangun (ringkas)
- **ML (Python, folder `ml/`)**: data klaim sintetis → fitur → Isolation Forest (unsupervised) + XGBoost (supervised) hybrid → skor risiko out-of-fold → SHAP per klaim → ekspor JSON.
- **Dashboard (folder `web/`)**: Vite + React + TypeScript + Tailwind, statis, membaca JSON dari `web/public/data/`. Tanpa backend. Di-deploy ke **Vercel** (Root Directory = `web`).
- Pola fraud yang dicakup (pakai **label resmi persis** ini di UI dan JSON):
  `Phantom billing (klaim palsu)`, `Repeat billing (klaim berulang)`, `Manipulasi diagnosis dan/atau tindakan (upcoding)`, `Services unbundling / fragmentation`, `Inflated bills (penggelembungan tagihan)`, `Cloning (penjiplakan klaim)`.
- Arsitektur inti (feedback reviewer, jangan diubah): hybrid Isolation Forest + XGBoost dengan fitur rasio biaya terhadap median faskes sejenis, plus SHAP per flag.

## Aturan non-negotiable
1. Semua data **sintetis**. Jangan pernah memakai atau mencari data peserta JKN riil. Setiap halaman UI dan README harus menyatakan data sintetis; angka performa bukan klaim performa dunia nyata.
2. `fraud_label` dan `fraud_type` **bukan fitur**. Kolom ID mentah (`claim_id`, `patient_id`, `faskes_id`) juga bukan fitur.
3. Jangan menyetel hyperparameter atau threshold dengan melihat data test. Laporkan hasil jujur, termasuk yang jelek.
4. Skor untuk dashboard = **out-of-fold** (5-fold), bukan prediksi pada data latih.
5. Seed acak selalu `42`.
6. Teks UI **Bahasa Indonesia**. Kode dan komentar teknis boleh Inggris.
7. Skor = rekomendasi prioritas pemeriksaan, bukan tuduhan. Pakai frasa "berpotensi" dan "perlu diperiksa". Keputusan akhir selalu di auditor manusia.
8. Dataset di `ml/data/` adalah sumber kebenaran. Jangan mengubah `generate_claims.py` atau meregenerasi data tanpa mencatat alasannya di `STATUS.md` (jika diregenerasi, seed tetap 42).
9. Jika hasil terlalu bagus (mis. PR-AUC hybrid > 0,99), anggap itu tanda kebocoran dan audit dulu sebelum melapor.

## Gate (berhenti dan tunggu konfirmasi Abil)
- **Gate A**, setelah Prompt 1 selesai: lapor memakai format di `docs/04_CHECKPOINT_DAN_DOD.md`, lalu berhenti.
- **Gate C**, sebelum deploy produksi ke Vercel: tunjukkan hasil QA lokal, lalu minta konfirmasi.
- Di luar dua gate itu, lanjut sendiri. Untuk ambiguitas kecil, ambil keputusan yang masuk akal dan catat di `STATUS.md`. Bertanya hanya jika sesuatu benar-benar menghalangi.

## Gaya kerja dengan Abil
- Bahasa Indonesia santai, ringkas, jujur.
- Abil ingin **memahami tiap komponen**, bukan hanya menerima hasil jadi. Setiap komponen utama (fitur, model, alur data, halaman dashboard) dijelaskan singkat: apa fungsinya dan kenapa dipilih.
- Jalankan kode dan **tampilkan hasil nyata** sebelum melanjutkan. Jangan mengklaim sesuatu berhasil tanpa menjalankannya.
- Setelah tiap tahap: centang `STATUS.md`, catat keputusan dan temuan, lalu commit git dengan pesan jelas (`git init` jika belum ada repo).

## Lingkungan: Windows + PowerShell
- Folder kerja mengandung spasi (`BPJS Healtkathon`): **selalu kutip path**.
- Shell default PowerShell. Jangan pakai sintaks bash (`rm -rf`, `export`, `&&` bisa gagal di PowerShell 5.1). Pisahkan perintah atau pakai `;`.
- Python virtual env:
  ```powershell
  cd ml
  python -m venv .venv
  .\.venv\Scripts\Activate.ps1      # jika diblokir: Set-ExecutionPolicy -Scope Process Bypass
  pip install -r requirements.txt
  ```
- Jalankan Python dengan `$env:PYTHONUTF8 = "1"`. **Jangan mencetak emoji atau karakter khusus** ke console (rawan error cp1252). Buka/tulis file dengan `encoding="utf-8"`.
- Gunakan `pathlib.Path`, bukan path string dengan backslash.
- Node: gunakan `npm` (Node 20+). Dashboard: `cd web; npm install; npm run dev`.
- Setelah instalasi paket Python berhasil, pin versi aktual ke `requirements.txt` (`pip freeze` untuk paket yang dipakai).

## Struktur repo
```
BPJS Healtkathon/
├─ AGENTS.md            # file ini
├─ STATUS.md            # progres + keputusan (selalu perbarui)
├─ README.md
├─ docs/                # prompt, kontrak data, format laporan, konten proposal
├─ ml/
│  ├─ data/             # claims_synthetic.csv, faskes.csv (input, sudah ada)
│  ├─ src/              # generate_claims.py (ada); features.py, train.py, evaluate.py, export.py (buat)
│  ├─ artifacts/        # model & metrik (tidak di-deploy)
│  ├─ run_all.py        # satu perintah menjalankan semuanya (buat)
│  └─ requirements.txt
└─ web/                 # dashboard (di-deploy ke Vercel)
   └─ public/data/      # JSON hasil ekspor (di-commit)
```

## Referensi tambahan
- `docs/PROPOSAL1_KONTEN.md`: isi proposal yang sudah lolos (masalah, solusi, arsitektur, dampak, risiko). Gunakan untuk menjaga konsistensi narasi UI (halaman Tata Kelola dan Evaluasi).
- `docs/FORM_ISIAN_PROPOSAL1.md`: teks form pendaftaran dan sub-kategori resmi.
