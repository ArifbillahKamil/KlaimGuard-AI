"""Label-free feature engineering for synthetic claims only.

No generator is imported or executed. Identifiers only define peer/history groups;
raw identifiers and evaluation labels never enter the feature matrix.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd

ML_DIR = Path(__file__).resolve().parents[1]
SEED = 42
COMPONENTS = ("room", "procedure", "drug", "labrad", "other")
COST_COLUMNS = tuple(f"cost_{name}" for name in COMPONENTS)
CATEGORICAL_MAPS = {
    "faskes_class": {"D": 1, "C": 2, "B": 3, "A": 4},
    "service_type": {"RJTL": 0, "RITL": 1},
    "severity": {"I": 1, "II": 2, "III": 3},
    "faskes_ownership": {"Pemerintah": 0, "Swasta": 1},
}
NUMERIC_FEATURES = (
    "dx_peer_ratio", "proc_peer_ratio", "ratio_gap",
    *(f"comp_ratio_{name}" for name in COMPONENTS),
    *(f"comp_share_{name}" for name in COMPONENTS),
    "pair_rarity", "los_ratio", "nn_dist", "patient_n_claims", "patient_once",
    "same_pat_fk_3d", "repeat_14d", "inpatient_overlap", "fk_day_burst", "fk_loo_ratio",
)
FEATURE_NAMES = (*NUMERIC_FEATURES, *CATEGORICAL_MAPS)
FEATURE_INPUT_COLUMNS = (
    "patient_id", "faskes_id", "faskes_class", "faskes_ownership", "service_type",
    "dx", "severity", "proc", "admit_date", "discharge_date", "los",
    *COST_COLUMNS, "claim_total",
)
FRAUD_TYPES = ("phantom", "repeat", "upcoding", "unbundling", "inflated", "cloning")
FORBIDDEN_FEATURES = {"fraud_label", "fraud_type", "claim_id", "patient_id", "faskes_id"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_claims(path: Path | None = None) -> pd.DataFrame:
    path = path or ML_DIR / "data" / "claims_synthetic.csv"
    text_columns = ["claim_id", "patient_id", "faskes_id", "faskes_class",
                    "faskes_ownership", "service_type", "dx", "severity", "proc", "fraud_type"]
    frame = pd.read_csv(path, dtype={col: str for col in text_columns},
                        parse_dates=["admit_date", "discharge_date"])
    missing = set((*FEATURE_INPUT_COLUMNS, "claim_id", "fraud_label", "fraud_type")) - set(frame)
    if missing:
        raise ValueError(f"Missing CSV columns: {sorted(missing)}")
    if frame.isna().any().any() or frame.claim_id.duplicated().any():
        raise ValueError("Input contains missing values or duplicate claim IDs.")
    if not frame.fraud_label.isin([0, 1]).all():
        raise ValueError("Unexpected evaluation labels.")
    if set(frame.fraud_type) - {"none", *FRAUD_TYPES}:
        raise ValueError("Unexpected evaluation fraud types.")
    if not (frame.fraud_label.eq(1) == frame.fraud_type.ne("none")).all():
        raise ValueError("Evaluation label/type mismatch.")
    return frame


def _relative_linf_nearest(frame: pd.DataFrame, block_size: int = 128) -> np.ndarray:
    """Exact max_i |a_i-b_i|/max(a_i,b_i), zero/zero=0; exclude self.

    Blocking limits memory; it does not approximate the nearest neighbor.
    """
    values = frame.loc[:, list(COST_COLUMNS)].to_numpy(dtype=np.float64)
    result = np.ones(len(frame), dtype=np.float64)
    for indexes in frame.groupby(["faskes_id", "dx", "proc"], sort=False).indices.values():
        if len(indexes) < 2:
            continue
        group = values[indexes]
        for start in range(0, len(indexes), block_size):
            stop = min(start + block_size, len(indexes))
            numerator = np.abs(group[start:stop, None, :] - group[None, :, :])
            denominator = np.maximum(group[start:stop, None, :], group[None, :, :])
            relative = np.divide(numerator, denominator, out=np.zeros_like(numerator),
                                 where=denominator > 0)
            distances = relative.max(axis=2)
            distances[np.arange(stop - start), np.arange(start, stop)] = np.inf
            result[indexes[start:stop]] = distances.min(axis=1)
    return result


def _temporal_features(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    days = frame.admit_date.to_numpy(dtype="datetime64[D]").astype(np.int64)
    ends = frame.discharge_date.to_numpy(dtype="datetime64[D]").astype(np.int64)
    same_3d = np.zeros(len(frame), dtype=np.int64)
    repeat_14d = np.zeros(len(frame), dtype=np.int64)
    overlap = np.zeros(len(frame), dtype=np.int64)

    for indexes in frame.groupby(["patient_id", "faskes_id"], sort=False).indices.values():
        if len(indexes) < 2:
            continue
        ordered = indexes[np.argsort(days[indexes], kind="stable")]
        dates = days[ordered]
        left = np.searchsorted(dates, dates - 3, side="left")
        right = np.searchsorted(dates, dates + 3, side="right")
        same_3d[ordered] = right - left - 1

    for indexes in frame.groupby(["patient_id", "dx", "proc"], sort=False).indices.values():
        if len(indexes) < 2:
            continue
        ordered = indexes[np.argsort(days[indexes], kind="stable")]
        dates = days[ordered]
        earliest = np.searchsorted(dates, dates - 14, side="left")
        # A same-day concurrent claim is not a strictly previous admission.
        before_today = np.searchsorted(dates, dates, side="left")
        repeat_14d[ordered] = (before_today > earliest).astype(np.int64)

    inpatient = frame.loc[frame.service_type.eq("RITL") & frame.discharge_date.gt(frame.admit_date)]
    facilities = frame.faskes_id.to_numpy()
    for indexes in inpatient.groupby("patient_id", sort=False).groups.values():
        indexes = np.asarray(indexes, dtype=np.int64)
        if len(indexes) < 2:
            continue
        # Half-open intervals [admit, discharge); mark both conflicting claims.
        conflicts = (days[indexes, None] < ends[indexes][None, :])
        conflicts &= days[indexes][None, :] < ends[indexes, None]
        conflicts &= facilities[indexes, None] != facilities[indexes][None, :]
        overlap[indexes] = conflicts.any(axis=1).astype(np.int64)
    return same_3d, repeat_14d, overlap


def build_features(claims: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Return (27 numeric/encoded features, metadata with peer_median).

    Peer medians and history are calculated on this unlabeled batch, as required
    by the brief. This is a retrospective/transductive cohort transformation,
    not an assertion of prospective or fully inductive evaluation.
    """
    # Explicit input whitelist prevents labels, claim IDs or label-derived values
    # from entering any feature calculation, even when callers pass the full CSV.
    frame = claims.loc[:, list(FEATURE_INPUT_COLUMNS)].copy().reset_index(drop=True)
    for col in ("admit_date", "discharge_date"):
        frame[col] = pd.to_datetime(frame[col], errors="raise")
    numeric = frame.loc[:, [*COST_COLUMNS, "claim_total", "los"]].to_numpy(dtype=float)
    if not np.isfinite(numeric).all() or (numeric < 0).any() or frame.claim_total.le(0).any():
        raise ValueError("Costs/LOS must be finite and nonnegative; totals must be positive.")
    if frame.discharge_date.lt(frame.admit_date).any():
        raise ValueError("Discharge precedes admission.")
    for column, mapping in CATEGORICAL_MAPS.items():
        unknown = set(frame[column]) - set(mapping)
        if unknown:
            raise ValueError(f"Unknown categories in {column}: {sorted(unknown)}")

    features = pd.DataFrame(index=frame.index)
    peer_group = frame.groupby(["dx", "faskes_class", "service_type"], sort=False)
    median = peer_group.claim_total.transform("median")
    count = peer_group.claim_total.transform("size")
    dx_median = frame.groupby("dx", sort=False).claim_total.transform("median")
    median = median.where(count.ge(20), dx_median)
    proc_median = frame.groupby(["proc", "faskes_class"], sort=False).claim_total.transform("median")
    features["dx_peer_ratio"] = frame.claim_total / median
    features["proc_peer_ratio"] = frame.claim_total / proc_median
    features["ratio_gap"] = features.proc_peer_ratio / features.dx_peer_ratio

    for name in COMPONENTS:
        component = frame[f"cost_{name}"]
        component_median = frame.groupby("dx", sort=False)[f"cost_{name}"].transform("median")
        features[f"comp_ratio_{name}"] = np.divide(component, component_median,
                                                    out=np.ones(len(frame)), where=component_median.gt(0))
        features[f"comp_share_{name}"] = component / frame.claim_total

    dx_count = frame.groupby("dx", sort=False).dx.transform("size")
    pair_count = frame.groupby(["dx", "proc"], sort=False).dx.transform("size")
    features["pair_rarity"] = 1.0 - pair_count / dx_count
    los_median = frame.groupby("dx", sort=False).los.transform("median")
    features["los_ratio"] = np.divide(frame.los, los_median, out=np.ones(len(frame)), where=los_median.gt(0))
    features.loc[frame.service_type.eq("RJTL"), "los_ratio"] = 1.0
    features["nn_dist"] = _relative_linf_nearest(frame)
    features["patient_n_claims"] = frame.groupby("patient_id", sort=False).patient_id.transform("size")
    features["patient_once"] = features.patient_n_claims.eq(1).astype(int)
    features["same_pat_fk_3d"], features["repeat_14d"], features["inpatient_overlap"] = _temporal_features(frame)

    # Include zero-volume calendar days in the observation window. Active-days-
    # only means would be >=1 and make the specified 0.05 floor meaningless.
    window_days = int((frame.admit_date.max() - frame.admit_date.min()).days) + 1
    facility_n = frame.groupby("faskes_id", sort=False).faskes_id.transform("size")
    facility_day_n = frame.groupby(["faskes_id", "admit_date"], sort=False).faskes_id.transform("size")
    features["fk_day_burst"] = facility_day_n / (facility_n / window_days).clip(lower=0.05)
    ratio_sum = features.dx_peer_ratio.groupby(frame.faskes_id, sort=False).transform("sum")
    features["fk_loo_ratio"] = np.divide(ratio_sum - features.dx_peer_ratio, facility_n - 1,
                                          out=np.ones(len(frame)), where=facility_n.gt(1))
    for column, mapping in CATEGORICAL_MAPS.items():
        features[column] = frame[column].map(mapping).astype(int)

    features = features.loc[:, list(FEATURE_NAMES)]
    if FORBIDDEN_FEATURES.intersection(features.columns):
        raise AssertionError("Forbidden column entered feature matrix.")
    if features.shape != (len(frame), 27) or not np.isfinite(features.to_numpy()).all():
        raise AssertionError("Invalid feature matrix shape or non-finite values.")
    metadata = pd.DataFrame({"peer_median": median, "observation_window_days": window_days})
    return features, metadata


