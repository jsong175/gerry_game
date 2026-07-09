// Play screen (DESIGN.md "Layout & Screens"): non-scrolling phone-shaped view
// with a top bar (name + undo/redo), the seat/rules HUD, the SVG grid, and the
// primary "Rig the Election!" action. Victory/Defeat are overlays so the board
// state is preserved across a non-destructive defeat (FR-4.6).

import { useMemo, useState } from "react";

import type { Level, ValidationResult } from "../types";
import { buildAdjacency, checkContiguity, districtGroups } from "../rules/rules";
import { useGame } from "../state/useGame";
import { Grid } from "./Grid";
import { Hud } from "./Hud";
import { DefeatScreen, VictoryScreen } from "./ResultScreens";

type Result = "none" | "victory" | "defeat";

/** Which card a submitted partition earns (FR-4.4). Victory only when SOLVED. */
export function outcomeFor(validation: ValidationResult): "victory" | "defeat" {
  return validation.solved ? "victory" : "defeat";
}

export function PlayScreen({
  level,
  hasNext,
  onWin,
  onNext,
  onExit,
}: {
  level: Level;
  hasNext: boolean;
  onWin: (id: string) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const game = useGame(level);
  const [result, setResult] = useState<Result>("none");

  // Live grid highlight: only genuinely broken (non-contiguous) districts, not
  // the many still-unassigned cells (which are simply work-in-progress).
  const brokenCells = useMemo(() => {
    const adj = buildAdjacency(level);
    const groups = districtGroups(game.assignment);
    return new Set(checkContiguity(adj, groups).badCells);
  }, [level, game.assignment]);

  const submit = () => {
    const outcome = outcomeFor(game.validation);
    if (outcome === "victory") onWin(level.id);
    setResult(outcome);
  };

  return (
    <div className="screen play">
      <header className="topbar">
        <button className="btn-ghost small" onClick={onExit} aria-label="level select">
          ☰
        </button>
        <span className="level-title">{level.name}</span>
        <span className="topbar-actions">
          <button className="btn-ghost small" disabled={!game.canUndo} onClick={game.undo} aria-label="undo">
            ↺
          </button>
          <button className="btn-ghost small" disabled={!game.canRedo} onClick={game.redo} aria-label="redo">
            ↻
          </button>
          <button
            className="btn-ghost small"
            disabled={!game.canClear}
            onClick={game.clear}
            aria-label="clear all districts"
            title="Clear all districts"
          >
            ✕
          </button>
        </span>
      </header>

      <Hud level={level} validation={game.validation} />

      <main className="board">
        <Grid
          level={level}
          assignment={game.assignment}
          active={game.active}
          districtInfo={game.districtInfo}
          offendingCells={brokenCells}
          onCellDown={game.cellDown}
          onCellEnter={game.cellEnter}
        />
      </main>

      {game.stranded.length > 0 && (
        <div className="toast" role="status">
          Careful — you've stranded voters who can't form a full district.
          <button className="btn-ghost small" onClick={game.undo} disabled={!game.canUndo}>
            Undo
          </button>
        </div>
      )}

      <footer className="bottombar">
        <button className="btn-primary big" onClick={submit}>
          Rig the Election!
        </button>
      </footer>

      {result === "victory" && (
        <VictoryScreen
          seats={game.validation.seats}
          hasNext={hasNext}
          onNext={onNext}
          onSelect={onExit}
        />
      )}
      {result === "defeat" && (
        <DefeatScreen level={level} validation={game.validation} onRetry={() => setResult("none")} />
      )}
    </div>
  );
}
