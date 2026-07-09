// Story copy (DESIGN.md "Story & Tone"). One plain-language "single new idea"
// per level for the intro card, plus Jerry's victory/defeat lines.

export const LEVEL_INTRO: Record<string, string> = {
  L1: "Welcome aboard, intern! The No Good Party is outnumbered — but seats are won district by district, not by total votes. Pack the Sunshines and Rainbows voters into a few crowded districts and crack the rest so our thin red majorities carry more seats than our votes deserve.",
  L2: "Same trick, bigger map. On this 8×8 sprawl you'll pack and crack across sixty-four voters. Waste their votes; stretch ours just far enough to win.",
  L3: "The regulators switched to triangular districts to trip us up. Triangles only touch along shared edges, so plan your contiguous districts carefully around who borders whom.",
  L4: "New rule: the Report Card. Districts are now graded on compactness (a perimeter-to-area score). No more absurd tentacle shapes — you must win your seats with tidy, C-or-better districts.",
  L5: "A lake has been carved through the map. Those void tiles aren't voters and can't be crossed, so your districts must stay connected while routing around the barrier.",
  L6: "The courts now measure the efficiency gap — how lopsidedly each side's votes are wasted. Win by thin margins (not by fat packing) so the gap still tilts our way. Crude gerrymanders fail here; surgical ones pass.",
};

export const VICTORY_LINE =
  "The No Good Party wins! You're a natural, intern. Democracy never saw it coming.";

export const DEFEAT_LINE =
  "Not quite — the puppies still have the votes. Check the red flags on the map and try again.";
