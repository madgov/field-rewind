/** Plain-English wording generated ONLY from computed numbers. No number appears that is not in the result. */
import { LANDFORM_LABEL, SOIL_US_ONLY_NOTE, TERRAIN_CAVEAT, landformOriginLine } from "./label";
import { compassName } from "./terrain";
import { hydrologicGroupMeaning } from "./soil";
import type { ErosionIndicator, LandformResult, SoilResult, TerrainResult } from "./types";

const r0 = (v: number) => Math.round(v).toString();
const r1 = (v: number) => (Math.round(v * 10) / 10).toString();

export function terrainWording(t: TerrainResult): string[] {
  if (t.status !== "ok") return [`Terrain: ${t.message}`];
  const s = t.summary;
  const lines: string[] = [];
  lines.push(`The ground at this point is ${r0(s.centerElevationM)} m above sea level.`);
  const aspect = s.centerAspectDeg === null ? "" : `, sloping down toward the ${compassName(s.centerAspectDeg)}`;
  lines.push(`The slope at this point is ${r1(s.centerSlopePct)} percent (${r1(s.centerSlopeDeg)} degrees)${aspect}.`);
  lines.push(
    `Across the surrounding window (${r0(s.extentM.eastWest)} m east-west by ${r0(s.extentM.northSouth)} m north-south) the ground varies by ${r0(s.reliefM)} m (${r0(s.minElevationM)} to ${r0(s.maxElevationM)} m), with a typical slope of ${r1(s.medianSlopePct)} percent and 1 cell in 10 steeper than ${r1(s.p90SlopePct)} percent.`,
  );
  return lines;
}

export function soilWording(s: SoilResult): string[] {
  if (s.status === "error") return [`Soil: ${s.message}`];
  if (s.status === "no-coverage") return [`Soil: ${s.message}`];
  const d = s.derived;
  const lines: string[] = [];
  lines.push(`Soil map unit: ${s.muName}. Its largest part is ${d.dominantName} (${r0(d.dominantPct)} percent of the unit).`);
  if (d.topHorizon && d.textureClass && d.sandPct !== null && d.siltPct !== null && d.clayPct !== null) {
    lines.push(
      `The surface layer (${r0(d.topHorizon.topCm)} to ${r0(d.topHorizon.bottomCm)} cm) is ${d.textureClass}: ${r0(d.sandPct)} percent sand, ${r0(d.siltPct)} percent silt, ${r0(d.clayPct)} percent clay.`,
    );
  } else if (d.topHorizon) {
    lines.push("The surface layer's sand, silt and clay are not all listed, so no texture class is given.");
  }
  if (d.omTopPct !== null) lines.push(`Organic matter in the surface layer is ${r1(d.omTopPct)} percent.`);
  if (d.profileAwc) {
    const p = d.profileAwc;
    lines.push(`The top 100 cm of soil can hold about ${r0(p.mm)} mm of water that plants can use (weighted over ${r0(p.coveragePct)} percent of the unit's listed components).`);
    if (p.shallowOrIncomplete) lines.push("At least one component is shallower than 100 cm or has layers with no water-capacity value, so this is the water held in the part that is listed.");
  } else {
    lines.push("No water-holding capacity is listed for this soil, so no total is given.");
  }
  const h = hydrologicGroupMeaning(d.hydgrp);
  if (h) lines.push(`Hydrologic soil group ${h.group}. ${h.meaning}`);
  else if (d.hydgrp) lines.push(`Hydrologic soil group ${d.hydgrp}.`);
  else lines.push("No hydrologic soil group is listed for this soil.");
  if (d.drainageClass) lines.push(`Natural drainage: ${d.drainageClass.toLowerCase()}.`);
  return lines;
}

export function erosionWording(e: ErosionIndicator | null, soilAvailable = true): string[] {
  if (!e) return ["Erosion indicator: not available because slope or soil data is missing."];
  const lines: string[] = [`${e.label}.`];
  if (e.slopePct !== null && e.slopeBand) lines.push(`Slope: ${r1(e.slopePct)} percent, in the NRCS ${e.slopeBand.label} band.`);
  else lines.push("Slope: not available.");
  if (e.kf !== null && e.kfClassRank !== null) lines.push(`Soil erodibility Kf: ${e.kf.toFixed(2)} (class ${e.kfClassRank} of 14 NRCS classes from 0.02 to 0.64; higher means the soil detaches more easily).`);
  else lines.push(soilAvailable ? "Soil erodibility Kf: not listed for this soil." : "Soil erodibility Kf: not available because there is no soil survey data for this point.");
  lines.push("No combined erosion class is given because no published rule combining slope and Kf could be cited.");
  return lines;
}

export type LandformWording = { label: string; originLine: string | null; terrain: string[]; soil: string[]; erosion: string[]; caveats: string[]; all: string[] };

export function landformWording(r: LandformResult): LandformWording {
  const terrain = terrainWording(r.terrain);
  const soil = soilWording(r.soil);
  const erosion = erosionWording(r.erosion, r.soil.status === "ok");
  const caveats: string[] = [];
  if (r.terrain.status === "ok") caveats.push(TERRAIN_CAVEAT);
  if (r.soil.status === "no-coverage") caveats.push(SOIL_US_ONLY_NOTE);
  if (r.soil.status === "ok" && r.terrain.status === "ok" && r.soil.derived.mappedSlopePct !== null) {
    caveats.push(`The soil survey lists the mapped slope of the main component as ${r0(r.soil.derived.mappedSlopePct)} percent; the elevation data gives ${r1(r.terrain.summary.centerSlopePct)} percent at this point. Both are shown because they come from different sources.`);
  }
  const originLine = r.fetchedAt && r.origin ? landformOriginLine({ origin: r.origin, fetchedAt: r.fetchedAt }) : null;
  return { label: LANDFORM_LABEL, originLine, terrain, soil, erosion, caveats, all: [...terrain, ...soil, ...erosion, ...caveats] };
}
