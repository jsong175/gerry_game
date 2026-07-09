"""End-to-end: build levels to a temp dir, then run the verify gate on them."""

import json

import pytest

from engine.build_levels import build_all
from engine.verify_levels import VerifyError, verify_dir, verify_level


def test_build_all_then_verify(tmp_path):
    entries = build_all(tmp_path)
    assert [e["id"] for e in entries] == ["L1", "L2", "L3", "L4", "L5", "L6"]
    assert (tmp_path / "manifest.json").exists()
    # The gate passes on freshly built levels.
    assert verify_dir(tmp_path) == 6


def test_verify_rejects_broken_reference(tmp_path):
    build_all(tmp_path)
    level = json.loads((tmp_path / "L1.json").read_text(encoding="utf-8"))
    # Corrupt the reference solution: swap two cells between districts so a
    # district is no longer contiguous / correctly sized.
    level["referenceSolution"][0][0] = level["referenceSolution"][1][0]
    with pytest.raises(VerifyError):
        verify_level(level)


def test_verify_rejects_non_minority(tmp_path):
    build_all(tmp_path)
    level = json.loads((tmp_path / "L1.json").read_text(encoding="utf-8"))
    for c in level["cells"]:
        c["party"] = "jerry"  # Jerry now 100% -> violates FR-1.2
    with pytest.raises(VerifyError):
        verify_level(level)
