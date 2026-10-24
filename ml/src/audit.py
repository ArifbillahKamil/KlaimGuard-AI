"""Persist leakage checks and design limitations before exporting model claims."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from xgboost import XGBClassifier

from .features import FORBIDDEN_FEATURES, ML_DIR, build_features
from .train import load_feature_bundle, write_json


def run_leakage_audit(artifact_dir: Path | None = None) -> dict:
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    claims, features, sanity = load_feature_bundle(artifact_dir)
    report = json.loads((artifact_dir / "model_report.json").read_text(encoding="utf-8"))
    manifest = json.loads((artifact_dir / "training_manifest.json").read_text(encoding="utf-8"))
    # Full-dataset invariance check: recompute, not just inspect column names.
    stripped = claims.drop(columns=["fraud_label", "fraud_type", "claim_id"])
    without_labels, _ = build_features(stripped)
    pd.testing.assert_frame_equal(features, without_labels)
    altered, _ = build_features(claims.assign(fraud_label=-999, fraud_type="label_marker", claim_id="not_a_feature"))
    pd.testing.assert_frame_equal(features, altered)
    all_model_columns = set()
    for variant in ("xgb_only", "hybrid"):
        for fold in range(5):
            model = XGBClassifier()
            model.load_model(artifact_dir / "models" / f"{variant}_fold_{fold}.ubj")
            columns = model.get_booster().feature_names
            expected = manifest["hybrid_feature_names" if variant == "hybrid" else "feature_names"]
            if columns != expected:
                raise AssertionError("Saved model feature names do not match the feature manifest.")
            all_model_columns.update(columns)
    forbidden = sorted(FORBIDDEN_FEATURES.intersection(all_model_columns))
    target = claims.fraud_label.to_numpy()
    identity_columns = [name for name in features if np.array_equal(features[name].to_numpy(), target)
                        or np.array_equal(features[name].to_numpy(), 1 - target)]
    high_ap = report["pr_auc"]["hybrid"] > 0.99
    nearly_all_types = sum(v["hybrid"] >= 0.95 for v in report["per_type_recall_at_5"].values()) >= 5
    result = {
        "triggered_by_high_metrics": high_ap or nearly_all_types,
        "hybrid_pr_auc": report["pr_auc"]["hybrid"],
        "n_types_hybrid_recall_at_5_ge_95pct": sum(v["hybrid"] >= 0.95 for v in report["per_type_recall_at_5"].values()),
        "checked_even_without_trigger": True, "forbidden_model_features": forbidden,
        "model_feature_names": sorted(all_model_columns), "feature_label_identity_columns": identity_columns,
        "full_dataset_features_equal_after_label_removal": True,
        "full_dataset_features_equal_after_label_and_claim_id_replacement": True,
        "outer_test_unused_for_fit_or_early_stopping": all(not f["early_stopping_uses_outer_test"] for f in manifest["fold_audit"]),
        "raw_input_sha256": sanity["source_sha256"],
        "known_design_limitations": [
            "Overlap direction chosen after comparing definitions on the full labeled synthetic dataset.",
            "Unlabeled full-cohort IF, peer statistics, neighbor references and history are transductive.",
            "Claims sharing patients, facilities or related synthetic examples may cross random folds.",
            "Holdout excludes T from supervised fitting, not from IF covariates or peer/history references.",
            "Synthetic injected patterns, including tiny cloning jitter, are not real-world validation.",
        ],
        "label_leakage_detected": bool(forbidden or identity_columns),
    }
    write_json(artifact_dir / "leakage_audit.json", result)
    if result["label_leakage_detected"]:
        raise RuntimeError("Leakage audit failed; export blocked.")
    print(f"Leakage audit: forbidden features={forbidden}; label/ID replacement invariance PASS; high-metric trigger={result['triggered_by_high_metrics']}", flush=True)
    return result


if __name__ == "__main__":
    run_leakage_audit()
