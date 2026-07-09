import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parseLevel, parseManifest, SchemaError } from "./loader";

const levelsDir = fileURLToPath(new URL("../../public/levels/", import.meta.url));
const readLevel = (id: string) => JSON.parse(readFileSync(`${levelsDir}${id}.json`, "utf-8"));

describe("loader schema validation (fail-closed)", () => {
  it("accepts every committed level", () => {
    const manifest = parseManifest(JSON.parse(readFileSync(`${levelsDir}manifest.json`, "utf-8")));
    expect(manifest.levels.length).toBe(6);
    for (const entry of manifest.levels) {
      const level = parseLevel(readLevel(entry.id));
      expect(level.cells.length).toBeGreaterThan(0);
    }
  });

  it("rejects a missing shape", () => {
    const level = readLevel("L1");
    delete level.shape;
    expect(() => parseLevel(level)).toThrow(SchemaError);
  });

  it("rejects an edge that touches a void cell", () => {
    const level = readLevel("L5");
    const voidCell = level.cells.find((c: { void: boolean }) => c.void);
    level.adjacency.push([voidCell.id, level.cells[0].id]);
    expect(() => parseLevel(level)).toThrow(SchemaError);
  });

  it("rejects a wrong K*S cell count", () => {
    const level = readLevel("L1");
    level.districtSize = 5; // 4 * 5 != 16
    expect(() => parseLevel(level)).toThrow(SchemaError);
  });

  it("rejects duplicate cell ids", () => {
    const level = readLevel("L1");
    level.cells[1].id = level.cells[0].id;
    expect(() => parseLevel(level)).toThrow(SchemaError);
  });

  it("rejects a bad party value", () => {
    const level = readLevel("L1");
    level.cells[0].party = "banana";
    expect(() => parseLevel(level)).toThrow(SchemaError);
  });

  it("rejects a manifest with no levels", () => {
    expect(() => parseManifest({ levels: [] })).toThrow(SchemaError);
  });
});
