"""Stranding-warning tests (DESIGN.md "Stranding warning"; FR-1.4).

The flood-fill must walk the level's shared adjacency graph — the same one every
other rule uses — and must not count the cells an unfinished district still needs
as stranded. Both bugs show up first on the triangular level, where the square-grid
neighbour shortcut is wrong and where a 6-cell district takes six taps to build.
"""

import pytest

from engine import rules
from engine.generator import build_level
from engine.levels import LEVEL_SPECS

SPECS_BY_ID = {s["id"]: s for s in LEVEL_SPECS}


@pytest.fixture(scope="module")
def l1():
    return build_level(SPECS_BY_ID["L1"])


@pytest.fixture(scope="module")
def l3():
    return build_level(SPECS_BY_ID["L3"])


def _assign(groups):
    return {cid: did for did, members in enumerate(groups) for cid in members}


def test_triangle_partition_in_progress_does_not_warn(l3):
    """Two committed districts leave 24 unassigned triangles: a clean multiple of 6."""
    committed = l3["referenceSolution"][:2]
    assignment = _assign(committed)
    assert len(assignment) == 12
    assert rules.stranded_pockets(l3, assignment) == []


def test_triangle_every_reference_prefix_is_clean(l3):
    """Walking the whole reference solution never fires a false warning."""
    assignment = {}
    for did, members in enumerate(l3["referenceSolution"]):
        for cid in members:
            assignment[cid] = did
        assert rules.stranded_pockets(l3, assignment) == [], f"after district {did}"


def test_triangle_mid_build_district_does_not_warn(l3):
    """One tap into a 6-triangle district: the other 35 cells are not stranded.

    35 is not a multiple of 6, but the district in progress still owes 5 cells to
    that region. Counting them as stranded is the false positive players hit.
    """
    seed = l3["referenceSolution"][0][0]
    assert rules.stranded_pockets(l3, {seed: 0}) == []


def test_square_mid_build_district_does_not_warn(l1):
    seed = l1["referenceSolution"][0][0]
    assert rules.stranded_pockets(l1, {seed: 0}) == []


def _tap_order(adj, members):
    """The order the client adds cells: BFS, so each tap is edge-adjacent."""
    members = sorted(members)
    seen = {members[0]}
    queue = [members[0]]
    order = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for nb in sorted(adj[node]):
            if nb in members and nb not in seen:
                seen.add(nb)
                queue.append(nb)
    return order


@pytest.mark.parametrize("level_id", ["L1", "L3"])
def test_no_warning_at_any_point_while_tapping_out_a_district(level_id, request):
    """Every intermediate state of building a valid district must stay quiet.

    A district mid-build can pinch off a small pocket that it is itself about to
    absorb: at 4 of 6 triangles the unassigned cells split 31 + 1, and the district
    still owes 2. Neither piece is stranded, because the district takes both.
    """
    level = request.getfixturevalue(level_id.lower())
    adj = rules.build_adjacency(level)
    for district in level["referenceSolution"]:
        assignment = {}
        for i, cid in enumerate(_tap_order(adj, set(district)), start=1):
            assignment[cid] = 0
            pockets = rules.stranded_pockets(level, assignment)
            assert pockets == [], f"{level_id}: warned after tap {i} of {len(district)}"


def test_an_unfinished_district_cannot_absorb_the_same_cells_twice(l3):
    """Capacity is compared per component, never subtracted from every component.

    Four taps in, the district owes 2 cells and touches a 1-cell pocket and a
    31-cell region. Both remainders (1 and 1) fit inside the owed 2.
    """
    adj = rules.build_adjacency(l3)
    order = _tap_order(adj, set(l3["referenceSolution"][0]))
    assignment = {cid: 0 for cid in order[:4]}
    comps = rules.connected_components(adj, set(rules.assignable_ids(l3)) - set(assignment))
    assert sorted(len(c) for c in comps) == [1, 31]
    assert rules.stranded_pockets(l3, assignment) == []


def test_triangle_isolated_apex_is_stranded(l3):
    """The apex triangle has exactly one neighbour; fencing it off strands it."""
    adj = rules.build_adjacency(l3)
    apex = 0
    (only_neighbour,) = adj[apex]
    # Grow a complete 6-cell district from the apex's sole neighbour, avoiding the
    # apex itself, so the apex is walled off behind a committed district.
    district = {only_neighbour}
    frontier = [only_neighbour]
    while len(district) < 6:
        node = frontier.pop(0)
        for nb in sorted(adj[node]):
            if len(district) >= 6:
                break
            if nb != apex and nb not in district:
                district.add(nb)
                frontier.append(nb)
    pockets = rules.stranded_pockets(l3, _assign([sorted(district)]))
    assert [apex] in pockets


def test_square_stranded_pocket_of_one(l1):
    """A committed district that walls off a single corner cell warns (FR-1.4)."""
    adj = rules.build_adjacency(l1)
    corner = 0
    district = sorted(adj[corner] | {c for nb in adj[corner] for c in adj[nb] if c != corner})
    district = district[:4]
    assert corner not in district
    pockets = rules.stranded_pockets(l1, _assign([district]))
    assert any(p == [corner] for p in pockets)


def test_stranding_walks_the_shared_adjacency_graph_not_a_square_grid(l3):
    """Ids 0..35 look like a 6x6 square grid; the real lattice says otherwise.

    A square-grid flood-fill (id +/- 1, id +/- 6) would mis-split this connected
    region. Walking the JSON adjacency keeps it whole, so nothing is stranded.
    """
    adj = rules.build_adjacency(l3)
    assert adj[0] == {2}, "the apex has exactly one edge-sharing neighbour"
    assert 1 not in adj[0], "a square-grid walk would wrongly join 0 and 1"
    # Districts 0 and 1 of the reference solution wall off no pocket.
    assert rules.stranded_pockets(l3, _assign(l3["referenceSolution"][:2])) == []


def test_stranded_in_graph_ignores_capacity_when_all_districts_are_complete(l1):
    adj = rules.build_adjacency(l1)
    available = set(rules.assignable_ids(l1)) - {5}
    assert rules.stranded_in_graph(adj, available, 4) != []  # 15 cells, not a multiple
    assert rules.stranded_in_graph(adj, set(rules.assignable_ids(l1)), 4) == []


def test_connected_components_returns_sorted_components(l1):
    adj = rules.build_adjacency(l1)
    comps = rules.connected_components(adj, {0, 1, 15})
    assert comps == [[0, 1], [15]]
