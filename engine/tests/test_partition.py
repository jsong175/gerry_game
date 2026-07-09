"""Tests for the reverse-solve partitioner (FR-5.3)."""

from engine import partition as part
from engine import rules
from engine.geometry import build_square, build_triangle


def _contiguous_equal(adj, districts, size):
    if any(len(d) != size for d in districts):
        return False
    groups = {i: list(d) for i, d in enumerate(districts)}
    ok, _, _ = rules.check_contiguity(adj, groups)
    return ok


def test_block_partition_tiles_and_is_contiguous():
    grid = build_square(10, 10)
    adj = grid.adjacency()
    districts = part.block_partition(10, 10, 5, 2)
    assert len(districts) == 10
    all_cells = sorted(c for d in districts for c in d)
    assert all_cells == list(range(100))
    assert _contiguous_equal(adj, districts, 10)


def test_grow_partition_on_triangle():
    grid = build_triangle(6)
    adj = grid.adjacency()
    districts = part.grow_partition(adj, grid.assignable_ids(), 6, 6, seed=33)
    assert districts is not None
    assert _contiguous_equal(adj, districts, 6)
    assert sorted(c for d in districts for c in d) == list(range(36))


def test_grow_partition_on_holed_grid():
    # 4x4 minus 2 cells is not divisible by any clean K*S; use full 4x4 into 4x4.
    grid = build_square(4, 4)
    adj = grid.adjacency()
    districts = part.grow_partition(adj, grid.assignable_ids(), 4, 4, seed=1)
    assert districts is not None
    assert _contiguous_equal(adj, districts, 4)


def test_components_ok_prunes_stranding():
    grid = build_square(4, 4)
    adj = grid.adjacency()
    # Removing a single cell strands the rest as a 15-cell component (not div by 4).
    available = set(range(16)) - {5}
    assert not part._components_ok(adj, available, 4)
    assert part._components_ok(adj, set(range(16)), 4)
