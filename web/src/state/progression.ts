// Level-unlock progression persisted to localStorage (FR-5.1). This is the only
// state worth surviving a reload (ARCHITECTURE.md "Runtime session state").

import type { Manifest } from "../types";

const KEY = "gerry.completed.v1";

export function loadCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x) => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

export function saveCompleted(completed: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...completed]));
  } catch {
    /* storage unavailable — progression simply won't persist */
  }
}

export function markComplete(levelId: string): Set<string> {
  const completed = loadCompleted();
  completed.add(levelId);
  saveCompleted(completed);
  return completed;
}

// A level is unlocked if it is the first, or the previous level is completed.
export function isUnlocked(manifest: Manifest, index: number, completed: Set<string>): boolean {
  if (index <= 0) return true;
  return completed.has(manifest.levels[index - 1].id);
}

export function nextLevelId(manifest: Manifest, levelId: string): string | null {
  const idx = manifest.levels.findIndex((l) => l.id === levelId);
  if (idx < 0 || idx + 1 >= manifest.levels.length) return null;
  return manifest.levels[idx + 1].id;
}
