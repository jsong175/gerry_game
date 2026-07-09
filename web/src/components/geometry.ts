// Pure SVG geometry helpers for the grid renderer. No React here so it can be
// unit-tested. Coordinates are in abstract units (1 = one cell); the SVG
// viewBox scales them to pixels.

import type { Level, LevelCell, Shape } from "../types";

export const TRI_H = Math.sqrt(3) / 2;

// The inradius of one cell, in the same abstract units the polygons use (side 1).
// It is the natural "how big is a cell" measure for line weights: a unit square
// admits a circle of radius 1/2, a unit equilateral triangle only 1/(2*sqrt(3)).
export const CELL_INRADIUS: Record<Shape, number> = {
  square: 0.5,
  triangle: 1 / (2 * Math.sqrt(3)),
};

// Border weights as a fraction of the cell's inradius, never as fixed pixels
// (DESIGN.md "Border weight is relative to cell size"). The square levels keep
// exactly the weights they had; Level 3's small triangles get ~58% of them.
export const BORDER_FRACTION = {
  cell: 0.04,
  district: 0.28,
  forming: 0.16,
  violation: 0.18,
} as const;

export interface BorderWeights {
  cell: number;
  district: number;
  forming: number;
  violation: number;
  dash: string;
}

export function borderWeights(shape: Shape): BorderWeights {
  const r = CELL_INRADIUS[shape];
  return {
    cell: BORDER_FRACTION.cell * r,
    district: BORDER_FRACTION.district * r,
    forming: BORDER_FRACTION.forming * r,
    violation: BORDER_FRACTION.violation * r,
    dash: `${0.36 * r} ${0.24 * r}`,
  };
}

export interface Poly {
  points: [number, number][];
  centroid: [number, number];
}

// A square cell occupies the unit box [col, col+1] x [row, row+1].
export function squarePoly(cell: LevelCell): Poly {
  const x = cell.col ?? 0;
  const y = cell.row ?? 0;
  return {
    points: [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1],
    ],
    centroid: [x + 0.5, y + 0.5],
  };
}

// A unit triangle in an equilateral subdivision of `rows` rows. Up-triangles
// (col even) point up; down-triangles (col odd) point down. Matches the
// adjacency graph built in engine/geometry.build_triangle.
export function trianglePoly(cell: LevelCell, rows: number): Poly {
  const r = cell.row ?? 0;
  const c = cell.col ?? 0;
  const yTop = r * TRI_H;
  const yBottom = (r + 1) * TRI_H;
  const center = rows / 2;
  const topLeft = center - r / 2;
  const bottomLeft = center - (r + 1) / 2;
  let points: [number, number][];
  if (c % 2 === 0) {
    const i = c / 2;
    points = [
      [bottomLeft + i, yBottom],
      [bottomLeft + i + 1, yBottom],
      [topLeft + i, yTop],
    ];
  } else {
    const j = (c - 1) / 2;
    points = [
      [topLeft + j, yTop],
      [topLeft + j + 1, yTop],
      [bottomLeft + j + 1, yBottom],
    ];
  }
  const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
  const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
  return { points, centroid: [cx, cy] };
}

export function cellPoly(cell: LevelCell, level: Level): Poly {
  return level.shape === "triangle" ? trianglePoly(cell, level.gridHeight) : squarePoly(cell);
}

export interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function computeViewBox(level: Level): ViewBox {
  if (level.shape === "square") {
    return { minX: 0, minY: 0, width: level.gridWidth, height: level.gridHeight };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of level.cells) {
    for (const [x, y] of trianglePoly(cell, level.gridHeight).points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY: 0, width: maxX - minX, height: maxY };
}

export function pointsToStr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

// --- Shared cell-edge index ----------------------------------------------------
// District outlines are drawn by stroking only the polygon edges that separate two
// different districts. Working from the polygons (rather than from square col/row
// arithmetic) means the same code draws squares and triangles.

export type Edge = [[number, number], [number, number]];

const round = (n: number): string => n.toFixed(6);

/** A canonical, orientation-independent key for the segment between two points. */
export function edgeKey([x1, y1]: [number, number], [x2, y2]: [number, number]): string {
  const a = `${round(x1)},${round(y1)}`;
  const b = `${round(x2)},${round(y2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The polygon's edges, each as an ordered pair of its endpoints. */
export function polyEdges(poly: Poly): Edge[] {
  return poly.points.map((p, i) => [p, poly.points[(i + 1) % poly.points.length]] as Edge);
}

/** edgeKey -> the ids of the (one or two) cells sharing that edge. */
export function buildEdgeOwners(level: Level): Map<string, number[]> {
  const owners = new Map<string, number[]>();
  for (const cell of level.cells) {
    for (const [p1, p2] of polyEdges(cellPoly(cell, level))) {
      const key = edgeKey(p1, p2);
      const list = owners.get(key);
      if (list) list.push(cell.id);
      else owners.set(key, [cell.id]);
    }
  }
  return owners;
}
