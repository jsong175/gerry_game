"""Shared rule / validation logic (FR-3, FR-4).

This is the *source of truth* for the game's rules. The React client re-implements
the identical semantics in TypeScript (``web/src/rules/rules.ts``); a shared fixture
set (``engine/fixtures/rule_cases.json``) pins the two implementations together so
they cannot disagree (ARCHITECTURE.md "The rule-checking code ... exists on both sides").

All functions are pure and independently testable (FR-3.6) and report the specific
offending districts/cells so failures are diagnosable (FR-3.7).

A *level* is the dict deserialized from a level JSON file. An *assignment* maps
``cellId -> districtId`` and omits unassigned cells (FR-1.3).
"""

from __future__ import annotations

from collections import deque

# Compactness A-F cutoffs on the mean perimeter-to-area edge ratio (FR-3.5).
# Lower ratio == more compact. These are the implementation-time calibration of
# the deferred cutoffs (REQUIREMENTS.md Open Questions), tightened after playtest:
# a stretched 1x10 row scores 2.2 and used to squeak through as a C, so visibly
# wonky tentacle districts passed The Report Card. C now sits below that at 2.1,
# which drops the row to a D while leaving a C comfortably reachable — a 5x2 block
# scores 1.4 (A) and Level 4's reference solution averages 1.74 (B).
# Mirrored verbatim in rules.ts.
COMPACTNESS_CUTOFFS: list[tuple[str, float]] = [
    ("A", 1.5),
    ("B", 1.9),
    ("C", 2.1),
    ("D", 2.5),
]
_GRADE_ORDER = ["A", "B", "C", "D", "F"]
# Full degree of a cell for perimeter accounting (square geometry, Level 4).
_SQUARE_FULL_DEGREE = 4


def build_adjacency(level: dict) -> dict[int, set[int]]:
    """cellId -> set of adjacent cellIds, from the JSON ``adjacency`` edge list."""
    adj: dict[int, set[int]] = {}
    for cell in level["cells"]:
        if not cell.get("void"):
            adj[cell["id"]] = set()
    for a, b in level["adjacency"]:
        adj.setdefault(a, set()).add(b)
        adj.setdefault(b, set()).add(a)
    return adj


def assignable_ids(level: dict) -> set[int]:
    return {c["id"] for c in level["cells"] if not c.get("void")}


def party_map(level: dict) -> dict[int, str]:
    return {c["id"]: c["party"] for c in level["cells"] if not c.get("void")}


def district_groups(assignment: dict[int, int]) -> dict[int, list[int]]:
    """districtId -> list of cellIds (only non-empty districts)."""
    groups: dict[int, list[int]] = {}
    for cid, did in assignment.items():
        if did is None:
            continue
        groups.setdefault(did, []).append(cid)
    return groups


# --- Individual rules (FR-3.6: each independently testable) -------------------


def check_contiguity(adj: dict[int, set[int]], groups: dict[int, list[int]]):
    """FR-3.1. Returns (ok, offending_district_ids, offending_cell_ids)."""
    bad_districts: list[int] = []
    bad_cells: list[int] = []
    for did, members in groups.items():
        member_set = set(members)
        start = members[0]
        seen = {start}
        queue = deque([start])
        while queue:
            node = queue.popleft()
            for nb in adj.get(node, ()):  # noqa: B007
                if nb in member_set and nb not in seen:
                    seen.add(nb)
                    queue.append(nb)
        if len(seen) != len(member_set):
            # Flag the whole district so the client can highlight it as one unit
            # (DESIGN.md "Violation diagnostics").
            bad_districts.append(did)
            bad_cells.extend(sorted(member_set))
    return (not bad_districts, sorted(bad_districts), sorted(bad_cells))


def check_parity(groups: dict[int, list[int]], size: int):
    """FR-3.2. Every district has exactly ``size`` cells (deviation 0)."""
    bad = sorted(did for did, m in groups.items() if len(m) != size)
    return (not bad, bad)


