"""Level generator: build geometry, assign parties, prove solvability (FR-5.2, FR-5.3).

For each level we (1) build the grid, (2) compute a reference partition into K
contiguous equal districts, (3) assign per-cell parties so that this partition
wins exactly the target number of seats while Jerry stays strictly < 50% overall
(FR-1.2), and (4) re-validate the reference with the shared rule logic. A level
that does not validate SOLVED is rejected, never shipped.
"""

from __future__ import annotations

import random

from . import rules
from .geometry import Grid, build_square, build_triangle


def evenly_spread(k: int, n: int) -> set[int]:
    """Pick ``n`` distinct indices in [0, k) spread as evenly as possible."""
    chosen: list[int] = []
    for i in range(n):
        idx = int(i * k / n)
        while idx in chosen:
            idx += 1
        chosen.append(idx)
    return set(chosen)


def assign_parties(
    grid: Grid, partition: list[list[int]], min_seats: int, size: int, seed: int
) -> None:
    """Pack/crack party assignment so ``partition`` wins exactly ``min_seats``.

    Jerry-win districts get the minimal strict majority (size//2 + 1); the rest
    are packed 100% opponent. This minimises Jerry's vote share (keeping him < 50%)
    while maximising seats — the core gerrymander (FR-1.2, DESIGN.md Story & Tone).
    """
    by_id = {c.id: c for c in grid.cells}
    rng = random.Random(seed)
    win_indices = evenly_spread(len(partition), min_seats)
    jerry_target = size // 2 + 1
    for idx, district in enumerate(partition):
        members = list(district)
        rng.shuffle(members)
        take = jerry_target if idx in win_indices else 0
        for i, cid in enumerate(members):
            by_id[cid].party = "jerry" if i < take else "opponent"


def _l5_void_candidates(width: int, height: int) -> list[set[int]]:
    """Candidate 12-cell interior 'lake' shapes for Level 5 (solver picks one)."""
    def block(cols, rows_):
        return {r * width + c for r in rows_ for c in cols}

    return [
        block([5, 6], range(3, 9)),          # central vertical wall (6x2)
        block([4, 5, 6, 7], range(4, 7)),    # central horizontal wall (3x4)
        block([5, 6], range(2, 8)),          # off-centre vertical wall
        block([3, 4, 5, 6, 7, 8], range(5, 7)),  # wide horizontal bar (2x6)
    ]


def build_level(spec: dict) -> dict:
    """Generate one validated level dict from a spec (see levels.py)."""
    shape = spec["shape"]
    if shape == "triangle":
        grid = build_triangle(spec["rows"])
    else:
        grid = build_square(spec["width"], spec["height"])

    void_sets = [set()]
    if spec.get("level5"):
        void_sets = _l5_void_candidates(spec["width"], spec["height"])

    size = spec["districtSize"]
    k = spec["districtCount"]

    last_error = "no attempt made"
    for voids in void_sets:
        for c in grid.cells:
            c.void = c.id in voids
        # Drop void cells from adjacency.
        grid.edges = {e for e in grid.edges if not (voids & set(e))}
        adj = grid.adjacency()
        nodes = grid.assignable_ids()
        if len(nodes) != k * size:
            last_error = f"assignable {len(nodes)} != K*S {k * size}"
            continue

        partition = _reference_partition(spec, grid, adj, nodes)
        if partition is None:
            last_error = "no contiguous equal partition found"
            continue

        assign_parties(grid, partition, spec["minSeats"], size, spec.get("seed", 0))
        level = _emit(spec, grid, partition)

        result = rules.validate(level, _assignment_from_partition(partition))
        if not result["solved"]:
            last_error = f"reference not SOLVED: {result}"
            continue
        _assert_minority(level)
        return level

    raise RuntimeError(f"Level {spec['id']} could not be generated: {last_error}")


def _reference_partition(spec, grid, adj, nodes):
    from . import partition as part

    strategy = spec["partition"]
    if strategy == "rows":
        return part.row_partition(grid.width, grid.height, spec["districtSize"])
    if strategy == "blocks":
        return part.block_partition(
            grid.width, grid.height, spec["blockWidth"], spec["blockHeight"]
        )
    # "grow" — randomized search over the (possibly holed) graph.
    return part.grow_partition(
        adj, nodes, spec["districtCount"], spec["districtSize"], seed=spec.get("seed", 0)
    )


def _assignment_from_partition(partition: list[list[int]]) -> dict[int, int]:
    assignment: dict[int, int] = {}
    for did, members in enumerate(partition):
        for cid in members:
            assignment[cid] = did
    return assignment


def _emit(spec: dict, grid: Grid, partition: list[list[int]]) -> dict:
    cells = [
        {
            "id": c.id,
            "party": c.party,
            "fixed": c.fixed,
            "void": c.void,
            **c.geometry(grid.shape),
        }
        for c in grid.cells
    ]
    return {
        "id": spec["id"],
        "name": spec["name"],
        "shape": grid.shape,
        "gridWidth": grid.width,
        "gridHeight": grid.height,
        "districtCount": spec["districtCount"],
        "districtSize": spec["districtSize"],
        "winCondition": {
            "minSeats": spec["minSeats"],
            "compactnessMinGrade": spec.get("compactnessMinGrade"),
            "minEfficiencyGap": spec.get("minEfficiencyGap"),
        },
        "cells": cells,
        "adjacency": grid.edge_list(),
        "referenceSolution": [sorted(d) for d in partition],
    }


def _assert_minority(level: dict) -> None:
    party = rules.party_map(level)
    total = len(party)
    jerry = sum(1 for p in party.values() if p == "jerry")
    if jerry * 2 >= total:
        raise RuntimeError(
            f"Level {level['id']}: Jerry not a strict minority "
            f"({jerry}/{total}) — violates FR-1.2"
        )
