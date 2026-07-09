"""CI gate: verify every committed level JSON (FR-5.3).

Usage:  py -m engine.verify_levels [levels_dir]

For each level in the manifest this re-loads the committed JSON and checks:
  * schema shape (required fields, types, geometry per shape);
  * K * districtSize == assignable-cell count (FR-3.2, FR-3.4);
  * Jerry is a strict minority of assignable cells (FR-1.2);
  * adjacency references only non-void cells, is symmetric, and matches FR-1.4;
  * the committed ``referenceSolution`` validates SOLVED (FR-4.4).

Exits non-zero on the first failure so it can gate the build.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import rules

DEFAULT_DIR = Path(__file__).resolve().parent.parent / "web" / "public" / "levels"


class VerifyError(Exception):
    pass


def _require(cond: bool, msg: str) -> None:
    if not cond:
        raise VerifyError(msg)


def verify_level(level: dict) -> dict:
    lid = level.get("id", "?")
    for field in (
        "id",
        "name",
        "shape",
        "districtCount",
        "districtSize",
        "winCondition",
        "cells",
        "adjacency",
        "referenceSolution",
    ):
        _require(field in level, f"{lid}: missing field {field!r}")
    _require(level["shape"] in ("square", "triangle"), f"{lid}: bad shape")

    ids = [c["id"] for c in level["cells"]]
    _require(len(ids) == len(set(ids)), f"{lid}: duplicate cell ids")
    id_set = set(ids)
    assignable = rules.assignable_ids(level)
    k = level["districtCount"]
    size = level["districtSize"]
    _require(
        len(assignable) == k * size,
        f"{lid}: assignable {len(assignable)} != K*S {k * size}",
    )

    # Geometry present per shape.
    for c in level["cells"]:
        if level["shape"] == "square":
            _require("col" in c and "row" in c, f"{lid}: square cell missing col/row")
        else:
            _require(
                "row" in c and "col" in c and "orient" in c,
                f"{lid}: triangle cell missing row/col/orient",
            )

    # Adjacency: over non-void cells only, symmetric, no self loops (FR-1.4).
    for a, b in level["adjacency"]:
        _require(a != b, f"{lid}: self-loop edge {a}")
        _require(a in id_set and b in id_set, f"{lid}: edge to unknown cell")
        _require(
            a in assignable and b in assignable,
            f"{lid}: edge touches void cell ({a},{b})",
        )

    # Party minority (FR-1.2).
    party = rules.party_map(level)
    jerry = sum(1 for p in party.values() if p == "jerry")
    _require(
        jerry * 2 < len(assignable),
        f"{lid}: Jerry not a strict minority ({jerry}/{len(assignable)})",
    )

    # Reference solution validates SOLVED (FR-4.4, FR-5.3).
    ref = level["referenceSolution"]
    _require(len(ref) == k, f"{lid}: referenceSolution has {len(ref)} != K districts")
    assignment: dict[int, int] = {}
    for did, members in enumerate(ref):
        for cid in members:
            _require(
                cid not in assignment, f"{lid}: cell {cid} in two reference districts"
            )
            assignment[cid] = did
    result = rules.validate(level, assignment)
    _require(result["solved"], f"{lid}: referenceSolution NOT SOLVED -> {result}")
    return result


def verify_dir(levels_dir: Path) -> int:
    manifest = json.loads((levels_dir / "manifest.json").read_text(encoding="utf-8"))
    count = 0
    for entry in manifest["levels"]:
        level = json.loads((levels_dir / entry["file"]).read_text(encoding="utf-8"))
        result = verify_level(level)
        print(
            f"  OK {level['id']}: seats={result['seats']} "
            f"grade={result['compactnessGrade']} gap={result['efficiencyGap']}"
        )
        count += 1
    return count


def main() -> None:
    levels_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DIR
    print(f"Verifying levels in {levels_dir}")
    try:
        count = verify_dir(levels_dir)
    except (VerifyError, FileNotFoundError, KeyError, json.JSONDecodeError) as exc:
        print(f"VERIFY FAILED: {exc}", file=sys.stderr)
        sys.exit(1)
    print(f"All {count} levels verified.")


if __name__ == "__main__":
    main()
