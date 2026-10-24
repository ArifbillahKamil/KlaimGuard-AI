"""Small hand-calculated checks for feature boundaries and label exclusion."""

import unittest

import numpy as np
import pandas as pd

from src.features import COST_COLUMNS, FEATURE_NAMES, build_features


def example():
    rows = []
    definitions = [
        ("P1", "RS1", "A09", "99.15", "RITL", "2025-01-01", "2025-01-06", [10, 20, 30, 40, 0]),
        ("P1", "RS1", "A09", "99.15", "RITL", "2025-01-03", "2025-01-05", [10.1, 20.2, 30.3, 40.4, 0]),
        ("P1", "RS2", "A09", "99.15", "RITL", "2025-01-04", "2025-01-08", [20, 40, 60, 80, 0]),
        ("P2", "RS3", "I10", "89.52", "RJTL", "2025-01-06", "2025-01-06", [0, 10, 5, 5, 0]),
    ]
    for i, (patient, facility, dx, proc, service, admit, discharge, costs) in enumerate(definitions):
        rows.append({"claim_id": f"C{i}", "patient_id": patient, "faskes_id": facility,
                     "dx": dx, "proc": proc, "service_type": service, "admit_date": admit,
                     "discharge_date": discharge, "los": (pd.Timestamp(discharge) - pd.Timestamp(admit)).days,
                     "faskes_class": "C", "faskes_ownership": "Pemerintah", "severity": "I",
                     **dict(zip(COST_COLUMNS, costs)), "claim_total": sum(costs),
                     "fraud_label": i % 2, "fraud_type": "arbitrary_evaluation_only"})
    return pd.DataFrame(rows)


class FeatureChecks(unittest.TestCase):
    def test_relative_distance_excludes_self_and_handles_zero(self):
        features, _ = build_features(example())
        np.testing.assert_allclose(features.nn_dist.to_numpy(), [1 / 101, 1 / 101, 1, 1])

    def test_history_and_directed_cross_facility_overlap(self):
        features, _ = build_features(example())
        self.assertEqual(features.same_pat_fk_3d.tolist(), [1, 1, 0, 0])
        self.assertEqual(features.repeat_14d.tolist(), [0, 1, 1, 0])
        self.assertEqual(features.inpatient_overlap.tolist(), [0, 0, 1, 0])
        self.assertEqual(features.patient_n_claims.tolist(), [3, 3, 3, 1])
        self.assertEqual(features.patient_once.tolist(), [0, 0, 0, 1])

    def test_labels_and_claim_ids_do_not_affect_features(self):
        raw = example()
        expected, _ = build_features(raw)
        altered = raw.assign(fraud_label=999, fraud_type="leak_marker", claim_id="unchanged_features")
        actual, _ = build_features(altered)
        stripped, _ = build_features(raw.drop(columns=["fraud_label", "fraud_type", "claim_id"]))
        pd.testing.assert_frame_equal(expected, actual)
        pd.testing.assert_frame_equal(expected, stripped)
        self.assertEqual(list(actual), list(FEATURE_NAMES))

    def test_medians_zero_components_outpatient_and_leave_one_out(self):
        features, metadata = build_features(example())
        np.testing.assert_allclose(metadata.peer_median.to_numpy(), [101, 101, 101, 20])
        self.assertEqual(features.comp_ratio_other.tolist(), [1, 1, 1, 1])
        self.assertEqual(features.pair_rarity.tolist(), [0, 0, 0, 0])
        self.assertEqual(features.los_ratio.iloc[3], 1)
        np.testing.assert_allclose(features.fk_loo_ratio.to_numpy(), [1, 100 / 101, 1, 1])

    def test_discharge_boundary_is_not_overlap_or_same_day_repeat(self):
        raw = example()
        raw.loc[2, ["admit_date", "discharge_date"]] = ["2025-01-06", "2025-01-08"]
        raw.loc[1, "admit_date"] = "2025-01-01"
        features, _ = build_features(raw)
        self.assertEqual(features.inpatient_overlap.tolist(), [0, 0, 0, 0])
        self.assertEqual(features.repeat_14d.iloc[1], 0)

    def test_earlier_admission_is_not_flagged(self):
        raw = example().iloc[[0, 2]].copy()
        features, _ = build_features(raw)
        self.assertEqual(features.inpatient_overlap.tolist(), [0, 1])

    def test_equal_admission_dates_flag_both(self):
        raw = example().iloc[[0, 2]].copy()
        raw.loc[:, "admit_date"] = "2025-01-01"
        features, _ = build_features(raw)
        self.assertEqual(features.inpatient_overlap.tolist(), [1, 1])


if __name__ == "__main__":
    unittest.main()
