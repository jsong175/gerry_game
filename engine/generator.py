"""Level generator: build geometry, assign parties, prove solvability and difficulty.

For each level we (1) build the grid, (2) search for a reference partition into K
contiguous equal districts, (3) assign per-cell parties so that this partition wins
exactly the target number of seats while Jerry stays strictly < 50% overall
(FR-1.2), and (4) re-validate the reference with the shared rule logic.

A level that does not validate SOLVED is rejected (FR-5.3), and so is one that
falls outside the FR-5.4 difficulty band — trivially winnable by a naive baseline,
pre-clustered, or so tight that its solution is effectively unique. Rejected
candidates are regenerated from a fresh seed, never shipped.
"""

from __future__ import annotations

import random

from . import difficulty, rules
from .geometry import Grid, build_square, build_triangle

# How many fresh seeds to try before giving up on a level spec.
MAX_ATTEMPTS = 60
# Distance between attempt seeds; coprime with the small level seeds so the
# randomized partition search and the party placement both move each attempt.
SEED_STRIDE = 1009

# Levels that should not take all the slack the board can carry. Without an entry
# here a level starts from ``max_extra_jerry``, which pushes Jerry to just under
# half the board and makes the level play too easy. A level listed here starts
# from this many extra Jerry cells instead, still easing down to its FR-5.4 margin.
JERRY_EXTRA_TARGETS: dict[str, int] = {
    "L5": 12,  # 7 x 6 + 12 = 54 Jerry cells of 132 (~41%), vs 65 (~49%) at the ceiling
}


def evenly_spread(k: int, n: int) -> set[int]:
    """Pick ``n`` distinct indices in [0, k) spread as evenly as possible."""
    chosen: list[int] = []
    for i in range(n):
        idx = int(i * k / n)
        while idx in chosen:
            idx += 1
        chosen.append(idx)
    return set(chosen)


def max_extra_jerry(k: int, size: int, min_seats: int) -> int:
    """The most Jerry cells we can add above the bare seat-target minimum.

    Bounded by (a) how many Jerry voters a losing district can absorb while the
    opponent keeps a strict majority there, and (b) FR-1.2: Jerry stays strictly
    under half of all assignable cells.
    """
    win = difficulty.cells_to_win(size)
    loser_cap = (size - 1) // 2  # opponent still holds a strict majority
    under_half = (k * size - 1) // 2 - min_seats * win
    return max(0, min((k - min_seats) * loser_cap, under_half))


def jerry_targets(k: int, size: int, min_seats: int, extra: int) -> list[int]:
    """Per-district Jerry cell counts: minimal winning majorities plus ``extra`` slack.

    Winning districts take the bare strict majority — the classic "crack" — and the
    slack is spread evenly across the packed losing districts, which keeps Jerry's
    voters distributed instead of concentrated (FR-5.4 distribution).
    """
    win_indices = evenly_spread(k, min_seats)
    win = difficulty.cells_to_win(size)
    loser_cap = (size - 1) // 2
    losers = k - min_seats
    base, rem = divmod(extra, losers) if losers else (0, 0)
    counts: list[int] = []
    seen_losers = 0
    for idx in range(k):
        if idx in win_indices:
            counts.append(win)
        else:
            share = base + (1 if seen_losers < rem else 0)
            counts.append(min(share, loser_cap))
            seen_losers += 1
    return counts


def _jerry_pressure(adj: dict[int, set[int]], node: int, jerry: set[int]) -> tuple[int, int]:
    """How crowded by existing Jerry voters a cell is, at one and two hops."""
    near = sum(1 for nb in adj[node] if nb in jerry)
    far = sum(1 for nb in adj[node] for nb2 in adj[nb] if nb2 in jerry and nb2 != node)
    return (near, far)


