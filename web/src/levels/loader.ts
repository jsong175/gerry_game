// Level JSON loading + fail-closed schema validation.
//
// The client reads levels as given (ARCHITECTURE.md: "no computation of
// geometry or affiliations"). Anything that does not match the schema is
// rejected with a thrown error rather than silently mis-rendered.

import type { Level, LevelCell, Manifest } from "../types";

class SchemaError extends Error {}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function req(cond: boolean, msg: string): void {
  if (!cond) throw new SchemaError(msg);
}

export function parseManifest(data: unknown): Manifest {
  req(isObject(data) && Array.isArray(data.levels), "manifest: missing levels array");
  const levels = (data as { levels: unknown[] }).levels.map((e, i) => {
    req(isObject(e), `manifest.levels[${i}]: not an object`);
    const entry = e as Record<string, unknown>;
    req(typeof entry.id === "string", `manifest.levels[${i}]: id`);
    req(typeof entry.name === "string", `manifest.levels[${i}]: name`);
    req(typeof entry.file === "string", `manifest.levels[${i}]: file`);
    return { id: entry.id as string, name: entry.name as string, file: entry.file as string };
  });
  req(levels.length > 0, "manifest: no levels");
  return { levels };
}

export function parseLevel(data: unknown): Level {
  req(isObject(data), "level: not an object");
  const d = data as Record<string, unknown>;
  req(typeof d.id === "string", "level.id");
  req(typeof d.name === "string", "level.name");
  req(d.shape === "square" || d.shape === "triangle", "level.shape");
  req(typeof d.districtCount === "number" && d.districtCount > 0, "level.districtCount");
  req(typeof d.districtSize === "number" && d.districtSize > 0, "level.districtSize");
  req(isObject(d.winCondition), "level.winCondition");
  req(Array.isArray(d.cells) && d.cells.length > 0, "level.cells");
  req(Array.isArray(d.adjacency), "level.adjacency");
  req(Array.isArray(d.referenceSolution), "level.referenceSolution");

  const shape = d.shape as "square" | "triangle";
  const win = d.winCondition as Record<string, unknown>;
  req(typeof win.minSeats === "number", "winCondition.minSeats");
  req(
    win.compactnessMinGrade === null || typeof win.compactnessMinGrade === "string",
    "winCondition.compactnessMinGrade",
  );
  req(
    win.minEfficiencyGap === null || typeof win.minEfficiencyGap === "number",
    "winCondition.minEfficiencyGap",
  );

  const ids = new Set<number>();
  const cells: LevelCell[] = (d.cells as unknown[]).map((c, i) => {
    req(isObject(c), `cells[${i}]: not an object`);
    const cell = c as Record<string, unknown>;
    req(typeof cell.id === "number", `cells[${i}].id`);
    req(!ids.has(cell.id as number), `cells[${i}]: duplicate id ${cell.id}`);
    ids.add(cell.id as number);
    req(cell.party === "jerry" || cell.party === "opponent", `cells[${i}].party`);
    if (shape === "square") {
      req(typeof cell.col === "number" && typeof cell.row === "number", `cells[${i}] col/row`);
    } else {
      req(
        typeof cell.row === "number" &&
          typeof cell.col === "number" &&
          (cell.orient === "up" || cell.orient === "down"),
        `cells[${i}] triangle geometry`,
      );
    }
    return {
      id: cell.id as number,
      party: cell.party as LevelCell["party"],
      fixed: Boolean(cell.fixed),
      void: Boolean(cell.void),
      col: cell.col as number | undefined,
      row: cell.row as number | undefined,
      orient: cell.orient as LevelCell["orient"],
    };
  });

  const assignable = cells.filter((c) => !c.void);
  req(
    assignable.length === (d.districtCount as number) * (d.districtSize as number),
    `assignable cells (${assignable.length}) != K*S`,
  );
  const assignableIds = new Set(assignable.map((c) => c.id));

  for (const [j, edge] of (d.adjacency as unknown[]).entries()) {
    req(Array.isArray(edge) && edge.length === 2, `adjacency[${j}]: not a pair`);
    const [a, b] = edge as number[];
    req(typeof a === "number" && typeof b === "number", `adjacency[${j}]: non-numeric`);
    req(a !== b, `adjacency[${j}]: self-loop`);
    req(assignableIds.has(a) && assignableIds.has(b), `adjacency[${j}]: touches void/unknown cell`);
  }

  return {
    id: d.id as string,
    name: d.name as string,
    shape,
    gridWidth: typeof d.gridWidth === "number" ? d.gridWidth : 0,
    gridHeight: typeof d.gridHeight === "number" ? d.gridHeight : 0,
    districtCount: d.districtCount as number,
    districtSize: d.districtSize as number,
    winCondition: {
      minSeats: win.minSeats as number,
      compactnessMinGrade: (win.compactnessMinGrade ?? null) as Level["winCondition"]["compactnessMinGrade"],
      minEfficiencyGap: (win.minEfficiencyGap ?? null) as number | null,
    },
    cells,
    adjacency: d.adjacency as [number, number][],
    referenceSolution: d.referenceSolution as number[][],
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return res.json();
}

const base = import.meta.env.BASE_URL;

export async function loadManifest(): Promise<Manifest> {
  return parseManifest(await fetchJson(`${base}levels/manifest.json`));
}

export async function loadLevel(file: string): Promise<Level> {
  return parseLevel(await fetchJson(`${base}levels/${file}`));
}

export { SchemaError };
