/**
 * Example inputs for the demo screen. CONSTRUCTED, not records of any real farm: the UI must show EXAMPLE_LABEL
 * next to them. Built only from crops in the real crop catalog (src/lib/crops/catalog.ts), referenced by id.
 *
 * How the supply was chosen (illustration only, see docs/replay-method.md): the median of all 120 per-season
 * irrigation needs of these three rotations on the saved Brentwood record,
 * rounded to the nearest 25 mm, so that the strips are a mix of red and green rather than one colour. That gave 700 mm.
 * It is NOT a real water allocation, NOT a recommendation, and was not tuned beyond that one rule.
 */
import type { RotationInput } from "./types";
import { EXAMPLE_LABEL } from "./types";

export { EXAMPLE_LABEL };

export type ExampleRotation = RotationInput & { label: string };

export const EXAMPLE_ROTATIONS: ExampleRotation[] = [
  { name: "Wheat, then maize", sequence: ["winter-wheat", "maize-grain"], label: EXAMPLE_LABEL },
  { name: "Maize, then cotton", sequence: ["maize-grain", "cotton"], label: EXAMPLE_LABEL },
  { name: "Rice, wheat, maize", sequence: ["rice", "winter-wheat", "maize-grain"], label: EXAMPLE_LABEL },
];

/** Seasonal water supply for the examples, mm. Chosen for illustration; not a real allocation. */
export const EXAMPLE_SUPPLY_MM = 700;

export const EXAMPLE_SUPPLY_NOTE =
  "Example supply chosen for illustration (the middle of the example rotations' seasonal needs on this record), not a real water allocation.";
