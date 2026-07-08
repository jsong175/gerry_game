# Task: Decompose the Gerry Game specs into a GitHub epic with granular sub-issues

## Inputs

Read these files as the authoritative source of truth, in this precedence order:

1. `REQUIREMENTS.md` (what the system must do; the `FR-*` rules and per-level definitions)
2. `ARCHITECTURE.md` (how it is built: the offline Python engine vs. stateless React client boundary, the static-JSON level schema, runtime state model, dependency rules)
3. `DESIGN.md` (look, feel, tone, screen inventory, and the district-forming interaction model)

Precedence means: if two files disagree, the higher one wins (`REQUIREMENTS.md` governs behavior, `ARCHITECTURE.md` governs structure, `DESIGN.md` governs presentation).

Do not infer requirements that are not present in these files. If a needed detail is missing or ambiguous, do NOT guess. Collect it under an "Open Questions" section and stop short of fabricating scope. Note that `REQUIREMENTS.md` and `ARCHITECTURE.md` already contain their own "Open Questions" sections; carry those forward and add any new ones you discover, but do not invent scope to resolve them.

As of the latest spec pass, the only carried-forward open item is the **deferred** compactness ratio-to-grade cutoffs in FR-3.5 (rule fixed; exact numeric cutoffs tuned during solver calibration). The following are now resolved and should NOT be re-listed as open: the level-loading schema (static JSON files, per `ARCHITECTURE.md`), the Level 5 void-lake shape (12 cells, solver-chosen at generation time and committed to the level JSON), and the Level 6 efficiency-gap target (seats fixed at 8; +0.15 gap aspirational, solver may loosen the gap, committed value in `winCondition.minEfficiencyGap` is authoritative).

## Output

- Produce one parent epic and a set of sub-issues, all as GitHub-flavored Markdown, as detailed and granular as possible, ready to paste or create via `gh issue create`.
- Make each issue as technically detailed as possible to help an AI agent write correct code. Cite concrete artifacts from the specs: the exact `FR-*` IDs, the JSON schema field names from `ARCHITECTURE.md`, and the named sections of `DESIGN.md`.

### Sub-issue sizing (Goldilocks constraint)

Each sub-issue must be:

- **Single-responsibility**: one component, module, rule, screen, or data flow. (This project has no HTTP endpoints; the analogous units are engine modules, the shared rule functions, SVG render components, interaction handlers, and level-data artifacts.)
- **Deterministic**: a competent engineer or AI agent could complete it without needing clarification beyond the linked spec sections.
- **Bounded**: roughly half a day to two days of work. If larger, split it.
- **Independently testable**: for engine and rule work, via `pytest` and/or the JS/TS test runner; for UI, via component tests or a described manual check.

If a unit of work cannot meet all four, decompose it further.

### Required fields per sub-issue

- **Title**: imperative, specific. Examples for this project: "Implement the contiguity check (FR-3.1) in the shared rule module", "Render the square grid as SVG (FR-1.1, DESIGN.md Cell & District Visual Language)", "Add the reverse-solve level generator for Level 1 (FR-5.3)".
- **Traceability**: cite the exact `REQUIREMENTS.md` `FR-*` IDs, `ARCHITECTURE.md` headings/schema fields, and `DESIGN.md` sections this issue satisfies. Every sub-issue MUST trace to at least one requirement. After listing all sub-issues, flag any `FR-*` requirement or per-level definition that no sub-issue covers.
- **Acceptance criteria**: explicit, checkable conditions. Always include a test coverage gate (~80% for logic-bearing modules). Where the issue implements a rule that exists on both sides of the engine/client boundary (contiguity, parity, coverage, district count, winner, efficiency gap, compactness), include as a criterion that the Python (build-time) and TypeScript (runtime) implementations agree on a shared set of fixtures. Where the issue parses level JSON, include that malformed or schema-invalid data is rejected fail-closed rather than silently mis-rendered. For engine-generation issues, include that the `verify_levels` CI check passes on the produced level.
- **Dependencies**: list blocking sub-issues by title. Order the whole set so prerequisites precede dependents. For this project the natural foundations are: the level-JSON schema, the shared rule/validation functions, and the base SVG grid renderer. These should come before the issues that consume them (specific levels, screens, HUD, progression).
- **Labels**: suggest area, type, and complexity labels. Use this project's vocabulary, for example: `area:engine`, `area:web`, `area:levels`, `area:infra`; `type:feature`, `type:test`, `type:docs`, `type:chore`; and a complexity/risk signal such as `complexity:high` or `complexity:low`. (There is no security label set; this project has no backend, accounts, or user data.)
- **Model recommendation**: see "Model assignment" below.

