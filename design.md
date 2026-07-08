# Design — Gerry Game (Evil Jerry Edition)

This document defines the look, feel, tone, and core interaction model for Gerry Game. It is the visual and UX companion to `REQUIREMENTS.md`, which defines the rules and level logic. Where the two overlap, `REQUIREMENTS.md` is authoritative on *what the game does*; this document is authoritative on *how it looks and feels*.

## Design Philosophy

The game should feel like a clean, friendly mobile puzzle app — the kind of thing you could pick up and understand in ten seconds. Everything here is deliberately built to be achievable by someone who is not an animator or a professional game developer. That means: flat shapes, solid fills, a small fixed color palette, and readable type. No particle systems, no physics, no rigged characters, no scroll parallax, no complex animation. Motion is limited to simple, cheap state changes (a color fade, a button press, a modal sliding in). If a feature would require real animation skill to look good, it is out of scope.

The visual hierarchy always puts the grid first. The grid is the game; everything else (title bars, buttons, tallies) is quiet chrome that frames it and gets out of the way.

## Story & Tone

You play as an intern hired by **Jerry Lu'mander**, an unpopular but scheming politician who represents the **No Good Party** (color: red). Jerry's problem is that voters overwhelmingly prefer the beloved **Puppies and Rainbows Party** (color: yellow). Jerry's one advantage is that he has total control over how his country's voting districts are drawn. Your job, as his intern, is to carve up the map so the No Good Party wins anyway — while navigating an escalating tangle of election regulations designed to stop exactly this kind of scheme.

The tone is playful and satirical, a cartoon-villain comedy rather than anything preachy. Jerry is gleefully, cartoonishly evil; the Puppies and Rainbows Party is nauseatingly wholesome. The humor comes from the contrast between the cute framing and the cynical mechanics the player is actually learning. The game never editorializes about real politics — it teaches the *math* of gerrymandering through a knowingly ridiculous story.

Party color assignments are fixed everywhere in the game:

- **No Good Party (Jerry / the player's side):** red. Always the minority of voters (per FR-1.2).
- **Puppies and Rainbows Party (the opponent):** yellow. Always the majority of voters.

## Color Palette — "Clean Civic"

A warm off-white canvas with near-black lines, bold flat party colors, and a cool teal for interactive UI so buttons never compete with the red/yellow party language.

| Role | Hex | Usage |
| --- | --- | --- |
| Background | `#F4F1EA` | App canvas / warm paper base |
| Surface | `#FFFFFF` | Cards, modals, HUD panels |
| Ink | `#2B2B33` | Text, grid lines, cell borders |
| No Good red | `#E63946` | No Good Party voter cells & icons |
| Puppies yellow | `#FDCA40` | Puppies & Rainbows voter cells & icons |
| Red district tint | `#F7C6C1` | Fill of a district won by No Good |
| Yellow district tint | `#FCE9A8` | Fill of a district won by Puppies |
| UI accent (teal) | `#2A9D8F` | Buttons, active controls, links |
| Success | `#43A047` | Satisfied rules / valid district ticks |
| Neutral / invalid | `#9AA0A6` | Unassigned cells, invalid-district dashed outline |
| Draw line | `#FFFFFF` | The white outline drawn while defining a district |

The red/yellow pairing is intentionally chosen partly because it reads clearly for the most common forms of color blindness (far better than red/green). Even so, color is never the *only* signal — see Accessibility.

## Typography

One friendly, rounded sans-serif used throughout, in at most two weights. Something in the Nunito / Poppins family: approachable, high legibility at small sizes, and free to license. Regular weight for body and cell counts; bold for titles, the seat tally, and button labels. No decorative or display fonts. Numbers (district counts, tallies, grades) should use tabular figures so they don't shift as they update.

## Layout & Screens

Portrait-first, phone-shaped. On a wider desktop window the play area stays centered in a phone-width column so the composition never stretches awkwardly. The core play screen is a single, non-scrolling view:

- **Top bar (HUD):** level name on the left; undo and redo buttons on the right.
- **Progress strip (under the top bar):** the seat tally and the active-rules checklist (see HUD & Feedback).
- **Center:** the grid, taking the majority of the screen.
- **Bottom bar:** the primary action button ("Rig the Election!" / submit). No district picker is needed — each new district starts automatically on the next tap of an unassigned cell.

The full screen inventory is small on purpose:

1. **Level Intro card** — explains the level's gimmick before play.
2. **Play screen** — the grid and HUD above.
3. **Victory screen** — Jerry celebrates; button to the next level.
4. **Defeat screen** — non-destructive "not solved yet"; button back to the same board.
5. **Level Select** — a simple vertical scrolling list of levels, locked levels grayed out (supports FR-5.1 progression).

## Level Intro Card

Before every level, a full-screen card introduces that level's single new idea — packing and cracking, contiguity, compactness, the lake barrier, the efficiency gap — in one short, plain-language paragraph, alongside a small worked diagram built from the same grid renderer used in play (e.g., a quick example of packing vs. cracking) rather than bespoke art — this keeps the intro visuals consistent with the board and avoids extra illustration work. Jerry appears here to "brief the intern," keeping the tone in character. A single large teal **"Understand!"** button dismisses the card and reveals the grid. The card template is identical across levels so the player learns the rhythm: read the gimmick, tap Understand, play.

## Core Interaction — Forming Districts

The top design priority is that forming a district feels effortless. The primary input is **tapping**, with dragging available as an accelerator once a district is under way.

**Tap to build.** Tapping an unassigned cell starts a new district and highlights that cell. Each subsequent tap adds a cell *only if it is edge-adjacent to the district in progress* (per FR-1.4 — rook-adjacency on the square levels, edge-sharing among the 3 neighbors on Level 3's triangles) — tapping a non-adjacent cell does nothing and the cell is not highlighted, so the player can't accidentally create a disconnected district. A **white line** traces the growing border as cells are added.

**Drag to speed up.** After the district has been seeded with a few taps, the player can drag across neighboring cells to add them in one motion — useful on the larger maps (Levels 5–6). Dragging obeys the same adjacency rule and only picks up edge-adjacent cells.

**Auto-complete at max size.** When a district reaches its required size (the level's per-district cell count), the game automatically commits it and blocks any further tapping or dragging onto it. The player never has to manually "close" a full district or worry about overfilling one.

**Committed districts are bold.** A completed district is drawn with a **bold outline** to signal it's full and locked. Its fill updates to the majority tint at that moment:

- **Light red** (`#F7C6C1`) if majority No Good.
- **Light yellow** (`#FCE9A8`) if majority Puppies.
- **Neutral / no tint** if tied (no winner, per FR-4.2).

Because two neighboring districts of the same majority would read as the same tint, each committed district also keeps its bold border and a small district number so adjacent districts stay visually distinct. Voter cells keep their own party color and icon *inside* the tint — the tint answers "who wins here," the cells answer "why."

**Editing a district.** To change a completed district, the player **taps it again** to re-enter edit mode; a small tooltip on the district reads *"click to edit the district."* In edit mode the district un-bolds and its cells can be removed or added, still respecting adjacency and the size cap. Removing a cell returns it to unassigned unless it is fixed (FR-1.6 / FR-2.5). Fixed and void cells are visually locked — void cells (e.g., the Level 5 lake) render as non-playable terrain, not voters, so it's clear they belong to no district.

**Stranding warning.** After each edit the game scans the unassigned cells for **stranded pockets** — connected components cut off from the rest by committed districts, void cells, or the board edge. It warns whenever a pocket's size is **not a whole multiple of the district size**, because such a pocket can only be filled by districts drawn entirely inside it, and a component that isn't a multiple of the district size can never be partitioned into full districts. This one modulo test (after a flood-fill) cheaply catches every case that matters — pockets smaller than a single district *and* oversized leftovers like size S+2 — with no solver call. Pockets that *are* a multiple of the district size are legitimate (they become whole districts) and are left alone. The warning is a small, non-blocking pop-up (*"Careful — you've stranded a few voters who can't form a full district."*); the player can undo or keep going. The rare case of a correctly-sized pocket that still can't be tiled into contiguous districts is left for final validation to catch.

A top-bar **undo** button steps back through recent edits and a **redo** button re-applies an undone edit. (History depth follows FR-2.4; if a shallow depth feels punishing during playtest, this is the first thing to loosen.)

## HUD & Feedback

The HUD's job is to make the win condition and the rules legible at all times, so the player is never guessing why a solution isn't accepted.

- **Seat tally (FR-4.5):** a compact bar or counter reading Jerry's won districts against the target, e.g. `No Good: 3 / 4`, using the party colors. This updates live after every edit.
- **Active-rules checklist:** the level's applicable constraints listed as short items (Equal size · Contiguous · All cells used · Compactness ≥ C, etc.), each showing a live pass/fail tick in success-green or neutral-gray. This directly surfaces FR-3.6's per-rule reporting.
- **Violation diagnostics (FR-3.7):** when a rule fails, the offending district(s) and cell(s) are highlighted on the grid — a non-contiguous district gets a dashed gray outline; an over/under-sized district shows its count in red. The player should be able to *see* the problem, not just be told "invalid."

## Win & Loss Screens

**Victory** appears when a level is solved (FR-4.4): a celebratory card with Jerry gloating ("The No Good Party wins! You're a natural, intern."), the final seat tally, and a teal button to the next level. Keep celebration simple — a static triumphant Jerry and maybe a one-shot color flourish, not an animated sequence.

**Defeat** is intentionally gentle and non-destructive (FR-4.6). If the player submits an invalid or losing partition, a card notes what fell short ("Not quite — the puppies still have the votes. Look at the red flags on the map.") and a single button returns them to their **exact board state** so no work is lost. It's less a failure screen than a "keep going" nudge. There is no game-over.

## Characters / Mascot

Jerry Lu'mander is the game's face: a small static illustration with a handful of expression states (smug briefing, gleeful on victory, sputtering on defeat). A few flat drawings, reused across screens — no rigging or animation. The Puppies and Rainbows Party can be represented by a simple wholesome emblem (a puppy under a rainbow) used on their voter cells/icons and the opponent tally. Keeping the cast to two simple visual identities keeps the art workload realistic.

## Cell & District Visual Language

Each voter cell carries both a **color** and a **tiny icon** (a simple mark for No Good, a puppy/rainbow mark for Puppies) so party identity survives color blindness, grayscale, and the lighter district tints layered behind it. Cell states, all achievable with flat styling:

- **Unassigned:** party color at slightly reduced strength, neutral border.
- **Assigned:** party color at full strength, sitting inside its district's tint and numbered border.
- **Fixed:** a small lock indicator; cannot be edited.
- **Void:** rendered as terrain (not a voter); never counts as a vertex.

## Accessibility

Never rely on color alone: every party signal is doubled with an icon or label, and every rule state is doubled with a tick/text, not just green vs. gray. Maintain strong contrast between ink and background and between cells and tints. Use tabular numbers and a minimum comfortable touch-target size. Because the default input is tapping rather than fiddly dragging, the primary interaction is already the most accessible one; dragging stays a pure optional accelerator and is never required to complete a level.

## Audio

Optional and minimal: a soft click on cell assignment, a "snap" when a district closes, and a short jingle on victory. All sound is mutable and off by default is acceptable. No audio should be required to understand game state.

## Animation Budget (explicit constraints)

Permitted: color/opacity fades on district commit, button press states, modal slide/fade in-out, a one-shot highlight pulse on rule violations, a single victory flourish. Not in scope: character animation, particle effects, physics, animated transitions between levels beyond a simple fade, or anything requiring a timeline/keyframe tool. This ceiling is a feature, not a limitation — it keeps the game buildable by a non-specialist and keeps the aesthetic clean.

## Resolved Decisions

- **Stranding warning:** fires on any stranded pocket whose size is not a whole multiple of the district size — a cheap flood-fill + modulo check (see Forming Districts).
- **Level Select:** a simple vertical scrolling list, not a themed campaign map.
- **Intro-card diagrams:** generated from the in-game grid renderer, not hand-drawn per level.