def check_coverage(assignable: set[int], assignment: dict[int, int]):
    """FR-3.3. Every assignable cell assigned exactly once; no void assigned."""
    assigned = {cid for cid, did in assignment.items() if did is not None}
    unassigned = assignable - assigned
    void_assigned = assigned - assignable
    offending = sorted(unassigned | void_assigned)
    return (not offending, offending)


def check_district_count(groups: dict[int, list[int]], k: int):
    """FR-3.4. Number of non-empty districts equals K."""
    return len(groups) == k


def district_winner(members: list[int], party: dict[int, str]) -> str | None:
    """FR-4.1 / FR-4.2. Strict-majority winner, or None for a tie / no winner."""
    jerry = sum(1 for c in members if party[c] == "jerry")
    opp = len(members) - jerry
    if jerry > opp:
        return "jerry"
    if opp > jerry:
        return "opponent"
    return None


def seat_count(groups: dict[int, list[int]], party: dict[int, str]) -> int:
    """FR-4.5. Districts won by Jerry."""
    return sum(1 for m in groups.values() if district_winner(m, party) == "jerry")


def connected_components(adj: dict[int, set[int]], nodes: set[int]) -> list[list[int]]:
    """Connected components of the subgraph induced on ``nodes``, via the shared graph."""
    seen: set[int] = set()
    out: list[list[int]] = []
    for start in sorted(nodes):
        if start in seen:
            continue
        comp: list[int] = []
        queue = deque([start])
        seen.add(start)
        while queue:
            node = queue.popleft()
            comp.append(node)
            for nb in adj.get(node, ()):
                if nb in nodes and nb not in seen:
                    seen.add(nb)
                    queue.append(nb)
        out.append(sorted(comp))
    return out


def stranded_in_graph(
    adj: dict[int, set[int]],
    available: set[int],
    size: int,
    capacity: dict[int, tuple[int, set[int]]] | None = None,
) -> list[list[int]]:
    """Unassigned components that can never be tiled into full districts.

    DESIGN.md "Stranding warning". With every district complete this is the plain
    modulo test: a component whose size is not a whole multiple of ``size`` can
    never be partitioned into full districts.

    ``capacity`` maps an *unfinished* district's id to ``(cells it still needs,
    cells it already holds)``. Such a district will draw its remaining cells out of
    the components it touches, so a component of size ``n`` is fine as long as its
    remainder ``n % size`` can be handed to an adjacent unfinished district. Without
    this, one tap into a 6-triangle district would flag the other 35 cells.

    Note the remainder — not the whole need — is what must be absorbed, and it is
    compared against each adjacent district's capacity rather than subtracted from
    the component: a district owed 2 cells that touches two components can satisfy
    both if each only needs to shed 1.

    The flood-fill walks ``adj`` — the level's shared adjacency graph — never a
    square-grid neighbour assumption, so it is correct on the triangular lattice.
    """
    stranded: list[list[int]] = []
    for comp in connected_components(adj, available):
        comp_set = set(comp)
        absorbable = sum(
            need
            for need, members in (capacity or {}).values()
            if any(nb in comp_set for m in members for nb in adj.get(m, ()))
        )
        if len(comp) % size > absorbable:
            stranded.append(comp)
    return stranded


def stranded_pockets(level: dict, assignment: dict[int, int]) -> list[list[int]]:
    """Stranded unassigned pockets for a live board (mirrored in web/src/state/stranding.ts)."""
    adj = build_adjacency(level)
    size = level["districtSize"]
    clean = {cid: did for cid, did in assignment.items() if did is not None}
    groups = district_groups(clean)
    capacity = {
        did: (size - len(members), set(members))
        for did, members in groups.items()
        if len(members) < size
    }
    available = {cid for cid in assignable_ids(level) if cid not in clean}
    return stranded_in_graph(adj, available, size, capacity)


