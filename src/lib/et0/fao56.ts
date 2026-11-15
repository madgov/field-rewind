/**
 * FAO-56 Penman-Monteith daily reference evapotranspiration (ET0).
 *
 * Source: Allen, Pereira, Raes, Smith (1998), FAO Irrigation and Drainage Paper 56,
 *   Chapter 3 (meteorological equations): https://www.fao.org/4/x0490e/x0490e07.htm
 *   Chapter 4 (ETo, Example 18):          https://www.fao.org/4/x0490e/x0490e08.htm
 * Equation numbers in comments refer to that document. Pure functions, no I/O.
 *
 * Units: temperature degC, pressure/vapour pressure kPa, radiation MJ m-2 day-1,
 * wind m/s, ET0 mm/day, angles in radians unless a name ends in Deg.
 */
import type { DailyRecord } from "../types";

/** Solar constant Gsc = 0.0820 MJ m-2 min-1 (text under Eq. 21 / Eq. 28). */
const GSC = 0.082;
/** Stefan-Boltzmann constant, 4.903e-9 MJ K-4 m-2 day-1 (Eq. 39). */
const STEFAN_BOLTZMANN = 4.903e-9;
/** K = degC + 273.16 (Eq. 39 definition of Tmax,K / Tmin,K). */
const KELVIN_OFFSET = 273.16;
/** Albedo of the hypothetical grass reference crop = 0.23 (Eq. 38). */
const ALBEDO = 0.23;
/** Angstrom defaults as = 0.25, bs = 0.50 (text under Eq. 35). */
export const ANGSTROM_AS = 0.25;
export const ANGSTROM_BS = 0.5;

/**
 * EDGE CASE (polar night / near-zero clear-sky radiation).
 * Rs/Rso is undefined when Rso is 0 (Ra = 0 at latitudes inside the polar circle in winter).
 * FAO-56 does not give a rule for this. Decision: if Rso < RSO_MIN_MJ, there is no daytime
 * sun to define cloudiness, so we use the FAO-56 value "Rs/Rso = 0.3 presumes total cloud
 * cover" (hourly-step text, Chapter 4) as the relative shortwave term. At such times Rn is
 * negative or ~0 and the result is clamped to 0 mm/day anyway (see et0Daily).
 */
export const RSO_MIN_MJ = 0.1;
export const RS_RSO_TOTAL_CLOUD = 0.3;

const DAY_MS = 86_400_000;

