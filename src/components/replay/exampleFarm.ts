/**
 * The "Load example farm (Brentwood)" shortcut. It is only a link: /replay with `example=1` makes the server read the
 * committed saved NASA POWER response for Brentwood (data/power/brentwood.json) and never contact NASA, and the
 * constructed example rotations and supply are written into the link with the same encoder every other link uses.
 * No results are stored here: the strips are computed by the normal replay engine from the saved weather.
 */
import { DEMO_PINS } from "@/lib/demoPins";
import { encodeState, exampleState } from "./urlState";

export const EXAMPLE_FARM_LABEL = "Load example farm (Brentwood)";
export const EXAMPLE_FARM_PIN_ID = "brentwood";
export const EXAMPLE_FARM_PARAM = "example";

export function exampleFarmPin() {
  const pin = DEMO_PINS.find((p) => p.id === EXAMPLE_FARM_PIN_ID);
  if (!pin) throw new Error("The Brentwood demo pin is missing from src/lib/demoPins.ts.");
  return pin;
}

export function exampleFarmHref(): string {
  const pin = exampleFarmPin();
  return `/replay?lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}&${EXAMPLE_FARM_PARAM}=1&${encodeState(exampleState())}`;
}