def compactness(adj: dict[int, set[int]], groups: dict[int, list[int]]):
    """FR-3.5. Mean perimeter-to-area ratio -> letter grade. (grade, mean_ratio)."""
    if not groups:
        return ("F", 0.0)
    ratios = []
    for members in groups.values():
        member_set = set(members)
        perimeter = 0
        for cell in members:
            same = sum(1 for nb in adj.get(cell, ()) if nb in member_set)
            perimeter += _SQUARE_FULL_DEGREE - same
        ratios.append(perimeter / len(members))
    mean_ratio = sum(ratios) / len(ratios)
    grade = "F"
    for letter, cutoff in COMPACTNESS_CUTOFFS:
        if mean_ratio <= cutoff:
            grade = letter
            break
    return (grade, mean_ratio)


def grade_at_least(grade: str, minimum: str) -> bool:
    return _GRADE_ORDER.index(grade) <= _GRADE_ORDER.index(minimum)


def efficiency_gap(groups: dict[int, list[int]], party: dict[int, str], total: int):
    """FR-3.8. (opponent_wasted - jerry_wasted) / total_cells; higher favours Jerry."""
    jerry_wasted = 0
    opp_wasted = 0
    for members in groups.values():
        jerry = sum(1 for c in members if party[c] == "jerry")
        opp = len(members) - jerry
        threshold = len(members) // 2 + 1
        winner = district_winner(members, party)
        if winner == "jerry":
            jerry_wasted += jerry - threshold
            opp_wasted += opp
        elif winner == "opponent":
            opp_wasted += opp - threshold
            jerry_wasted += jerry
        else:  # tie: no winner, every vote wasted
            jerry_wasted += jerry
            opp_wasted += opp
    if total == 0:
        return 0.0
    return (opp_wasted - jerry_wasted) / total


# --- Composite evaluation (FR-4.4) --------------------------------------------


def validate(level: dict, assignment: dict[int, int]) -> dict:
    """Full evaluation used by both the engine (reference) and the client (live).

    Returns per-rule pass/fail, offending districts/cells (FR-3.7), the seat
    tally (FR-4.5), and SOLVED/NOT SOLVED (FR-4.4).
    """
    adj = build_adjacency(level)
    assignable = assignable_ids(level)
    party = party_map(level)
    size = level["districtSize"]
    k = level["districtCount"]
    win = level["winCondition"]

    # Filter assignment to real, assignable cells for rule evaluation.
    clean = {cid: did for cid, did in assignment.items() if did is not None}
    groups = district_groups(clean)

    contig_ok, bad_contig_d, bad_contig_c = check_contiguity(adj, groups)
    parity_ok, bad_parity_d = check_parity(groups, size)
    coverage_ok, bad_coverage_c = check_coverage(assignable, clean)
    count_ok = check_district_count(groups, k)

    complete = parity_ok and coverage_ok and count_ok and contig_ok
    seats = seat_count(groups, party)

    per_rule: dict[str, bool | None] = {
        "contiguity": contig_ok,
        "parity": parity_ok,
        "coverage": coverage_ok,
        "districtCount": count_ok,
        "compactness": None,
        "efficiencyGap": None,
    }
    offending_districts = sorted(set(bad_contig_d) | set(bad_parity_d))
    offending_cells = sorted(set(bad_contig_c) | set(bad_coverage_c))

    grade = None
    gap = None
    # Level-specific metrics are only meaningful on a structurally complete board.
    min_grade = win.get("compactnessMinGrade")
    if min_grade is not None:
        grade, _ = compactness(adj, groups)
        per_rule["compactness"] = complete and grade_at_least(grade, min_grade)
    min_gap = win.get("minEfficiencyGap")
    if min_gap is not None:
        gap = efficiency_gap(groups, party, len(assignable))
        per_rule["efficiencyGap"] = complete and gap >= min_gap

    seats_ok = seats >= win["minSeats"]
    rules_ok = all(v for v in per_rule.values() if v is not None)
    solved = complete and rules_ok and seats_ok

    return {
        "perRule": per_rule,
        "offendingDistricts": offending_districts,
        "offendingCells": offending_cells,
        "complete": complete,
        "seats": seats,
        "minSeats": win["minSeats"],
        "seatsOk": seats_ok,
        "compactnessGrade": grade,
        "efficiencyGap": gap,
        "solved": solved,
    }
