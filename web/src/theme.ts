// "Clean Civic" palette (DESIGN.md Color Palette). Party colours are fixed
// everywhere: No Good = red (Jerry, minority), Puppies & Rainbows = yellow.

export const COLOR = {
  bg: "#F4F1EA",
  surface: "#FFFFFF",
  ink: "#2B2B33",
  red: "#E63946", // No Good voter cell
  yellow: "#FDCA40", // Puppies voter cell
  redTint: "#F7C6C1", // district won by No Good
  yellowTint: "#FCE9A8", // district won by Puppies
  teal: "#2A9D8F", // UI accent
  success: "#43A047",
  neutral: "#9AA0A6",
  draw: "#FFFFFF", // in-progress draw line
} as const;

export function districtTint(winner: "jerry" | "opponent" | null, complete: boolean): string {
  if (!complete) return "#EDEBE4"; // in-progress: quiet neutral fill
  if (winner === "jerry") return COLOR.redTint;
  if (winner === "opponent") return COLOR.yellowTint;
  return "#E4E2DB"; // tied: no tint (FR-4.2)
}
