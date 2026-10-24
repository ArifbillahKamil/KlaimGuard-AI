"""Small independent examples for budget boundaries and fixed pattern rules."""

import unittest

import numpy as np

from src.evaluate import budget_metrics, top_indexes
from src.export import infer_patterns
from src.features import FEATURE_NAMES
from src.validate_export import OFFICIAL_PATTERNS


class PipelineChecks(unittest.TestCase):
    def test_budget_rounds_up_and_uses_stable_ties_without_labels(self):
        scores = np.array([0.9, 0.9, 0.5, 0.4, 0.1])
        np.testing.assert_array_equal(top_indexes(scores, 21), [0, 1])
        y = np.array([0, 1, 1, 0, 0])
        self.assertEqual(budget_metrics(y, scores, 21),
                         {"recall": 0.5, "precision": 0.5, "selected": 2, "true_positives": 1})

    def test_pattern_rules_are_not_labels_and_shap_only_orders_matches(self):
        names = [*FEATURE_NAMES, "if_score"]
        index = {name: i for i, name in enumerate(names)}
        values = np.zeros(len(names))
        contributions = np.zeros(len(names))
        values[index["nn_dist"]] = 0.01
        values[index["repeat_14d"]] = 1
        values[index["dx_peer_ratio"]] = 1.3
        contributions[index["nn_dist"]] = 0.7
        contributions[index["repeat_14d"]] = -1.1
        contributions[index["dx_peer_ratio"]] = 0.2
        self.assertEqual(infer_patterns(values, contributions, index), [OFFICIAL_PATTERNS[1], OFFICIAL_PATTERNS[5]])
        # A huge contribution cannot create an ineligible pattern.
        contributions[index["ratio_gap"]] = 99
        self.assertEqual(infer_patterns(values, contributions, index), [OFFICIAL_PATTERNS[1], OFFICIAL_PATTERNS[5]])

    def test_directed_overlap_pattern_works_on_equal_admission_flag(self):
        names = [*FEATURE_NAMES, "if_score"]
        index = {name: i for i, name in enumerate(names)}
        values = np.zeros(len(names))
        values[index["nn_dist"]] = 1
        values[index["dx_peer_ratio"]] = 1
        values[index["inpatient_overlap"]] = 1
        self.assertEqual(infer_patterns(values, np.ones(len(names)), index), [OFFICIAL_PATTERNS[0]])


if __name__ == "__main__":
    unittest.main()
