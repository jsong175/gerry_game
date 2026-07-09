// Pure SVG geometry helpers for the grid renderer. No React here so it can be
// unit-tested. Coordinates are in abstract units (1 = one cell); the SVG
// viewBox scales them to pixels.

import type { Level, LevelCell } from "../types";

export const TRI_H = Math.sqrt(3) / 2;

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