Note: there is deliberately no "Security considerations" field. The system is a fully static, client-side game hosted on GitHub Pages with no server, database, API, authentication, or user data, so the original prompt's security, authz, and trust-boundary dimensions do not apply. Input-validation and rule-parity expectations that do matter are captured inside "Acceptance criteria" as ordinary correctness conditions, not as a separate security control.

### Coverage guidance (ensure the decomposition is complete)

Derive every issue from the specs, but make sure the set as a whole covers, at minimum, these natural work streams. Do not treat this list as scope in itself; each resulting issue must still trace to a spec section, and you should split any stream that is too large for the Goldilocks bound:

- **Engine / generator**: grid-and-lattice construction (squares and the Level 3 triangular subdivision), the reverse-solve partition generator, voter assignment that guarantees a solvable win target (FR-5.3), per-level constraint handling (compactness FR-3.5 for Level 4, efficiency gap FR-3.8 for Level 6, the Level 5 void lake), and JSON serialization.
- **Shared rules**: contiguity (FR-3.1), parity (FR-3.2), coverage (FR-3.3), district count (FR-3.4), per-district winner and ties (FR-4.1, FR-4.2), win-condition evaluation (FR-4.3, FR-4.4), compactness grading (FR-3.5), and efficiency gap (FR-3.8), implemented on both the Python and TypeScript sides.
- **Level data**: one issue per level (Levels 1 through 6) producing and committing its validated JSON, plus the `manifest.json`.
- **Rendering**: the SVG grid renderer for squares and for triangles, cell/district visual states, and the majority-tint / bold-completed-district treatment (DESIGN.md).
- **Interaction**: tap-to-build with edge-adjacency enforcement, drag-to-extend, auto-complete at max size, tap-again-to-edit, and the stranding warning (DESIGN.md Forming Districts; FR-1.3, FR-2.1, FR-2.2, FR-2.5).
- **HUD and feedback**: seat tally (FR-4.5), live active-rules checklist (FR-3.6), and violation diagnostics (FR-3.7).
- **Screens and flow**: Level Intro card with the "Understand!" gate, Play, Victory, Defeat (non-destructive, FR-4.6), and the scrolling Level Select (DESIGN.md; FR-5.1).
- **State and progression**: the in-memory `assignment` model, undo/redo at 15-step depth (FR-2.4), and `localStorage`-backed unlock progression (FR-5.1).
- **Infra**: Vite project setup, the GitHub Pages deploy workflow (Vite `base` + GitHub Action), and the `verify_levels` CI gate.

### Epic format

The parent epic must contain:

- A one-paragraph objective tied to `REQUIREMENTS.md` (the educational-gerrymandering puzzle and its guaranteed-solvable, static-delivery premise).
- A GitHub task list linking every sub-issue, grouped by work stream and ordered so foundations come first.

## Last notes

- Explicitly call out which issues can be worked on simultaneously (for example, the SVG renderer and the Python engine can proceed in parallel once the JSON schema is fixed), and which form a strict prerequisite chain.
- For each issue, recommend which class of model best fits the work and state why:
  - a frontier reasoning / agentic coding model for complex, multi-file, algorithmically tricky work (the reverse-solve generator, the compactness and efficiency-gap logic, the triangular-lattice geometry, the district-forming interaction state machine)
  - a faster, lower-cost model for mechanical, narrowly scoped, single-file work (a single level's JSON, a static screen's markup, a small pure rule function with fixtures, a label or config chore)
- Then name the specific current model you would assign from each major provider (Anthropic, OpenAI, Google) as of the date you run this prompt. Model lineups change frequently, so do NOT rely on model names cached in training data or written in this document. Verify each provider's current lineup (via web search) before recommending, and note the date you verified.
