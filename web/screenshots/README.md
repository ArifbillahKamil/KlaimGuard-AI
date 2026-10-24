# Screenshot KlaimGuard AI

Semua layar memakai **data contoh sintetis**: 300 klaim, 12 faskes, seed 42. Skor, SHAP, dan metrik hanya ilustrasi antarmuka, **bukan hasil model atau klaim performa dunia nyata**.

Desktop: 1440 × 1050 piksel; mobile: 390 × 844 piksel. Halaman diambil penuh hingga footer. Panel detail diambil sesuai ukuran viewport karena kontennya dapat digulir.

| Halaman | Desktop | Mobile |
| --- | --- | --- |
| Ringkasan | [Buka PNG](ringkasan-desktop.png) | [Buka PNG](ringkasan-mobile.png) |
| Antrean Audit | [Buka PNG](antrean-desktop.png) | [Buka PNG](antrean-mobile.png) |
| Faskes | [Buka PNG](faskes-desktop.png) | [Buka PNG](faskes-mobile.png) |
| Evaluasi Model | [Buka PNG](evaluasi-desktop.png) | [Buka PNG](evaluasi-mobile.png) |
| Tata Kelola | [Buka PNG](tata-kelola-desktop.png) | [Buka PNG](tata-kelola-mobile.png) |
| Detail klaim | [Buka PNG](detail-klaim-desktop.png) | [Buka PNG](detail-klaim-mobile.png) |

Reproduksi: jalankan `npm run build`, `npm run preview -- --port 4173`, lalu `npm run qa` di terminal lain. Hasil uji browser dan Lighthouse dirangkum pada `../QA.md` dan `../qa-report.json`.
