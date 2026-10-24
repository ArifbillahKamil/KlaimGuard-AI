"""Budget metrics and six supervised-type holdouts on the same OOF folds."""

from __future__ import annotations

import json
from pathlib import Path
from time import perf_counter

import numpy as np
from sklearn.metrics import average_precision_score

from .features import FRAUD_TYPES, ML_DIR
from .train import fit_nested_model, load_feature_bundle, make_splits, write_json

VARIANTS = ("if_only", "xgb_only", "hybrid")
BUDGETS = (2, 5, 10)


def top_indexes(scores: np.ndarray, pct: float) -> np.ndarray:
    count = min(len(scores), int(np.ceil(len(scores) * pct / 100)))
    return np.lexsort((np.arange(len(scores)), -scores))[:count]


def budget_metrics(y: np.ndarray, scores: np.ndarray, pct: float) -> dict:
    selected = top_indexes(scores, pct)
    hits = int(y[selected].sum())
    return {"recall": hits / int(y.sum()), "precision": hits / len(selected) if len(selected) else 0.0,
            "selected": len(selected), "true_positives": hits}


def score_report(claims, predictions: dict) -> dict:
    y = claims.fraud_label.to_numpy(dtype=int)
    types = claims.fraud_type.to_numpy()
    pr_auc = {name: float(average_precision_score(y, predictions[name])) for name in VARIANTS}
    at_budget = {}
    for budget in BUDGETS:
        measured = {name: budget_metrics(y, predictions[name], budget) for name in VARIANTS}
        at_budget[str(budget)] = {"recall": {n: m["recall"] for n, m in measured.items()},
                                  "precision": {n: m["precision"] for n, m in measured.items()},
                                  "selected_claims": measured["hybrid"]["selected"]}
    per_type = {}
    for fraud_type in FRAUD_TYPES:
        per_type[fraud_type] = {}
        mask = types == fraud_type
        for variant in VARIANTS:
            selected = top_indexes(predictions[variant], 5)
            per_type[fraud_type][variant] = float(mask[selected].sum() / mask.sum())
    lift = [{"pct": pct,
             "recall_hybrid": budget_metrics(y, predictions["hybrid"], pct)["recall"] if pct else 0.0,
             "recall_random": pct / 100.0} for pct in range(101)]
    return {"pr_auc": pr_auc, "at_budget": at_budget, "per_type_recall_at_5": per_type,
            "lift_curve": lift, "pr_auc_definition": "average_precision_score (AP)",
            "budget_rounding": "ceil(N * pct / 100); skor sama diurutkan stabil menurut baris sumber"}


