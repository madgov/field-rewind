/**
 * FAO-56 Example 18 (Uccle, Brussels, 6 July): the published inputs and the published answer, in ONE place.
 * Imported by the unit test (src/lib/et0/fao56.test.ts) and by the "How we know" panel, so the two cannot drift.
 * Source: Allen et al. (1998), FAO Irrigation and Drainage Paper 56, Chapter 4, Example 18
 *   https://www.fao.org/4/x0490e/x0490e08.htm
 */
import {
  daylightHours,
  dayOfYear,
  et0Daily,
  extraterrestrialRadiation,
  solarFromSunshine,
  windAt2m,
  type Et0Input,
} from "./fao56";

export const EXAMPLE18_URL = "https://www.fao.org/4/x0490e/x0490e08.htm";

/** Published inputs (Chapter 4, Example 18). */
export const EXAMPLE18 = {
  placeName: "Uccle, Brussels, Belgium",
  date: "2001-07-06",
  latDeg: 50 + 48 / 60, // 50 deg 48' N = 50.80
  elevationM: 100,
  tMaxC: 21.5,
  tMinC: 12.3,
  rhMaxPct: 84,
  rhMinPct: 63,
  windKmhAt10m: 10,
  sunshineH: 9.25,
  /** The answer as the document reports it (rounded), and the unrounded figure printed in its worked table. */
  publishedMmPerDay: 3.9,
  faoWorkedMmPerDay: 3.88,
  /** Pass criterion: |ours - published| must be below this, mm/day. */
  toleranceMmPerDay: 0.1,
} as const;

export type Example18Chain = {
  doy: number;
  u2: number;
  ra: number;
  daylightH: number;
  rs: number;
  input: Et0Input;
};

/** The intermediate chain (Eq. 47 wind, Eq. 21 Ra, Eq. 34 N, Eq. 35 Rs) built with the real functions. */
export function example18Chain(): Example18Chain {
  const e = EXAMPLE18;
  const doy = dayOfYear(e.date);
  const u2 = windAt2m(e.windKmhAt10m / 3.6, 10);
  const ra = extraterrestrialRadiation(e.latDeg, doy);
  const daylightH = daylightHours(e.latDeg, doy);
  const rs = solarFromSunshine(e.sunshineH, daylightH, ra);
  const input: Et0Input = {
    tMaxC: e.tMaxC,
    tMinC: e.tMinC,
    rhMaxPct: e.rhMaxPct,
    rhMinPct: e.rhMinPct,
    wind2mMs: u2,
    solarMJm2: rs,
    latDeg: e.latDeg,
    elevationM: e.elevationM,
    dayOfYear: doy,
  };
  return { doy, u2, ra, daylightH, rs, input };
}

export type Example18Result = {
  ourMmPerDay: number;
  publishedMmPerDay: number;
  faoWorkedMmPerDay: number;
  /** ours minus published 3.9 */
  differenceMmPerDay: number;
  /** ours minus FAO's worked 3.88 */
  differenceFromWorkedMmPerDay: number;
  toleranceMmPerDay: number;
  pass: boolean;
};

/** Recomputes the example with the real ET0 code. Nothing here is typed in except the published inputs and answer. */
export function runExample18(): Example18Result {
  const { input } = example18Chain();
  const ours = et0Daily(input);
  const diff = ours - EXAMPLE18.publishedMmPerDay;
  return {
    ourMmPerDay: ours,
    publishedMmPerDay: EXAMPLE18.publishedMmPerDay,
    faoWorkedMmPerDay: EXAMPLE18.faoWorkedMmPerDay,
    differenceMmPerDay: diff,
    differenceFromWorkedMmPerDay: ours - EXAMPLE18.faoWorkedMmPerDay,
    toleranceMmPerDay: EXAMPLE18.toleranceMmPerDay,
    pass: Math.abs(diff) < EXAMPLE18.toleranceMmPerDay,
  };
}
