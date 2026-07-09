// Stranding detection (DESIGN.md "Stranding warning").
//
// After each edit we flood-fill the still-unassigned cells into connected
// components. A component whose size is not a whole multiple of the district
// size can never be tiled into full districts, so it is "stranded". This single
// modulo-after-flood-fill test catches both under-sized pockets and oversized
// leftovers cheaply, with no solver call.

import type { Assignment, Level } from "../types";
import { buildAdjacency } from "../rules/rules";

export function findStrandedPockets(level: Level, assignment: Assignment): number[][] {
  const adj = buildAdjacency(level);
  const available = new Set<number>();
  for (const c of level.cells) {
    if (!c.void && assignment.get(c.id) === undefined) available.add(c.id);
  }

  const seen = new Set<number>();
  const stranded: number[][] = [];
  for (const start of available) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const node = queue.shift()!;
      comp.push(node);
      for (const nb of adj.get(node) ?? []) {
        if (available.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    if (comp.length % level.districtSize !== 0) stranded.push(comp);
  }
  return stranded;
}

export function hasStranding(level: Level, assignment: Assignment): boolean {
  return findStrandedPockets(level, assignment).length > 0;
}
