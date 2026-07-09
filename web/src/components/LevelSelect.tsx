// Level Select: a simple vertical scrolling list; locked levels grayed out
// (DESIGN.md "Level Select"; FR-5.1 progression).

import type { Manifest } from "../types";
import { isUnlocked } from "../state/progression";

export function LevelSelect({
  manifest,
  completed,
  onPick,
}: {
  manifest: Manifest;
  completed: Set<string>;
  onPick: (id: string) => void;
}) {
  return (
    <div className="screen level-select">
      <div className="card wide">
        <h1>Evil Jerry's Campaign</h1>
        <p className="brief">Pick a scheme, intern. Clear one to unlock the next.</p>
        <ul className="level-list">
          {manifest.levels.map((lvl, i) => {
            const unlocked = isUnlocked(manifest, i, completed);
            const done = completed.has(lvl.id);
            return (
              <li key={lvl.id}>
                <button
                  className={`level-row${unlocked ? "" : " locked"}`}
                  disabled={!unlocked}
                  onClick={() => unlocked && onPick(lvl.id)}
                >
                  <span className="level-num">{i + 1}</span>
                  <span className="level-name">{lvl.name}</span>
                  <span className="level-status" aria-hidden="true">
                    {done ? "✓" : unlocked ? "▶" : "🔒"}
                  </span>
                  <span className="sr-only">
                    {done ? "completed" : unlocked ? "unlocked" : "locked"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
