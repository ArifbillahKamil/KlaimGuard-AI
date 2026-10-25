# Proposal 1: KlaimGuard AI — Deteksi Anomali Billing Klaim Faskes

**Kategori:** Efisiensi Risiko Fasilitas Kesehatan
**Sub-kategori:** Phantom & Repeat Billing, Upcoding & Unbundling, Inflated Bills & Cloning

---

## Bagian 1: Identitas & Positioning

**Nama Solusi:** KlaimGuard AI

**Tagline:** Mengubah audit klaim JKN dari menebak menjadi mendeteksi — verifikasi berbasis risiko untuk melindungi dana amanat peserta.

**Kategori & Sub-kategori:** Efisiensi Risiko Fasilitas Kesehatan — fokus pada tiga pola billing yang saling terkait: Phantom & Repeat Billing, Upcoding & Unbundling, dan Inflated Bills & Cloning.

**Tim:** Solo — Muhammad Arifbillah Kamil ("Abil"), merangkap peran data engineering, pengembangan model, dan pengembangan dashboard (lihat detail di Bagian 9).

**Positioning:** KlaimGuard AI unik karena menggabungkan deteksi anomali unsupervised, model risiko supervised, dan lapisan explainability (SHAP) dalam satu sistem terpadu untuk tiga pola billing fraud sekaligus — bukan tools terpisah yang mengharuskan auditor berpindah-pindah sistem untuk tiap jenis fraud.

---

## Bagian 2: Masalah & Urgensi

### Spesifisitas Masalah
Fokus pada pola-pola anomali billing klaim Fasilitas Kesehatan Rujukan Tingkat Lanjut (FKRTL) — phantom & repeat billing, upcoding & unbundling, serta inflated bills & cloning — tiga pola yang saling berkaitan karena sama-sama termanifestasi dalam ketidakwajaran struktur biaya/kode klaim.

### Dukungan Data
- Kajian Komisi Pemberantasan Korupsi (KPK) mencatat bahwa hingga Juni 2015, terdeteksi 175.774 klaim FKRTL yang berpotensi fraud dengan nilai sekitar Rp440 miliar — dan ini baru dari kelompok provider layanan kesehatan, belum termasuk aktor lain seperti staf BPJS, peserta, atau pemasok obat/alkes. (Sumber: KPK, 2015, dikutip di Jurnal Integritas KPK dan berbagai kajian akademik terkait)
- Hingga pertengahan 2016, jumlah klaim bermasalah yang terdeteksi KPK meningkat menjadi lebih dari 1 juta klaim. (Sumber: KPK, dikutip Kontan, 2019)
- Dari studi akademik yang menganalisis data KPK tersebut, upcoding tercatat sebagai pola fraud provider paling dominan dengan total 528.285 kasus (sekitar 49,77% dari total kasus fraud FKRTL terdeteksi), disusul pola service unbundling/fragmentation dengan lebih dari 259.649 kasus hanya di rawat jalan tingkat lanjut. (Sumber: tesis analisis manajemen penanggulangan fraud JKN, Universitas Sriwijaya)
- Skala total pembiayaan JKN terus tumbuh — total biaya pelayanan kesehatan program JKN pada 2023 mencapai Rp158 triliun. (Sumber: BPJS Kesehatan, dipaparkan dalam forum PK-JKN bersama KPK-Kemenkes-BPKP, 2024)

### Dampak & Urgensi
Skala pembiayaan JKN yang terus tumbuh berarti bahkan persentase kecil fraud berpotensi menimbulkan kerugian bernilai triliunan rupiah per tahun — dana yang seharusnya dipakai untuk pelayanan peserta lain yang membutuhkan. Sistem pengawasan yang masih banyak mengandalkan sampling manual membuat potensi fraud yang terdeteksi kemungkinan besar hanya "puncak gunung es". Framing masalah ini adalah soal efisiensi & integritas sistem, bukan tuduhan — upcoding/unbundling seringkali juga terjadi karena kelemahan sistem verifikasi yang belum otomatis, sehingga solusi deteksi dini justru melindungi faskes yang jujur dari kecurigaan tak berdasar, sekaligus mempersempit ruang bagi oknum.

### Cara Bercerita (saran untuk slide)
Visualisasikan tren jumlah klaim bermasalah dari tahun ke tahun (2015 → 2016 → sekarang) dan breakdown persentase jenis fraud (upcoding vs unbundling vs lainnya) sebagai grafik, agar juri langsung menangkap skala masalahnya.

---

## Bagian 3: Solusi & Keunggulan

