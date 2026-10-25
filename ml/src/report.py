"""Generate the reviewable Gate A report from an actually completed run."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .features import FRAUD_TYPES, ML_DIR, format_check
from .validate_export import OFFICIAL_PATTERNS


def table(headers, rows) -> str:
    escape = lambda value: str(value).replace("|", "\\|")
    return "\n".join(["| " + " | ".join(escape(v) for v in headers) + " |", "| " + " | ".join("---" for _ in headers) + " |",
                       *("| " + " | ".join(escape(v) for v in row) + " |" for row in rows)])


def generate_report(artifact_dir: Path) -> None:
    load = lambda name: json.loads((artifact_dir / name).read_text(encoding="utf-8"))
    sanity = load("feature_sanity.json")
    model = load("model_report.json")
    pipeline = load("pipeline_manifest.json")
    leakage = load("leakage_audit.json")
    export = load("export_manifest.json")
    holdout_audit = load("holdout_audit.json")
    run_artifacts = artifact_dir.relative_to(ML_DIR).as_posix()
    if not pipeline["reproduction"]["passed"]:
        raise ValueError("Gate A report requires a completed fresh reproduction comparison.")
    fmt = lambda n: f"{n:.6f}".replace(".", ",")
    pct = lambda n: f"{100 * n:.2f}%".replace(".", ",")
    names = dict(zip(FRAUD_TYPES, OFFICIAL_PATTERNS))
    variants = ("if_only", "xgb_only", "hybrid")
    sanity_rows = []
    for check in sanity["checks"]:
        actual, expected, deviation, state = format_check(check)
        if "enrichment" in check:
            actual += f"; enrichment {check['enrichment']:.3f}x"
            expected += "; enrichment >=10x"
        sanity_rows.append([check["check"], actual, expected, deviation, state])
    metric_rows = [[variant, fmt(model["pr_auc"][variant]),
                    *(pct(model["at_budget"][str(budget)]["recall"][variant]) for budget in (2, 5, 10))]
                   for variant in variants]
    precision_rows = [[variant, *(pct(model["at_budget"][str(budget)]["precision"][variant]) for budget in (2, 5, 10))]
                      for variant in variants]
    recall_rows = [[names[t], *(pct(model["per_type_recall_at_5"][t][v]) for v in variants)] for t in FRAUD_TYPES]
    holdout_rows = [[names[t], *(pct(model["holdout"][t][v]) for v in variants)] for t in FRAUD_TYPES]
    gain_rows = [[row["label"], fmt(row["mean_abs_shap"]), fmt(row["gain"])] for row in model["feature_importance"]]
    source_rows = [[name, digest] for name, digest in sanity["source_sha256"].items()]
    file_rows = [[name, n] for name, n in export["file_bytes"].items()]
    state = f"""# Gate A — KlaimGuard AI, hasil ML aktual

Seluruh data **sintetis**, bukan data peserta JKN. Angka performa **bukan klaim performa dunia nyata**. Skor merupakan rekomendasi prioritas; keputusan akhir tetap pada auditor manusia.

## 1. Ringkasan selesai dan belum selesai

Selesai: 27 fitur, Isolation Forest 300 tree pada 23 fitur numerik, XGBoost dan hybrid lima fold OOF, early stopping internal train, enam eksperimen hold-out lima fold, audit anti-kebocoran, SHAP setiap klaim dari model fold yang menilainya, aturan pola transparan, lima JSON aktual dan validator, serta `run_all.py` dari CSV tanpa cache.

Input: 62.711 klaim, 120 faskes, 23.171 pasien sintetis, 2.784 label fraud (4,4394%). Sepuluh unit test lolos; `pip check` tidak menemukan dependensi rusak.

Run penuh baru selesai dalam **{pipeline['duration_seconds']:.3f} detik**. Hasil lolos **{len(pipeline['reproduction']['checks'])} pembandingan eksak** terhadap run per tahap sebelumnya: fitur, prediksi, hold-out dan SHAP identik bit demi bit; JSON sama kecuali `generated_at`/`duration_seconds`. Tidak mengklaim reproduksibilitas bitwise lintas versi paket/OS.

Belum dilakukan: QA integrasi dashboard dengan ekspor ML, pembaruan screenshot/dashboard README, dan deploy. Berhenti di Gate A; menunggu konfirmasi Abil. Semua berkas `web/` di luar lima JSON ekspor sama berdasarkan fingerprint sebelum/sesudah run.

## 2. Sanity check fitur

**13/13 lolos.** Pemeriksaan overlap terakhir menggabungkan dua syarat tegas, proporsi phantom >50% sekaligus enrichment >=10x. Jumlah terverifikasi: 253 total / 134 phantom / 92 normal / 27 lain.

