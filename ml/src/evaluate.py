"""Budget metrics and six supervised-type holdouts on the same OOF folds."""

from __future__ import annotations

import json
import argparse
from pathlib import Path
from time import perf_counter

import numpy as np
from sklearn.metrics import average_precision_score
from sklearn.model_selection import StratifiedGroupKFold

from .features import FRAUD_TYPES, ML_DIR, SEED, sha256
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
        "Split per klaim dapat memisahkan klaim berelasi ke fold berbeda. Lihat grouped_eval untuk evaluasi kelompok tambahan bila tersedia; evaluasi waktu dan validasi prospektif masih diperlukan.",
        "Cloning sintetis memiliki jitter sangat kecil dan dapat terlalu mudah; phantom memiliki sinyal lemah. Pola dugaan adalah heuristik, bukan label atau tuduhan.",
        "Estimasi kelebihan bayar adalah selisih positif biaya terhadap median peer; bukan kerugian terkonfirmasi. Keputusan akhir ada pada auditor.",
    ]
    report["duration_seconds"] = round(perf_counter() - start, 3)
    np.savez_compressed(artifact_dir / "holdout_predictions.npz", **all_holdout_predictions)
    write_json(artifact_dir / "holdout_audit.json", {"fold_audit": holdout_audits})
    write_json(artifact_dir / "model_report.json", report)
    print(f"Evaluation and holdouts complete: {report['duration_seconds']:.3f} seconds", flush=True)
    return report


def run_grouped_evaluation(artifact_dir: Path | None = None, publish: bool = False) -> dict:
    """Additional group-isolated evaluation; never replaces ordinary OOF scores."""
    start = perf_counter()
    artifact_dir = artifact_dir or ML_DIR / "artifacts" / "final_run"
    group_dir = artifact_dir / "grouped_eval"
    group_dir.mkdir(parents=True, exist_ok=True)
    protected = [ML_DIR.parent / "web" / "public" / "data" / name for name in
                 ("claims_flagged.json", "summary.json", "faskes_risk.json", "feature_dictionary.json")]
    protected += [artifact_dir / "oof_predictions.npz", artifact_dir / "shap_values.npy"]
    before = {str(p): sha256(p) for p in protected if p.exists()}
    claims, features, _ = load_feature_bundle(artifact_dir)
    y, types = claims.fraud_label.to_numpy(dtype=int), claims.fraud_type.to_numpy()
    with np.load(artifact_dir / "oof_predictions.npz", allow_pickle=False) as saved:
        original_if = saved["if_only"]
    x = features.astype(np.float32)
    hybrid_x = x.assign(if_score=original_if.astype(np.float32))
    result, audits = {}, []
    for scheme in ("faskes_id", "patient_id"):
        groups = claims[scheme].to_numpy()
        split = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=SEED)
        predictions = {"if_only": original_if,
                       "xgb_only": np.full(len(x), np.nan), "hybrid": np.full(len(x), np.nan)}
        assignments = np.full(len(x), -1, dtype=np.int32)
        coverage = np.zeros(len(x), dtype=int)
        for fold, (train_indexes, test_indexes) in enumerate(split.split(x, types, groups=groups)):
            if np.intersect1d(groups[train_indexes], groups[test_indexes]).size:
                raise AssertionError("Grouped outer train/test overlap.")
            assignments[test_indexes] = fold
            coverage[test_indexes] += 1
            for variant, frame in (("xgb_only", x), ("hybrid", hybrid_x)):
                model, audit = fit_nested_model(frame, y, types, train_indexes, test_indexes, inner_groups=groups)
                predictions[variant][test_indexes] = model.predict_proba(frame.iloc[test_indexes])[:, 1]
                audits.append({"scheme": scheme, "fold": fold, "variant": variant, **audit})
            print(f"Grouped {scheme} fold {fold + 1}/5: group-disjoint outer and inner splits; parameters unchanged", flush=True)
        if not np.all(coverage == 1) or any(not np.isfinite(p).all() for p in predictions.values()):
            raise AssertionError("Invalid grouped OOF coverage.")
        metrics = score_report(claims, predictions)
        keep = lambda values: {name: values[name] for name in ("xgb_only", "hybrid")}
        label = "faskes" if scheme == "faskes_id" else "pasien"
        result[scheme] = {
            "group": scheme, "n_groups": len(np.unique(groups)), "folds": 5, "seed": SEED,
            "splitter": "StratifiedGroupKFold", "stratification": "fraud_type",
            "note": f"Kelompok {label} terpisah pada outer train/uji dan inner validasi; IF dan referensi fitur tetap memakai batch penuh tanpa label sehingga evaluasi masih transduktif.",
            "pr_auc": keep(metrics["pr_auc"]),
            "at_budget": {budget: {"recall": keep(value["recall"]), "precision": keep(value["precision"]),
                                    "selected_claims": value["selected_claims"]} for budget, value in metrics["at_budget"].items()},
            "per_type_recall_at_5": {kind: keep(value) for kind, value in metrics["per_type_recall_at_5"].items()},
            "outer_group_overlap": 0, "inner_group_overlap": 0,
        }
        np.savez_compressed(group_dir / f"{scheme}_predictions.npz",
                            xgb_only=predictions["xgb_only"], hybrid=predictions["hybrid"], fold=assignments)
        print(f"Grouped {scheme} AP: {result[scheme]['pr_auc']}; recall@5%: {result[scheme]['at_budget']['5']['recall']}", flush=True)
    report_path = artifact_dir / "model_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["grouped_eval"] = result
    write_json(report_path, report)
    if publish:
        for path in (ML_DIR.parent / "web" / "public" / "data" / "model_report.json", ML_DIR / "reports" / "model_report.json"):
            original = json.loads(path.read_text(encoding="utf-8"))
            original["grouped_eval"] = result
            path.write_text(json.dumps(original, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n", encoding="utf-8")
    after = {str(p): sha256(Path(p)) for p in before}
    if after != before:
        raise AssertionError("Protected scores, SHAP or non-report JSON changed.")
    write_json(group_dir / "audit.json", {"duration_seconds": round(perf_counter() - start, 3),
                                          "model_parameters_unchanged": True, "fold_audit": audits,
                                          "protected_sha256_before": before, "protected_sha256_after": after,
                                          "ordinary_oof_and_exported_claim_scores_unchanged": True})
    write_json(group_dir / "metrics.json", result)
    print(f"Grouped evaluation complete: {perf_counter() - start:.3f}s; original scores/SHAP/claims unchanged", flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--grouped-only", action="store_true")
    parser.add_argument("--artifact-dir", type=Path)
    args = parser.parse_args()
    directory = (ML_DIR / args.artifact_dir).resolve() if args.artifact_dir else None
    run_grouped_evaluation(directory, publish=True) if args.grouped_only else run_evaluation(directory)
