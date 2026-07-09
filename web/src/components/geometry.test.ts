import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Level } from "../types";
import { parseLevel } from "../levels/loader";
import {
  borderWeights,
  buildEdgeOwners,
  cellPoly,
  computeViewBox,
  edgeKey,
  polyEdges,
  squarePoly,
  trianglePoly,
} from "./geometry";

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

describe("border weight (DESIGN.md: relative to cell size)", () => {
  it("derives every weight from the cell's inradius, not a pixel constant", () => {
    const sq = borderWeights("square");
    const tri = borderWeights("triangle");
    const ratio = 1 / Math.sqrt(3); // triangle inradius / square inradius
    expect(tri.cell / sq.cell).toBeCloseTo(ratio, 9);
    expect(tri.district / sq.district).toBeCloseTo(ratio, 9);
    expect(tri.forming / sq.forming).toBeCloseTo(ratio, 9);
    expect(tri.violation / sq.violation).toBeCloseTo(ratio, 9);
  });

  it("draws the triangular level thinner than the square levels", () => {
    expect(borderWeights("triangle").district).toBeLessThan(borderWeights("square").district);
  });

  it("leaves the square levels' weights exactly as they were", () => {
    const sq = borderWeights("square");
    expect(sq.cell).toBeCloseTo(0.02, 9);
    expect(sq.district).toBeCloseTo(0.14, 9);
    expect(sq.forming).toBeCloseTo(0.08, 9);
    expect(sq.violation).toBeCloseTo(0.09, 9);
  });
});

describe("shared cell-edge index", () => {
  it("keys an edge the same from either endpoint", () => {
    expect(edgeKey([1, 2], [3, 4])).toBe(edgeKey([3, 4], [1, 2]));
  });

  it("pairs up exactly the cells the adjacency graph calls neighbours", () => {
    for (const id of ["L1", "L3"]) {
      const level = load(id);
      const owners = buildEdgeOwners(level);
      const shared = new Set<string>();
      for (const [key, cells] of owners) if (cells.length === 2) shared.add(key);

      const graph = new Set(level.adjacency.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
      const geometric = new Set<string>();
      for (const [, cells] of owners) {
        if (cells.length !== 2) continue;
        const [a, b] = cells.sort((x, y) => x - y);
        geometric.add(`${a}-${b}`);
      }
      expect(geometric, `${id}: shared polygon edges must match the graph`).toEqual(graph);
      expect(shared.size).toBe(level.adjacency.length);
    }
  });

  it("gives a boundary cell edges owned by only itself", () => {
    const level = load("L1");
    const owners = buildEdgeOwners(level);
    const corner = polyEdges(cellPoly(level.cells[0], level));
    const lone = corner.filter(([p1, p2]) => (owners.get(edgeKey(p1, p2)) ?? []).length === 1);
    expect(lone.length).toBe(2); // the two board-edge sides of the top-left cell
  });
});
