"""Unit tests for the shared rule logic (FR-3, FR-4)."""

from engine import rules
from engine.geometry import build_square


def make_square_level(party_rows, k, size, win=None):
    """Build a minimal square level dict from rows of 'j'/'o' chars."""
    height = len(party_rows)
    width = len(party_rows[0])
    grid = build_square(width, height)
    lookup = {"j": "jerry", "o": "opponent"}
    for c in grid.cells:
        c.party = lookup[party_rows[c.row][c.col]]
    return {
        "id": "T",
        "name": "test",
        "shape": "square",
        "gridWidth": width,
        "gridHeight": height,
        "districtCount": k,
        "districtSize": size,
        "winCondition": win or {"minSeats": 1, "compactnessMinGrade": None, "minEfficiencyGap": None},
        "cells": [
            {"id": c.id, "party": c.party, "fixed": False, "void": False, "col": c.col, "row": c.row}
            for c in grid.cells
        ],
        "adjacency": grid.edge_list(),
        "referenceSolution": [],
    }


def test_contiguity_pass_and_fail():
    level = make_square_level(["oo", "oo"], 1, 4)
    adj = rules.build_adjacency(level)
    # contiguous 2x2
    ok, bad_d, bad_c = rules.check_contiguity(adj, {0: [0, 1, 2, 3]})
    assert ok and not bad_d and not bad_c
    # two opposite corners are not connected within the district
    ok, bad_d, bad_c = rules.check_contiguity(adj, {0: [0, 3]})
    assert not ok
    assert bad_d == [0]
    assert set(bad_c) == {0, 3}  # whole broken district flagged


def test_parity():
    ok, bad = rules.check_parity({0: [0, 1], 1: [2, 3, 4]}, 2)
    assert not ok and bad == [1]
    ok, _ = rules.check_parity({0: [0, 1], 1: [2, 3]}, 2)
    assert ok


def test_coverage_detects_unassigned_and_void():
    assignable = {0, 1, 2, 3}
    ok, offending = rules.check_coverage(assignable, {0: 0, 1: 0})
    assert not ok and set(offending) == {2, 3}
    # assigning a non-assignable (void) cell is also an offence
    ok, offending = rules.check_coverage(assignable, {0: 0, 1: 0, 2: 0, 3: 0, 99: 1})
    assert not ok and 99 in offending


def test_district_count():
    assert rules.check_district_count({0: [1], 1: [2]}, 2)
    assert not rules.check_district_count({0: [1]}, 2)


def test_winner_and_ties():
    party = {0: "jerry", 1: "jerry", 2: "opponent", 3: "opponent"}
    assert rules.district_winner([0, 1, 2], party) == "jerry"
    assert rules.district_winner([0, 2, 3], party) == "opponent"
    assert rules.district_winner([0, 2], party) is None  # tie -> no winner (FR-4.2)


def test_seat_count():
    party = {i: ("jerry" if i < 3 else "opponent") for i in range(6)}
    groups = {0: [0, 1], 1: [2, 3], 2: [4, 5]}
    # d0 all jerry, d1 split (tie), d2 all opponent
    assert rules.seat_count(groups, party) == 1


def test_compactness_block_beats_row():
    # 5x2 compact block scores better (lower ratio, higher grade) than a 1x10 row.
    level = make_square_level(["o" * 10, "o" * 10], 2, 10)
    adj = rules.build_adjacency(level)
    block = {0: list(range(10)) + list(range(10, 20))}  # whole 10x2? build below
    # Build an actual 5x2 block vs a 1x10 row on a 10x2 grid.
    block_district = [0, 1, 2, 3, 4, 10, 11, 12, 13, 14]
    row_district = list(range(10))
    grade_block, ratio_block = rules.compactness(adj, {0: block_district})
    grade_row, ratio_row = rules.compactness(adj, {0: row_district})
    assert ratio_block < ratio_row
    assert grade_block == "A"
    assert rules.grade_at_least(grade_block, "C")


def test_efficiency_gap_favours_jerry_when_opponents_packed():
    # 2 districts of 3. Jerry wins d0 2-1 (thin); opponent wins d1 3-0 (packed).
    party = {0: "jerry", 1: "jerry", 2: "opponent", 3: "opponent", 4: "opponent", 5: "opponent"}
    groups = {0: [0, 1, 2], 1: [3, 4, 5]}
    gap = rules.efficiency_gap(groups, party, 6)
    # d0: jerry surplus 2-2=0 wasted, opp losing vote 1 wasted.
    # d1: opp surplus 3-2=1 wasted, jerry 0.
    # (opp_wasted 2 - jerry_wasted 0) / 6
    assert abs(gap - (2 / 6)) < 1e-9


def test_validate_solved_and_broken():
    win = {"minSeats": 1, "compactnessMinGrade": None, "minEfficiencyGap": None}
    level = make_square_level(["jj", "oo"], 2, 2, win)  # top row jerry, bottom opponent
    # districts = two rows: d0 = {0,1} jerry-win, d1 = {2,3} opponent
    assignment = {0: 0, 1: 0, 2: 1, 3: 1}
    result = rules.validate(level, assignment)
    assert result["solved"] and result["seats"] == 1 and result["complete"]

    # break contiguity: swap so d0={0,3} (diagonal, disconnected)
    broken = {0: 0, 3: 0, 1: 1, 2: 1}
    result = rules.validate(level, broken)
    assert not result["solved"]
    assert not result["perRule"]["contiguity"]
    assert set(result["offendingCells"]) >= {0, 3}

    # incomplete: leave a cell unassigned
    incomplete = {0: 0, 1: 0, 2: 1}
    result = rules.validate(level, incomplete)
    assert not result["complete"] and not result["perRule"]["coverage"]