def sanity_checks(features: pd.DataFrame, claims: pd.DataFrame) -> list[dict]:
    """Evaluation-only diagnostics. Never called from build_features."""
    types = claims.fraud_type.reset_index(drop=True)
    normal = claims.fraud_label.reset_index(drop=True).eq(0)
    checks: list[dict] = []

    def add(name: str, actual: float, expected: float, unit: str = "value", mode: str = "target", note: str = ""):
        if mode == "upper":
            deviation = max(0.0, actual / expected - 1)
            within_document = actual < expected
        elif mode == "lower":
            deviation = max(0.0, 1 - actual / expected)
            within_document = actual > expected
        elif mode == "near_zero":
            # Relative deviation from zero is undefined. Predeclared 1pp bound.
            deviation = None
            within_document = actual <= 0.01
        else:
            deviation = abs(actual - expected) / expected
            within_document = deviation <= 0.20 + 1e-12
        passed = within_document if mode == "near_zero" else deviation <= 0.20 + 1e-12
        checks.append({"check": name, "actual": float(actual), "expected": float(expected),
                       "unit": unit, "mode": mode, "relative_deviation": deviation,
                       "within_document": bool(within_document), "passed_20pct_gate": bool(passed), "note": note})

    add("nn_dist < 0.015 | cloning", features.loc[types.eq("cloning"), "nn_dist"].lt(0.015).mean(), 1.0, "rate")
    add("nn_dist < 0.015 | normal", features.loc[normal, "nn_dist"].lt(0.015).mean(), 0.01, "rate", "upper")
    add("same_pat_fk_3d >= 1 | unbundling", features.loc[types.eq("unbundling"), "same_pat_fk_3d"].ge(1).mean(), 1.0, "rate")
    add("same_pat_fk_3d >= 1 | repeat", features.loc[types.eq("repeat"), "same_pat_fk_3d"].ge(1).mean(), 0.20, "rate")
    add("same_pat_fk_3d >= 1 | normal", features.loc[normal, "same_pat_fk_3d"].ge(1).mean(), 0.0, "rate", "near_zero", "Predeclared absolute bound <=1 percentage point; relative deviation from 0 undefined.")
    add("median ratio_gap | upcoding", features.loc[types.eq("upcoding"), "ratio_gap"].median(), 2.3)
    add("median ratio_gap | others", features.loc[types.ne("upcoding"), "ratio_gap"].median(), 1.0)
    add("median pair_rarity | upcoding", features.loc[types.eq("upcoding"), "pair_rarity"].median(), 0.99)
    add("median pair_rarity | normal", features.loc[normal, "pair_rarity"].median(), 0.03)
    add("median dx_peer_ratio | inflated", features.loc[types.eq("inflated"), "dx_peer_ratio"].median(), 1.3)
    add("median dx_peer_ratio | unbundling", features.loc[types.eq("unbundling"), "dx_peer_ratio"].median(), 0.45)
    add("median dx_peer_ratio | others", features.loc[~types.isin(["inflated", "unbundling"]), "dx_peer_ratio"].median(), 1.0)
    flagged = features.inpatient_overlap.eq(1)
    phantom_fraction = float(types[flagged].eq("phantom").mean()) if flagged.any() else 0.0
    add("phantom fraction | inpatient_overlap=1", phantom_fraction, 0.50, "rate", "lower", "Document: majority (>50%) of flagged claims are phantom. Both conflicting inpatient claims must be marked without labels.")
    return checks


