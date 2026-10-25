# Isian Form Platform Healthkathon — Proposal 1 (KlaimGuard AI)

Batas karakter: Tujuan 500, Deskripsi 1000, Dampak 500 (Latar Belakang tidak menampilkan batas).

## Sub-kategori (checkbox resmi, kategori Efisiensi Risiko Fasilitas Kesehatan)
- [x] Phantom billing (klaim palsu)
- [x] Repeat billing (klaim berulang)
- [x] Manipulasi diagnosis dan/atau tindakan (upcoding)
- [x] Services unbundling / fragmentation
- [x] Inflated bills (penggelembungan tagihan)
- [x] Cloning (penjiplakan klaim)

## Latar Belakang (580 karakter)
Audit klaim JKN saat ini masih banyak mengandalkan sampling manual, padahal skala klaim terus tumbuh — KPK mencatat 175.774 klaim FKRTL berpotensi fraud senilai ±Rp440 miliar pada 2015, meningkat jadi lebih dari 1 juta klaim bermasalah pada pertengahan 2016. Pola dominan yang teridentifikasi adalah upcoding (528.285 kasus) dan unbundling (259.649 kasus). Dengan total biaya pelayanan JKN mencapai Rp158 triliun pada 2023, bahkan kebocoran 1% saja bernilai triliunan rupiah — audit berbasis sampling acak tidak cukup menjangkau pola fraud yang tersembunyi di antara jutaan klaim.

## Tujuan (461/500)
Membangun sistem deteksi anomali klaim berbasis AI yang mengubah proses audit BPJS Kesehatan dari sampling acak menjadi risk-based auditing. Tujuannya memprioritaskan pemeriksaan pada klaim dengan skor risiko fraud tertinggi — khususnya pola phantom & repeat billing, upcoding & unbundling, serta inflated bills & cloning — sehingga waktu dan sumber daya auditor lebih efisien, sambil tetap menjaga keputusan akhir di tangan auditor manusia (human-in-the-loop).

## Deskripsi (822/1000)
KlaimGuard AI adalah sistem deteksi anomali billing klaim FKRTL yang menggabungkan model unsupervised (Isolation Forest/Autoencoder) untuk menangkap pola klaim menyimpang tanpa memerlukan data fraud berlabel riil, dengan model supervised (XGBoost) yang menilai risiko berdasarkan fitur seperti rasio biaya terhadap median faskes sejenis, kesesuaian kode diagnosis-tindakan, kemiripan antar klaim, dan frekuensi klaim berulang. Setiap skor risiko dilengkapi penjelasan SHAP agar auditor tahu alasan spesifik di balik setiap flag, bukan sekadar angka. Outputnya berupa dashboard antrean prioritas audit per klaim dan per faskes. Sistem dikembangkan dan diuji memakai data publik sejenis serta data sintetis yang meniru struktur klaim INA-CBG, karena data JKN riil tidak digunakan tanpa izin resmi sesuai ketentuan kompetisi.

## Dampak (442/500)
Proses audit bergeser dari reaktif/sampling acak menjadi proaktif berbasis risiko, dengan cakupan deteksi lebih luas karena seluruh klaim dinilai, bukan hanya subset acak. Manfaat dirasakan BPJS Kesehatan (integritas dana klaim terjaga), peserta JKN (dana amanat lebih terlindungi), dan faskes jujur (terhindar dari kecurigaan tak berdasar lewat verifikasi transparan). Angka dampak masih bersifat estimasi, perlu divalidasi dengan data riil.

> Catatan: setelah Gate A, bagian Dampak dan materi PPT sebaiknya diperbarui dengan angka performa asli (recall pada anggaran pemeriksaan, lift vs sampling acak), tetap dilabeli data sintetis.
