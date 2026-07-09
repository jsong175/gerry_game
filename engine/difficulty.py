"""The FR-5.4 difficulty band: a level must be non-trivial *and* fair.

Solvability (FR-5.3) is necessary but not sufficient. Before a generated level is
accepted it must also pass this gate:

* **Lower bound (instructive).** No *naive baseline* partition may satisfy the win
  condition. If an all-rows / all-columns / blocked / serpentine / greedy carve-up
  already wins, the player never has to learn packing and cracking.
* **Distribution.** Affiliations must not be pre-clustered: no large all-opponent
  region, and no district-sized neighbourhood that is almost entirely opponent.
  (This is what stops Level 4 shipping with the opponent packed into one corner.)
* **Upper bound (fair).** Jerry must hold more cells than the bare minimum needed
  to reach the seat target, so more than one winning partition exists.

All thresholds are named, per-level tuning constants — the FR-5.4 analogue of the
FR-3.5 compactness cutoffs, deferred to solver calibration by REQUIREMENTS.md.
"""

from __future__ import annotations

from collections import deque

from . import partition as part
from . import rules

# --- Tuning constants (per level, FR-5.4 "deferred to solver calibration") -----

# The naive partitions a player might reach for without understanding the level.
# A level is rejected if *any* of these both tiles the board legally and meets the
# win condition. Baselines that do not apply to a level's geometry (e.g. all-rows
# on the triangle, where rows have unequal length) are skipped, not counted.
ALL_BASELINES = ("rows", "columns", "blocks", "snake", "greedy")

BASELINE_SETS: dict[str, tuple[str, ...]] = {
    "L1": ALL_BASELINES,
    "L2": ALL_BASELINES,
    "L3": ALL_BASELINES,  # rows/columns/blocks self-skip on the triangular lattice
    "L4": ALL_BASELINES,
    "L5": ALL_BASELINES,  # rows/columns/blocks self-skip around the lake
    "L6": ALL_BASELINES,
}

# Minimum slack: Jerry's assignable cells must exceed ``minSeats * cells_to_win``
# by at least this much. Zero slack means a near-unique solution (Level 5 shipped
# with exactly 7 x 6 = 42 Jerry cells). The ceiling is set by FR-1.2 (Jerry stays
# under 50%), so the small boards can only afford a margin of 1.
SLACK_MARGINS: dict[str, int] = {
    "L1": 1,  # 16 cells: Jerry may hold at most 7, minimum is 6
    "L2": 4,
    "L3": 1,  # 36 cells: Jerry may hold at most 17, minimum is 16
    "L4": 8,
    "L5": 12,  # was 0 — the bug this gate exists to catch
    "L6": 12,
}

# Largest permitted connected run of opponent-only cells. A corner-packed level
# has one component holding most of the opponent's voters; a distributed level
# breaks them up. Rule of thumb: two districts' worth.
MAX_OPPONENT_CLUSTER: dict[str, int] = {
    "L1": 8,
    "L2": 16,
    "L3": 12,
    "L4": 20,
    "L5": 22,
    "L6": 28,
}

# Densest permitted opponent share of a district-sized neighbourhood (a BFS ball
# of ``districtSize`` cells). 1.0 disables the check on boards too small to
# satisfy it: Level 1's losing districts are only 4 cells and may hold at most one
# Jerry voter, so an all-opponent ball is unavoidable there.
MAX_LOCAL_OPPONENT_SHARE: dict[str, float] = {
    "L1": 1.0,
    "L2": 0.85,
    "L3": 0.90,
    "L4": 0.85,
    "L5": 0.85,
    "L6": 0.85,
}


def cells_to_win(size: int) -> int:
    """Strict-majority threshold of one district (FR-3.8)."""
    return size // 2 + 1


# --- Naive baseline partitions -------------------------------------------------


def _assignable_cells(level: dict) -> list[dict]:
    return [c for c in level["cells"] if not c.get("void")]