def run_evaluation(artifact_dir: Path | None = None) -> dict:
    start = perf_counter()
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    claims, features, _ = load_feature_bundle(artifact_dir)
    training = json.loads((artifact_dir / "training_manifest.json").read_text(encoding="utf-8"))
    with np.load(artifact_dir / "oof_predictions.npz", allow_pickle=False) as saved:
        predictions = {variant: saved[variant] for variant in VARIANTS}
    report = {"config": training["config"], **score_report(claims, predictions)}
    print("Variant       PR-AUC(AP)    Recall@2%   Recall@5%   Recall@10%", flush=True)
    for variant in VARIANTS:
        values = [report["at_budget"][str(b)]["recall"][variant] for b in BUDGETS]
        print(f"{variant:<12} {report['pr_auc'][variant]:.6f}       " + "    ".join(f"{v:.4%}" for v in values), flush=True)
    # Save ordinary OOF evaluation before starting independent holdout fits.
    write_json(artifact_dir / "evaluation_oof.json", report)

    y = claims.fraud_label.to_numpy(dtype=int)
    types = claims.fraud_type.to_numpy()
    x = features.astype(np.float32)
    hybrid_x = x.assign(if_score=predictions["if_only"].astype(np.float32))
    holdout = {}
    holdout_audits = []
    all_holdout_predictions = {}
    for fraud_type in FRAUD_TYPES:
        held_predictions = {variant: np.full(len(x), np.nan) for variant in ("xgb_only", "hybrid")}
        for fold, (train_indexes, test_indexes) in enumerate(make_splits(types)):
            for variant, frame in (("xgb_only", x), ("hybrid", hybrid_x)):
                model, audit = fit_nested_model(frame, y, types, train_indexes, test_indexes, excluded_type=fraud_type)
                held_predictions[variant][test_indexes] = model.predict_proba(frame.iloc[test_indexes])[:, 1]
                holdout_audits.append({"fold": fold, "variant": variant, **audit})
            print(f"Holdout {fraud_type}: fold {fold + 1}/5 done; excluded type absent from supervised train/validation", flush=True)
        mask = types == fraud_type
        holdout[fraud_type] = {"if_only": report["per_type_recall_at_5"][fraud_type]["if_only"]}
        for variant, scores in held_predictions.items():
            if not np.isfinite(scores).all():
                raise AssertionError("Incomplete holdout OOF predictions.")
            holdout[fraud_type][variant] = float(mask[top_indexes(scores, 5)].sum() / mask.sum())
            all_holdout_predictions[f"{fraud_type}_{variant}"] = scores
        print(f"Holdout {fraud_type} recall@5%: {holdout[fraud_type]}", flush=True)
    report["holdout"] = holdout
    report["holdout_protocol"] = {
        "supervised_type_exclusion": "Semua baris T dikeluarkan dari outer train sebelum inner split; baris normal tetap tersedia.",
        "evaluation": "Lima outer fold yang sama; prediksi uji digabung; top 5% seluruh cohort; recall dihitung dalam jenis T.",
        "unsupervised": "Isolation Forest dan referensi fitur tanpa label tidak berubah dan telah melihat kovariat T; belum menguji jenis baru secara induktif.",
    }
    report["notes"] = [
        "Seluruh data sintetis, bukan data peserta JKN. Angka performa bukan klaim performa dunia nyata.",
        "PR-AUC dilaporkan sebagai average precision (AP); budget memakai ceil(N*pct/100). Tidak ada tuning pada fold uji.",
        "Prediksi supervised adalah OOF 5-fold; early stopping memakai validasi internal train, lalu model dilatih ulang pada seluruh outer train dengan jumlah tree terpilih.",
        "Isolation Forest, median peer, nearest-neighbor dan hitungan riwayat memakai seluruh batch tanpa label: evaluasi transduktif, bukan generalisasi prospektif atau ke faskes baru.",
        "Definisi overlap terarah dipilih setelah membandingkan dua definisi pada data penuh; ini keputusan desain berbasis data dan membatasi independensi evaluasi.",
        "Hold-out membuang satu jenis fraud hanya dari train supervised. Isolation Forest tetap melihat kovariat tanpa label dari jenis itu sesuai brief.",
        "Split per klaim dapat memisahkan klaim berelasi ke fold berbeda. Evaluasi kelompok pasien/faskes dan waktu masih diperlukan.",
        "Cloning sintetis memiliki jitter sangat kecil dan dapat terlalu mudah; phantom memiliki sinyal lemah. Pola dugaan adalah heuristik, bukan label atau tuduhan.",
        "Estimasi kelebihan bayar adalah selisih positif biaya terhadap median peer; bukan kerugian terkonfirmasi. Keputusan akhir ada pada auditor.",
    ]
    report["duration_seconds"] = round(perf_counter() - start, 3)
    np.savez_compressed(artifact_dir / "holdout_predictions.npz", **all_holdout_predictions)
    write_json(artifact_dir / "holdout_audit.json", {"fold_audit": holdout_audits})
    write_json(artifact_dir / "model_report.json", report)
    print(f"Evaluation and holdouts complete: {report['duration_seconds']:.3f} seconds", flush=True)
    return report


if __name__ == "__main__":
    run_evaluation()
