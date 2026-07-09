"""Tests that every generated level is solvable and well-formed (FR-5.2, FR-5.3)."""

import pytest

from engine import rules
from engine.generator import build_level, evenly_spread
from engine.levels import LEVEL_SPECS


def _ref_assignment(level):
    assignment = {}
    for did, members in enumerate(level["referenceSolution"]):
        for cid in members:
            assignment[cid] = did
    return assignment


@pytest.mark.parametrize("spec", LEVEL_SPECS, ids=[s["id"] for s in LEVEL_SPECS])
def test_every_level_is_solvable_and_minority(spec):
    level = build_level(spec)
    result = rules.validate(level, _ref_assignment(level))
    assert result["solved"], f"{spec['id']} not solved: {result}"
    assert result["seats"] == spec["minSeats"]

    # Jerry strictly < 50% of assignable cells (FR-1.2).
    party = rules.party_map(level)
    jerry = sum(1 for p in party.values() if p == "jerry")
    assert jerry * 2 < len(party)


def test_level4_compactness_at_least_c():
    level = build_level(LEVEL_SPECS[3])
    result = rules.validate(level, _ref_assignment(level))
    assert rules.grade_at_least(result["compactnessGrade"], "C")


def test_level5_has_twelve_void_cells():
    level = build_level(LEVEL_SPECS[4])
    voids = [c for c in level["cells"] if c["void"]]
    assert len(voids) == 12
    assert len(rules.assignable_ids(level)) == 132


def test_level6_efficiency_gap_meets_target():
    level = build_level(LEVEL_SPECS[5])
    result = rules.validate(level, _ref_assignment(level))
    assert result["efficiencyGap"] >= level["winCondition"]["minEfficiencyGap"]


def test_evenly_spread_returns_distinct_indices():
    for k, n in [(4, 2), (8, 5), (14, 8), (12, 7)]:
        spread = evenly_spread(k, n)
        assert len(spread) == n
        assert all(0 <= i < k for i in spread)