def _grouped(level: dict, key: str) -> list[list[int]] | None:
    """Group assignable cells by ``row`` or ``col``; None unless it tiles exactly."""
    groups: dict[int, list[int]] = {}
    for cell in _assignable_cells(level):
        groups.setdefault(cell[key], []).append(cell["id"])
    if len(groups) != level["districtCount"]:
        return None
    if any(len(g) != level["districtSize"] for g in groups.values()):
        return None
    return [sorted(g) for _, g in sorted(groups.items())]


def rows_baseline(level: dict) -> list[list[int]] | None:
    """Every district is one full grid row."""
    return _grouped(level, "row")


def columns_baseline(level: dict) -> list[list[int]] | None:
    """Every district is one full grid column."""
    return _grouped(level, "col")


def blocks_baseline(level: dict) -> dict[str, list[list[int]]]:
    """Every rectangular block tiling of the grid whose block area is districtSize."""
    if level["shape"] != "square" or any(c.get("void") for c in level["cells"]):
        return {}
    width, height = level["gridWidth"], level["gridHeight"]
    size, k = level["districtSize"], level["districtCount"]
    out: dict[str, list[list[int]]] = {}
    for bw in range(1, size + 1):
        if size % bw:
            continue
        bh = size // bw
        if width % bw or height % bh:
            continue
        if (width // bw) * (height // bh) != k:
            continue
        out[f"blocks:{bw}x{bh}"] = part.block_partition(width, height, bw, bh)
    return out


def _snake_order(level: dict) -> list[int]:
    """Boustrophedon (serpentine) scan: left-to-right, then right-to-left."""
    rows: dict[int, list[dict]] = {}
    for cell in _assignable_cells(level):
        rows.setdefault(cell["row"], []).append(cell)
    order: list[int] = []
    for i, (_, cells) in enumerate(sorted(rows.items())):
        line = sorted(cells, key=lambda c: c["col"], reverse=bool(i % 2))
        order.extend(c["id"] for c in line)
    return order


def snake_baseline(level: dict) -> list[list[int]]:
    """Chop the serpentine scan into consecutive runs of districtSize cells."""
    order = _snake_order(level)
    size = level["districtSize"]
    return [sorted(order[i : i + size]) for i in range(0, len(order), size)]


def greedy_baseline(level: dict) -> list[list[int]] | None:
    """Repeatedly flood-fill a district from the lowest-numbered free cell.

    Geometry-agnostic (it walks the shared adjacency graph), so it applies to the
    triangular lattice and to Level 5's holed grid as well.
    """
    adj = rules.build_adjacency(level)
    available = set(rules.assignable_ids(level))
    size = level["districtSize"]
    districts: list[list[int]] = []
    while available:
        start = min(available)
        district = {start}
        queue = deque([start])
        while queue and len(district) < size:
            node = queue.popleft()
            for nb in sorted(adj[node]):
                if len(district) >= size:
                    break
                if nb in available and nb not in district:
                    district.add(nb)
                    queue.append(nb)
        if len(district) != size:
            return None  # ran out of room: not a legal carve-up
        districts.append(sorted(district))
        available -= district
    return districts


def baseline_partitions(level: dict, names: tuple[str, ...]) -> dict[str, list[list[int]]]:
    """Named baseline partitions that apply to this level's geometry."""
    out: dict[str, list[list[int]]] = {}
    for name in names:
        if name == "rows":
            candidate = rows_baseline(level)
            if candidate:
                out["rows"] = candidate
        elif name == "columns":
            candidate = columns_baseline(level)
            if candidate:
                out["columns"] = candidate
        elif name == "blocks":
            out.update(blocks_baseline(level))
        elif name == "snake":
            out["snake"] = snake_baseline(level)
        elif name == "greedy":
            candidate = greedy_baseline(level)
            if candidate:
                out["greedy"] = candidate
        else:
            raise ValueError(f"unknown naive baseline {name!r}")
    return out


def winning_baselines(level: dict, names: tuple[str, ...] | None = None) -> list[str]:
    """Names of the naive baselines that already satisfy the win condition."""
    if names is None:
        names = BASELINE_SETS.get(level["id"], ALL_BASELINES)
    winners = []
    for name, districts in baseline_partitions(level, names).items():
        assignment = {cid: did for did, group in enumerate(districts) for cid in group}
        if rules.validate(level, assignment)["solved"]:
            winners.append(name)
    return sorted(winners)


def check_naive_baselines(level: dict) -> tuple[bool, list[str]]:
    """FR-5.4 lower bound: no naive baseline may win. Returns (ok, winner names)."""
    winners = winning_baselines(level)
    return (not winners, winners)


# --- Slack (FR-5.4 upper bound) ------------------------------------------------


def jerry_cells(level: dict) -> int:
    return sum(1 for p in rules.party_map(level).values() if p == "jerry")


def slack(level: dict) -> int:
    """Jerry's cells above the bare minimum needed to reach the seat target."""
    minimum = level["winCondition"]["minSeats"] * cells_to_win(level["districtSize"])
    return jerry_cells(level) - minimum


def check_slack(level: dict, margin: int | None = None) -> tuple[bool, int, int]:
    """FR-5.4 upper bound. Returns (ok, actual slack, required margin)."""
    if margin is None:
        margin = SLACK_MARGINS.get(level["id"], 1)
    actual = slack(level)
    return (actual >= margin, actual, margin)


# --- Distribution / clustering -------------------------------------------------


def largest_opponent_cluster(level: dict) -> int:
    """Size of the biggest connected run of opponent-only cells."""
    adj = rules.build_adjacency(level)
    party = rules.party_map(level)
    seen: set[int] = set()
    largest = 0
    for cid in adj:
        if cid in seen or party[cid] != "opponent":
            continue
        seen.add(cid)
        queue = deque([cid])
        size = 0
        while queue:
            node = queue.popleft()
            size += 1
            for nb in adj[node]:
                if nb not in seen and party[nb] == "opponent":
                    seen.add(nb)
                    queue.append(nb)
        largest = max(largest, size)
    return largest


def _ball(adj: dict[int, set[int]], start: int, n: int) -> list[int]:
    """The ``n`` cells nearest ``start`` in graph distance (BFS, id-ordered)."""
    seen = {start}
    queue = deque([start])
    out: list[int] = []
    while queue and len(out) < n:
        node = queue.popleft()
        out.append(node)
        for nb in sorted(adj[node]):
            if nb not in seen:
                seen.add(nb)
                queue.append(nb)
    return out


def max_local_opponent_share(level: dict) -> float:
    """Densest opponent share over every district-sized neighbourhood."""
    adj = rules.build_adjacency(level)
    party = rules.party_map(level)
    size = level["districtSize"]
    worst = 0.0
    for cid in adj:
        ball = _ball(adj, cid, size)
        share = sum(1 for c in ball if party[c] == "opponent") / len(ball)
        worst = max(worst, share)
    return worst


def check_distribution(level: dict) -> tuple[bool, str]:
    """FR-5.4: affiliations distributed, not pre-clustered. Returns (ok, detail)."""
    lid = level["id"]
    cluster = largest_opponent_cluster(level)
    max_cluster = MAX_OPPONENT_CLUSTER.get(lid, 2 * level["districtSize"])
    if cluster > max_cluster:
        return (False, f"opponent cluster of {cluster} cells > {max_cluster}")
    share = max_local_opponent_share(level)
    max_share = MAX_LOCAL_OPPONENT_SHARE.get(lid, 0.85)
    if share > max_share:
        return (False, f"opponent-dominated region at {share:.2f} share > {max_share}")
    return (True, f"cluster={cluster} localShare={share:.2f}")


# --- The gate ------------------------------------------------------------------


def gate(level: dict) -> tuple[bool, str]:
    """Run the whole FR-5.4 band. Returns (accepted, reason-if-rejected)."""
    ok, winners = check_naive_baselines(level)
    if not ok:
        return (False, f"naive baseline(s) already win: {', '.join(winners)}")
    ok, detail = check_distribution(level)
    if not ok:
        return (False, f"affiliations pre-clustered: {detail}")
    ok, actual, margin = check_slack(level)
    if not ok:
        return (False, f"slack {actual} < required margin {margin}")
    return (True, "")
