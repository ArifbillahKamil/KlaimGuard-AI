"""Verify group boundaries and unchanged estimator settings independently."""

import unittest
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd

from src.train import XGB_PARAMS, fit_nested_model


class GroupedValidationChecks(unittest.TestCase):
    def test_inner_groups_separate_and_outer_test_not_fitted(self):
        x = pd.DataFrame({"signal": np.arange(60, dtype=float)})
        groups = np.repeat(np.arange(20), 3)
        y = np.arange(60) % 2
        types = np.where(y, "phantom", "none")
        train, test = np.arange(48), np.arange(48, 60)
        selector, final = MagicMock(), MagicMock()
        selector.best_iteration = 11
        with patch("src.train.XGBClassifier", side_effect=[selector, final]) as constructor:
            _, audit = fit_nested_model(x, y, types, train, test, inner_groups=groups)
        inner_train = selector.fit.call_args.args[0].index.to_numpy()
        inner_valid = selector.fit.call_args.kwargs["eval_set"][0][0].index.to_numpy()
        self.assertEqual(np.intersect1d(groups[inner_train], groups[inner_valid]).size, 0)
        self.assertEqual(np.intersect1d(groups[inner_valid], groups[test]).size, 0)
        np.testing.assert_array_equal(final.fit.call_args.args[0].index.to_numpy(), train)
        for name, value in XGB_PARAMS.items():
            self.assertEqual(constructor.call_args_list[0].kwargs[name], value)
        self.assertEqual(constructor.call_args_list[0].kwargs["early_stopping_rounds"], 30)
        self.assertEqual(constructor.call_args_list[1].kwargs["n_estimators"], 12)
        self.assertTrue(audit["outer_groups_disjoint"])
        self.assertTrue(audit["inner_groups_disjoint"])


if __name__ == "__main__":
    unittest.main()