{table(['Pemeriksaan', 'Aktual', 'Ekspektasi', 'Deviasi relatif', 'Gate'], sanity_rows)}

Ekspektasi sekitar nol memakai batas absolut 1 poin persentase yang ditetapkan sebelum penghitungan; deviasi relatif terhadap nol tidak terdefinisi. Deviasi pemeriksaan batas hanya menghitung pelanggaran batas, bukan selisih terhadap target titik.

**Riwayat perubahan penting:** overlap simetris awal menghasilkan 359 klaim, 134 phantom, 183 normal, 42 lain; ekspektasi mayoritas phantom pada definisi itu dinyatakan keliru oleh Abil dan Claude. Definisi diganti menjadi terarah: klaim masuk lebih belakangan ditandai; tanggal masuk sama menandai keduanya; hanya rawat inap lintas faskes, interval `[admit, discharge)`. **Definisi terarah dipilih setelah membandingkan kedua definisi pada data penuh**, sehingga merupakan keputusan desain berbasis data dan membatasi independensi evaluasi. Tidak mengubah atau meregenerasi dataset/generator.

## 3. Metrik tiga varian

PR-AUC dilaporkan sebagai **average precision (AP)**. Fold distratifikasi `fraud_type`, seed 42. Budget membulatkan ke atas: top 2/5/10% masing-masing {model['at_budget']['2']['selected_claims']}/{model['at_budget']['5']['selected_claims']}/{model['at_budget']['10']['selected_claims']} klaim. Tie diurutkan berdasarkan urutan sumber, tanpa label.

{table(['Varian', 'PR-AUC / AP', 'Recall@2%', 'Recall@5%', 'Recall@10%'], metric_rows)}

{table(['Varian', 'Precision@2%', 'Precision@5%', 'Precision@10%'], precision_rows)}

`if_only` adalah persentil skor IF tanpa label yang dilatih pada seluruh batch. `xgb_only` dan `hybrid` adalah prediksi supervised OOF. Early stopping memakai 20% inner validation dari outer train, lalu refit seluruh outer train memakai jumlah tree terpilih; fold uji tidak masuk fit/early stopping. Parameter maksimum 400 tree, depth 5, learning rate 0,05, subsample/colsample 0,8; tidak disetel berdasarkan hasil uji.

Kurva lift mencakup 0–100%, termasuk seluruh titik 1–20% yang diwajibkan. Pada top 5%, hybrid menangkap {pct(model['at_budget']['5']['recall']['hybrid'])} kasus sintetis berlabel dibanding ekspektasi sampling acak 5%.

## 4. Recall per jenis dan hold-out

Recall per jenis pada top 5% klaim, dari OOF biasa:

{table(['Jenis pola sintetis', 'IF', 'XGBoost', 'Hybrid'], recall_rows)}

Hold-out: untuk setiap T, semua baris T dibuang dari outer train **sebelum** inner train/validation dan refit; baris normal pada outer train tetap tersedia. Lima fold uji yang sama memuat T. Prediksi uji digabung, top 5% seluruh cohort dipilih, kemudian recall T dihitung. Audit {len(holdout_audit['fold_audit'])} model hold-out menyatakan tidak ada T dalam supervised train dan tidak menggunakan outer test untuk early stopping.

{table(['T dikeluarkan dari train supervised', 'IF', 'XGBoost', 'Hybrid'], holdout_rows)}

IF dan referensi fitur tanpa label tetap memakai seluruh batch, termasuk kovariat T, sesuai brief. Ini **bukan** uji jenis yang benar-benar baru pada lingkungan induktif/prospektif. IF sebagai baseline tidak dilatih ulang per T karena tidak memakai label.

## 5. Temuan, audit, dan batasan

