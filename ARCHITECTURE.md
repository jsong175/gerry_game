# Architecture — Gerry Game (Evil Jerry Edition)

The technical companion to `REQUIREMENTS.md`. `REQUIREMENTS.md` is authoritative on *what the system must do* (the `FR-*` rules); this document is authoritative on *how it is built*. All FR references below point back to that file.

## Required Architecture Inputs

- **Requirements source:** REQUIREMENTS.md
- **System purpose:** Static educational puzzle game about political geometry.
- **Offline Solver/Generator:** Python (standard library plus NetworkX, NumPy, and optionally pandas).
- **Frontend Framework:** React + TypeScript, built with Vite.
- **Rendering Strategy:** SVG DOM elements for grid/lattice drawing.
- **Data Transfer:** Static JSON files.
- **Hosting/Deployment:** GitHub Pages (100% static, no live backend server).

## System Architecture

Two independent halves with a hard boundary: an **offline Python engine** (build time) and a **live React client** (run time). They communicate *only* through committed static JSON. There is no server, database, or API at runtime (per hosting input).

```
  Python engine (build time)                     React client (run time)
  ───────────────────────────                    ─────────────────────────
  generate map + affiliations                    fetch /levels/manifest.json
  reverse-solve a guaranteed win  ──▶  static ──▶ fetch /levels/<id>.json
  validate contiguity/parity/K        JSON       render SVG grid/lattice
  compute compactness / eff. gap                 track click→district state
  emit levels/*.json  (committed)                validate partition, show SOLVED
```

**Offline Python engine** (`engine/`, standard library plus NetworkX / NumPy / optional pandas). Owns all combinatorial work:
- Generates each level's grid geometry, per-cell party affiliations (Jerry strictly < 50%, FR-1.2), and any fixed/void cells (FR-1.6).
- Runs **reverse constraint satisfaction**: searches for at least one partition into `K` contiguous, equal-size districts that meets the win condition, so every shipped level is provably solvable (FR-5.3). If none exists, the level is rejected, not shipped.
- Validates the reference solution with the same rule logic the client enforces (contiguity, parity, coverage, district count — FR-3.1–3.4) plus level-specific metrics (compactness FR-3.5, efficiency gap FR-3.8).
- Owns the placement of Level 5's void "lake": it chooses the specific contiguous interior void cells (12 of them, shape not fixed in the spec) subject to solvability and to forcing districts to route around the barrier (FR-1.6, Level 5).
- When an aspirational target is infeasible, the engine may relax level-specific thresholds within authorized bounds and record the *achieved* value in the emitted JSON. For Level 6 this means loosening the required efficiency gap in steps (gap before the seat count, which stays fixed at 8) and committing the final required gap to `winCondition.minEfficiencyGap` (FR-3.8, Level 6).
- Emits static JSON (below). This is the *only* output; the engine ships nothing else to runtime.

**React client** (`web/`). **Completely stateless regarding map generation** — it never generates, solves, or reverse-engineers maps. It only:
- Loads level JSON (no computation of geometry or affiliations — read as given).
- Renders the grid/lattice as raw SVG elements (FR-1.1).
- Tracks user click/drag state: which cell belongs to which district (FR-1.3, FR-1.5, FR-2.1–2.2).
- Re-validates the *current user partition* against the win conditions after every edit (FR-2.3, FR-3.6, FR-4.4) and reports per-rule pass/fail and offending cells (FR-3.7).

The rule-checking code (contiguity/parity/coverage/count) exists on **both** sides. Python is the source of truth that guarantees solvability offline; the client re-implements the same checks to grade the player live. Both consume the identical adjacency graph baked into the JSON, so they cannot disagree about topology.

## Data Flow & State Management

### Static JSON schema

A `manifest.json` lists levels in unlock order (FR-5.1); each level is one file. Cells are an explicit node list with a **precomputed adjacency graph**, so the client is agnostic to square vs. triangular geometry (FR-1.4) — it walks edges, never re-derives neighbors.

```jsonc
// levels/manifest.json
{ "levels": [ { "id": "L1", "name": "The Basics of Packing and Cracking", "file": "L1.json" }, ... ] }

// levels/L1.json
{
  "id": "L1",
  "name": "The Basics of Packing and Cracking",
  "shape": "square",              // "square" | "triangle" (drives SVG renderer only)
  "districtCount": 4,             // K (FR-3.4)
  "districtSize": 4,              // exact parity target (FR-3.2)
  "winCondition": {               // FR-4.3
    "minSeats": 3,                // Jerry districts required
    "compactnessMinGrade": null,  // "C" for L4 (FR-3.5), else null
    "minEfficiencyGap": null      // L6: solver-committed required gap (target +0.15, may be loosened), FR-3.8; else null
  },
  "cells": [
    // id: stable index. party: "jerry" | "opponent". geometry per shape:
    //   square   -> "col","row"
    //   triangle -> "row","col","orient":"up"|"down"
    { "id": 0, "party": "opponent", "col": 0, "row": 0, "fixed": false, "void": false },
    ...
  ],
  "adjacency": [ [0,1], [0,4], ... ], // undirected edges over non-void cells (FR-1.4)
  "referenceSolution": [ [0,1,4,5], ... ] // optional: K cell-id groups, hint/verification only
}
```

Void cells (FR-1.6, Level 5 lake) are either omitted from `cells` or flagged `"void": true` and excluded from `adjacency`; they render as terrain and are never graph vertices. The specific void cells for Level 5 are chosen by the engine at generation time (shape not fixed in the spec); the committed JSON is authoritative for which cells are void. `referenceSolution` proves solvability but the client does not reveal it.

### Runtime session state (no database)

All player state is **ephemeral, in-memory React state** — nothing persists server-side. The core structure:

- **`assignment: Map<cellId, districtId | null>`** — the single source of truth for the live board (FR-1.3, FR-1.5). Every derived value (per-district cell sets, per-district winner, seat tally, rule pass/fail) is **computed from this map on each edit**, not stored redundantly (FR-2.3).
- **Edits** mutate `assignment` immutably (produce a new Map) so React re-renders and history is cheap.
- **Undo/redo** is a bounded stack of the last 15 `assignment` snapshots (FR-2.4); fixed cells are excluded from mutation (FR-2.5).
- **Validation** is a pure function `(level, assignment) → { perRule: {...}, offendingCells: [...], solved: bool }` (FR-3.6, FR-3.7, FR-4.4). Contiguity uses BFS/DFS over the JSON `adjacency` graph.
- **Progression** (which levels are unlocked) is the only state worth surviving a reload; persist it to `localStorage` keyed by level id (FR-5.1). No backend, no accounts.

## Dependency Rules

- Do not add a dependency when the standard library or a few lines of first-party code will do.
- The Python backend MUST NOT use external libraries unless they earn their place. NetworkX, NumPy, and pandas are explicitly permitted, since they are faster and more readable than hand-rolled equivalents. Any library beyond those three must clear the "absolutely necessary" bar before being added.
- The React frontend MUST NOT use heavy mapping libraries (like Leaflet or Mapbox). All grids and lattices must be rendered using raw SVG elements for maximum performance and topological control.
