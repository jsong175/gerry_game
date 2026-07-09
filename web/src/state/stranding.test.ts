import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Assignment, Level } from "../types";
import { buildAdjacency } from "../rules/rules";
import { parseLevel } from "../levels/loader";
import { findStrandedPockets } from "./stranding";

function loadLevel(id: string): Level {
  return parseLevel(
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../public/levels/${id}.json`, import.meta.url)), "utf-8"),
    ),
  );
}

const L1 = loadLevel("L1");
const L3 = loadLevel("L3");

function assign(groups: number[][]): Assignment {
  const m: Assignment = new Map();
  groups.forEach((members, did) => members.forEach((c) => m.set(c, did)));
  return m;
}

describe("stranding on the triangular level (Level 3)", () => {
  it("does not warn on a valid partition-in-progress", () => {
    // Two committed 6-triangle districts leave 24 unassigned cells: 24 % 6 === 0.
    const assignment = assign(L3.referenceSolution.slice(0, 2));
    expect(assignment.size).toBe(12);
    expect(findStrandedPockets(L3, assignment)).toEqual([]);
  });

  it("stays quiet across every prefix of the reference solution", () => {
    const assignment: Assignment = new Map();
    L3.referenceSolution.forEach((members, did) => {
      members.forEach((c) => assignment.set(c, did));
      expect(findStrandedPockets(L3, assignment), `after district ${did}`).toEqual([]);
    });
  });

  it("does not warn one tap into a district (the district is owed 5 more cells)", () => {
    const seed = L3.referenceSolution[0][0];
    expect(findStrandedPockets(L3, new Map([[seed, 0]]))).toEqual([]);
  });

  it("stays quiet at every tap while a district is being built", () => {
    // At 4 of 6 triangles the district pinches off a 1-cell pocket it will absorb
    // itself; its 2 owed cells must satisfy both that pocket and the 31-cell rest.
    const adj = buildAdjacency(L3);
    for (const district of L3.referenceSolution) {
      const members = new Set(district);
      const seen = new Set([district[0]]);
      const queue = [district[0]];
      const assignment: Assignment = new Map();
      let tap = 0;
      while (queue.length) {
        const node = queue.shift()!;
        assignment.set(node, 0);
        expect(findStrandedPockets(L3, assignment), `tap ${++tap}`).toEqual([]);
        for (const nb of [...(adj.get(node) ?? [])].sort((a, b) => a - b)) {
          if (members.has(nb) && !seen.has(nb)) {
            seen.add(nb);
            queue.push(nb);
          }
        }
      }
    }
  });

  it("walks the shared adjacency graph, not a square-grid guess", () => {
    // Cell ids 0..35 look like a 6x6 grid, but the apex triangle has ONE neighbour.
    const adj = buildAdjacency(L3);
    expect([...adj.get(0)!]).toEqual([2]);
    expect(adj.get(0)!.has(1)).toBe(false); // a square-grid walk would join 0 and 1
  });

  it("still warns when a committed district walls off the apex", () => {
    const pockets = findStrandedPockets(L3, assign([[1, 2, 3, 4, 5, 7]]));
    expect(pockets).toContainEqual([0]);
  });
});

describe("stranding on square levels", () => {
  it("does not warn one tap into a district", () => {
    const seed = L1.referenceSolution[0][0];
    expect(findStrandedPockets(L1, new Map([[seed, 0]]))).toEqual([]);
  });

  it("does not warn on an empty board", () => {
    expect(findStrandedPockets(L1, new Map())).toEqual([]);
  });

  it("does not warn on committed whole districts", () => {
    expect(findStrandedPockets(L1, assign(L1.referenceSolution.slice(0, 2)))).toEqual([]);
  });

  it("warns on a pocket that is not a whole multiple of the district size", () => {
    // Fence off cell 0 (neighbours 1 and 4) behind one committed 4-cell district.
    const adj = buildAdjacency(L1);
    expect(adj.get(0)!.has(1) && adj.get(0)!.has(4)).toBe(true);
    const pockets = findStrandedPockets(L1, assign([[1, 4, 5, 9]]));
    expect(pockets).toContainEqual([0]);
  });
});

interface StrandingCase {
  name: string;
  level: Level;
  assignment: Record<string, number>;
  expected: number[][];
}

const strandingCases: StrandingCase[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../engine/fixtures/stranding_cases.json", import.meta.url)),
    "utf-8",
  ),
);

describe("Python<->TypeScript stranding parity", () => {
  it("loaded shared fixtures", () => {
    expect(strandingCases.length).toBeGreaterThanOrEqual(6);
  });

  for (const c of strandingCases) {
    it(`agrees with the engine on '${c.name}'`, () => {
      const assignment: Assignment = new Map();
      for (const [k, v] of Object.entries(c.assignment)) assignment.set(Number(k), v);
      expect(findStrandedPockets(c.level, assignment)).toEqual(c.expected);
    });
  }
});
