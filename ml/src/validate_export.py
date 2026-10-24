"""Validate the five JSON exports, consistency, privacy and size budget."""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from .features import ML_DIR

EXPORT_FILES = ("summary.json", "claims_flagged.json", "faskes_risk.json", "model_report.json", "feature_dictionary.json")
OFFICIAL_PATTERNS = (
    "Phantom billing (klaim palsu)", "Repeat billing (klaim berulang)",
    "Manipulasi diagnosis dan/atau tindakan (upcoding)", "Services unbundling / fragmentation",
    "Inflated bills (penggelembungan tagihan)", "Cloning (penjiplakan klaim)",
)


def validate_payloads(payloads: dict) -> dict:
    summary, claims = payloads["summary.json"], payloads["claims_flagged.json"]
    facilities, report = payloads["faskes_risk.json"], payloads["model_report.json"]
    dictionary = payloads["feature_dictionary.json"]
    if summary["dataset"]["synthetic"] is not True or summary.get("data_source") == "sample":
        raise AssertionError("Actual ML export must identify synthetic data and must not be sample fixtures.")
    if len(claims) != 3000 or len({c["claim_id"] for c in claims}) != 3000:
        raise AssertionError("Expected 3,000 distinct top claims.")
    required = {"claim_id", "patient_ref", "faskes_id", "faskes_class", "faskes_ownership", "service_type",
                "dx", "dx_name", "proc", "severity", "admit_date", "los", "claim_total", "peer_median", "est_excess",
                "risk_score", "risk_tier", "if_score", "patterns", "reasons", "eval"}
    feature_names = {f["feature"] for f in dictionary}
    for f in dictionary:
        if not {"feature", "label", "explain", "template"}.issubset(f):
            raise AssertionError("Incomplete feature dictionary.")
    for i, claim in enumerate(claims):
        if not required.issubset(claim):
            raise AssertionError("Missing claim fields.")
        if "patient_id" in claim or "fraud_label" in claim or "fraud_type" in claim:
            raise AssertionError("Raw private/evaluation fields leaked outside eval.")
        if not re.fullmatch(r"PX-[0-9a-f]{6}", claim["patient_ref"]):
            raise AssertionError("Invalid patient pseudonym.")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", claim["admit_date"]):
            raise AssertionError("Invalid date format.")
        if claim["risk_tier"] not in ("high", "medium", "low"):
            raise AssertionError("Invalid tier.")
        for score in (claim["risk_score"], claim["if_score"]):
            if type(score) is not int or not 0 <= score <= 100:
                raise AssertionError("Scores must be integer percentiles in [0,100].")
        if i and claim["risk_score"] > claims[i - 1]["risk_score"]:
            raise AssertionError("Claims not sorted descending by risk percentile.")
        if len(claim["patterns"]) > 2 or len(set(claim["patterns"])) != len(claim["patterns"]) or set(claim["patterns"]) - set(OFFICIAL_PATTERNS):
            raise AssertionError("Unexpected or too many pattern labels.")
        if len(claim["reasons"]) != 3 or len({r["feature"] for r in claim["reasons"]}) != 3:
            raise AssertionError("Expected three distinct reasons per claim.")
        for reason in claim["reasons"]:
            if reason["feature"] not in feature_names or not reason["text"] or reason["direction"] not in ("up", "down"):
                raise AssertionError("Invalid SHAP reason.")
            if (reason["shap"] > 0) != (reason["direction"] == "up") or reason["shap"] == 0:
                raise AssertionError("SHAP direction does not match contribution.")
        for name in ("claim_total", "peer_median", "est_excess"):
            if type(claim[name]) is not int or claim[name] < 0:
                raise AssertionError("Currency must be nonnegative integer rupiah.")
        if claim["est_excess"] != max(0, claim["claim_total"] - claim["peer_median"]):
            raise AssertionError("Estimated excess does not match rounded peer median.")
    n = summary["dataset"]["n_claims"]
    if sum(summary["score_hist"]["counts"]) != n or len(summary["score_hist"]["bin_edges"]) != len(summary["score_hist"]["counts"]) + 1:
        raise AssertionError("Histogram is inconsistent.")
    if sum(summary["kpi"][f"n_{t}"] for t in ("high", "medium", "low")) != n:
        raise AssertionError("Tier counts inconsistent.")
    if len(facilities) != summary["dataset"]["n_faskes"] or sum(f["n_claims"] for f in facilities) != n:
        raise AssertionError("Facility counts inconsistent.")
    if sum(f["n_high"] for f in facilities) != summary["kpi"]["n_high"]:
        raise AssertionError("High-risk counts inconsistent.")
    if sum(f["est_excess_total"] for f in facilities) != summary["kpi"]["est_excess_total_idr"]:
        raise AssertionError("Estimated excess aggregates inconsistent.")
    for f in facilities:
        if set(f["pattern_counts"]) - set(OFFICIAL_PATTERNS):
            raise AssertionError("Unexpected facility pattern labels.")
    if report["config"]["seed"] != 42 or report["config"]["folds"] != 5:
        raise AssertionError("Unexpected seed/fold configuration.")
    for section in (report["pr_auc"], *report["per_type_recall_at_5"].values(), *report["holdout"].values()):
        if set(section) != {"if_only", "xgb_only", "hybrid"} or any(not 0 <= v <= 1 for v in section.values()):
            raise AssertionError("Invalid model metric.")

    def finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise AssertionError("Non-finite JSON number.")
        if isinstance(value, dict):
            for child in value.values():
                finite(child)
        elif isinstance(value, list):
            for child in value:
                finite(child)
    finite(payloads)
    encoded = {name: json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
               for name, value in payloads.items()}
    total = sum(len(value) for value in encoded.values())
    if total > 6_000_000:
        raise AssertionError(f"Export exceeds conservative 6 MB size limit: {total}")
    return {"valid": True, "n_exported_claims": len(claims), "n_faskes": len(facilities),
            "total_json_bytes": total, "file_bytes": {name: len(value) for name, value in encoded.items()}}


def validate_directory(directory: Path | None = None) -> dict:
    directory = directory or ML_DIR.parent / "web" / "public" / "data"
    def reject_constant(value):
        raise ValueError(f"Non-standard JSON constant: {value}")
    payloads = {name: json.loads((directory / name).read_text(encoding="utf-8"), parse_constant=reject_constant)
                for name in EXPORT_FILES}
    result = validate_payloads(payloads)
    folder_bytes = sum(p.stat().st_size for p in directory.iterdir() if p.is_file())
    if folder_bytes > 6_000_000:
        raise AssertionError("Total data folder size exceeds 6 MB.")
    result["total_folder_bytes"] = folder_bytes
    print(f"Export validation PASS: {result['n_exported_claims']} claims, {result['n_faskes']} facilities, {folder_bytes} bytes total", flush=True)
    return result


if __name__ == "__main__":
    validate_directory()
