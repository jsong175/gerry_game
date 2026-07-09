"""Grid and lattice construction (FR-1.1, FR-1.4).

Produces the explicit node list + precomputed adjacency graph that the static
JSON ships (ARCHITECTURE.md "Static JSON schema"). Two geometries:

* ``square``   -> W x H von Neumann (4-neighbour) grid. Cells carry (col, row).
* ``triangle`` -> equilateral triangle subdivided into unit triangles, R rows,
  row r (0-indexed) holding 2r+1 triangles alternating up/down, edge adjacency
  only (each triangle has at most 3 neighbours). Cells carry (row, col, orient).

Diagonal (8-neighbour) adjacency is never emitted (FR-1.4).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

Party = Literal["jerry", "opponent"]


@dataclass
class Cell:
    """A single voter cell / graph vertex (unless void)."""

    id: int
    party: Party = "opponent"
    fixed: bool = False
    void: bool = False
    # square geometry
    col: int | None = None
    row: int | None = None
    # triangle geometry
    orient: Literal["up", "down"] | None = None

    def geometry(self, shape: str) -> dict:
        if shape == "square":
            return {"col": self.col, "row": self.row}
        return {"row": self.row, "col": self.col, "orient": self.orient}


@dataclass
class Grid:
    """A geometry: cells + undirected adjacency over non-void cells."""

    shape: Literal["square", "triangle"]
    width: int
    height: int
    cells: list[Cell]
    # adjacency as a set of frozenset({a, b}) pairs, non-void only
    edges: set[frozenset[int]] = field(default_factory=set)

    def edge_list(self) -> list[list[int]]:
        """Sorted, de-duplicated edge list for JSON emission."""
        out = sorted(tuple(sorted(e)) for e in self.edges)
        return [[a, b] for a, b in out]

    def adjacency(self) -> dict[int, set[int]]:
        """cellId -> set of adjacent (non-void) cellIds."""
        adj: dict[int, set[int]] = {c.id: set() for c in self.cells if not c.void}
        for e in self.edges:
            a, b = tuple(e)
            adj[a].add(b)
            adj[b].add(a)
        return adj

    def assignable_ids(self) -> list[int]:
        return [c.id for c in self.cells if not c.void]


def build_square(width: int, height: int) -> Grid:
    """W x H square grid, 4-neighbour adjacency. id = row * width + col."""
    cells: list[Cell] = []
    for row in range(height):
        for col in range(width):
            cells.append(Cell(id=row * width + col, col=col, row=row))
    edges: set[frozenset[int]] = set()
    for row in range(height):
        for col in range(width):
            cid = row * width + col
            if col + 1 < width:
                edges.add(frozenset({cid, cid + 1}))
            if row + 1 < height:
                edges.add(frozenset({cid, cid + width}))
    return Grid("square", width, height, cells, edges)


def build_triangle(rows: int = 6) -> Grid:
    """Equilateral triangle of unit triangles (FR-5.3, Level 3).

    Row r (0-indexed) has 2r+1 triangles; cell (r, c) is 'up' when c is even,
    'down' when c is odd. Adjacency (edge-sharing, <=3 per triangle):

    * horizontal: (r, c) -- (r, c+1)
    * vertical:   down-triangle (r, c) -- up-triangle (r-1, c-1)
    """
    index: dict[tuple[int, int], int] = {}
    cells: list[Cell] = []
    nid = 0
    for r in range(rows):
        for c in range(2 * r + 1):
            orient = "up" if c % 2 == 0 else "down"
            index[(r, c)] = nid
            cells.append(Cell(id=nid, row=r, col=c, orient=orient))
            nid += 1

    edges: set[frozenset[int]] = set()
    for (r, c), cid in index.items():
        # horizontal neighbour to the right
        if (r, c + 1) in index:
            edges.add(frozenset({cid, index[(r, c + 1)]}))
        # vertical: a down-triangle joins the up-triangle above-left
        if c % 2 == 1:  # down
            up = index.get((r - 1, c - 1))
            if up is not None:
                edges.add(frozenset({cid, up}))

    # width/height are the triangle's bounding extent, used only for SVG sizing.
    width = 2 * rows - 1
    height = rows
    return Grid("triangle", width, height, cells, edges)
