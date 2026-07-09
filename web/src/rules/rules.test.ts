import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { Assignment, Level } from "../types";
import { districtWinner, efficiencyGap, validate } from "./rules";

interface Case {
  name: string;
  level: Level;
  assignment: Record<string, number>;
  expected: ReturnType<typeof validate>;
}

const fixturePath = fileURLToPath(
  new URL("../../../engine/fixtures/rule_cases.json", import.meta.url),
);
const cases: Case[] = JSON.parse(readFileSync(fixturePath, "utf-8"));

function toAssignment(obj: Record<string, number>): Assignment {
  const m: Assignment = new Map();
  for (const [k, v] of Object.entries(obj)) m.set(Number(k), v);
  return m;
}

describe("Python<->TypeScript rule parity", () => {
  it("loaded shared fixtures", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  for (const c of cases) {
    it(`agrees with the engine on '${c.name}'`, () => {
      const result = validate(c.level, toAssignment(c.assignment));
      const { efficiencyGap: gap, ...rest } = result;
      const { efficiencyGap: expGap, ...expRest } = c.expected;
      expect(rest).toEqual(expRest);
      if (expGap === null) {
        expect(gap).toBeNull();
      } else {
        expect(gap).toBeCloseTo(expGap, 9);
      }
    });
  }
});

describe("rule primitives", () => {
  const party = new Map<number, string>([
    [0, "jerry"],
    [1, "jerry"],
    [2, "opponent"],
    [3, "opponent"],
  ]);

  it("reports a tie as no winner (FR-4.2)", () => {
    expect(districtWinner([0, 2], party)).toBeNull();
    expect(districtWinner([0, 1, 2], party)).toBe("jerry");
  });

  it("efficiency gap rewards packing opponents (FR-3.8)", () => {
    const groups = new Map<number, number[]>([
      [0, [0, 1, 2]],
      [1, [3, 4, 5]],
    ]);
    const p = new Map<number, string>([
      [0, "jerry"],
      [1, "jerry"],
      [2, "opponent"],
      [3, "opponent"],
      [4, "opponent"],
      [5, "opponent"],
    ]);
    expect(efficiencyGap(groups, p, 6)).toBeCloseTo(2 / 6, 9);
  });
});
