"""OOF-fold SHAP, label-free pattern hints, and five contract JSON exports."""

from __future__ import annotations

import ast
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter

import numpy as np
import pandas as pd
import shap
from scipy.special import expit
from xgboost import XGBClassifier

from .audit import run_leakage_audit
from .evaluate import top_indexes
from .features import COMPONENTS, ML_DIR
from .train import load_feature_bundle, write_json
from .validate_export import EXPORT_FILES, OFFICIAL_PATTERNS, validate_directory, validate_payloads

COMPONENT_LABELS = {"room": "kamar", "procedure": "tindakan", "drug": "obat",
                    "labrad": "laboratorium/radiologi", "other": "lainnya"}
LABELS = {
    "dx_peer_ratio": "Rasio biaya vs peer diagnosis", "proc_peer_ratio": "Rasio biaya vs peer prosedur",
    "ratio_gap": "Ketidakseimbangan rasio diagnosis–prosedur", "pair_rarity": "Kelangkaan diagnosis–tindakan",
    "los_ratio": "Durasi vs median diagnosis", "nn_dist": "Kemiripan komponen biaya",
    "patient_n_claims": "Jumlah klaim pasien", "patient_once": "Pasien muncul sekali",
    "same_pat_fk_3d": "Klaim berdekatan dalam 3 hari", "repeat_14d": "Pengulangan dalam 14 hari",
    "inpatient_overlap": "Rawat inap tumpang tindih terarah", "fk_day_burst": "Lonjakan klaim harian faskes",
    "fk_loo_ratio": "Kecenderungan biaya faskes", "faskes_class": "Kelas faskes",
    "service_type": "Tipe layanan", "severity": "Tingkat keparahan",
    "faskes_ownership": "Kepemilikan faskes", "if_score": "Persentil anomali Isolation Forest",
}
for component in COMPONENTS:
    LABELS[f"comp_ratio_{component}"] = f"Rasio komponen {COMPONENT_LABELS[component]}"
    LABELS[f"comp_share_{component}"] = f"Porsi komponen {COMPONENT_LABELS[component]}"


