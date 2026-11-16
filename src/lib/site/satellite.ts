import satelliteJson from "../../../data/site/satellite-vs-ground.json";
import { resolveCites } from "./resolve";
import type { BothSide, Layer, SatelliteFile } from "./types";

const FILE = satelliteJson as unknown as SatelliteFile;

export type SatelliteVsGround = {
  compiledOn: string;
  note: string;
  sides: (SatelliteFile["sides"][number] & { layers: Layer[] })[];
  bothSides: BothSide[];
  layers: Layer[];
  gaps: string[];
};

export function loadSatelliteVsGround(file: SatelliteFile = FILE): SatelliteVsGround {
  const layers: Layer[] = file.layers.map((l) => ({ ...l, cites: resolveCites(l.cites, file.sources, `layer "${l.id}"`) }));
  const bothSides: BothSide[] = file.bothSides.map((b) => ({ ...b, cites: resolveCites(b.cites, file.sources, `bothSides "${b.title}"`) }));
  const sides = file.sides.map((s) => ({ ...s, layers: layers.filter((l) => l.side === s.id) }));
  return { compiledOn: file.compiledOn, note: file.note, sides, bothSides, layers, gaps: file.gaps };
}
