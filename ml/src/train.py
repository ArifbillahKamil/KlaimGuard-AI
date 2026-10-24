"""CPU Isolation Forest and nested-validation, five-fold OOF XGBoost."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from time import perf_counter

import joblib
import numpy as np
import pandas as pd
from scipy.stats import rankdata
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedKFold, train_test_split
from sklearn.preprocessing import RobustScaler
from xgboost import XGBClassifier

from .features import FEATURE_NAMES, FORBIDDEN_FEATURES, ML_DIR, NUMERIC_FEATURES, SEED, load_claims, sha256

FOLDS = 5
N_JOBS = 4
IF_PARAMS = {"n_estimators": 300, "contamination": "auto", "random_state": SEED, "n_jobs": N_JOBS}
XGB_PARAMS = {"n_estimators": 400, "max_depth": 5, "learning_rate": 0.05,
              "subsample": 0.8, "colsample_bytree": 0.8, "eval_metric": "aucpr",
              "tree_method": "hist", "device": "cpu", "n_jobs": N_JOBS,
              "random_state": SEED, "objective": "binary:logistic"}


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def load_feature_bundle(artifact_dir: Path | None = None):
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    sanity = json.loads((artifact_dir / "feature_sanity.json").read_text(encoding="utf-8"))
    if not sanity["passed_20pct_gate"]:
        raise RuntimeError("Sanity gate failed: training is prohibited.")
    for relative, digest in sanity["source_sha256"].items():
        if sha256(ML_DIR / relative) != digest:
            raise RuntimeError(f"Input changed since feature construction: {relative}")
    features = pd.read_parquet(artifact_dir / "features.parquet")
    if list(features) != list(FEATURE_NAMES) or FORBIDDEN_FEATURES.intersection(features):
        raise AssertionError("Unexpected or forbidden feature columns.")
    return load_claims(), features, sanity


def make_splits(types: np.ndarray) -> list[tuple[np.ndarray, np.ndarray]]:
    return list(StratifiedKFold(n_splits=FOLDS, shuffle=True, random_state=SEED).split(np.zeros(len(types)), types))


def index_hash(indexes: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(indexes, dtype="<i8").tobytes()).hexdigest()


def positive_weight(y: np.ndarray) -> float:
    positive = int(y.sum())
    if positive == 0:
        raise ValueError("Training partition has no positive labels.")
    return float((len(y) - positive) / positive)


def fit_nested_model(x: pd.DataFrame, y: np.ndarray, types: np.ndarray,
                     train_indexes: np.ndarray, test_indexes: np.ndarray,
                     excluded_type: str | None = None) -> tuple[XGBClassifier, dict]:
    """Select tree count on inner validation, then refit all outer train rows.

    Test indexes and labels are never passed to fit/early stopping. A holdout
    type, when specified, is removed before both inner splitting and refitting.
    """
    if excluded_type is not None:
        train_indexes = train_indexes[types[train_indexes] != excluded_type]
    if np.intersect1d(train_indexes, test_indexes).size:
        raise AssertionError("Outer train/test overlap.")
    inner_train, inner_valid = train_test_split(train_indexes, test_size=0.20,
                                               random_state=SEED, stratify=types[train_indexes])
    if np.intersect1d(inner_train, inner_valid).size:
        raise AssertionError("Inner train/validation overlap.")
    if excluded_type is not None and (types[train_indexes] == excluded_type).any():
        raise AssertionError("Held-out type entered supervised training.")
    selector = XGBClassifier(**XGB_PARAMS, scale_pos_weight=positive_weight(y[inner_train]),
                             early_stopping_rounds=30)
    selector.fit(x.iloc[inner_train], y[inner_train],
                 eval_set=[(x.iloc[inner_valid], y[inner_valid])], verbose=False)
    tree_count = int(selector.best_iteration) + 1
    final_params = {**XGB_PARAMS, "n_estimators": tree_count,
                    "scale_pos_weight": positive_weight(y[train_indexes])}
    model = XGBClassifier(**final_params)
    model.fit(x.iloc[train_indexes], y[train_indexes], verbose=False)
    audit = {"n_outer_train": len(train_indexes), "n_inner_train": len(inner_train),
             "n_inner_validation": len(inner_valid), "n_outer_test": len(test_indexes),
             "best_n_estimators": tree_count, "scale_pos_weight": final_params["scale_pos_weight"],
             "excluded_type": excluded_type, "excluded_type_in_supervised_train": 0,
             "outer_train_sha256": index_hash(train_indexes), "outer_test_sha256": index_hash(test_indexes),
             "inner_train_sha256": index_hash(inner_train), "inner_valid_sha256": index_hash(inner_valid),
             "outer_train_test_disjoint": True, "inner_validation_is_subset_of_outer_train": True,
             "early_stopping_uses_outer_test": False,
             "feature_names": list(x.columns), "refit_on_full_outer_train_after_inner_selection": True}
    return model, audit


def run_training(artifact_dir: Path | None = None) -> dict:
    start = perf_counter()
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    model_dir = artifact_dir / "models"
    model_dir.mkdir(parents=True, exist_ok=True)
    claims, features, sanity = load_feature_bundle(artifact_dir)
    y = claims.fraud_label.to_numpy(dtype=np.int32)
    types = claims.fraud_type.to_numpy()

    scaler = RobustScaler()
    numeric = scaler.fit_transform(features.loc[:, list(NUMERIC_FEATURES)])
    isolation = IsolationForest(**IF_PARAMS)
    isolation.fit(numeric)
    anomaly = -isolation.score_samples(numeric)
    if_score = rankdata(anomaly, method="average") / len(anomaly) * 100.0
    joblib.dump({"scaler": scaler, "model": isolation, "numeric_features": list(NUMERIC_FEATURES)}, model_dir / "isolation_forest.joblib")
    print(f"Isolation Forest: fitted {len(features)} unlabeled rows, {len(NUMERIC_FEATURES)} numeric features, 300 trees", flush=True)

    x = features.astype(np.float32)
    hybrid_x = x.assign(if_score=if_score.astype(np.float32))
    predictions = {"if_only": if_score.copy(), "xgb_only": np.full(len(x), np.nan),
                   "hybrid": np.full(len(x), np.nan)}
    folds = np.full(len(x), -1, dtype=np.int32)
    audits = []
    gain = {name: [] for name in hybrid_x.columns}
    for fold, (train_indexes, test_indexes) in enumerate(make_splits(types)):
        folds[test_indexes] = fold
        for variant, frame in (("xgb_only", x), ("hybrid", hybrid_x)):
            model, audit = fit_nested_model(frame, y, types, train_indexes, test_indexes)
            predictions[variant][test_indexes] = model.predict_proba(frame.iloc[test_indexes])[:, 1]
            model.save_model(model_dir / f"{variant}_fold_{fold}.ubj")
            audits.append({"fold": fold, "variant": variant, **audit})
            if variant == "hybrid":
                scores = model.get_booster().get_score(importance_type="gain")
                total = sum(scores.values()) or 1.0
                for name in gain:
                    gain[name].append(float(scores.get(name, 0.0) / total))
            print(f"OOF fold {fold + 1}/{FOLDS} {variant}: test={len(test_indexes)}, trees={audit['best_n_estimators']}, inner validation only", flush=True)
    if (folds < 0).any() or any(not np.isfinite(p).all() for p in predictions.values()):
        raise AssertionError("Missing or non-finite OOF predictions.")
    np.savez_compressed(artifact_dir / "oof_predictions.npz", **predictions, fold=folds,
                        if_anomaly_score=anomaly, claim_id=claims.claim_id.to_numpy(dtype=str))
    result = {"config": {"seed": SEED, "folds": FOLDS, "if_params": IF_PARAMS, "xgb_params": {
        **XGB_PARAMS, "early_stopping_rounds": 30, "inner_validation_fraction": 0.20,
        "scale_pos_weight": "n_normal/n_fraud computed within the respective training partition"}},
        "feature_names": list(x.columns), "hybrid_feature_names": list(hybrid_x.columns),
        "input_sha256": sanity["source_sha256"], "fold_audit": audits,
        "hybrid_normalized_gain": {name: float(np.mean(values)) for name, values in gain.items()},
        "if_is_transductive_unsupervised_full_batch": True,
        "supervised_predictions_are_five_fold_oof": True,
        "duration_seconds": round(perf_counter() - start, 3)}
    write_json(artifact_dir / "training_manifest.json", result)
    print(f"Training complete: {result['duration_seconds']:.3f} seconds", flush=True)
    return result


if __name__ == "__main__":
    run_training()
