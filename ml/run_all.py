"""Run every stage from unchanged synthetic CSVs to validated JSON; no cache."""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd

from src.evaluate import run_evaluation
from src.export import run_export
from src.features import ML_DIR, run_feature_stage, sha256
from src.train import run_training, write_json
from src.validate_export import EXPORT_FILES


def web_fingerprints() -> dict[str, str]:
    root = ML_DIR.parent / "web"
    result = {}
    for directory, subdirs, files in os.walk(root):
        subdirs[:] = [name for name in subdirs if name not in {"node_modules", "dist", "qa-results", ".git"}]
        for name in files:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if relative not in {f"public/data/{filename}" for filename in EXPORT_FILES}:
                result[relative] = sha256(path)
    return result


def canonical_payload(value):
    if isinstance(value, dict):
        return {key: canonical_payload(child) for key, child in value.items() if key not in {"generated_at", "duration_seconds"}}
    if isinstance(value, list):
        return [canonical_payload(child) for child in value]
    return value


def verify_reproduction(actual: Path, reference: Path) -> dict:
    if actual.resolve() == reference.resolve():
        raise ValueError("Reproduction reference and output artifact directories must differ.")
    checks = {}
    for filename in ("oof_predictions.npz", "holdout_predictions.npz"):
        with np.load(actual / filename, allow_pickle=False) as current, np.load(reference / filename, allow_pickle=False) as old:
            if set(current.files) != set(old.files):
                raise AssertionError(f"Reproduction array keys differ: {filename}")
            for name in current.files:
                identical = np.array_equal(current[name], old[name])
                checks[f"{filename}:{name}"] = bool(identical)
    for filename in ("features.parquet", "feature_metadata.parquet"):
        pd.testing.assert_frame_equal(pd.read_parquet(actual / filename), pd.read_parquet(reference / filename), check_exact=True)
        checks[filename] = True
    for filename in ("shap_values.npy", "shap_base_values.npy"):
        checks[filename] = bool(np.array_equal(np.load(actual / filename), np.load(reference / filename)))
    for filename in EXPORT_FILES:
        current = json.loads((actual / "exports" / filename).read_text(encoding="utf-8"))
        old = json.loads((reference / "exports" / filename).read_text(encoding="utf-8"))
        checks[f"export:{filename}"] = canonical_payload(current) == canonical_payload(old)
    if not all(checks.values()):
        raise AssertionError(f"Reproduction differs: {[name for name, passed in checks.items() if not passed]}")
    return {"passed": True, "reference": str(reference), "checks": checks,
            "predictions_and_shap_bitwise_identical": True,
            "json_equal_except_runtime_metadata": True,
            "excluded_json_runtime_fields": ["generated_at", "duration_seconds"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, default=Path("artifacts"))
    parser.add_argument("--verify-against", type=Path)
    args = parser.parse_args()
    resolve = lambda path: path.resolve() if path.is_absolute() else (ML_DIR / path).resolve()
    artifact_dir = resolve(args.artifact_dir)
    reference = resolve(args.verify_against) if args.verify_against else None
    if reference and artifact_dir == reference:
        raise ValueError("Reference must be distinct from the new artifact output.")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    web_before = web_fingerprints()
    input_paths = [ML_DIR / "data" / "claims_synthetic.csv", ML_DIR / "data" / "faskes.csv", ML_DIR / "src" / "generate_claims.py"]
    inputs_before = {p.relative_to(ML_DIR).as_posix(): sha256(p) for p in input_paths}
    start = perf_counter()
    print("START: synthetic CSV -> features -> IF/OOF -> holdouts -> audit/SHAP -> validated JSON; seed=42; no cache", flush=True)
    sanity = run_feature_stage(artifact_dir)
    if not sanity["passed_20pct_gate"]:
        print("STOP: feature sanity gate failed. No training, holdout, SHAP or export.", flush=True)
        return 2
    training = run_training(artifact_dir)
    evaluation = run_evaluation(artifact_dir)
    export = run_export(artifact_dir)
    inputs_after = {p.relative_to(ML_DIR).as_posix(): sha256(p) for p in input_paths}
    if inputs_after != inputs_before or web_fingerprints() != web_before:
        raise AssertionError("Input/generator or non-data dashboard files changed.")
    reproduction = verify_reproduction(artifact_dir, reference) if reference else None
    result = {"seed": 42, "from_csv_without_cache": True,
              "duration_seconds": round(perf_counter() - start, 3),
              "stage_durations_seconds": {"features": sanity["duration_seconds"],
                                           "training": training["duration_seconds"],
                                           "evaluation_holdouts": evaluation["duration_seconds"],
                                           "audit_shap_export": export["duration_seconds"]},
              "source_sha256": inputs_after, "source_and_generator_unchanged": True,
              "non_data_dashboard_files_unchanged": True,
              "package_versions": {name: importlib.metadata.version(name) for name in
                                   ("numpy", "pandas", "scikit-learn", "xgboost", "shap", "pyarrow")},
              "export_validation": export, "reproduction": reproduction}
    write_json(artifact_dir / "pipeline_manifest.json", result)
    print(f"FULL PIPELINE PASS: {result['duration_seconds']:.3f} seconds; source and non-data web files unchanged", flush=True)
    if reproduction:
        print(f"REPRODUCTION PASS: {len(reproduction['checks'])} exact comparisons; predictions/SHAP bitwise identical; JSON equal excluding timestamps/durations", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
