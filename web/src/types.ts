// Shared level + validation types. Mirrors the JSON schema in ARCHITECTURE.md
// and the Python engine's rule output (engine/rules.py validate()).

export type Party = "jerry" | "opponent";
export type Shape = "square" | "triangle";
export type Grade = "A" | "B" | "C" | "D" | "F";

export interface WinCondition {
  minSeats: number;
  compactnessMinGrade: Grade | null;
  minEfficiencyGap: number | null;
}

export interface LevelCell {
  id: number;
  party: Party;
  fixed: boolean;
  void: boolean;
  // square geometry
  col?: number;
  row?: number;
  // triangle geometry
  orient?: "up" | "down";
}

export interface Level {
  id: string;
  name: string;
  shape: Shape;
  gridWidth: number;
  gridHeight: number;
  districtCount: number;
  districtSize: number;
  winCondition: WinCondition;
  cells: LevelCell[];
  adjacency: [number, number][];
  referenceSolution: number[][];
}

export interface ManifestEntry {
  id: string;
  name: string;
  file: string;
}

export interface Manifest {
  levels: ManifestEntry[];
}

export interface PerRule {
  contiguity: boolean;
  parity: boolean;
  coverage: boolean;
  districtCount: boolean;
  compactness: boolean | null;
  efficiencyGap: boolean | null;
}

export interface ValidationResult {
  perRule: PerRule;
  offendingDistricts: number[];
  offendingCells: number[];
  complete: boolean;
  seats: number;
  minSeats: number;
  seatsOk: boolean;
  compactnessGrade: Grade | null;
  efficiencyGap: number | null;
  solved: boolean;
}

// cellId -> districtId. Unassigned cells are absent (FR-1.3).
export type Assignment = Map<number, number>;