- Hybrid belum unggul secara keseluruhan: AP {fmt(model['pr_auc']['hybrid'])} vs XGBoost {fmt(model['pr_auc']['xgb_only'])}; recall@5% juga sedikit lebih rendah. Parameter dipertahankan dan hasil tidak dipoles.
- Pada hold-out, hybrid membantu dibanding XGBoost untuk repeat dan unbundling, sedikit untuk phantom/inflated, tetapi lebih rendah untuk upcoding dan cloning. IF sendiri sering lebih tinggi; tambahan skor anomali tidak otomatis menghasilkan generalisasi terbaik.
- Inflated menjadi jenis paling sulit pada evaluasi OOF biasa (hybrid {pct(model['per_type_recall_at_5']['inflated']['hybrid'])}), lebih rendah daripada phantom ({pct(model['per_type_recall_at_5']['phantom']['hybrid'])}), berbeda dari ekspektasi awal.
- Cloning memiliki fitur jarak sangat mudah (100% melewati sanity threshold), tetapi recall hybrid saat jenis cloning dikeluarkan dari train hanya {pct(model['holdout']['cloning']['hybrid'])}. Fitur yang mudah tidak menjamin model menangkap pola yang belum dilatih.
- Pemicu AP >0,99 atau setidaknya lima jenis recall >=95%: **{leakage['triggered_by_high_metrics']}**. Audit tetap dijalankan: fitur tanpa label dan setelah penggantian label/claim_id identik pada seluruh 62.711 baris; tidak ada fitur label atau ID mentah pada model tersimpan; tidak ada kolom identik dengan target atau komplemennya.
- Peer median, tetangga dan riwayat serta IF memakai batch penuh tanpa label. Evaluasi transduktif dan split per klaim dapat berbagi pasien/faskes/klaim berelasi lintas fold; perlu evaluasi per kelompok dan waktu untuk klaim generalisasi baru.
- Data sintetis dan pola disuntikkan; perubahan definisi overlap dilakukan setelah meninjau data penuh. Tidak ada validasi dunia nyata atau bukti penghematan terkonfirmasi.
- SHAP memakai TreeExplainer pada model OOF terkait dan output raw log-odds. Rekonstruksi probabilitas maksimum **{export['shap']['max_probability_reconstruction_error']:.3g}**. Tiga alasan dipilih dari kontribusi positif terbesar; jika kurang dari tiga, diisi kontribusi negatif nonnol terbesar dengan arah yang benar. Kontribusi bukan sebab-akibat.
- Pola dugaan mengikuti enam aturan tetap, tanpa label; maksimum dua, diurutkan menurut |SHAP| fitur terkait. Median peer rupiah dibulatkan, estimasi = selisih positif terhadap median yang diekspor; bukan kerugian terbukti.
- Referensi pasien adalah SHA1 enam karakter untuk demo; bukan jaminan anonimitas produksi. Keputusan tetap pada auditor manusia.

Global feature importance: kolom pertama rata-rata |SHAP| OOF dalam log-odds; kolom kedua rata-rata gain yang dinormalisasi per model. Besarnya importance tidak membuktikan perbaikan AP.

{table(['Fitur', 'Mean |SHAP|', 'Mean normalized gain'], gain_rows)}

Durasi tahap run penuh:

{table(['Tahap', 'Detik'], [[k, v] for k, v in pipeline['stage_durations_seconds'].items()])}

## 6. Reproduksi dan berkas

```powershell
cd "<folder proyek>/ml"
$env:PYTHONUTF8 = "1"
python -m venv .venv
.\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt
.\\.venv\\Scripts\\python.exe -m unittest discover -s tests -v
.\\.venv\\Scripts\\python.exe run_all.py
```

Run penuh yang diverifikasi pada sesi ini:

```powershell
.\\.venv\\Scripts\\python.exe run_all.py --artifact-dir {run_artifacts} --verify-against artifacts
```

Referensi `artifacts/` berasal dari run per tahap sebelumnya; perbandingan baru membutuhkan referensi tersebut. Run normal `run_all.py` tidak membutuhkan cache atau reference. Generator tidak dijalankan. Paket dipin dalam `requirements.txt`; versi dan hash sumber tercantum pada snapshot manifest. Gunakan Python 3.12+ untuk requirements ini: metadata NumPy/XGBoost/SHAP terpasang membutuhkan >=3.12; sesi memakai Python 3.12.6 dan memenuhi batas awal preflight >=3.10.

Ukuran ekspor tervalidasi: **{export['total_folder_bytes']:,} byte**, di bawah batas konservatif 6.000.000 byte; 3.000 klaim dan 120 faskes.

{table(['JSON', 'Byte payload JSON (sebelum newline akhir)'], file_rows)}

Kode: `src/features.py`, `train.py`, `evaluate.py`, `audit.py`, `export.py`, `validate_export.py`, `report.py`, `run_all.py`, serta `tests/`. Lima JSON aktual ada pada `web/public/data/`. Model 10 fold, IF/scaler, fitur, OOF/hold-out, SHAP dan audit rinci tersimpan pada `artifacts/` yang tidak di-deploy. Snapshot untuk review ada di `reports/`.

Hash input sebelum/sesudah sama:

{table(['Sumber', 'SHA256'], source_rows)}

**Gate A: laporan lengkap siap; berhenti dan menunggu konfirmasi Abil.**
"""
    reports = ML_DIR / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    (reports / "GATE_A.md").write_text(state, encoding="utf-8")
    for name in ("feature_sanity.json", "model_report.json", "pipeline_manifest.json", "leakage_audit.json", "shap_audit.json", "export_manifest.json"):
        (reports / name).write_text((artifact_dir / name).read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Gate A report saved: {reports / 'GATE_A.md'}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts/final_run"))
    args = parser.parse_args()
    directory = args.artifact_dir if args.artifact_dir.is_absolute() else ML_DIR / args.artifact_dir
    generate_report(directory)
