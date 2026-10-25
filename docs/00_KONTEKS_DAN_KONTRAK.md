# Konteks & Kontrak Data

Baca ini lebih dulu sebelum prompt mana pun. Aturan di sini mengikat semua tahap. (Aturan ringkas juga ada di `AGENTS.md`.)


### Konteks
KlaimGuard AI adalah prototipe sistem prioritas audit klaim BPJS Kesehatan (FKRTL) untuk kompetisi Healthkathon 2026 (kategori Efisiensi Risiko Fasilitas Kesehatan). Sistem menilai setiap klaim dengan skor risiko dan memberi alasan per klaim, sehingga auditor memeriksa klaim paling mencurigakan lebih dulu, bukan sampling acak. Keputusan akhir selalu di tangan auditor (human-in-the-loop).

Pola fraud yang dicakup (gunakan **label resmi persis** ini di seluruh UI dan JSON):
- `Phantom billing (klaim palsu)`
- `Repeat billing (klaim berulang)`
- `Manipulasi diagnosis dan/atau tindakan (upcoding)`
- `Services unbundling / fragmentation`
- `Inflated bills (penggelembungan tagihan)`
- `Cloning (penjiplakan klaim)`

Nilai kunci arsitektur (feedback reviewer): **hybrid** = Isolation Forest (unsupervised, tanpa label fraud) + XGBoost (supervised) dengan fitur seperti rasio biaya terhadap median faskes sejenis, + **SHAP per klaim**.

### Aturan wajib (tidak boleh dilanggar)
1. Semua data **sintetis**. Tidak ada data peserta JKN riil. Setiap halaman UI dan README harus menyebut bahwa data adalah sintetis dan angka performa **bukan** klaim performa di dunia nyata.
2. `fraud_label` dan `fraud_type` **tidak boleh** menjadi fitur. Kolom ID mentah (`claim_id`, `patient_id`, `faskes_id`) juga bukan fitur.
3. Jangan menyetel hyperparameter atau threshold dengan melihat data test. Laporkan hasil apa adanya, termasuk jika lebih rendah dari harapan.
4. Skor untuk dashboard harus **out-of-fold** (5-fold), bukan prediksi pada data yang dipakai melatih modelnya.
5. Semua proses acak memakai `seed=42` agar reproducible.
6. Teks UI dalam **Bahasa Indonesia**. Kode, nama variabel, dan komentar teknis boleh Inggris.
7. Skor adalah rekomendasi prioritas pemeriksaan, bukan tuduhan. Gunakan frasa "berpotensi", "perlu diperiksa", bukan "pelaku" atau "fraud terbukti".

### Struktur repo
```
BPJS Healtkathon/
├─ AGENTS.md / STATUS.md / README.md
├─ docs/                    # prompt, kontrak, format laporan
├─ ml/
│  ├─ data/                 # claims_synthetic.csv, faskes.csv (input)
│  ├─ src/                  # generate_claims.py, features.py, train.py, evaluate.py, export.py
│  ├─ artifacts/            # model & metrik (tidak di-deploy)
│  ├─ run_all.py            # satu perintah menjalankan semuanya
│  ├─ requirements.txt
│  └─ README.md
├─ web/                     # dashboard (di-deploy ke Vercel)
│  ├─ public/data/          # JSON hasil ekspor (di-commit)
│  └─ ...
```

### Kontrak data (ML → dashboard)
Semua file di `web/public/data/`. Teks bebas dalam Bahasa Indonesia. Tanggal `YYYY-MM-DD`. Uang dalam rupiah (angka bulat).

**`summary.json`**
```json
{
  "generated_at": "ISO8601",
  "dataset": {"n_claims": 0, "n_faskes": 0, "n_patients": 0, "fraud_rate": 0.0, "synthetic": true},
  "kpi": {
    "n_high": 0, "n_medium": 0, "n_low": 0,
    "est_excess_total_idr": 0,
    "n_faskes_high_risk": 0
  },
  "tiers": {"high_top_pct": 3, "medium_top_pct": 10, "score_cut_high": 0, "score_cut_medium": 0},
  "score_hist": {"bin_edges": [0,5,10], "counts": [0,0]},
  "disclaimer": "Data sintetis. Bukan data peserta JKN. Skor adalah rekomendasi prioritas pemeriksaan."
}
```

