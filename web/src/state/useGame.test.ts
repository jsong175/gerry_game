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

  it("clears every non-fixed assignment in one action", () => {
    const solved = solveFromReference();
    expect(solved.assignment.size).toBe(16);
    const cleared = reducer(solved, { type: "clear" });
    expect(cleared.assignment.size).toBe(0);
    expect(cleared.active).toBeNull();
  });

  it("leaves fixed and void cells untouched when clearing", () => {
    // Pin a cell as fixed and pre-assign it, the way FR-1.6 allows a level to.
    const pinned = level.cells[0].id;
    const fixedLevel: Level = {
      ...level,
      cells: level.cells.map((c) => (c.id === pinned ? { ...c, fixed: true } : c)),
    };
    const fixedReducer = makeReducer(fixedLevel, adj);
    const seeded: GameState = {
      assignment: new Map([
        [pinned, 0],
        [level.cells[1].id, 1],
      ]),
      active: null,
      past: [],
      future: [],
    };
    const cleared = fixedReducer(seeded, { type: "clear" });
    expect(cleared.assignment.get(pinned)).toBe(0); // fixed: survives the clear
    expect(cleared.assignment.has(level.cells[1].id)).toBe(false);
  });

  it("clears with an empty undo stack, and one undo restores the board", () => {
    // Build a board without ever pushing history, so past is empty at clear time.
    const board = new Map(solveFromReference().assignment);
    const fresh: GameState = { assignment: board, active: null, past: [], future: [] };

    const cleared = reducer(fresh, { type: "clear" });
    expect(cleared.assignment.size).toBe(0);
    expect(cleared.past.length).toBe(1); // clear is itself one undoable action

    const restored = reducer(cleared, { type: "undo" });
    expect(restored.assignment).toEqual(board);
    expect(validate(level, restored.assignment).solved).toBe(true);
  });

  it("is a no-op on an already-empty board", () => {
    const state = reducer(START, { type: "clear" });
    expect(state).toBe(START); // no history entry pushed
  });

  it("caps undo history at 15 snapshots", () => {
    let state: GameState = START;
    // 16 taps across the reference order produce 16 history pushes.
    const ids = level.referenceSolution.flatMap((d) => bfsOrder(d));
    for (const id of ids) state = tap(state, id);
    expect(state.past.length).toBeLessThanOrEqual(15);
  });
});

// A committed district must be editable no matter what the player did before.
// The old reducer refused any tap on a district while `active` pointed at another
// one, so whether an edit "took" depended on invisible leftover state.
function editCycleSuite(name: string, lvl: Level) {
  const a = buildAdjacency(lvl);
  const reduce = makeReducer(lvl, a);
  const empty: GameState = { assignment: new Map(), active: null, past: [], future: [] };
  const order = (members: number[]): number[] => {
    const set = new Set(members);
    const seen = new Set([members[0]]);
    const queue = [members[0]];
    const out: number[] = [];
    while (queue.length) {
      const n = queue.shift()!;
      out.push(n);
      for (const nb of a.get(n) ?? []) {
        if (set.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    return out;
  };
  const press = (s: GameState, id: number) => reduce(s, { type: "cellDown", id });
  const solved = (): GameState => {
    let s = empty;
    for (const d of lvl.referenceSolution) for (const id of order(d)) s = press(s, id);
    return s;
  };

  describe(`district editing is order-independent (${name})`, () => {
    it("re-enters edit mode on every committed district, in any order", () => {
      let state = solved();
      // Walk the districts twice; each tap must select the district touched.
      for (const pass of [0, 1]) {
        for (let d = 0; d < lvl.districtCount; d++) {
          const cell = lvl.referenceSolution[d][0];
          state = press(state, cell);
          expect(state.active, `pass ${pass}, district ${d}`).toBe(d);
        }
      }
    });

    it("removes a cell from any committed district, repeatedly", () => {
      let state = solved();
      for (let d = 0; d < lvl.districtCount; d++) {
        const cell = lvl.referenceSolution[d][0];
        state = press(state, cell); // enter edit on district d
        expect(state.active).toBe(d);
        state = press(state, cell); // remove it (FR-2.2)
        expect(state.assignment.has(cell), `district ${d} cell not removed`).toBe(false);
        state = press(state, cell); // put it back; district auto-completes
        expect(state.assignment.get(cell)).toBe(d);
        expect(state.active).toBeNull();
      }
      expect(state.assignment.size).toBe(lvl.districtCount * lvl.districtSize);
    });

    it("does not strand the player in edit mode on a full district", () => {
      // Build exactly one district, tap it to edit, then tap an unassigned cell.
      let state = empty;
      for (const id of order(lvl.referenceSolution[0])) state = press(state, id);
      expect(state.active).toBeNull(); // auto-committed

      state = press(state, lvl.referenceSolution[0][0]);
      expect(state.active).toBe(0); // re-entered edit on the full district

      const free = lvl.cells.find((c) => !c.void && !c.fixed && !state.assignment.has(c.id))!;
      state = press(state, free.id);
      expect(state.assignment.get(free.id), "tapping a free cell must start a district").toBe(1);
      expect(state.active).toBe(1);
    });

    it("ignores taps on other districts while a district is still being built", () => {
      // DESIGN.md: a partial district keeps focus; it is not abandoned by a stray tap.
      let state = solved();
      const victim = lvl.referenceSolution[0][0];
      state = press(state, victim); // edit district 0
      state = press(state, victim); // remove -> district 0 is now incomplete
      expect(state.active).toBe(0);

      const otherCell = lvl.referenceSolution[1][0];
      const before = state.assignment.get(otherCell);
      state = press(state, otherCell);
      expect(state.active, "must stay on the unfinished district").toBe(0);
      expect(state.assignment.get(otherCell)).toBe(before);
    });
  });
}

editCycleSuite("square level L1", level);
editCycleSuite(
  "triangular level L3",
  parseLevel(
    JSON.parse(
      readFileSync(fileURLToPath(new URL("../../public/levels/L3.json", import.meta.url)), "utf-8"),
    ),
  ),
);
