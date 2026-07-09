// Stranding detection (DESIGN.md "Stranding warning") — the TypeScript twin of
// engine/rules.py `stranded_pockets`, pinned to it by engine/fixtures/stranding_cases.json.
//
// After each edit we flood-fill the still-unassigned cells into connected
// components. A component that can never be tiled into full districts is
// "stranded". Two things this must get right:
//
//   * The flood-fill walks the level's shared `adjacency` graph, exactly like
//     every other rule. A square-grid neighbour shortcut would mis-split a
//     connected region on the triangular level and warn on valid districts.
//   * A district still being built already owns some cells and is *owed* the rest.
//     It draws those cells out of the regions it touches, so a region only strands
//     when its remainder cannot be handed to an adjacent unfinished district.
//     Otherwise one tap into a 6-triangle district would flag the remaining 35
//     cells, because 35 % 6 !== 0. The remainder — not the whole owed count — is
//     what must be absorbed, so a district owed 2 cells that touches two regions
//     can satisfy both when each only needs to shed 1.

import type { Assignment, Level } from "../types";
import { buildAdjacency, districtGroups } from "../rules/rules";

const asc = (a: number, b: number) => a - b;

/** Connected components of the unassigned cells, walking the shared adjacency graph. */
export function connectedComponents(
  adj: Map<number, Set<number>>,
  nodes: Set<number>,
): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of [...nodes].sort(asc)) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const node = queue.shift()!;
      comp.push(node);
      for (const nb of adj.get(node) ?? []) {
        if (nodes.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    out.push(comp.sort(asc));
  }
  return out;
}

export function findStrandedPockets(level: Level, assignment: Assignment): number[][] {
  const adj = buildAdjacency(level);
  const size = level.districtSize;

  // Districts mid-build: how many cells each still needs, and where it sits.
  const owed: { need: number; members: number[] }[] = [];
  for (const members of districtGroups(assignment).values()) {
    if (members.length < size) owed.push({ need: size - members.length, members });
  }

  const available = new Set<number>();
  for (const c of level.cells) {
    if (!c.void && assignment.get(c.id) === undefined) available.add(c.id);
  }

  const stranded: number[][] = [];
  for (const comp of connectedComponents(adj, available)) {
    const compSet = new Set(comp);
    let absorbable = 0;
    for (const { need, members } of owed) {
      const touches = members.some((m) =>
        [...(adj.get(m) ?? [])].some((nb) => compSet.has(nb)),
      );
      if (touches) absorbable += need;
    }
    if (comp.length % size > absorbable) stranded.push(comp);
  }
  return stranded;
}

export function hasStranding(level: Level, assignment: Assignment): boolean {
  return findStrandedPockets(level, assignment).length > 0;
}