### Ide Solusi
KlaimGuard AI adalah sistem deteksi anomali klaim berbasis AI yang mengubah proses audit BPJS Kesehatan dari sampling acak menjadi *risk-based auditing*. Sistem menganalisis pola billing setiap klaim yang masuk dan memberikan skor risiko fraud, sehingga auditor bisa memprioritaskan klaim paling mencurigakan alih-alih memeriksa secara acak/manual.

### Bagaimana Solusi Menjawab Masalah
- **Masalah:** Audit manual/sampling acak tidak efisien menemukan pola fraud yang tersembunyi di antara jutaan klaim (lihat skala masalah di Bagian 2).
- **Jawaban:** Kombinasi model unsupervised + supervised (lihat Bagian 4) otomatis menyaring dan memprioritaskan klaim berisiko tinggi, memfokuskan waktu auditor ke klaim yang benar-benar perlu diperiksa.

### Keunggulan & Pembeda
1. **Kombinasi unsupervised + supervised** — mengatasi keterbatasan tidak adanya data fraud berlabel riil dalam jumlah besar, yang biasanya jadi kendala sistem deteksi fraud berbasis supervised learning murni.
2. **Explainability (SHAP)** — auditor tidak hanya menerima skor, tapi juga alasan konkret di balik setiap flag, mempercepat verifikasi manual dan membangun kepercayaan terhadap rekomendasi sistem.
3. **Integrasi 3 sub-pola sekaligus** (phantom billing, upcoding/unbundling, inflated bills) dalam satu sistem, bukan tools terpisah untuk tiap jenis fraud.

### Kenapa Pendekatan Ini Paling Tepat untuk BPJS/JKN
- Skala klaim JKN sangat besar (jutaan klaim/bulan) — skor risiko otomatis jauh lebih scalable dibanding audit manual murni.
- Keterbatasan data fraud berlabel riil di konteks JKN membuat pendekatan hybrid lebih realistis dibanding supervised learning murni yang butuh banyak contoh fraud terkonfirmasi.
- Human-in-the-loop menjaga prinsip bahwa keputusan akhir (pencabutan klaim, sanksi faskes) tetap di tangan manusia — selaras dengan tata kelola AI yang dituntut di sektor kesehatan.

---

## Bagian 4: Pendekatan Teknis & Data

### 1. Input Data
Data klaim terstruktur yang dibutuhkan:
- Kode diagnosis (ICD-10) dan kode tindakan/prosedur (ICD-9-CM)
- Jenis pelayanan (rawat inap/jalan), tanggal & durasi pelayanan
- Biaya yang diklaim per komponen (obat, tindakan, kamar, dll)
- Identitas faskes pengaju klaim dan riwayat klaim faskes tersebut
- Riwayat klaim pasien (untuk deteksi pola repeat billing)

**Sumber data:** Karena data klaim JKN riil tidak boleh dipakai tanpa izin resmi, digunakan data publik dengan struktur sejenis (dataset fraud klaim asuransi kesehatan, mis. Medicare/CMS) sebagai basis pola, dikombinasikan dengan **data sintetis** yang meniru struktur klaim INA-CBG dan disisipi (injected) pola fraud secara terkontrol untuk keperluan demo dan validasi model.

### 2. Proses & Model
Kombinasi dua pendekatan agar saling melengkapi:

- **Unsupervised anomaly detection** (Isolation Forest / Autoencoder) — menangkap pola klaim yang menyimpang tanpa memerlukan data berlabel fraud, karena label fraud riil memang tidak tersedia/tidak boleh dipakai.
- **Supervised risk scoring** (XGBoost) — dilatih dari fitur hasil rekayasa seperti:
  - Rasio biaya klaim terhadap median biaya faskes sejenis untuk tindakan yang sama
  - Kesesuaian antara kode diagnosis dan kode tindakan (deteksi upcoding/unbundling)
  - Tingkat kemiripan antar klaim dari faskes yang sama (deteksi cloning)
  - Frekuensi klaim berulang untuk kasus yang sudah selesai dibayar (deteksi repeat billing)
- **Explainability layer (SHAP)** — setiap skor risiko disertai alasan spesifik kenapa suatu klaim di-flag, bukan sekadar angka tanpa konteks.

**Kenapa pendekatan ini dipilih:** kombinasi unsupervised + supervised mengatasi keterbatasan tidak adanya data fraud berlabel riil, sementara SHAP menjawab kebutuhan transparansi yang dinilai juri di kriteria Keamanan & Tata Kelola.

