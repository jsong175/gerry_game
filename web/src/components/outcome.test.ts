// ISSUE A: the result card must follow the evaluated partition (FR-4.4, FR-4.6).
// Victory only when every applicable rule passes AND Jerry meets the seat target;
// anything else is the non-destructive NOT SOLVED card.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Assignment, Level } from "../types";
import { parseLevel } from "../levels/loader";
import { validate } from "../rules/rules";
import { outcomeFor } from "./PlayScreen";

function load(id: string): Level {
  return parseLevel(
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../public/levels/${id}.json`, import.meta.url)), "utf-8"),
    ),
  );
}

const assign = (groups: number[][]): Assignment => {
  const m: Assignment = new Map();
  groups.forEach((members, did) => members.forEach((c) => m.set(c, did)));
  return m;
};

const L1 = load("L1");
const L4 = load("L4");

describe("submitted partition -> result card", () => {
  it("shows victory for a genuinely winning partition", () => {
    const v = validate(L1, assign(L1.referenceSolution));
    expect(v.solved).toBe(true);
    expect(outcomeFor(v)).toBe("victory");
  });

  it("shows NOT SOLVED for an empty board", () => {
    const v = validate(L1, new Map());
    expect(v.solved).toBe(false);
    expect(outcomeFor(v)).toBe("defeat");
  });

  it("shows NOT SOLVED for an incomplete partition", () => {
    const partial = L1.referenceSolution.slice(0, 3); // one district's worth left over
    const v = validate(L1, assign(partial));
    expect(v.perRule.coverage).toBe(false);
    expect(outcomeFor(v)).toBe("defeat");
  });

  it("shows NOT SOLVED for a complete, legal, but losing partition", () => {
    // Four columns of L1: contiguous, equal, covers the board, 4 districts...
    const cols = [0, 1, 2, 3].map((c) => [0, 1, 2, 3].map((r) => r * 4 + c));
    const v = validate(L1, assign(cols));
    expect(v.complete).toBe(true);
    expect(v.seatsOk).toBe(false); // ...but Jerry does not reach the seat target
    expect(outcomeFor(v)).toBe("defeat");
  });

  it("shows NOT SOLVED when only the level-specific rule fails", () => {
    // L4 all-rows: complete and legal, but tentacle districts fail the Report Card.
    const rows = Array.from({ length: 10 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => r * 10 + c),
    );
    const v = validate(L4, assign(rows));
    expect(v.complete).toBe(true);
    expect(v.perRule.compactness).toBe(false);
    expect(outcomeFor(v)).toBe("defeat");
  });

  it("never shows victory unless validation says SOLVED", () => {
    const boards: [string, Assignment][] = [
      ["empty", new Map()],
      ["one cell", new Map([[0, 0]])],
      ["three districts", assign(L1.referenceSolution.slice(0, 3))],
      ["reference", assign(L1.referenceSolution)],
    ];
    for (const [name, board] of boards) {
      const v = validate(L1, board);
      expect(outcomeFor(v) === "victory", name).toBe(v.solved);
    }
  });
});

// The engine is the source of truth for SOLVED/NOT SOLVED; the client must agree.
interface Case {
  name: string;
  level: Level;
  assignment: Record<string, number>;
  expected: { solved: boolean };
}
const cases: Case[] = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../engine/fixtures/rule_cases.json", import.meta.url)),
    "utf-8",
  ),
);

describe("Python<->TypeScript agreement on the submitted outcome", () => {
  it("covers at least one solved and one unsolved fixture", () => {
    expect(cases.some((c) => c.expected.solved)).toBe(true);
    expect(cases.some((c) => !c.expected.solved)).toBe(true);
  });

  for (const c of cases) {
    it(`'${c.name}' -> ${c.expected.solved ? "victory" : "defeat"}`, () => {
      const board: Assignment = new Map();
      for (const [k, v] of Object.entries(c.assignment)) board.set(Number(k), v);
      const result = validate(c.level, board);
      expect(result.solved).toBe(c.expected.solved);
      expect(outcomeFor(result)).toBe(c.expected.solved ? "victory" : "defeat");
    });
  }
});
