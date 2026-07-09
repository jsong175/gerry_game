"""The six Evil Jerry campaign level specs (REQUIREMENTS.md FR-5.3, Levels 1-6).

Each spec is the input to ``generator.build_level``. Win conditions and grid
sizes are transcribed directly from REQUIREMENTS.md; the ``partition`` field
names the reference-solution strategy used to prove solvability.
"""

from __future__ import annotations

LEVEL_SPECS: list[dict] = [
    {
        "id": "L1",
        "name": "The Basics of Packing and Cracking",
        "shape": "square",
        "width": 4,
        "height": 4,
        "districtCount": 4,
        "districtSize": 4,
        "minSeats": 2,  # 2 of 4 is the minority maximum at 16 cells
        "partition": "rows",
        "seed": 11,
    },
    {
        "id": "L2",
        "name": "The Sprawl",
        "shape": "square",
        "width": 8,
        "height": 8,
        "districtCount": 8,
        "districtSize": 8,
        "minSeats": 5,
        "partition": "rows",
        "seed": 22,
    },
    {
        "id": "L3",
        "name": "The Triangle Trap",
        "shape": "triangle",
        "rows": 6,
        "districtCount": 6,
        "districtSize": 6,
        "minSeats": 4,
        "partition": "grow",
        "seed": 33,
    },
    {
        "id": "L4",
        "name": "The Report Card",
        "shape": "square",
        "width": 10,
        "height": 10,
        "districtCount": 10,
        "districtSize": 10,
        "minSeats": 6,
        "compactnessMinGrade": "C",
        "partition": "blocks",
        "blockWidth": 5,
        "blockHeight": 2,
        "seed": 44,
    },
    {
        "id": "L5",
        "name": "The Natural Barrier",
        "shape": "square",
        "width": 12,
        "height": 12,
        "districtCount": 12,
        "districtSize": 11,
        "minSeats": 7,
        "partition": "grow",
        "level5": True,  # engine carves a 12-cell interior lake
        "seed": 55,
    },
    {
        "id": "L6",
        "name": "The Efficiency Gap",
        "shape": "square",
        "width": 14,
        "height": 14,
        "districtCount": 14,
        "districtSize": 14,
        "minSeats": 8,
        "minEfficiencyGap": 0.15,
        "partition": "rows",
        "seed": 66,
    },
]