### 3. Output & Keputusan
- **Output:** Dashboard skor risiko per klaim dan per faskes, dengan penjelasan spesifik (mis. "klaim ini di-flag karena biaya 3x lipat dari median faskes untuk tindakan sejenis").
- **Pengguna:** Tim verifikator/auditor internal BPJS Kesehatan.
- **Cara pakai:** Sistem mengubah proses audit dari sampling acak menjadi *risk-based* — auditor memprioritaskan klaim dengan skor risiko tertinggi untuk diperiksa manual. Keputusan akhir tetap di tangan auditor manusia (human-in-the-loop), sistem hanya memberi rekomendasi prioritas.

### 4. Asumsi & Keterbatasan
- Model dilatih dan divalidasi menggunakan data sintetis/publik, bukan data JKN riil — performa di produksi nyata perlu divalidasi ulang dengan data riil BPJS di bawah izin resmi.
- Pola fraud yang di-inject ke data sintetis dirancang berdasarkan definisi sub-kategori yang tersedia di panduan Healthkathon, sehingga mungkin belum mencakup varian fraud yang belum teridentifikasi.
- Model rentan terhadap *concept drift* — pola fraud bisa berubah seiring waktu, sehingga perlu retraining berkala.

### 5. Keamanan & Privasi Data
- Data sintetis untuk demo tidak memuat identitas riil peserta JKN.
- Untuk implementasi produksi, arsitektur diusulkan tetap memproses data di infrastruktur internal BPJS (bukan dikirim ke API eksternal), dengan akses berbasis role untuk auditor.
- Skor risiko bersifat rekomendasi, bukan keputusan otomatis — mencegah risiko keputusan diskriminatif tanpa tinjauan manusia.

---

## Bagian 5: Tingkat Kematangan, Prototype & Pengalaman

> ⚠️ **Catatan buat kamu:** Bagian ini aku isi dengan asumsi posisi solusi saat ini masih di tahap **Ide dengan rancangan teknis matang, menuju Mockup** — karena sejauh yang kita bahas belum ada kode yang dijalankan. Panduan menekankan kejujuran di bagian ini, jadi **tolong dikonfirmasi/diedit** sesuai progres codingmu yang sebenarnya sebelum submit.

**Posisi saat ini:** Ide/Konsep dengan rancangan arsitektur teknis yang sudah detail (lihat Bagian 4) — algoritma, fitur, dan alur input-proses-output sudah dirancang, belum ada implementasi kode yang berjalan.

**Yang sudah berfungsi:** Belum ada — rancangan teknis dan skema data sudah matang sebagai dasar pengembangan.

**Rencana pembuktian sebelum submission:** Membangun prototype minimal (notebook/skrip) yang menjalankan pipeline Isolation Forest + XGBoost pada dataset sintetis, untuk menghasilkan screenshot/demo hasil deteksi sebagai bukti kelayakan teknis di proposal.

---

## Bagian 6: Rencana & Kelayakan

> ⚠️ Timeline di bawah ini contoh generik per-minggu — **sesuaikan dengan deadline submission proposal yang sebenarnya** (cek ulang di platform, karena PDF panduan tidak mencantumkan tanggal spesifik).

| Fase | Fokus | Deliverable |
|---|---|---|
| 1 | Finalisasi desain sistem, susun & validasi dataset sintetis | Skema data + dataset sintetis siap pakai |
| 2 | Bangun model unsupervised (Isolation Forest/Autoencoder) + feature engineering | Model anomaly detection versi awal |
| 3 | Bangun model supervised (XGBoost) + integrasi SHAP | Model risk scoring + explainability berfungsi |
| 4 | Bangun dashboard (backend + frontend) untuk visualisasi skor risiko | Dashboard interaktif versi demo |
| 5 | Testing, validasi, penyusunan materi presentasi/demo | Proposal + demo siap submit |

**Sumber daya dibutuhkan:** Waktu individu (dikerjakan solo sambil kuliah), compute lokal (CPU cukup untuk model tabular ini, tidak perlu GPU khusus).

**Rencana lanjutan jika lolos tahap berikutnya:** Validasi model dengan data riil BPJS di bawah izin resmi/lingkungan sandbox, pengembangan integrasi API dengan sistem klaim BPJS eksisting, perluasan cakupan ke sub-kategori fraud lain di kategori Fasilitas Kesehatan.

---

## Bagian 7: Dampak & Nilai

### Perubahan yang Dihasilkan
Dari audit reaktif berbasis sampling acak menjadi audit proaktif berbasis risiko — auditor bisa fokus memeriksa persentase klaim dengan skor risiko tertinggi, alih-alih memeriksa subset acak yang belum tentu mengandung kasus fraud.