/** Day of year J, 1..365/366, from an ISO date (YYYY-MM-DD). Works in UTC: no timezone drift. */
export function dayOfYear(isoDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) throw new RangeError(`dayOfYear: not an ISO date: ${isoDate}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const check = new Date(t);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new RangeError(`dayOfYear: invalid calendar date: ${isoDate}`);
  }
  return Math.round((t - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
}

/** Eq. 22: decimal degrees to radians. */
export function degToRad(deg: number): number {
  return (Math.PI / 180) * deg;
}

/** Eq. 7: atmospheric pressure P [kPa] from elevation z [m]. */
export function pressureKPa(elevationM: number): number {
  return 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26);
}

/** Eq. 8: psychrometric constant [kPa/degC] = 0.665e-3 * P. */
export function psychrometricConstant(pressure: number): number {
  return 0.665e-3 * pressure;
}

/** Eq. 11: saturation vapour pressure e0(T) [kPa]. */
export function saturationVapourPressure(tC: number): number {
  return 0.6108 * Math.exp((17.27 * tC) / (tC + 237.3));
}

/** Eq. 12: mean saturation vapour pressure es = (e0(Tmax) + e0(Tmin)) / 2. */
export function meanSaturationVapourPressure(tMaxC: number, tMinC: number): number {
  return (saturationVapourPressure(tMaxC) + saturationVapourPressure(tMinC)) / 2;
}

/** Eq. 13: slope of the saturation vapour pressure curve [kPa/degC] at T (use Tmean, Eq. 9). */
export function slopeSatVapourPressure(tC: number): number {
  return (4098 * saturationVapourPressure(tC)) / Math.pow(tC + 237.3, 2);
}

/** Eq. 17: ea from RHmax and RHmin (preferred). */
export function actualVapourPressureFromRhMaxMin(
  tMaxC: number,
  tMinC: number,
  rhMaxPct: number,
  rhMinPct: number,
): number {
  return (
    (saturationVapourPressure(tMinC) * (rhMaxPct / 100) +
      saturationVapourPressure(tMaxC) * (rhMinPct / 100)) /
    2
  );
}

/** Eq. 19: ea from mean RH (FAO-56 calls this "less desirable" than Eq. 17 or 18). */
export function actualVapourPressureFromRhMean(
  tMaxC: number,
  tMinC: number,
  rhMeanPct: number,
): number {
  return (rhMeanPct / 100) * meanSaturationVapourPressure(tMaxC, tMinC);
}

/** Eq. 23: inverse relative distance Earth-Sun. */
export function inverseRelativeDistance(doy: number): number {
  return 1 + 0.033 * Math.cos(((2 * Math.PI) / 365) * doy);
}

/** Eq. 24: solar declination [rad]. */
export function solarDeclination(doy: number): number {
  return 0.409 * Math.sin(((2 * Math.PI) / 365) * doy - 1.39);
}

/**
 * Eq. 25: sunset hour angle ws = arccos(-tan(lat) tan(decl)) [rad].
 * EDGE CASE: beyond the polar circle |tan(lat) tan(decl)| > 1 and arccos is undefined.
 * The argument is clamped to [-1, 1]: ws = pi (polar day, 24 h sun) or 0 (polar night).
 * This is the physical limit and is equivalent to Eq. 26/27 with X floored at 0.00001.
 */
export function sunsetHourAngle(latRad: number, declRad: number): number {
  const x = -Math.tan(latRad) * Math.tan(declRad);
  return Math.acos(Math.min(1, Math.max(-1, x)));
}

/** Eq. 34: daylight hours N = 24/pi * ws. */
export function daylightHours(latDeg: number, doy: number): number {
  return (24 / Math.PI) * sunsetHourAngle(degToRad(latDeg), solarDeclination(doy));
}

/**
 * Eq. 21: extraterrestrial radiation Ra [MJ m-2 day-1] for a daily period.
 * Ra = 24*60/pi * Gsc * dr * [ws sin(lat) sin(decl) + cos(lat) cos(decl) sin(ws)].
 * Polar night gives ws = 0 so Ra = 0 exactly (no negative values).
 */
export function extraterrestrialRadiation(latDeg: number, doy: number): number {
  const lat = degToRad(latDeg);
  const decl = solarDeclination(doy);
  const ws = sunsetHourAngle(lat, decl);
  const ra =
    ((24 * 60) / Math.PI) *
    GSC *
    inverseRelativeDistance(doy) *
    (ws * Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.sin(ws));
  return Math.max(0, ra);
}

/** Eq. 35: Angstrom formula Rs = (as + bs n/N) Ra, defaults as = 0.25, bs = 0.50. */
export function solarFromSunshine(
  sunshineHours: number,
  daylightHoursN: number,
  raMJ: number,
  as = ANGSTROM_AS,
  bs = ANGSTROM_BS,
): number {
  return (as + bs * (sunshineHours / daylightHoursN)) * raMJ;
}

/** Eq. 37: clear-sky radiation Rso = (0.75 + 2e-5 z) Ra (no calibrated as, bs). */
export function clearSkyRadiation(elevationM: number, raMJ: number): number {
  return (0.75 + 2e-5 * elevationM) * raMJ;
}

/** Eq. 38: net shortwave Rns = (1 - 0.23) Rs. */
export function netShortwaveRadiation(rsMJ: number, albedo = ALBEDO): number {
  return (1 - albedo) * rsMJ;
}

/**
 * Relative shortwave radiation Rs/Rso as used in Eq. 39.
 * - Capped at 1.0: "Rs/Rso ... limited to <= 1.0" (FAO-56 text under Eq. 39).
 * - Floored at 0 (negative Rs is non-physical; not an FAO-56 rule).
 * - If Rso < RSO_MIN_MJ (polar night) the ratio is undefined; returns RS_RSO_TOTAL_CLOUD (0.3).
 */
export function relativeShortwave(rsMJ: number, rsoMJ: number): number {
  if (!(rsoMJ >= RSO_MIN_MJ)) return RS_RSO_TOTAL_CLOUD;
  return Math.min(1, Math.max(0, rsMJ / rsoMJ));
}

/**
 * Eq. 39: net longwave Rnl [MJ m-2 day-1]
 *   = sigma [(Tmax,K^4 + Tmin,K^4)/2] (0.34 - 0.14 sqrt(ea)) (1.35 Rs/Rso - 0.35).
 * `rsOverRso` must already be limited (see relativeShortwave).
 */
export function netLongwaveRadiation(
  tMaxC: number,
  tMinC: number,
  eaKPa: number,
  rsOverRso: number,
): number {
  const tx = tMaxC + KELVIN_OFFSET;
  const tn = tMinC + KELVIN_OFFSET;
  const sigmaT4 = (STEFAN_BOLTZMANN * (Math.pow(tx, 4) + Math.pow(tn, 4))) / 2;
  return sigmaT4 * (0.34 - 0.14 * Math.sqrt(eaKPa)) * (1.35 * rsOverRso - 0.35);
}

/** Eq. 47: wind speed at height z [m] converted to 2 m: u2 = uz * 4.87 / ln(67.8 z - 5.42). */
export function windAt2m(uz: number, zMetres: number): number {
  return (uz * 4.87) / Math.log(67.8 * zMetres - 5.42);
}

export type Et0Humidity =
  | { rhMaxPct: number; rhMinPct: number; rhMeanPct?: undefined }
  | { rhMeanPct: number; rhMaxPct?: undefined; rhMinPct?: undefined };

export type Et0Input = Et0Humidity & {
  tMaxC: number;
  tMinC: number;
  /** Wind speed at 2 m height, m/s (convert first with windAt2m if measured elsewhere). */
  wind2mMs: number;
  /** Incoming solar radiation Rs, MJ m-2 day-1. */
  solarMJm2: number;
  latDeg: number;
  elevationM: number;
  dayOfYear: number;
};

export type Et0Detail = {
  tMeanC: number;
  pressureKPa: number;
  gamma: number;
  delta: number;
  es: number;
  ea: number;
  ra: number;
  rso: number;
  rsOverRso: number;
  rns: number;
  rnl: number;
  rn: number;
  /** 0.408 (Rn - G) Delta / [Delta + gamma (1 + 0.34 u2)] */
  radiationTerm: number;
  /** 900/(T+273) u2 (es - ea) gamma / [Delta + gamma (1 + 0.34 u2)] */
  aerodynamicTerm: number;
  /** Eq. 6 result before the non-negative clamp. */
  et0Raw: number;
  /** After clamp at 0. */
  et0: number;
};

/** Reasons an input is physically unusable, or null if fine. */
export function validateEt0Input(i: Et0Input): string | null {
  const nums: [string, number][] = [
    ["tMaxC", i.tMaxC],
    ["tMinC", i.tMinC],
    ["wind2mMs", i.wind2mMs],
    ["solarMJm2", i.solarMJm2],
    ["latDeg", i.latDeg],
    ["elevationM", i.elevationM],
    ["dayOfYear", i.dayOfYear],
  ];
  for (const [k, v] of nums) if (typeof v !== "number" || !Number.isFinite(v)) return `${k} not finite`;
  if (i.wind2mMs < 0) return "wind2mMs negative";
  if (i.solarMJm2 < 0) return "solarMJm2 negative";
  if (Math.abs(i.latDeg) > 90) return "latDeg outside [-90, 90]";
  if (i.dayOfYear < 1 || i.dayOfYear > 366) return "dayOfYear outside [1, 366]";
  if (i.tMaxC < i.tMinC) return "tMaxC below tMinC";
  if (i.tMinC <= -237.3) return "tMinC below -237.3 degC";
  const rh: number[] =
    i.rhMeanPct !== undefined ? [i.rhMeanPct] : [i.rhMaxPct as number, i.rhMinPct as number];
  for (const r of rh) {
    if (typeof r !== "number" || !Number.isFinite(r)) return "relative humidity not finite";
    if (r < 0 || r > 100) return "relative humidity outside [0, 100]";
  }
  return null;
}

/** Full FAO-56 Eq. 6 chain with all intermediates. Throws RangeError on invalid input. */
export function et0DailyDetailed(input: Et0Input): Et0Detail {
  const bad = validateEt0Input(input);
  if (bad) throw new RangeError(`et0Daily: ${bad}`);

  const { tMaxC, tMinC, wind2mMs: u2, solarMJm2: rs } = input;
  const tMeanC = (tMaxC + tMinC) / 2; // Eq. 9
  const P = pressureKPa(input.elevationM); // Eq. 7
  const gamma = psychrometricConstant(P); // Eq. 8
  const delta = slopeSatVapourPressure(tMeanC); // Eq. 13
  const es = meanSaturationVapourPressure(tMaxC, tMinC); // Eq. 12
  const ea =
    input.rhMeanPct !== undefined
      ? actualVapourPressureFromRhMean(tMaxC, tMinC, input.rhMeanPct) // Eq. 19
      : actualVapourPressureFromRhMaxMin(tMaxC, tMinC, input.rhMaxPct, input.rhMinPct); // Eq. 17
  const ra = extraterrestrialRadiation(input.latDeg, input.dayOfYear); // Eq. 21
  const rso = clearSkyRadiation(input.elevationM, ra); // Eq. 37
  const rsOverRso = relativeShortwave(rs, rso);
  const rns = netShortwaveRadiation(rs); // Eq. 38
  const rnl = netLongwaveRadiation(tMaxC, tMinC, ea, rsOverRso); // Eq. 39
  const rn = rns - rnl; // Eq. 40
  const G = 0; // Eq. 42: daily step

  const denom = delta + gamma * (1 + 0.34 * u2);
  const radiationTerm = (0.408 * (rn - G) * delta) / denom;
  const aerodynamicTerm = (((900 / (tMeanC + 273)) * u2 * (es - ea)) * gamma) / denom;
  const et0Raw = radiationTerm + aerodynamicTerm; // Eq. 6

  /**
   * EDGE CASE (negative result): Eq. 6 can go negative (very low Rs, cold, humid, or polar
   * night, where Rn < 0). ET0 is an evaporative demand and FAO-56 does not define a negative
   * value, so we clamp to 0 and expose the raw value in `et0Raw`.
   */
  return {
    tMeanC, pressureKPa: P, gamma, delta, es, ea, ra, rso, rsOverRso,
    rns, rnl, rn, radiationTerm, aerodynamicTerm, et0Raw, et0: Math.max(0, et0Raw),
  };
}

/** FAO-56 Eq. 6, daily step, G = 0 (Eq. 42). Returns mm/day, never negative. */
export function et0Daily(input: Et0Input): number {
  return et0DailyDetailed(input).et0;
}

/**
 * Adapter from a normalized NASA POWER daily record.
 * Returns null if ANY required field is null (never filled or interpolated), or if a value
 * is non-finite / physically invalid (e.g. RH outside 0-100), so one bad day cannot throw
 * inside a 40-year loop. Uses the rhMean path (Eq. 19) because POWER gives daily mean RH2M.
 * WS2M is already at 2 m, so no Eq. 47 conversion is applied.
 */
export function et0FromDailyRecord(
  rec: DailyRecord,
  latDeg: number,
  elevationM: number,
): number | null {
  if (
    rec.tMaxC === null ||
    rec.tMinC === null ||
    rec.rhPct === null ||
    rec.wind2mMs === null ||
    rec.solarMJm2 === null
  ) {
    return null;
  }
  let doy: number;
  try {
    doy = dayOfYear(rec.date);
  } catch {
    return null;
  }
  const input: Et0Input = {
    tMaxC: rec.tMaxC,
    tMinC: rec.tMinC,
    rhMeanPct: rec.rhPct,
    wind2mMs: rec.wind2mMs,
    solarMJm2: rec.solarMJm2,
    latDeg,
    elevationM,
    dayOfYear: doy,
  };
  if (validateEt0Input(input) !== null) return null;
  return et0Daily(input);
}
