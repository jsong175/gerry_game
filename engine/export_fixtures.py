"""Export shared rule fixtures for Python<->TypeScript parity.

Usage:  py -m engine.export_fixtures

Builds a set of (level, assignment) cases, computes the authoritative
``rules.validate`` output for each, and writes them to
``engine/fixtures/rule_cases.json``. The TypeScript test suite loads the same
file and asserts its port produces identical results (ARCHITECTURE.md: the rule
code exists on both sides and "cannot disagree").
"""

from __future__ import annotations

import json
from pathlib import Path

from . import rules
from .generator import build_level
from .geometry import build_square
from .levels import LEVEL_SPECS

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "rule_cases.json"


def _tiny_level(party_rows, k, size, win):
    height = len(party_rows)
    width = len(party_rows[0])
    grid = build_square(width, height)
    lookup = {"j": "jerry", "o": "opponent"}
    return {
        "id": "TINY",
        "name": "tiny",
        "shape": "square",
        "gridWidth": width,
        "gridHeight": height,
        "districtCount": k,
        "districtSize": size,
        "winCondition": win,
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


def _ref_assignment(level):
    assignment = {}
    for did, members in enumerate(level["referenceSolution"]):
        for cid in members:
            assignment[str(cid)] = did
    return assignment


def _rows_assignment(level):
    """Assign each cell to its grid row (used to exercise a different partition)."""
    return {str(c["id"]): c["row"] for c in level["cells"] if not c["void"]}


def build_cases() -> list[dict]:
    cases: list[dict] = []
    no_extra = {"minSeats": 1, "compactnessMinGrade": None, "minEfficiencyGap": None}

    # 1. tiny solved: top row Jerry, bottom row opponent, two row-districts.
    tiny = _tiny_level(["jj", "oo"], 2, 2, no_extra)
    cases.append(("tiny_solved", tiny, {"0": 0, "1": 0, "2": 1, "3": 1}))
    # 2. tiny broken contiguity (diagonal districts).
    cases.append(("tiny_broken_contiguity", tiny, {"0": 0, "3": 0, "1": 1, "2": 1}))
    # 3. tiny incomplete (a cell left unassigned).
    cases.append(("tiny_incomplete", tiny, {"0": 0, "1": 0, "2": 1}))
    # 4. tie: single district of 4 with 2 Jerry / 2 opponent (no winner, FR-4.2).
    tie = _tiny_level(["jo", "jo"], 1, 4, no_extra)
    cases.append(("tie_no_winner", tie, {"0": 0, "1": 0, "2": 0, "3": 0}))

    # Real generated levels exercise every geometry and metric.
    built = {spec["id"]: build_level(spec) for spec in LEVEL_SPECS}
    cases.append(("L1_reference", built["L1"], _ref_assignment(built["L1"])))
    cases.append(("L3_reference_triangle", built["L3"], _ref_assignment(built["L3"])))
    cases.append(("L4_reference_compact", built["L4"], _ref_assignment(built["L4"])))
    cases.append(("L4_rows_variant", built["L4"], _rows_assignment(built["L4"])))
    cases.append(("L5_reference_lake", built["L5"], _ref_assignment(built["L5"])))
    cases.append(("L6_reference_gap", built["L6"], _ref_assignment(built["L6"])))

    out = []
    for name, level, assignment in cases:
        int_assignment = {int(k): v for k, v in assignment.items()}
        expected = rules.validate(level, int_assignment)
        out.append(
            {"name": name, "level": level, "assignment": assignment, "expected": expected}
        )
    return out


def main() -> None:
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    cases = build_cases()
    FIXTURE_PATH.write_text(json.dumps(cases, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {len(cases)} rule cases -> {FIXTURE_PATH}")


if __name__ == "__main__":
    main()