def assign_parties(
    grid: Grid,
    adj: dict[int, set[int]],
    partition: list[list[int]],
    counts: list[int],
    seed: int,
) -> None:
    """Paint ``counts[i]`` Jerry cells into district ``i``, spreading them out.

    Districts are filled majority-first so the winning districts' Jerry blocks land
    before the losing districts', and each cell is chosen to sit as far from
    existing Jerry voters as the district allows. That breaks up the all-opponent
    runs that a naive "pack the losers 100% opponent" painter leaves behind
    (FR-5.4 distribution; DESIGN.md Story & Tone).
    """
    by_id = {c.id: c for c in grid.cells}
    for cell in grid.cells:
        cell.party = "opponent"
    rng = random.Random(seed)
    jerry: set[int] = set()

    for idx in sorted(range(len(partition)), key=lambda i: -counts[i]):
        free = [cid for cid in partition[idx] if cid not in jerry]
        for _ in range(counts[idx]):
            pick = min(free, key=lambda n: (*_jerry_pressure(adj, n, jerry), rng.random()))
            jerry.add(pick)
            free.remove(pick)

    for cid in jerry:
        by_id[cid].party = "jerry"


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


def _build_grid(spec: dict, voids: set[int]) -> Grid:
    if spec["shape"] == "triangle":
        grid = build_triangle(spec["rows"])
    else:
        grid = build_square(spec["width"], spec["height"])
    for cell in grid.cells:
        cell.void = cell.id in voids
    grid.edges = {e for e in grid.edges if not (voids & set(e))}
    return grid


def build_level(spec: dict) -> dict:
    """Generate one validated level dict from a spec (see levels.py).

    Retries with fresh seeds until a candidate is both SOLVED (FR-5.3) and inside
    the FR-5.4 difficulty band; raises if no seed produces one.
    """
    void_sets = (
        _l5_void_candidates(spec["width"], spec["height"]) if spec.get("level5") else [set()]
    )
    size = spec["districtSize"]
    k = spec["districtCount"]
    min_seats = spec["minSeats"]
    margin = difficulty.SLACK_MARGINS.get(spec["id"], 1)
    ceiling = max_extra_jerry(k, size, min_seats)
    start = min(ceiling, JERRY_EXTRA_TARGETS.get(spec["id"], ceiling))
    last_error = "no attempt made"

    # Void candidates are listed in preference order, so exhaust every seed on one
    # before falling back to the next. (Levels other than 5 have a single, empty
    # candidate, for which this is the same iteration as the plain seed loop.)
    for voids in void_sets:
        for attempt in range(MAX_ATTEMPTS):
            seed = spec.get("seed", 0) + attempt * SEED_STRIDE
            grid = _build_grid(spec, voids)
            adj = grid.adjacency()
            nodes = grid.assignable_ids()
            if len(nodes) != k * size:
                last_error = f"assignable {len(nodes)} != K*S {k * size}"
                continue

            partition = _reference_partition(spec, grid, adj, nodes, seed)
            if partition is None:
                last_error = "no contiguous equal partition found"
                continue

            # Prefer the most slack the level can carry, easing off only as far as
            # the FR-5.4 margin: more slack means more winning partitions exist.
            # Levels in JERRY_EXTRA_TARGETS start below the ceiling instead.
            for extra in range(start, margin - 1, -1):
                counts = jerry_targets(k, size, min_seats, extra)
                assign_parties(grid, adj, partition, counts, seed)
                level = _emit(spec, grid, partition)

                result = rules.validate(level, _assignment_from_partition(partition))
                if not result["solved"]:
                    last_error = f"reference not SOLVED at extra={extra}: {result}"
                    continue
                accepted, reason = difficulty.gate(level)
                if not accepted:
                    last_error = f"difficulty gate at extra={extra}: {reason}"
                    continue
                _assert_minority(level)
                return level

    raise RuntimeError(
        f"Level {spec['id']} could not be generated in {MAX_ATTEMPTS} attempts: {last_error}"
    )


def _reference_partition(spec, grid, adj, nodes, seed):
    """The proof of solvability (FR-5.3).

    Always a randomized region-growing search: the deterministic row/block carve-ups
    are exactly the naive baselines FR-5.4 forbids, so they can never be a level's
    intended solution.
    """
    from . import partition as part

    return part.grow_partition(adj, nodes, spec["districtCount"], spec["districtSize"], seed=seed)


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
