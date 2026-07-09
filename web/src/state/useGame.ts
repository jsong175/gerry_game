// Core board state + district-forming interaction (DESIGN.md "Core Interaction";
// FR-1.3, FR-1.5, FR-2.1, FR-2.2, FR-2.4, FR-2.5).
//
// The assignment Map is the single source of truth; every derived value (winner,
// seats, rule pass/fail, stranding) is recomputed from it on each edit (FR-2.3).

import { useCallback, useMemo, useReducer } from "react";

import type { Assignment, Level, ValidationResult } from "../types";
import { buildAdjacency, districtWinner, validate } from "../rules/rules";
import { findStrandedPockets } from "./stranding";

const HISTORY_DEPTH = 15; // FR-2.4

export interface GameState {
  assignment: Assignment;
  active: number | null; // district currently being built / edited
  past: Assignment[];
  future: Assignment[];
}

type Action =
  | { type: "cellDown"; id: number }
  | { type: "cellEnter"; id: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "clear" };

export interface DistrictInfo {
  id: number;
  size: number;
  winner: "jerry" | "opponent" | null;
  complete: boolean;
}

export function makeReducer(level: Level, adj: Map<number, Set<number>>) {
  const cellsById = new Map(level.cells.map((c) => [c.id, c]));
  const K = level.districtCount;
  const size = level.districtSize;

  const districtsUsed = (a: Assignment): Set<number> => new Set(a.values());
  const sizeOf = (a: Assignment, did: number): number => {
    let n = 0;
    for (const v of a.values()) if (v === did) n++;
    return n;
  };
  const nextId = (a: Assignment): number | null => {
    const used = districtsUsed(a);
    for (let i = 0; i < K; i++) if (!used.has(i)) return i;
    return null;
  };
  const adjacentTo = (a: Assignment, id: number, did: number): boolean => {
    for (const nb of adj.get(id) ?? []) if (a.get(nb) === did) return true;
    return false;
  };

  const editable = (id: number): boolean => {
    const cell = cellsById.get(id);
    return !!cell && !cell.void && !cell.fixed; // FR-2.5
  };

  const applyEdit = (state: GameState, next: Assignment, active: number | null): GameState => ({
    assignment: next,
    active,
    past: [...state.past, state.assignment].slice(-HISTORY_DEPTH),
    future: [],
  });

  const tryAdd = (state: GameState, id: number, drag: boolean): GameState => {
    const A = state.active;
    if (A === null) return state;
    const filled = sizeOf(state.assignment, A);
    if (filled >= size) return state; // full: blocked (auto-completed districts lock)
    // Seed tap is allowed on an empty district; otherwise must be edge-adjacent.
    if (filled > 0 && !adjacentTo(state.assignment, id, A)) return state; // FR-1.4
    if (drag && filled === 0) return state; // drag only extends a seeded district
    const next = new Map(state.assignment);
    next.set(id, A);
    const active = filled + 1 >= size ? null : A; // auto-complete at max size
    return applyEdit(state, next, active);
  };

  return function reducer(state: GameState, action: Action): GameState {
    switch (action.type) {
      case "cellDown": {
        if (!editable(action.id)) return state;
        const did = state.assignment.get(action.id);
        if (state.active === null) {
          if (did !== undefined) return { ...state, active: did }; // re-enter edit
          const fresh = nextId(state.assignment);
          if (fresh === null) return state; // no room for a new district
          const next = new Map(state.assignment);
          next.set(action.id, fresh);
          return applyEdit(state, next, fresh);
        }
        if (did === state.active) {
          const next = new Map(state.assignment);
          next.delete(action.id); // remove -> unassigned (FR-2.2)
          return applyEdit(state, next, state.active);
        }
        if (did === undefined) return tryAdd(state, action.id, false);
        return state; // tap on a different district while building: ignore
      }
      case "cellEnter": {
        if (!editable(action.id)) return state;
        if (state.assignment.get(action.id) !== undefined) return state;
        return tryAdd(state, action.id, true);
      }
      case "undo": {
        if (!state.past.length) return state;
        const prev = state.past[state.past.length - 1];
        return {
          assignment: prev,
          active: null,
          past: state.past.slice(0, -1),
          future: [state.assignment, ...state.future],
        };
      }
      case "redo": {
        if (!state.future.length) return state;
        const nxt = state.future[0];
        return {
          assignment: nxt,
          active: null,
          past: [...state.past, state.assignment],
          future: state.future.slice(1),
        };
      }
      case "clear": {
        // Wipe every non-fixed assignment back to an empty board in one action
        // (DESIGN.md Resolved Decisions). Independent of the history stack, but
        // pushed onto it so a single undo restores the pre-clear board.
        const next = new Map(state.assignment);
        for (const cid of state.assignment.keys()) if (editable(cid)) next.delete(cid);
        if (next.size === state.assignment.size) return state; // nothing to clear
        return applyEdit(state, next, null);
      }
      default:
        return state;
    }
  };
}

export interface UseGame {
  assignment: Assignment;
  active: number | null;
  validation: ValidationResult;
  stranded: number[][];
  districtInfo: Map<number, DistrictInfo>;
  canUndo: boolean;
  canRedo: boolean;
  canClear: boolean;
  cellDown: (id: number) => void;
  cellEnter: (id: number) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
}

export function useGame(level: Level): UseGame {
  const adj = useMemo(() => buildAdjacency(level), [level]);
  const reducer = useMemo(() => makeReducer(level, adj), [level, adj]);
  const [state, dispatch] = useReducer(reducer, {
    assignment: new Map<number, number>(),
    active: null,
    past: [],
    future: [],
  });

  const party = useMemo(
    () => new Map(level.cells.filter((c) => !c.void).map((c) => [c.id, c.party])),
    [level],
  );

  const validation = useMemo(() => validate(level, state.assignment), [level, state.assignment]);
  const stranded = useMemo(
    () => findStrandedPockets(level, state.assignment),
    [level, state.assignment],
  );

  const districtInfo = useMemo(() => {
    const info = new Map<number, DistrictInfo>();
    const members = new Map<number, number[]>();
    for (const [cid, did] of state.assignment) {
      if (!members.has(did)) members.set(did, []);
      members.get(did)!.push(cid);
    }
    for (const [did, m] of members) {
      info.set(did, {
        id: did,
        size: m.length,
        winner: districtWinner(m, party) as DistrictInfo["winner"],
        complete: m.length === level.districtSize,
      });
    }
    return info;
  }, [state.assignment, party, level.districtSize]);

  const fixed = useMemo(
    () => new Set(level.cells.filter((c) => c.fixed || c.void).map((c) => c.id)),
    [level],
  );
  const canClear = useMemo(
    () => [...state.assignment.keys()].some((cid) => !fixed.has(cid)),
    [state.assignment, fixed],
  );

  return {
    assignment: state.assignment,
    active: state.active,
    validation,
    stranded,
    districtInfo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    canClear,
    cellDown: useCallback((id: number) => dispatch({ type: "cellDown", id }), []),
    cellEnter: useCallback((id: number) => dispatch({ type: "cellEnter", id }), []),
    undo: useCallback(() => dispatch({ type: "undo" }), []),
    redo: useCallback(() => dispatch({ type: "redo" }), []),
    clear: useCallback(() => dispatch({ type: "clear" }), []),
  };
}
