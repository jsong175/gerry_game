// SVG grid/lattice renderer (FR-1.1; DESIGN.md "Cell & District Visual
// Language"). Renders squares or triangles from the precomputed geometry, tints
// completed districts by winner, double-encodes party with colour + icon
// (accessibility), draws bold outlines on committed districts and the white
// draw-line on the district in progress, and flags violating cells.

import { useEffect, useMemo, useRef } from "react";

import type { DistrictInfo } from "../state/useGame";
import type { Assignment, Level, LevelCell } from "../types";
import { COLOR, districtTint } from "../theme";
import {
  borderWeights,
  buildEdgeOwners,
  cellPoly,
  computeViewBox,
  edgeKey,
  pointsToStr,
  polyEdges,
  squarePoly,
} from "./geometry";

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
  // Line weights scale with cell size, so the small triangles are not smothered
  // by the square levels' heavy borders (DESIGN.md "Committed districts are bold").
  const weight = borderWeights(level.shape);
  const edgeOwners = useMemo(() => buildEdgeOwners(level), [level]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

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
          strokeWidth={weight.cell}
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
        <polygon
          points={pointsToStr(poly.points)}
          fill={tint}
          stroke={COLOR.ink}
          strokeWidth={weight.cell}
        />
        <PartyMark cell={cell} cx={cx} cy={cy} r={iconR} assigned={assigned} />
        {cell.fixed && (
          <circle cx={cx} cy={cy} r={iconR * 0.5} fill="none" stroke={COLOR.ink} strokeWidth={0.05} />
        )}
        {offending && (
          <polygon
            points={pointsToStr(poly.points)}
            fill="none"
            stroke={COLOR.neutral}
            strokeWidth={weight.violation}
            strokeDasharray={weight.dash}
          />
        )}
      </g>
    );
  });

  // District boundary strokes: stroke only the cell edges that separate a district
  // from something else. Driven by the shared edge index, so squares and triangles
  // take the same path and no interior edge is ever drawn bold.
  const borders: React.ReactNode[] = [];
  for (const [cid, did] of assignment) {
    const cell = cellById.get(cid)!;
    const info = districtInfo.get(did);
    const strokeW = info?.complete || active === did ? weight.district : weight.forming;
    const stroke = active === did ? COLOR.draw : info?.complete ? COLOR.ink : COLOR.teal;
    polyEdges(cellPoly(cell, level)).forEach(([p1, p2], i) => {
      const owners = edgeOwners.get(edgeKey(p1, p2)) ?? [];
      const neighbour = owners.find((o) => o !== cid);
      if (neighbour !== undefined && assignment.get(neighbour) === did) return; // interior
      borders.push(
        <line
          key={`b${cid}-${i}`}
          x1={p1[0]}
          y1={p1[1]}
          x2={p2[0]}
          y2={p2[1]}
          stroke={stroke}
          strokeWidth={strokeW}
          strokeLinecap="round"
          pointerEvents="none"
        />,
      );
    });
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
    // preserveAspectRatio (the SVG default) scales the board down to whatever box
    // the layout gives it, letterboxing rather than clipping or distorting.
    <svg
      viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
      className="grid-svg"
      role="img"
      aria-label={`${level.name} board`}
      style={{ touchAction: "none" }}
    >
      {cellNodes}
      {borders}
      {labels}
    </svg>
  );
}

// Exposed for tests: default cell polygon of a square level.
export const _squarePoly = squarePoly;
