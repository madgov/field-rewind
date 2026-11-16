/**
 * Pure soil derivations from SSURGO values. No I/O.
 *
 * Column meanings (Soil Data Mart 4.3 "Table Column Descriptions" and "Tables and Columns", NRCS; units from the latter):
 *  - sandtotal_r / silttotal_r / claytotal_r: percent by weight of the fine-earth (<2 mm) fraction (representative value)
 *  - om_r: organic matter, percent by weight of the <2 mm soil material
 *  - awc_r: available water capacity, a volume fraction, cm/cm (water an increment of soil can store that is available
 *    to plants; commonly field capacity minus permanent wilting point)
 *  - kffact: Kf, "an erodibility factor which quantifies the susceptibility of soil particles to detachment by water"
 *  - ksat_r: saturated hydraulic conductivity, micrometres per second
 *  - hydgrp: "a group of soils having similar runoff potential under similar storm and cover conditions"
 *  - drainagecl: natural drainage condition, frequency and duration of wet periods
 *  - hzdept_r / hzdepb_r: horizon top/bottom depth, cm
 */
import type { ProfileAwc, SoilComponent, SoilDerived, SoilHorizon, TextureClass } from "./types";

/**
 * USDA texture class from percent sand, silt, clay (they must sum to about 100). Boundaries are the standard USDA texture
 * triangle definitions (Soil Survey Division Staff, Soil Survey Manual, USDA Handbook 18; NRCS National Soil Survey
 * Handbook 618, texture class and the triangle in 618.85/618.86). Rules, checked in this order:
 *   clay >= 40: silt >= 40 silty clay; else sand > 45 sandy clay; else clay
 *   clay >= 35 and sand > 45: sandy clay
 *   clay >= 27: sand > 45 sandy clay loam; sand < 20 silty clay loam; else clay loam
 *   clay >= 20: (silt < 28 and sand > 45) sandy clay loam; silt >= 50 silt loam; else loam
 *   clay >= 7:  silt >= 80 and clay < 12 silt; silt >= 50 silt loam; sand > 52 sandy loam; else loam
 *   clay < 7:   silt >= 80 silt; silt >= 50 silt loam; silt + 1.5 clay < 15 sand; silt + 2 clay < 30 loamy sand; else sandy loam
 * Points exactly on a line belong to the class listed first above (documented in docs/landform.md).
 */
export function textureClass(sand: number, silt: number, clay: number): TextureClass | null {
  if (![sand, silt, clay].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) return null;
  const sum = sand + silt + clay;
  if (sum < 98 || sum > 102) return null;
  if (clay >= 40) {
    if (silt >= 40) return "silty clay";
    if (sand > 45) return "sandy clay";
    return "clay";
  }
  if (clay >= 35 && sand > 45) return "sandy clay";
  if (clay >= 27) {
    if (sand > 45) return "sandy clay loam";
    if (sand < 20) return "silty clay loam";
    return "clay loam";
  }
  if (clay >= 20) {
    if (silt < 28 && sand > 45) return "sandy clay loam";
    if (silt >= 50) return "silt loam";
    return "loam";
  }
  if (clay >= 7) {
    if (silt >= 80 && clay < 12) return "silt";
    if (silt >= 50) return "silt loam";
    if (sand > 52) return "sandy loam";
    return "loam";
  }
  if (silt >= 80) return "silt";
  if (silt >= 50) return "silt loam";
  if (silt + 1.5 * clay < 15) return "sand";
  if (silt + 2 * clay < 30) return "loamy sand";
  return "sandy loam";
}

export const PROFILE_DEPTH_CM = 100;

/**
 * Available water in the top 100 cm of ONE component, mm: sum over horizons of awc_r (cm/cm) x thickness inside 0-100 cm
 * (cm) x 10. Horizons without an awc_r value contribute nothing and are not counted in coveredCm.
 */
export function componentAwcMm(c: SoilComponent, depthCm = PROFILE_DEPTH_CM): { mm: number; coveredCm: number; depthCm: number } {
  let mm = 0;
  let covered = 0;
  let deepest = 0;
  for (const h of c.horizons) {
    const top = Math.max(0, h.topCm);
    const bottom = Math.min(depthCm, h.bottomCm);
    if (h.bottomCm > deepest) deepest = h.bottomCm;
    const thick = bottom - top;
    if (thick <= 0 || h.awc === null) continue;
    mm += h.awc * thick * 10;
    covered += thick;
  }
  return { mm, coveredCm: covered, depthCm: deepest };
}

/**
 * Profile available water capacity, mm, top 100 cm, weighted by component percentage:
 *   AWC = sum( comppct_i x AWC_i ) / sum( comppct_i )   over components that have at least one horizon with awc_r.
 * Components with no awc_r data (for example rock outcrop) are left out of both sums, and coveragePct says how much of the
 * listed component percentage contributed.
 */
