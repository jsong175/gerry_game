"""Build all levels and emit committed static JSON (ARCHITECTURE.md Data Transfer).

Usage:  py -m engine.build_levels [output_dir]

Writes ``<output_dir>/L*.json`` plus ``manifest.json`` (default:
``web/public/levels``). This is the engine's only runtime output.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import rules
from .generator import build_level
from .levels import LEVEL_SPECS

DEFAULT_OUT = Path(__file__).resolve().parent.parent / "web" / "public" / "levels"


def build_all(out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_entries = []
    for spec in LEVEL_SPECS:
        level = build_level(spec)
        path = out_dir / f"{level['id']}.json"
        path.write_text(json.dumps(level, indent=2) + "\n", encoding="utf-8", newline="\n")
        result = rules.validate(level, _ref_assignment(level))
        print(
            f"  {level['id']} {level['name']!r}: "
            f"seats={result['seats']}/{level['winCondition']['minSeats']} "
            f"grade={result['compactnessGrade']} "
            f"gap={_fmt(result['efficiencyGap'])} SOLVED={result['solved']}"
        )
        manifest_entries.append(
            {"id": level["id"], "name": level["name"], "file": f"{level['id']}.json"}
        )

    manifest = {"levels": manifest_entries}
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    return manifest_entries


def _ref_assignment(level: dict) -> dict[int, int]:
    assignment: dict[int, int] = {}
    for did, members in enumerate(level["referenceSolution"]):
        for cid in members:
            assignment[cid] = did
    return assignment


def _fmt(value):
    return f"{value:+.3f}" if isinstance(value, float) else value


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    print(f"Building {len(LEVEL_SPECS)} levels -> {out_dir}")
    entries = build_all(out_dir)
    print(f"Wrote {len(entries)} levels + manifest.json")


if __name__ == "__main__":
    main()
