// A tiny read-only board used as the intro card's worked diagram, built from
// the same renderer as play (DESIGN.md: intro diagrams come from the in-game
// grid renderer, not bespoke art).

import type { DistrictInfo } from "../state/useGame";
import type { Assignment, Level } from "../types";

const jerry = new Set([0, 1, 4]); // 3 red voters, rest yellow

export const EXAMPLE_LEVEL: Level = {
  id: "EX",
  name: "example",
  shape: "square",
  gridWidth: 4,
  gridHeight: 2,
  districtCount: 2,
  districtSize: 4,
  winCondition: { minSeats: 1, compactnessMinGrade: null, minEfficiencyGap: null },
  cells: Array.from({ length: 8 }, (_, id) => ({
    id,
    party: jerry.has(id) ? "jerry" : "opponent",
    fixed: false,
    void: false,
    col: id % 4,
    row: Math.floor(id / 4),
  })),
  adjacency: (() => {
    const edges: [number, number][] = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 4; c++) {
        const id = r * 4 + c;
        if (c < 3) edges.push([id, id + 1]);
        if (r < 1) edges.push([id, id + 4]);
      }
    }
    return edges;
  })(),
  referenceSolution: [],
};

// Left 2x2 = red-majority seat; right 2x2 = yellow seat.
export const EXAMPLE_ASSIGNMENT: Assignment = new Map([
  [0, 0],
  [1, 0],
  [4, 0],
  [5, 0],
  [2, 1],
  [3, 1],
  [6, 1],
  [7, 1],
]);

export const EXAMPLE_INFO: Map<number, DistrictInfo> = new Map([
  [0, { id: 0, size: 4, winner: "jerry", complete: true }],
  [1, { id: 1, size: 4, winner: "opponent", complete: true }],
]);
