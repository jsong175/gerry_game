// HUD: seat tally (FR-4.5) + live active-rules checklist (FR-3.6). Every rule
// state is doubled with a tick glyph *and* text, never colour alone
// (DESIGN.md Accessibility).

import type { Level, ValidationResult } from "../types";
import { COLOR } from "../theme";

interface Props {
  level: Level;
  validation: ValidationResult;
}

interface RuleRow {
  label: string;
  ok: boolean;
}

function buildRows(level: Level, v: ValidationResult): RuleRow[] {
  const rows: RuleRow[] = [
    { label: `Win ${level.winCondition.minSeats} districts`, ok: v.seatsOk },
    { label: "Contiguous", ok: v.perRule.contiguity },
    { label: "Equal size", ok: v.perRule.parity },
    { label: "All cells used", ok: v.perRule.coverage },
    { label: `${level.districtCount} districts`, ok: v.perRule.districtCount },
  ];
  if (v.perRule.compactness !== null) {
    const grade = v.compactnessGrade ?? "—";
    rows.push({
      label: `Compactness ≥ ${level.winCondition.compactnessMinGrade} (now ${grade})`,
      ok: v.perRule.compactness,
    });
  }
  if (v.perRule.efficiencyGap !== null) {
    const gap = v.efficiencyGap === null ? "—" : v.efficiencyGap.toFixed(2);
    rows.push({
      label: `Efficiency gap ≥ ${level.winCondition.minEfficiencyGap} (now ${gap})`,
      ok: v.perRule.efficiencyGap,
    });
  }
  return rows;
}

export function Hud({ level, validation }: Props) {
  const rows = buildRows(level, validation);
  return (
    <div className="hud">
      <div className="tally" aria-label="seat tally">
        <span className="tally-party" style={{ color: COLOR.red }}>
          No Good
        </span>
        <span className="tally-count">
          <strong>{validation.seats}</strong> / {level.winCondition.minSeats}
        </span>
        <span className="tally-note">districts won</span>
      </div>
      <ul className="rules" aria-label="active rules">
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? "rule ok" : "rule pending"}>
            <span className="tick" aria-hidden="true">
              {r.ok ? "✓" : "○"}
            </span>
            <span className="rule-label">{r.label}</span>
            <span className="sr-only">{r.ok ? " (met)" : " (not met)"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