export function profileAwc(components: SoilComponent[]): ProfileAwc | null {
  const per: ProfileAwc["perComponent"] = [];
  let weighted = 0;
  let wsum = 0;
  let allPct = 0;
  let incomplete = false;
  for (const c of components) {
    allPct += c.pct;
    const r = componentAwcMm(c);
    if (r.coveredCm <= 0) continue;
    per.push({ name: c.name, pct: c.pct, mm: r.mm, coveredCm: r.coveredCm, depthCm: r.depthCm });
    weighted += c.pct * r.mm;
    wsum += c.pct;
    if (r.coveredCm < PROFILE_DEPTH_CM) incomplete = true;
  }
  if (wsum <= 0) return null;
  return { mm: weighted / wsum, perComponent: per, coveragePct: allPct > 0 ? (wsum / allPct) * 100 : 0, shallowOrIncomplete: incomplete };
}

/** The NRCS meaning of each hydrologic soil group, quoted from NEH Part 630 Chapter 7 (January 2009), page 7-3. */
export const HSG_MEANING: Record<"A" | "B" | "C" | "D", string> = {
  A: "Soils in this group have low runoff potential when thoroughly wet. Water is transmitted freely through the soil.",
  B: "Soils in this group have moderately low runoff potential when thoroughly wet. Water transmission through the soil is unimpeded.",
  C: "Soils in this group have moderately high runoff potential when thoroughly wet. Water transmission through the soil is somewhat restricted.",
  D: "Soils in this group have high runoff potential when thoroughly wet. Water movement through the soil is restricted or very restricted.",
};

export const HSG_SOURCE = {
  title: "USDA NRCS, National Engineering Handbook Part 630 Hydrology, Chapter 7 Hydrologic Soil Groups (210-VI-NEH, January 2009)",
  url: "https://www.damtoolbox.org/images/e/e9/NEH7.pdf",
  officialIndex: "https://directives.nrcs.usda.gov/sites/default/files2/1712930634/Part%20630%20-%20Hydrology.pdf",
};

/** Plain meaning of a hydgrp value like "C" or "C/D" (dual groups: first letter drained, second undrained, per NEH7). */
export function hydrologicGroupMeaning(hydgrp: string | null): { group: string; meaning: string; dual: boolean } | null {
  if (!hydgrp) return null;
  const g = hydgrp.trim().toUpperCase();
  const m = /^([ABCD])(?:\/([ABCD]))?$/.exec(g);
  if (!m) return null;
  const first = m[1] as "A" | "B" | "C" | "D";
  if (!m[2]) return { group: g, meaning: HSG_MEANING[first], dual: false };
  const second = m[2] as "A" | "B" | "C" | "D";
  return {
    group: g,
    dual: true,
    meaning: `Dual group ${g}: when adequately drained the soil is group ${first} (${HSG_MEANING[first]}) and when undrained it is group ${second} (${HSG_MEANING[second]})`,
  };
}

/** Kf classes in NSSH 618.60 (14 representative class values). */
export const KF_CLASSES = [0.02, 0.05, 0.1, 0.15, 0.17, 0.2, 0.24, 0.28, 0.32, 0.37, 0.43, 0.49, 0.55, 0.64] as const;

/** 1-based position of a Kf value among the 14 classes (nearest class value), or null for a missing/invalid value. */
export function kfClassRank(kf: number | null): number | null {
  if (kf === null || !Number.isFinite(kf) || kf <= 0 || kf > 0.7) return null;
  let best = 0;
  for (let i = 1; i < KF_CLASSES.length; i++) if (Math.abs(KF_CLASSES[i] - kf) < Math.abs(KF_CLASSES[best] - kf)) best = i;
  return best + 1;
}

function dominant(components: SoilComponent[]): SoilComponent | null {
  let best: SoilComponent | null = null;
  for (const c of components) if (!best || c.pct > best.pct) best = c;
  return best;
}

export function topHorizon(c: SoilComponent): SoilHorizon | null {
  return c.horizons.length ? c.horizons.reduce((a, b) => (b.topCm < a.topCm ? b : a)) : null;
}

/** Everything derived from the components: dominant component, its surface horizon, texture, OM, Kf, group, profile AWC. */
export function deriveSoil(components: SoilComponent[]): SoilDerived | null {
  const dom = dominant(components);
  if (!dom) return null;
  const top = topHorizon(dom);
  const sand = top?.sandPct ?? null;
  const silt = top?.siltPct ?? null;
  const clay = top?.clayPct ?? null;
  return {
    dominantName: dom.name,
    dominantPct: dom.pct,
    topHorizon: top ? { name: top.name, topCm: top.topCm, bottomCm: top.bottomCm } : null,
    sandPct: sand,
    siltPct: silt,
    clayPct: clay,
    textureClass: sand !== null && silt !== null && clay !== null ? textureClass(sand, silt, clay) : null,
    omTopPct: top?.omPct ?? null,
    kfTop: top?.kf ?? null,
    hydgrp: dom.hydgrp,
    drainageClass: dom.drainageClass,
    mappedSlopePct: dom.slopePct,
    profileAwc: profileAwc(components),
  };
}