def format_check(check: dict) -> tuple[str, str, str, str]:
    rate = check["unit"] == "rate"
    fmt = (lambda value: f"{value * 100:.3f}%") if rate else (lambda value: f"{value:.5f}")
    actual = fmt(check["actual"])
    expected = fmt(check["expected"])
    if check["mode"] == "upper":
        expected = "<" + expected
    elif check["mode"] == "lower":
        expected = ">" + expected
    elif check["mode"] == "near_zero":
        expected = "~0%; bound <=1pp"
    deviation = "n/a" if check["relative_deviation"] is None else f"{check['relative_deviation'] * 100:.2f}%"
    state = "PASS" if check["passed_20pct_gate"] else "STOP"
    return actual, expected, deviation, state


def run_feature_stage(artifact_dir: Path | None = None) -> dict:
    start = perf_counter()
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    source_paths = [ML_DIR / "data" / "claims_synthetic.csv", ML_DIR / "data" / "faskes.csv", ML_DIR / "src" / "generate_claims.py"]
    hashes_before = {str(p.relative_to(ML_DIR)).replace("\\", "/"): sha256(p) for p in source_paths}
    claims = load_claims()
    features, metadata = build_features(claims)
    checks = sanity_checks(features, claims)
    passed = all(c["passed_20pct_gate"] for c in checks)
    group_counts = features.assign(fraud_type=claims.fraud_type).groupby("fraud_type").agg(
        n_claims=("inpatient_overlap", "size"), overlap_flagged=("inpatient_overlap", "sum"))
    hashes_after = {str(p.relative_to(ML_DIR)).replace("\\", "/"): sha256(p) for p in source_paths}
    if hashes_before != hashes_after:
        raise AssertionError("Input CSV or generator changed during feature computation.")
    report = {
        "seed": SEED, "synthetic": True, "n_claims": len(claims), "n_features": features.shape[1],
        "feature_names": list(FEATURE_NAMES), "numeric_features": list(NUMERIC_FEATURES),
        "feature_input_whitelist": list(FEATURE_INPUT_COLUMNS),
        "forbidden_features_absent": not bool(FORBIDDEN_FEATURES.intersection(features.columns)),
        "source_sha256": hashes_after, "observation_window_days": int(metadata.observation_window_days.iloc[0]),
        "checks": checks, "passed_20pct_gate": passed,
        "inpatient_overlap_by_label_for_diagnostics_only": group_counts.to_dict(orient="index"),
        "duration_seconds": round(perf_counter() - start, 3),
        "notes": [
            "All data are synthetic; this is not a real-world performance claim.",
            "Raw labels and claim_id are excluded before any feature computation.",
            "Raw patient_id/faskes_id define groups only; neither is a model input.",
            "Historical and peer features use the unlabeled full retrospective batch.",
            "Inpatient intervals are half-open, cross-facility, and both members of a conflicting pair are flagged.",
            "No model is trained by the feature-stage command.",
        ],
    }
    features.to_parquet(artifact_dir / "features.parquet", index=False)
    metadata.to_parquet(artifact_dir / "feature_metadata.parquet", index=False)
    (artifact_dir / "feature_sanity.json").write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(f"Synthetic claims={len(claims)}, features={features.shape[1]}, seed={SEED}")
    print(f"{'Check':<43} | {'Actual':>11} | {'Expected':>19} | {'Deviation':>10} | Gate")
    print("-" * 105)
    for check in checks:
        actual, expected, deviation, state = format_check(check)
        print(f"{check['check']:<43} | {actual:>11} | {expected:>19} | {deviation:>10} | {state}")
    print("\nOverlap counts by evaluation type (diagnostics only):")
    print(group_counts.to_string())
    print(f"\nFeature stage duration: {report['duration_seconds']:.3f} seconds")
    print(f"SANITY GATE: {'PASS' if passed else 'STOP - deviation exceeds tolerance; no training allowed'}")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Build label-free features and enforce the sanity gate before training.")
    parser.parse_args()
    report = run_feature_stage()
    return 0 if report["passed_20pct_gate"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
