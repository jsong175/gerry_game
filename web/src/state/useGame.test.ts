import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Level } from "../types";
import { buildAdjacency, validate } from "../rules/rules";
import { makeReducer, type GameState } from "./useGame";
import { parseLevel } from "../levels/loader";

const level: Level = parseLevel(
  JSON.parse(
    readFileSync(fileURLToPath(new URL("../../public/levels/L1.json", import.meta.url)), "utf-8"),
  ),
);
const adj = buildAdjacency(level);
const reducer = makeReducer(level, adj);
const START: GameState = { assignment: new Map(), active: null, past: [], future: [] };

// BFS order over a district's members so each successive cell is edge-adjacent
// to the growing district (satisfies the tap-to-build adjacency rule).
function bfsOrder(members: number[]): number[] {
  const set = new Set(members);
  const seen = new Set<number>([members[0]]);
  const queue = [members[0]];
  const order: number[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    for (const nb of adj.get(n) ?? []) {
      if (set.has(nb) && !seen.has(nb)) {
        seen.add(nb);
        queue.push(nb);
      }
    }
  }
  return order;
}

function tap(state: GameState, id: number): GameState {
  return reducer(state, { type: "cellDown", id });
}

function solveFromReference(): GameState {
  let state = START;
  for (const district of level.referenceSolution) {
    for (const id of bfsOrder(district)) state = tap(state, id);
  }
  return state;
}

describe("district-forming interaction (useGame reducer)", () => {
  it("builds the reference solution by tapping and reaches SOLVED", () => {
    const state = solveFromReference();
    expect(state.assignment.size).toBe(16);
    expect(validate(level, state.assignment).solved).toBe(true);
  });

  it("auto-completes a district at max size and locks the active pointer", () => {
    let state = START;
    const first = bfsOrder(level.referenceSolution[0]);
    for (let i = 0; i < first.length - 1; i++) {
      state = tap(state, first[i]);
      expect(state.active).toBe(0); // still building district 0
    }
    state = tap(state, first[first.length - 1]);
    expect(state.active).toBeNull(); // auto-committed at size 4
  });

  it("ignores taps on non-adjacent unassigned cells (FR-1.4)", () => {
    // Seed district 0 with one corner, then tap the opposite corner.
    const seed = level.referenceSolution[0][0];
    let state = tap(START, seed);
    const far = level.cells.find(
      (c) => c.id !== seed && !(adj.get(seed) ?? new Set()).has(c.id),
    )!;
    const before = state.assignment.size;
    state = tap(state, far.id);
    expect(state.assignment.size).toBe(before); // nothing added
    expect(state.assignment.has(far.id)).toBe(false);
  });

  it("re-enters edit mode on a committed district and removes a cell (FR-2.2)", () => {
    const solved = solveFromReference();
    const cell = level.referenceSolution[0][0];
    const did = solved.assignment.get(cell)!;
    // Tap a committed cell -> re-enter edit (no mutation yet).
    let state = tap(solved, cell);
    expect(state.active).toBe(did);
    expect(state.assignment.size).toBe(16);
    // Tap it again -> removed from the district.
    state = tap(state, cell);
    expect(state.assignment.has(cell)).toBe(false);
    expect(state.assignment.size).toBe(15);
  });

  it("supports undo and redo (FR-2.4)", () => {
    const solved = solveFromReference();
    const undone = reducer(solved, { type: "undo" });
    expect(undone.assignment.size).toBe(15); // last tap reverted
    const redone = reducer(undone, { type: "redo" });
    expect(redone.assignment.size).toBe(16);
  });

  it("caps undo history at 15 snapshots", () => {
    let state: GameState = START;
    // 16 taps across the reference order produce 16 history pushes.
    const ids = level.referenceSolution.flatMap((d) => bfsOrder(d));
    for (const id of ids) state = tap(state, id);
    expect(state.past.length).toBeLessThanOrEqual(15);
  });
});
