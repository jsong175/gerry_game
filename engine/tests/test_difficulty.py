"""Tests for the FR-5.4 difficulty band (naive baselines, distribution, slack)."""

import pytest

from engine import difficulty, rules
from engine.generator import build_level, jerry_targets, max_extra_jerry
from engine.geometry import build_square
from engine.levels import LEVEL_SPECS

SPECS_BY_ID = {s["id"]: s for s in LEVEL_SPECS}


def _square_level(party_rows, k, size, win=None, level_id="TEST"):
    """A hand-built square level: ``party_rows`` is a list of 'jo' strings."""
    height = len(party_rows)
    width = len(party_rows[0])
    grid = build_square(width, height)
    lookup = {"j": "jerry", "o": "opponent"}
    return {
        "id": level_id,
        "name": "hand-built",
        "shape": "square",
        "gridWidth": width,
        "gridHeight": height,
        "districtCount": k,
        "districtSize": size,
        "winCondition": win
        or {"minSeats": 2, "compactnessMinGrade": None, "minEfficiencyGap": None},
        "cells": [
            {
                "id": c.id,
                "party": lookup[party_rows[c.row][c.col]],
                "fixed": False,
                "void": False,
                "col": c.col,
                "row": c.row,
            }
            for c in grid.cells
        ],
        "adjacency": grid.edge_list(),
        "referenceSolution": [],
    }


# A 4x4 board where Jerry (7 of 16, a minority) holds a strict majority of the top
# two rows: the all-rows baseline hands him 2 of 4 districts with no thought at all.
TRIVIAL_ROWS = ["jjjo", "jjjo", "oooo", "jooo"]

# The same 7 Jerry voters, interleaved so that no row, column, block, serpentine
# run or greedy flood-fill reaches the 2-seat target.
NON_TRIVIAL = ["jojo", "ojoj", "jojo", "ojoo"]


def test_naive_baseline_checker_flags_a_trivially_winnable_level():
    level = _square_level(TRIVIAL_ROWS, k=4, size=4)
    ok, winners = difficulty.check_naive_baselines(level)
    assert not ok
    assert "rows" in winners


def test_naive_baseline_checker_passes_a_real_level():
    level = _square_level(NON_TRIVIAL, k=4, size=4)
    ok, winners = difficulty.check_naive_baselines(level)
    assert ok, f"unexpected naive winners: {winners}"


def test_rows_and_columns_baselines_skip_geometries_that_do_not_admit_them():
    triangle = build_level(SPECS_BY_ID["L3"])
    assert difficulty.rows_baseline(triangle) is None
    assert difficulty.columns_baseline(triangle) is None
    # The lake breaks every rectangular carve-up on Level 5.
    lake = build_level(SPECS_BY_ID["L5"])
    assert difficulty.rows_baseline(lake) is None
    assert difficulty.blocks_baseline(lake) == {}
    # ...but the graph-walking baselines still apply there.
    assert "greedy" in difficulty.baseline_partitions(lake, ("greedy", "snake"))


def test_greedy_baseline_tiles_a_square_grid_contiguously():
    level = build_level(SPECS_BY_ID["L4"])
    districts = difficulty.greedy_baseline(level)
    assert districts is not None
    assert sorted(c for d in districts for c in d) == list(range(100))
    adj = rules.build_adjacency(level)
    ok, _, _ = rules.check_contiguity(adj, dict(enumerate(districts)))
    assert ok


def test_greedy_baseline_reports_no_partition_when_it_strands_itself():
    # On the triangular lattice a lowest-id flood-fill paints itself into a corner.
    # No partition means no naive win, which is what the gate cares about.
    assert difficulty.greedy_baseline(build_level(SPECS_BY_ID["L3"])) is None


def test_the_triangle_is_still_guarded_by_a_baseline_that_does_tile_it():
    triangle = build_level(SPECS_BY_ID["L3"])
    applicable = difficulty.baseline_partitions(triangle, difficulty.ALL_BASELINES)
    assert "snake" in applicable
    assignment = {c: d for d, g in enumerate(applicable["snake"]) for c in g}
    result = rules.validate(triangle, assignment)
    assert result["complete"], "the serpentine carve-up must be a legal partition"
    assert not result["solved"], "...that nonetheless loses"