def diagnosis_names() -> dict[str, str]:
    # Parse the catalog as literal data; never import/run the generator.
    tree = ast.parse((ML_DIR / "src" / "generate_claims.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "DX" for t in node.targets):
            return {row[0]: row[1] for row in ast.literal_eval(node.value)}
    raise ValueError("DX catalog not found in generator source.")


def decimal(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def reason_text(name: str, values: dict, claim: dict, dx_name: str) -> str:
    value = float(values[name])
    if name == "dx_peer_ratio":
        return f"Biaya {decimal(value)} kali median faskes sejenis untuk {dx_name}"
    if name == "proc_peer_ratio":
        return f"Biaya {decimal(value)} kali median peer untuk prosedur {claim['proc']}"
    if name == "ratio_gap":
        return f"Perbandingan rasio biaya prosedur dan diagnosis {decimal(value)}; kesesuaian kode perlu diperiksa"
    if name == "pair_rarity":
        return f"Kelangkaan pasangan diagnosis dan tindakan {decimal(value * 100)}%; konteks layanan perlu diperiksa"
    if name == "nn_dist":
        return f"Selisih relatif maksimum komponen biaya dengan klaim terdekat di faskes sama {decimal(value * 100)}%"
    if name == "same_pat_fk_3d":
        return f"Pasien yang sama punya {int(value)} klaim lain di faskes ini dalam selisih 3 hari"
    if name == "repeat_14d":
        return ("Diagnosis dan tindakan sama sudah diklaim pasien ini dalam 14 hari sebelumnya; perlu diperiksa"
                if value else "Tidak ditemukan klaim diagnosis dan tindakan sama dalam 14 hari sebelumnya")
    if name == "inpatient_overlap":
        return ("Rawat inap bertumpang tindih dengan rawat inap yang dimulai lebih dahulu atau pada tanggal sama di faskes lain"
                if value else "Tidak ditemukan overlap terarah dengan rawat inap di faskes lain")
    if name == "patient_once":
        return "Pasien hanya muncul sekali dalam batch klaim" if value else "Pasien memiliki lebih dari satu klaim dalam batch"
    if name == "patient_n_claims":
        return f"Pasien memiliki {int(value)} klaim dalam batch observasi"
    if name == "fk_day_burst":
        return f"Faskes mengajukan {decimal(value)} kali rata-rata klaim harian pada tanggal masuk ini"
    if name == "fk_loo_ratio":
        return f"Rata-rata rasio biaya klaim lain di faskes ini {decimal(value)} kali median peer"
    if name == "los_ratio":
        return ("Pelayanan rawat jalan tanpa menginap" if claim["service_type"] == "RJTL"
                else f"Durasi rawat {claim['los']} hari, {decimal(value)} kali median diagnosis sejenis")
    if name.startswith("comp_ratio_"):
        label = COMPONENT_LABELS[name.removeprefix("comp_ratio_")]
        return f"Komponen {label} {decimal(value)} kali median komponen untuk diagnosis sejenis"
    if name.startswith("comp_share_"):
        label = COMPONENT_LABELS[name.removeprefix("comp_share_")]
        return f"Komponen {label} mencakup {decimal(value * 100)}% dari biaya klaim"
    if name == "if_score":
        return f"Persentil anomali Isolation Forest {decimal(value)} dari 100; bukan probabilitas fraud"
    if name == "faskes_class":
        return f"Klaim berasal dari faskes kelas {claim['faskes_class']}; perlu dinilai dalam konteks peer"
    if name == "service_type":
        return f"Jenis layanan klaim adalah {claim['service_type']}"
    if name == "severity":
        return f"Keparahan diagnosis yang diklaim tingkat {claim['severity']}"
    if name == "faskes_ownership":
        return f"Kepemilikan faskes {claim['faskes_ownership']}; kategori bukan bukti penyimpangan"
    raise KeyError(name)


def feature_dictionary(names: list[str]) -> list[dict]:
    descriptions = {
        "dx_peer_ratio": "Biaya / median diagnosis, kelas faskes dan layanan; fallback diagnosis untuk peer kurang dari 20 klaim.",
        "proc_peer_ratio": "Biaya / median prosedur dan kelas faskes.",
        "ratio_gap": "Rasio peer prosedur dibagi rasio peer diagnosis.",
        "pair_rarity": "Satu dikurangi frekuensi pasangan diagnosis–prosedur dalam diagnosis itu.",
        "nn_dist": "Jarak relatif L-infinity minimum antarkomponen biaya pada faskes, diagnosis dan prosedur sama; bukan jarak ke diri sendiri.",
        "inpatient_overlap": "Overlap rawat inap lintas faskes, hanya klaim masuk lebih belakangan atau sama tanggal; interval setengah terbuka.",
        "fk_loo_ratio": "Rata-rata rasio biaya klaim lain pada faskes, tanpa klaim yang sedang dinilai.",
        "if_score": "Persentil anomali IF pada seluruh batch tanpa label; skor makin tinggi berarti makin janggal.",
    }
    return [{"feature": name, "label": LABELS[name],
             "explain": descriptions.get(name, f"{LABELS[name]}; dihitung tanpa label fraud sesuai kamus fitur ML."),
             "template": f"{LABELS[name]}: {{value}}; kontribusi model perlu ditinjau bersama konteks klaim."} for name in names]


def infer_patterns(values: np.ndarray, contributions: np.ndarray, index: dict[str, int]) -> list[str]:
    """Eligibility from the fixed rules only; SHAP ranks eligible hints."""
    v = lambda name: float(values[index[name]])
    candidates = [
        (v("inpatient_overlap") == 1 or (v("patient_once") == 1 and v("fk_day_burst") >= 3), 0,
         ("inpatient_overlap", "patient_once", "fk_day_burst")),
        (v("repeat_14d") == 1, 1, ("repeat_14d",)),
        (v("pair_rarity") >= 0.9 or v("ratio_gap") >= 1.6, 2, ("pair_rarity", "ratio_gap")),
        (v("same_pat_fk_3d") >= 1 and v("dx_peer_ratio") < 0.8, 3, ("same_pat_fk_3d", "dx_peer_ratio")),
        (v("dx_peer_ratio") >= 1.25, 4, ("dx_peer_ratio", *(f"comp_ratio_{c}" for c in COMPONENTS))),
        (v("nn_dist") < 0.015, 5, ("nn_dist",)),
    ]
    eligible = [(max(abs(float(contributions[index[n]])) for n in related), pattern)
                for flag, pattern, related in candidates if flag]
    eligible.sort(key=lambda item: (-item[0], item[1]))
    return [OFFICIAL_PATTERNS[pattern] for _, pattern in eligible[:2]]


def compute_oof_shap(x: pd.DataFrame, artifact_dir: Path, folds: np.ndarray,
                     predictions: np.ndarray) -> tuple[np.ndarray, dict]:
    values = np.zeros(x.shape, dtype=np.float32)
    bases = np.zeros(len(x), dtype=np.float64)
    max_error = 0.0
    for fold in range(5):
        indexes = np.flatnonzero(folds == fold)
        model = XGBClassifier(n_jobs=4, device="cpu")
        model.load_model(artifact_dir / "models" / f"hybrid_fold_{fold}.ubj")
        model.get_booster().set_param({"nthread": 4})
        explainer = shap.TreeExplainer(model.get_booster(), model_output="raw", feature_perturbation="tree_path_dependent")
        contributions = np.asarray(explainer.shap_values(x.iloc[indexes], check_additivity=True))
        if contributions.shape != (len(indexes), x.shape[1]):
            raise AssertionError("Unexpected TreeExplainer output shape.")
        values[indexes] = contributions
        bases[indexes] = float(np.asarray(explainer.expected_value).item())
        reconstructed = expit(bases[indexes] + contributions.sum(axis=1))
        error = float(np.max(np.abs(reconstructed - predictions[indexes])))
        max_error = max(max_error, error)
        if error > 1e-5:
            raise AssertionError(f"SHAP does not reconstruct OOF predictions for fold {fold}: {error}")
        print(f"OOF SHAP fold {fold + 1}/5: rows={len(indexes)}, max probability reconstruction error={error:.3g}", flush=True)
    if not np.isfinite(values).all():
        raise AssertionError("Non-finite SHAP values.")
    np.save(artifact_dir / "shap_values.npy", values)
    np.save(artifact_dir / "shap_base_values.npy", bases)
    return values, {"model_output": "raw margin (log-odds), not probability units",
                    "explainer": "shap.TreeExplainer; tree_path_dependent; corresponding OOF fold model",
                    "n_claims": len(x), "max_probability_reconstruction_error": max_error,
                    "reasons_selection": "Three largest positive contributions if available; fill with largest absolute nonzero negative contributions only when fewer than three positives."}


def run_export(artifact_dir: Path | None = None, output_dir: Path | None = None) -> dict:
    start = perf_counter()
    artifact_dir = artifact_dir or ML_DIR / "artifacts"
    output_dir = output_dir or ML_DIR.parent / "web" / "public" / "data"
    audit = run_leakage_audit(artifact_dir)
    claims, features, _ = load_feature_bundle(artifact_dir)
    metadata = pd.read_parquet(artifact_dir / "feature_metadata.parquet")
    training = json.loads((artifact_dir / "training_manifest.json").read_text(encoding="utf-8"))
    report = json.loads((artifact_dir / "model_report.json").read_text(encoding="utf-8"))
    with np.load(artifact_dir / "oof_predictions.npz", allow_pickle=False) as saved:
        if_score, hybrid_probability, folds = saved["if_only"], saved["hybrid"], saved["fold"]
    x = features.astype(np.float32).assign(if_score=if_score.astype(np.float32))
    names = list(x.columns)
    shap_values, shap_audit = compute_oof_shap(x, artifact_dir, folds, hybrid_probability)
    write_json(artifact_dir / "shap_audit.json", shap_audit)
    mean_abs = np.abs(shap_values).mean(axis=0, dtype=np.float64)
    report["feature_importance"] = sorted([
        {"feature": name, "label": LABELS[name], "importance": float(mean_abs[i]),
         "mean_abs_shap": float(mean_abs[i]), "gain": training["hybrid_normalized_gain"][name]}
        for i, name in enumerate(names)], key=lambda f: -f["importance"])
    report["feature_importance_definition"] = "importance=mean absolute OOF SHAP in raw log-odds; gain=mean normalized gain over five hybrid models"
    report["shap"] = shap_audit
    report["leakage_audit"] = {k: audit[k] for k in ("triggered_by_high_metrics", "forbidden_model_features", "label_leakage_detected",
                                                     "full_dataset_features_equal_after_label_removal")}
    report["notes"].append("SHAP berasal dari model fold yang menilai klaim; kontribusi memakai satuan log-odds dan lolos rekonstruksi probabilitas OOF.")

    n = len(claims)
    order = top_indexes(hybrid_probability, 100)
    # Break probability ties by original row order, independent of labels.
    risk_score = np.empty(n, dtype=np.int32)
    risk_score[order] = np.rint(np.arange(n, 0, -1) / n * 100).astype(np.int32)
    n_high, n_priority = int(np.ceil(n * 0.03)), int(np.ceil(n * 0.10))
    tiers = np.full(n, "low", dtype="U6")
    tiers[order[:n_priority]] = "medium"
    tiers[order[:n_high]] = "high"
    peer = np.rint(metadata.peer_median.to_numpy()).astype(np.int64)
    total = np.rint(claims.claim_total.to_numpy()).astype(np.int64)
    excess = np.maximum(0, total - peer)
    indexes = {name: i for i, name in enumerate(names)}
    numeric = x.to_numpy()
    patterns = [infer_patterns(numeric[i], shap_values[i], indexes) for i in range(n)]
    diagnoses = diagnosis_names()
    exported_claims = []
    for row_index in order[:3000]:
        raw = claims.iloc[row_index].to_dict()
        dx_name = diagnoses[raw["dx"]]
        contributions = shap_values[row_index]
        positive = [i for i in np.argsort(-np.abs(contributions), kind="stable") if contributions[i] > 0]
        negative = [i for i in np.argsort(-np.abs(contributions), kind="stable") if contributions[i] < 0]
        chosen = (positive + negative)[:3]
        if len(chosen) != 3:
            raise AssertionError("Fewer than three nonzero SHAP contributions; cannot fabricate reasons.")
        values = dict(zip(names, numeric[row_index]))
        reasons = [{"feature": names[i], "text": reason_text(names[i], values, raw, dx_name),
                    "shap": float(contributions[i]), "direction": "up" if contributions[i] > 0 else "down"} for i in chosen]
        exported_claims.append({
            **{name: raw[name] for name in ("claim_id", "faskes_id", "faskes_class", "faskes_ownership", "service_type", "dx", "proc", "severity")},
            "patient_ref": "PX-" + hashlib.sha1(raw["patient_id"].encode("utf-8")).hexdigest()[:6],
            "dx_name": dx_name, "admit_date": raw["admit_date"].strftime("%Y-%m-%d"), "los": int(raw["los"]),
            "claim_total": int(total[row_index]), "peer_median": int(peer[row_index]), "est_excess": int(excess[row_index]),
            "risk_score": int(risk_score[row_index]), "risk_tier": str(tiers[row_index]),
            "if_score": int(np.rint(if_score[row_index])), "patterns": patterns[row_index], "reasons": reasons,
            "eval": {"label": int(raw["fraud_label"]), "type": raw["fraud_type"]}})

    facility_records = []
    for facility, group in claims.groupby("faskes_id", sort=True):
        ix = group.index.to_numpy()
        counts = {pattern: sum(pattern in patterns[i] for i in ix) for pattern in OFFICIAL_PATTERNS}
        high = int(np.count_nonzero(tiers[ix] == "high"))
        facility_records.append({"faskes_id": facility, "faskes_class": group.faskes_class.iloc[0],
                                 "faskes_ownership": group.faskes_ownership.iloc[0], "n_claims": len(ix), "n_high": high,
                                 "high_rate": high / len(ix), "avg_risk": float(risk_score[ix].mean()),
                                 "est_excess_total": int(excess[ix].sum()), "pattern_counts": counts})
    facility_records.sort(key=lambda f: (-f["high_rate"], -f["avg_risk"], f["faskes_id"]))
    for rank, facility in enumerate(facility_records, start=1):
        facility["risk_rank"] = rank
    histogram, edges = np.histogram(risk_score, bins=np.arange(0, 101, 5))
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(), "data_source": "ml_oof",
        "dataset": {"n_claims": n, "n_faskes": len(facility_records), "n_patients": int(claims.patient_id.nunique()),
                    "fraud_rate": float(claims.fraud_label.mean()), "synthetic": True},
        "kpi": {"n_high": n_high, "n_medium": n_priority - n_high, "n_low": n - n_priority,
                "est_excess_total_idr": int(excess.sum()), "n_faskes_high_risk": sum(f["n_high"] > 0 for f in facility_records)},
        "tiers": {"high_top_pct": 3, "medium_top_pct": 10,
                  "score_cut_high": int(risk_score[order[n_high - 1]]), "score_cut_medium": int(risk_score[order[n_priority - 1]])},
        "score_hist": {"bin_edges": edges.tolist(), "counts": histogram.tolist()},
        "disclaimer": "Data sintetis. Bukan data peserta JKN. Skor adalah rekomendasi prioritas pemeriksaan, bukan probabilitas fraud. Angka performa bukan klaim performa dunia nyata. Keputusan akhir ada pada auditor.",
    }
    payloads = {"summary.json": summary, "claims_flagged.json": exported_claims,
                "faskes_risk.json": facility_records, "model_report.json": report,
                "feature_dictionary.json": feature_dictionary(names)}
    validation = validate_payloads(payloads)
    snapshot_dir = artifact_dir / "exports"
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    for name in EXPORT_FILES:
        content = json.dumps(payloads[name], ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
        (snapshot_dir / name).write_text(content, encoding="utf-8")
        (output_dir / name).write_text(content, encoding="utf-8")
    validation = validate_directory(output_dir)
    write_json(artifact_dir / "model_report.json", report)
    result = {**validation, "shap": shap_audit, "duration_seconds": round(perf_counter() - start, 3)}
    write_json(artifact_dir / "export_manifest.json", result)
    print(f"SHAP and export complete: {result['duration_seconds']:.3f} seconds", flush=True)
    return result


if __name__ == "__main__":
    run_export()
