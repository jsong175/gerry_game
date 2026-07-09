import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Level } from "../types";
import { parseLevel } from "../levels/loader";
import { cellPoly, computeViewBox, squarePoly, trianglePoly } from "./geometry";

function load(id: string): Level {
  return parseLevel(
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../public/levels/${id}.json`, import.meta.url)), "utf-8"),
    ),
  );
}

const near = (a: [number, number], b: [number, number]) =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

describe("SVG geometry", () => {
  it("square cell is a unit box", () => {
    const poly = squarePoly({ id: 0, party: "opponent", fixed: false, void: false, col: 2, row: 3 });
    expect(poly.points).toEqual([
      [2, 3],
      [3, 3],
      [3, 4],
      [2, 4],
    ]);
    expect(poly.centroid).toEqual([2.5, 3.5]);
  });

  it("triangle polygons share an edge exactly where the graph says they are adjacent", () => {
    const level = load("L3");
    const polys = new Map(level.cells.map((c) => [c.id, trianglePoly(c, level.gridHeight)]));
    for (const [a, b] of level.adjacency) {
      const pa = polys.get(a)!.points;
      const pb = polys.get(b)!.points;
      let shared = 0;
      for (const va of pa) for (const vb of pb) if (near(va, vb)) shared++;
      expect(shared).toBeGreaterThanOrEqual(2); // adjacent triangles share an edge (2 vertices)
    }
  });

  it("computes a bounding view box for both shapes", () => {
    const sq = computeViewBox(load("L1"));
    expect(sq).toEqual({ minX: 0, minY: 0, width: 4, height: 4 });
    const tri = computeViewBox(load("L3"));
    expect(tri.width).toBeGreaterThan(0);
    expect(tri.height).toBeGreaterThan(0);
  });

  it("cellPoly dispatches on shape", () => {
    const sqLevel = load("L1");
    expect(cellPoly(sqLevel.cells[0], sqLevel).points.length).toBe(4);
    const triLevel = load("L3");
    expect(cellPoly(triLevel.cells[0], triLevel).points.length).toBe(3);
  });
});