def test_slack_checker_flags_a_zero_slack_level():
    # 2 seats x cells_to_win(4)=3 -> minimum 6 Jerry cells; this level ships exactly 6.
    level = _square_level(["jjjo", "jjjo", "oooo", "oooo"], k=4, size=4)
    assert difficulty.jerry_cells(level) == 6
    ok, actual, margin = difficulty.check_slack(level, margin=1)
    assert not ok
    assert actual == 0 and margin == 1


def test_slack_checker_passes_a_level_with_slack():
    level = _square_level(NON_TRIVIAL, k=4, size=4)
    assert difficulty.jerry_cells(level) == 7
    ok, actual, _ = difficulty.check_slack(level, margin=1)
    assert ok and actual == 1


def test_distribution_checker_flags_a_corner_packed_level():
    # Every one of the opponent's 60 voters sits in one contiguous block, exactly
    # the pre-clustering FR-5.4 forbids (and exactly how Level 4 used to ship).
    rows = ["o" * 10] * 6 + ["j" * 10] * 4
    level = _square_level(rows, k=10, size=10, level_id="L4")
    ok, detail = difficulty.check_distribution(level)
    assert not ok
    assert "opponent cluster of 60 cells" in detail


def test_distribution_checker_passes_a_distributed_level():
    ok, detail = difficulty.check_distribution(build_level(SPECS_BY_ID["L4"]))
    assert ok, detail


def test_max_extra_jerry_respects_the_under_half_ceiling():
    # L1: 4 districts of 4, 2 seats. Bare minimum 6 Jerry cells; 8 would tie 50%.
    assert max_extra_jerry(k=4, size=4, min_seats=2) == 1
    # L5: 12 districts of 11, 7 seats. Losing districts can absorb 5 Jerry each.
    assert max_extra_jerry(k=12, size=11, min_seats=7) == 23


def test_jerry_targets_give_winners_a_bare_majority_and_losers_the_slack():
    counts = jerry_targets(k=4, size=4, min_seats=2, extra=1)
    assert sorted(counts) == [0, 1, 3, 3]  # two bare 3-of-4 wins, one slack voter


@pytest.mark.parametrize("spec", LEVEL_SPECS, ids=[s["id"] for s in LEVEL_SPECS])
def test_every_generated_level_is_inside_the_difficulty_band(spec):
    level = build_level(spec)
    accepted, reason = difficulty.gate(level)
    assert accepted, f"{spec['id']}: {reason}"


def test_level1_is_not_solvable_by_four_horizontal_rows():
    level = build_level(SPECS_BY_ID["L1"])
    rows = difficulty.rows_baseline(level)
    assert rows is not None  # the baseline applies to a 4x4 grid...
    assignment = {cid: did for did, group in enumerate(rows) for cid in group}
    assert not rules.validate(level, assignment)["solved"]  # ...and it loses


def test_level5_ships_with_real_slack():
    level = build_level(SPECS_BY_ID["L5"])
    # The bug this gate exists to catch: Jerry held exactly 7 x 6 = 42 cells.
    assert difficulty.jerry_cells(level) > 42
    assert difficulty.slack(level) >= difficulty.SLACK_MARGINS["L5"]


def test_level4_opponent_voters_are_not_corner_packed():
    level = build_level(SPECS_BY_ID["L4"])
    assert difficulty.largest_opponent_cluster(level) <= difficulty.MAX_OPPONENT_CLUSTER["L4"]
    assert difficulty.max_local_opponent_share(level) <= difficulty.MAX_LOCAL_OPPONENT_SHARE["L4"]


def test_gate_reports_the_first_failing_bound():
    trivial = _square_level(TRIVIAL_ROWS, k=4, size=4)
    accepted, reason = difficulty.gate(trivial)
    assert not accepted and "naive baseline" in reason


def test_baseline_partitions_rejects_an_unknown_name():
    with pytest.raises(ValueError, match="unknown naive baseline"):
        difficulty.baseline_partitions(_square_level(NON_TRIVIAL, 4, 4), ("nope",))
