// Level Intro card (DESIGN.md "Level Intro Card"). Full-screen, one gimmick
// paragraph + a worked diagram built from the same grid renderer, dismissed by
// a single teal "Understand!" button (FR-5.x flow).

import type { Level } from "../types";
import { LEVEL_INTRO } from "../content";
import { Grid } from "./Grid";
import { EXAMPLE_LEVEL, EXAMPLE_ASSIGNMENT, EXAMPLE_INFO } from "./example";

export function IntroCard({ level, onUnderstand }: { level: Level; onUnderstand: () => void }) {
  return (
    <div className="screen intro">
      <div className="card">
        <div className="jerry-badge" aria-hidden="true">
          🎩
        </div>
        <h1>{level.name}</h1>
        <p className="brief">{LEVEL_INTRO[level.id] ?? "Draw the districts so the No Good Party wins."}</p>
        <div className="example">
          <div className="example-caption">
            Each district's majority wins its seat — geometry decides, not vote totals.
          </div>
          <Grid
            level={EXAMPLE_LEVEL}
            assignment={EXAMPLE_ASSIGNMENT}
            active={null}
            districtInfo={EXAMPLE_INFO}
            offendingCells={new Set()}
            onCellDown={() => {}}
            onCellEnter={() => {}}
          />
        </div>
        <button className="btn-primary" onClick={onUnderstand}>
          Understand!
        </button>
      </div>
    </div>
  );
}
