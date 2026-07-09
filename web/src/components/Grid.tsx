// SVG grid/lattice renderer (FR-1.1; DESIGN.md "Cell & District Visual
// Language"). Renders squares or triangles from the precomputed geometry, tints
// completed districts by winner, double-encodes party with colour + icon
// (accessibility), draws bold outlines on committed districts and the white
// draw-line on the district in progress, and flags violating cells.

import { useEffect, useRef } from "react";

import type { DistrictInfo } from "../state/useGame";
import type { Assignment, Level, LevelCell } from "../types";
import { COLOR, districtTint } from "../theme";
import { cellPoly, computeViewBox, pointsToStr, squarePoly } from "./geometry";

interface Props {
  level: Level;
  assignment: Assignment;
  active: number | null;
  districtInfo: Map<number, DistrictInfo>;
  offendingCells: Set<number>;
  onCellDown: (id: number) => void;
  onCellEnter: (id: number) => void;
}

function PartyMark({ cell, cx, cy, r, assigned }: {
  cell: LevelCell;
  cx: number;
  cy: number;
  r: number;
  assigned: boolean;
}) {
  const opacity = assigned ? 1 : 0.5;
  if (cell.party === "jerry") {
    // No Good: a red diamond.
    const d = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return <polygon points={d} fill={COLOR.red} stroke={COLOR.ink} strokeWidth={r * 0.12} opacity={opacity} />;
  }
  // Puppies & Rainbows: a yellow circle.
  return <circle cx={cx} cy={cy} r={r} fill={COLOR.yellow} stroke={COLOR.ink} strokeWidth={r * 0.12} opacity={opacity} />;
}

export function Grid(props: Props) {
  const { level, assignment, active, districtInfo, offendingCells, onCellDown, onCellEnter } = props;
  const vb = computeViewBox(level);
  const dragging = useRef(false);
  const isTri = level.shape === "triangle";
  const iconR = isTri ? 0.16 : 0.24;
  const cellById = new Map(level.cells.map((c) => [c.id, c]));

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // Square neighbour lookup by coordinate for boundary drawing.
  const coordDistrict = new Map<string, number>();
  if (!isTri) {
    for (const [cid, did] of assignment) {
      const cell = cellById.get(cid)!;
      coordDistrict.set(`${cell.col},${cell.row}`, did);
    }
  }

  // District label centroids.
  const labelAccum = new Map<number, { x: number; y: number; n: number }>();

  const cellNodes = level.cells.map((cell) => {
    if (cell.void) {
      const poly = cellPoly(cell, level);
      return (
        <polygon
          key={`v${cell.id}`}
          points={pointsToStr(poly.points)}
          fill="#C9D4D0"
          stroke={COLOR.ink}
          strokeWidth={0.02}
          opacity={0.7}
        />
      );
    }
    const did = assignment.get(cell.id);
    const info = did !== undefined ? districtInfo.get(did) : undefined;
    const poly = cellPoly(cell, level);
    const [cx, cy] = poly.centroid;
    const assigned = did !== undefined;
    const tint = assigned ? districtTint(info?.winner ?? null, info?.complete ?? false) : COLOR.surface;
    const offending = offendingCells.has(cell.id);

    if (assigned && did !== undefined) {
      const acc = labelAccum.get(did) ?? { x: 0, y: 0, n: 0 };
      acc.x += cx;
      acc.y += cy;
      acc.n += 1;
      labelAccum.set(did, acc);
    }

    const onDown = (e: React.PointerEvent) => {
      dragging.current = true;
      // Release implicit pointer capture so pointerenter fires on sibling cells
      // during a touch drag (drag-to-extend accelerator, DESIGN.md).
      try {
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      } catch {
        /* not captured — fine */
      }
      onCellDown(cell.id);
    };
    const onEnter = () => {
      if (dragging.current) onCellEnter(cell.id);
    };

    return (
      <g key={cell.id} onPointerDown={onDown} onPointerEnter={onEnter} style={{ cursor: cell.fixed ? "not-allowed" : "pointer" }}>
        <polygon points={pointsToStr(poly.points)} fill={tint} stroke={COLOR.ink} strokeWidth={0.02} />
        <PartyMark cell={cell} cx={cx} cy={cy} r={iconR} assigned={assigned} />
        {cell.fixed && (
          <circle cx={cx} cy={cy} r={iconR * 0.5} fill="none" stroke={COLOR.ink} strokeWidth={0.05} />
        )}
        {offending && (
          <polygon
            points={pointsToStr(poly.points)}
            fill="none"
            stroke={COLOR.neutral}
            strokeWidth={0.09}
            strokeDasharray="0.18 0.12"
          />
        )}
      </g>
    );
  });

  // District boundary strokes.
  const borders: React.ReactNode[] = [];
  const dirs: [number, number, [number, number], [number, number]][] = [
    [0, -1, [0, 0], [1, 0]], // top edge
    [1, 0, [1, 0], [1, 1]], // right edge
    [0, 1, [0, 1], [1, 1]], // bottom edge
    [-1, 0, [0, 0], [0, 1]], // left edge
  ];
  for (const [cid, did] of assignment) {
    const cell = cellById.get(cid)!;
    const info = districtInfo.get(did);
    const strokeW = info?.complete ? 0.14 : active === did ? 0.14 : 0.08;
    const stroke = active === did ? COLOR.draw : info?.complete ? COLOR.ink : COLOR.teal;
    if (isTri) {
      borders.push(
        <polygon
          key={`b${cid}`}
          points={pointsToStr(cellPoly(cell, level).points)}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeW}
          strokeLinejoin="round"
          pointerEvents="none"
        />,
      );
    } else {
      const { col = 0, row = 0 } = cell;
      for (const [dx, dy, p1, p2] of dirs) {
        if (coordDistrict.get(`${col + dx},${row + dy}`) !== did) {
          borders.push(
            <line
              key={`b${cid}-${dx}-${dy}`}
              x1={col + p1[0]}
              y1={row + p1[1]}
              x2={col + p2[0]}
              y2={row + p2[1]}
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
              pointerEvents="none"
            />,
          );
        }
      }
    }
  }

  const labels = [...labelAccum].map(([did, acc]) => (
    <text
      key={`l${did}`}
      x={acc.x / acc.n}
      y={acc.y / acc.n}
      fontSize={isTri ? 0.5 : 0.55}
      textAnchor="middle"
      dominantBaseline="central"
      fill={COLOR.ink}
      stroke={COLOR.surface}
      strokeWidth={0.06}
      paintOrder="stroke"
      pointerEvents="none"
      style={{ fontWeight: 700 }}
    >
      {did + 1}
    </text>
  ));

  return (
    <svg
      viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
      className="grid-svg"
      role="img"
      aria-label={`${level.name} board`}
      style={{ touchAction: "none", width: "100%", height: "auto", maxHeight: "62vh" }}
    >
      {cellNodes}
      {borders}
      {labels}
    </svg>
  );
}

// Exposed for tests: default cell polygon of a square level.
export const _squarePoly = squarePoly;
