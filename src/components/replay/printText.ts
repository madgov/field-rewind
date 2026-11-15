/** What the printed report says about built-in example inputs, worded for what actually matches. null when neither does. */
export function exampleInputsNote(rotationsMatch: boolean, supplyMatch: boolean): string | null {
  if (rotationsMatch && supplyMatch) return "The rotations and supply shown are the built-in example.";
  if (rotationsMatch) return "The rotations shown are the built-in example; the water supply was changed.";
  if (supplyMatch) return "The water supply shown is the built-in example supply; the rotations were changed.";
  return null;
}