### Cara Mengukur Dampak (proyeksi, transparan sebagai estimasi)
- Potensi cakupan deteksi lebih tinggi dibanding sampling manual acak, karena sistem menilai seluruh klaim yang masuk, bukan subset acak.
- Estimasi reduksi waktu audit per klaim mencurigakan (perlu diuji dengan data riil sebelum diklaim sebagai angka pasti).
- Baseline skala masalah dari Bagian 2 (potensi fraud triliunan rupiah, jutaan klaim bermasalah) menjadi acuan besarnya potensi penghematan jika deteksi dini diterapkan sistematis.

### Penerima Manfaat
- **BPJS Kesehatan:** integritas pengelolaan dana klaim terjaga.
- **Peserta JKN:** dana amanat lebih terlindungi untuk pelayanan yang benar-benar dibutuhkan peserta lain.
- **Faskes jujur:** terhindar dari kecurigaan tak berdasar karena proses verifikasi lebih presisi dan transparan (lewat explainability SHAP).

*Catatan kejujuran: angka dampak kuantitatif di atas masih bersifat estimasi/proyeksi berdasarkan data skala masalah publik, dan perlu divalidasi lebih lanjut lewat uji coba dengan data riil.*

---

## Bagian 8: Risiko, Privasi & Etika

### Perlindungan Data Pribadi
Pengembangan dan demo menggunakan data sintetis/publik, bukan data JKN riil, sesuai batasan kompetisi. Kepatuhan terhadap UU PDP diterapkan lewat prinsip minimalisasi data dan anonimisasi. Untuk skenario produksi, diusulkan pemrosesan data tetap dilakukan on-premise di infrastruktur internal BPJS, bukan dikirim ke layanan API eksternal.

### Bias & Keterbatasan AI
Model dilatih dari data sintetis/publik yang mungkin tidak sepenuhnya merepresentasikan pola riil JKN, sehingga berisiko menghasilkan false positive — misalnya menandai faskes dengan kasus kompleks yang secara wajar memang lebih mahal. Risiko ini dimitigasi lewat kalibrasi threshold per spesialisasi/tipe faskes serta review manusia sebelum ada tindak lanjut resmi.

### Peran Manusia dalam Keputusan
Skor risiko dari sistem berfungsi murni sebagai rekomendasi prioritas pemeriksaan — keputusan investigasi lanjutan maupun sanksi terhadap faskes sepenuhnya berada di tangan auditor manusia (human-in-the-loop eksplisit di setiap tahap keputusan).

### Mitigasi Risiko Utama
1. **False positive terhadap faskes dengan kasus kompleks** → mitigasi: kalibrasi threshold per spesialisasi/tipe faskes + review manual sebelum notifikasi resmi ke faskes bersangkutan.
2. **Data drift (pola fraud berubah seiring waktu)** → mitigasi: retraining model berkala dan monitoring performa berkelanjutan.
3. **Risiko kebocoran/penyalahgunaan data jika terintegrasi sistem eksternal di masa depan** → mitigasi: pemrosesan data tetap on-premise, tidak ada data klaim riil yang dikirim ke pihak ketiga tanpa izin resmi.

---

## Bagian 9: Profil & Pengalaman Tim

**Anggota Tim:** Muhammad Arifbillah Kamil ("Abil") — Tim solo, merangkap seluruh peran dari data engineering hingga pengembangan dashboard.

**Latar Belakang & Keahlian:**
- Mahasiswa Informatika, Telkom University (angkatan 2023–2027), IPK 3.67
- AI Engineer dan Full-stack Developer
- Lulusan bootcamp CodingCamp by DBS Foundation × Dicoding
- Pengalaman membangun pipeline machine learning (TensorFlow, PyTorch), RAG pipeline (FAISS), serta fine-tuning LLM (LoRA)
- Pengalaman pengembangan full-stack (Flutter, Laravel, Filament) untuk membangun dashboard dan aplikasi end-to-end

**Kenapa Mampu Mengeksekusi:** Kombinasi kemampuan data science/ML dan pengembangan aplikasi end-to-end memungkinkan seluruh pipeline — dari model deteksi anomali hingga dashboard verifikasi — dikerjakan dan didemokan secara solo.

> 💡 Tambahkan link portofolio/GitHub relevan di slide ini jika ada, untuk memperkuat kredibilitas klaim di atas.

---

*Draft siap dijadikan referensi upload ke AI Agent pembuat PPT, dilengkapi instruksi prompt terpisah.*
