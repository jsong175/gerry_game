// Shared rule / validation logic (FR-3, FR-4) — the TypeScript twin of
// engine/rules.py. Kept in lockstep with the Python source of truth via the
// shared fixtures in engine/fixtures/rule_cases.json (see rules.test.ts).
//
// Every function is pure and reports the specific offending districts/cells so
// failures are diagnosable (FR-3.7).

import type { Assignment, Grade, Level, ValidationResult } from "../types";

// Compactness A-F cutoffs on the mean perimeter-to-area ratio (FR-3.5).
// Tightened after playtest so a stretched 1x10 row (ratio 2.2) grades D instead of
// squeaking through as a C. Must match COMPACTNESS_CUTOFFS in engine/rules.py verbatim.
const COMPACTNESS_CUTOFFS: [Grade, number][] = [
  ["A", 1.5],
  ["B", 1.9],
  ["C", 2.1],
  ["D", 2.5],
];
const GRADE_ORDER: Grade[] = ["A", "B", "C", "D", "F"];
const SQUARE_FULL_DEGREE = 4;

const asc = (a: number, b: number) => a - b;

export function buildAdjacency(level: Level): Map<number, Set<number>> {
  const adj = new Map<number, Set<number>>();
  for (const cell of level.cells) {
    if (!cell.void) adj.set(cell.id, new Set());
  }
  for (const [a, b] of level.adjacency) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }
  return adj;
}

export function assignableIds(level: Level): Set<number> {
  const out = new Set<number>();
  for (const c of level.cells) if (!c.void) out.add(c.id);
  return out;
}

export function partyMap(level: Level): Map<number, string> {
  const out = new Map<number, string>();
  for (const c of level.cells) if (!c.void) out.set(c.id, c.party);
  return out;
}

export function districtGroups(assignment: Assignment): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  for (const [cid, did] of assignment) {
    if (did === null || did === undefined) continue;
    if (!groups.has(did)) groups.set(did, []);
    groups.get(did)!.push(cid);
  }
  return groups;
}

// --- Individual rules ---------------------------------------------------------

