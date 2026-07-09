"""Reverse-solve partitioning (FR-5.3).

Finds at least one partition of the grid graph into ``K`` contiguous, equal-size
districts. If a partition exists it is the proof the level is solvable; the
generator later assigns parties so that this partition also meets the win
condition, and the whole thing is re-validated before shipping.

Two paths:

* deterministic constructions (rows, blocks) for hole-free rectangles, which are
  trivially contiguous and equal-size; and
* a randomized region-growing search (``grow_partition``) for irregular graphs
  (the triangular lattice, the Level 5 lake), pruned by a stranding check so it
  never paints itself into a corner.
"""

from __future__ import annotations

import random
from collections import deque


def row_partition(width: int, height: int, size: int) -> list[list[int]]:
    """Each district is one full row. Requires ``size == width``."""
    if size != width:
        raise ValueError("row_partition requires size == width")
    return [[row * width + col for col in range(width)] for row in range(height)]


def block_partition(width: int, height: int, bw: int, bh: int) -> list[list[int]]:
    """Tile W x H with bw x bh rectangular blocks (compact districts, FR-3.5)."""
    if width % bw or height % bh:
        raise ValueError("block dimensions must tile the grid")
    districts: list[list[int]] = []
    for by in range(0, height, bh):
        for bx in range(0, width, bw):
            block = [
                (by + dy) * width + (bx + dx)
                for dy in range(bh)
                for dx in range(bw)
            ]
            districts.append(block)
    return districts


def _components_ok(adj: dict[int, set[int]], available: set[int], size: int) -> bool:
    """Every connected component of ``available`` has size divisible by ``size``.

    This is the stranding test (DESIGN.md "Stranding warning") used as a search
    prune: a component whose size is not a multiple of the district size can
    never be tiled into full districts.
    """
    seen: set[int] = set()
    for node in available:
        if node in seen:
            continue
        comp = 0
        queue = deque([node])
        seen.add(node)
        while queue:
            cur = queue.popleft()
            comp += 1
            for nb in adj[cur]:
                if nb in available and nb not in seen:
                    seen.add(nb)
                    queue.append(nb)
        if comp % size:
            return False
    return True


def _degree_in(adj: dict[int, set[int]], node: int, subset: set[int]) -> int:
    return sum(1 for nb in adj[node] if nb in subset)


def _grow_one(
    adj: dict[int, set[int]], available: set[int], size: int, rng: random.Random
) -> set[int] | None:
    """Grow a single contiguous district of ``size`` cells, hugging the boundary."""
    # Seed at the most constrained available cell (fewest available neighbours),
    # i.e. a corner, so leftover space stays tileable.
    start = min(available, key=lambda n: (_degree_in(adj, n, available), rng.random()))
    district = {start}
    while len(district) < size:
        frontier = [
            nb
            for cell in district
            for nb in adj[cell]
            if nb in available and nb not in district
        ]
        if not frontier:
            return None
        remaining = available - district
        # Prefer the frontier cell with the fewest onward connections: keeps the
        # district compact and avoids splitting the remaining region.
        cand = min(
            set(frontier),
            key=lambda n: (_degree_in(adj, n, remaining), rng.random()),
        )
        district.add(cand)
    if _components_ok(adj, available - district, size):
        return district
    return None


def grow_partition(
    adj: dict[int, set[int]],
    nodes: list[int],
    k: int,
    size: int,
    seed: int = 0,
    attempts: int = 6000,
) -> list[list[int]] | None:
    """Randomized region-growing search. Returns K districts or None."""
    if len(nodes) != k * size:
        raise ValueError("node count must equal K * size")
    rng = random.Random(seed)
    for _ in range(attempts):
        available = set(nodes)
        districts: list[set[int]] = []
        ok = True
        for _d in range(k):
            grown = _grow_one(adj, available, size, rng)
            if grown is None:
                ok = False
                break
            districts.append(grown)
            available -= grown
        if ok and not available:
            return [sorted(d) for d in districts]
    return None
