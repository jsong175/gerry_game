// Victory and Defeat cards (DESIGN.md "Win & Loss Screens"). Defeat is gentle
// and non-destructive (FR-4.6): it names what fell short and returns the player
// to their exact board.

import type { Level, ValidationResult } from "../types";
import { DEFEAT_LINE, VICTORY_LINE } from "../content";

export function VictoryScreen({
  seats,
  hasNext,
  onNext,
  onSelect,
}: {
  seats: number;
  hasNext: boolean;
  onNext: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="screen result victory">
      <div className="card">
        <div className="jerry-badge win" aria-hidden="true">
          😈
        </div>
        <h1>Rigged it!</h1>
        <p className="brief">{VICTORY_LINE}</p>
        <p className="final-tally">
          No Good won <strong>{seats}</strong> districts.
        </p>
        {hasNext ? (
          <button className="btn-primary" onClick={onNext}>
            Next scheme →
          </button>
        ) : (
          <p className="brief">You've completed every level. Truly diabolical work, intern.</p>
        )}
        <button className="btn-ghost" onClick={onSelect}>
          Level select
        </button>
      </div>
    </div>
  );
}

function failureReasons(level: Level, v: ValidationResult): string[] {
  const reasons: string[] = [];
  if (!v.perRule.coverage) reasons.push("Some voters aren't in a district yet.");
  if (!v.perRule.parity) reasons.push(`Every district must have exactly ${level.districtSize} cells.`);
  if (!v.perRule.districtCount) reasons.push(`You need exactly ${level.districtCount} districts.`);
  if (!v.perRule.contiguity) reasons.push("A district is broken into disconnected pieces.");
  if (v.perRule.compactness === false)
    reasons.push(`Districts aren't compact enough (need ${level.winCondition.compactnessMinGrade}+).`);
  if (v.perRule.efficiencyGap === false)
    reasons.push(`The efficiency gap is too low (need ≥ ${level.winCondition.minEfficiencyGap}).`);
  if (v.complete && !v.seatsOk)
    reasons.push(`No Good only won ${v.seats} of the ${level.winCondition.minSeats} districts needed.`);
  return reasons;
}

export function DefeatScreen({
  level,
  validation,
  onRetry,
}: {
  level: Level;
  validation: ValidationResult;
  onRetry: () => void;
}) {
  const reasons = failureReasons(level, validation);
  return (
    <div className="screen result defeat">
      <div className="card">
        <div className="jerry-badge lose" aria-hidden="true">
          😰
        </div>
        <h1>Not yet…</h1>
        <p className="brief">{DEFEAT_LINE}</p>
        <ul className="reasons">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <button className="btn-primary" onClick={onRetry}>
          Back to the map
        </button>
      </div>
    </div>
  );
}