export function checkContiguity(
  adj: Map<number, Set<number>>,
  groups: Map<number, number[]>,
): { ok: boolean; badDistricts: number[]; badCells: number[] } {
  const badDistricts: number[] = [];
  const badCells: number[] = [];
  for (const [did, members] of groups) {
    const memberSet = new Set(members);
    const start = members[0];
    const seen = new Set<number>([start]);
    const queue = [start];
    while (queue.length) {
      const node = queue.shift()!;
      for (const nb of adj.get(node) ?? []) {
        if (memberSet.has(nb) && !seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    if (seen.size !== memberSet.size) {
      badDistricts.push(did);
      badCells.push(...members);
    }
  }
  return {
    ok: badDistricts.length === 0,
    badDistricts: badDistricts.sort(asc),
    badCells: [...new Set(badCells)].sort(asc),
  };
}

export function checkParity(
  groups: Map<number, number[]>,
  size: number,
): { ok: boolean; bad: number[] } {
  const bad: number[] = [];
  for (const [did, m] of groups) if (m.length !== size) bad.push(did);
  return { ok: bad.length === 0, bad: bad.sort(asc) };
}

export function checkCoverage(
  assignable: Set<number>,
  assignment: Assignment,
): { ok: boolean; offending: number[] } {
  const assigned = new Set<number>();
  for (const [cid, did] of assignment) if (did !== null && did !== undefined) assigned.add(cid);
  const offending: number[] = [];
  for (const id of assignable) if (!assigned.has(id)) offending.push(id);
  for (const id of assigned) if (!assignable.has(id)) offending.push(id);
  return { ok: offending.length === 0, offending: [...new Set(offending)].sort(asc) };
}

export function checkDistrictCount(groups: Map<number, number[]>, k: number): boolean {
  return groups.size === k;
}

export function districtWinner(members: number[], party: Map<number, string>): string | null {
  let jerry = 0;
  for (const c of members) if (party.get(c) === "jerry") jerry++;
  const opp = members.length - jerry;
  if (jerry > opp) return "jerry";
  if (opp > jerry) return "opponent";
  return null;
}

export function seatCount(groups: Map<number, number[]>, party: Map<number, string>): number {
  let seats = 0;
  for (const m of groups.values()) if (districtWinner(m, party) === "jerry") seats++;
  return seats;
}

export function compactness(
  adj: Map<number, Set<number>>,
  groups: Map<number, number[]>,
): { grade: Grade; meanRatio: number } {
  if (groups.size === 0) return { grade: "F", meanRatio: 0 };
  const ratios: number[] = [];
  for (const members of groups.values()) {
    const memberSet = new Set(members);
    let perimeter = 0;
    for (const cell of members) {
      let same = 0;
      for (const nb of adj.get(cell) ?? []) if (memberSet.has(nb)) same++;
      perimeter += SQUARE_FULL_DEGREE - same;
    }
    ratios.push(perimeter / members.length);
  }
  const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  let grade: Grade = "F";
  for (const [letter, cutoff] of COMPACTNESS_CUTOFFS) {
    if (meanRatio <= cutoff) {
      grade = letter;
      break;
    }
  }
  return { grade, meanRatio };
}

export function gradeAtLeast(grade: Grade, minimum: Grade): boolean {
  return GRADE_ORDER.indexOf(grade) <= GRADE_ORDER.indexOf(minimum);
}

export function efficiencyGap(
  groups: Map<number, number[]>,
  party: Map<number, string>,
  total: number,
): number {
  let jerryWasted = 0;
  let oppWasted = 0;
  for (const members of groups.values()) {
    let jerry = 0;
    for (const c of members) if (party.get(c) === "jerry") jerry++;
    const opp = members.length - jerry;
    const threshold = Math.floor(members.length / 2) + 1;
    const winner = districtWinner(members, party);
    if (winner === "jerry") {
      jerryWasted += jerry - threshold;
      oppWasted += opp;
    } else if (winner === "opponent") {
      oppWasted += opp - threshold;
      jerryWasted += jerry;
    } else {
      jerryWasted += jerry;
      oppWasted += opp;
    }
  }
  if (total === 0) return 0;
  return (oppWasted - jerryWasted) / total;
}

// --- Composite evaluation (FR-4.4) -------------------------------------------

export function validate(level: Level, assignment: Assignment): ValidationResult {
  const adj = buildAdjacency(level);
  const assignable = assignableIds(level);
  const party = partyMap(level);
  const size = level.districtSize;
  const k = level.districtCount;
  const win = level.winCondition;

  const clean: Assignment = new Map();
  for (const [cid, did] of assignment) if (did !== null && did !== undefined) clean.set(cid, did);
  const groups = districtGroups(clean);

  const contig = checkContiguity(adj, groups);
  const parity = checkParity(groups, size);
  const coverage = checkCoverage(assignable, clean);
  const countOk = checkDistrictCount(groups, k);

  const complete = parity.ok && coverage.ok && countOk && contig.ok;
  const seats = seatCount(groups, party);

  const perRule: ValidationResult["perRule"] = {
    contiguity: contig.ok,
    parity: parity.ok,
    coverage: coverage.ok,
    districtCount: countOk,
    compactness: null,
    efficiencyGap: null,
  };
  const offendingDistricts = [...new Set([...contig.badDistricts, ...parity.bad])].sort(asc);
  const offendingCells = [...new Set([...contig.badCells, ...coverage.offending])].sort(asc);

  let grade: Grade | null = null;
  let gap: number | null = null;
  if (win.compactnessMinGrade !== null) {
    grade = compactness(adj, groups).grade;
    perRule.compactness = complete && gradeAtLeast(grade, win.compactnessMinGrade);
  }
  if (win.minEfficiencyGap !== null) {
    gap = efficiencyGap(groups, party, assignable.size);
    perRule.efficiencyGap = complete && gap >= win.minEfficiencyGap;
  }

  const seatsOk = seats >= win.minSeats;
  const applicable = [
    perRule.contiguity,
    perRule.parity,
    perRule.coverage,
    perRule.districtCount,
    ...(perRule.compactness === null ? [] : [perRule.compactness]),
    ...(perRule.efficiencyGap === null ? [] : [perRule.efficiencyGap]),
  ];
  const rulesOk = applicable.every(Boolean);
  const solved = complete && rulesOk && seatsOk;

  return {
    perRule,
    offendingDistricts,
    offendingCells,
    complete,
    seats,
    minSeats: win.minSeats,
    seatsOk,
    compactnessGrade: grade,
    efficiencyGap: gap,
    solved,
  };
}