**`claims_flagged.json`**: array berisi **3.000 klaim teratas** menurut `risk_score`, urut menurun.
```json
{
  "claim_id": "C000123",
  "patient_ref": "PX-a3f9c1",
  "faskes_id": "RS014", "faskes_class": "B", "faskes_ownership": "Swasta",
  "service_type": "RITL",
  "dx": "I50", "dx_name": "Gagal jantung", "proc": "88.72", "severity": "II",
  "admit_date": "2025-03-14", "los": 6,
  "claim_total": 18450000, "peer_median": 12100000, "est_excess": 6350000,
  "risk_score": 94, "risk_tier": "high",
  "if_score": 88,
  "patterns": ["Inflated bills (penggelembungan tagihan)"],
  "reasons": [
    {"feature": "dx_peer_ratio", "text": "Biaya 1,5× median faskes sejenis untuk Gagal jantung", "shap": 1.82, "direction": "up"}
  ],
  "eval": {"label": 1, "type": "inflated"}
}
```
- `patient_ref` = `"PX-"` + 6 karakter pertama hash SHA1 dari `patient_id` (jangan tampilkan ID asli).
- `risk_score` = persentil peringkat (0–100, integer) dari probabilitas hybrid OOF. `risk_tier`: `high` = top 3%, `medium` = top 3–10%, `low` = sisanya.
- `if_score` = persentil Isolation Forest (0–100).
- `peer_median` = median biaya peer (dx × kelas faskes × tipe layanan). `est_excess = max(0, claim_total − peer_median)`. Ini **estimasi**, selalu beri label "estimasi" di UI.
- `reasons`: 3 alasan teratas berdasarkan |SHAP|, teks lewat template (lihat Prompt 1, langkah 5).
- `patterns`: 0–2 pola dugaan (aturan di Prompt 1, langkah 6), memakai label resmi.
- `eval` hanya untuk "Mode Evaluasi (data sintetis)". Jangan tampilkan di mode normal.

**`faskes_risk.json`**: array per faskes
```json
{"faskes_id":"RS014","faskes_class":"B","faskes_ownership":"Swasta","n_claims":512,
 "n_high":21,"high_rate":0.041,"avg_risk":38.2,"est_excess_total":184000000,
 "pattern_counts":{"Inflated bills (penggelembungan tagihan)":9},"risk_rank":3}
```

**`model_report.json`**
```json
{
  "config": {"seed":42,"folds":5,"if_params":{},"xgb_params":{}},
  "pr_auc": {"if_only":0,"xgb_only":0,"hybrid":0},
  "at_budget": {"2":{"recall":{"if_only":0,"xgb_only":0,"hybrid":0},"precision":{"hybrid":0}},
                "5":{...}, "10":{...}},
  "lift_curve": [{"pct":1,"recall_hybrid":0,"recall_random":0.01}],
  "per_type_recall_at_5": {"cloning":{"if_only":0,"xgb_only":0,"hybrid":0}},
  "holdout": {"cloning":{"if_only":0,"xgb_only":0,"hybrid":0}},
  "feature_importance": [{"feature":"dx_peer_ratio","label":"Rasio biaya vs peer","importance":0.0}],
  "notes": ["..."]
}
```

**`feature_dictionary.json`**: array `{feature, label, explain, template}`.

### Tambahan evaluasi kelompok (Gate A bersyarat, 25 Oktober 2026)

`model_report.json.grouped_eval` berisi dua skema `faskes_id` dan `patient_id`. Tiap skema mempunyai `group`, `n_groups`, `folds=5`, `seed=42`, `splitter="StratifiedGroupKFold"`, `stratification="fraud_type"`, dan satu kalimat `note` dalam Bahasa Indonesia. Metrik `pr_auc`, `at_budget["2"/"5"/"10"].recall/precision`, serta `per_type_recall_at_5` masing-masing berisi `xgb_only` dan `hybrid`. `outer_group_overlap` dan `inner_group_overlap` harus 0. Parameter model tetap; inner validation juga memisahkan kelompok. IF dan referensi fitur tetap transduktif. Blok ini **tidak mengganti skor OOF per klaim** yang dipakai pada antrean/SHAP/summary.
