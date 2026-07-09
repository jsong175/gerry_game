import networkx as nx

from engine.geometry import build_square, build_triangle


def test_square_dimensions_and_ids():
    grid = build_square(4, 4)
    assert len(grid.cells) == 16
    assert [c.id for c in grid.cells] == list(range(16))
    assert grid.cells[5].col == 1 and grid.cells[5].row == 1


def test_square_adjacency_is_von_neumann():
    grid = build_square(4, 4)
    # 4x4: 12 horizontal + 12 vertical edges, no diagonals (FR-1.4).
    assert len(grid.edge_list()) == 24
    adj = grid.adjacency()
    assert len(adj[0]) == 2   # corner
    assert len(adj[1]) == 3   # top edge
    assert len(adj[5]) == 4   # interior
    # no diagonal neighbour
    assert 5 not in adj[0]


def test_triangle_row_sizes_and_orientation():
    grid = build_triangle(6)
    assert len(grid.cells) == 36
    rows: dict[int, int] = {}
    for c in grid.cells:
        rows[c.row] = rows.get(c.row, 0) + 1
    assert [rows[r] for r in range(6)] == [1, 3, 5, 7, 9, 11]
    # alternating up/down starting 'up'
    row2 = sorted((c.col, c.orient) for c in grid.cells if c.row == 2)
    assert row2 == [(0, "up"), (1, "down"), (2, "up"), (3, "down"), (4, "up")]


def test_triangle_adjacency_degree_and_connectivity():
    grid = build_triangle(6)
    adj = grid.adjacency()
    assert all(len(nbrs) <= 3 for nbrs in adj.values())  # <=3 neighbours
    g = nx.Graph(grid.edge_list())
    assert nx.is_connected(g)
    assert g.number_of_nodes() == 36
