// Test-only fixtures. Small crop definitions and hand-built climates. Never imported by app code.
import type { Crop, Sourced } from "../crops/types";
import type { DailyRecord, PowerResult } from "../types";
import type { PreparedClimate } from "./climate";
import { dayNum, dayNumToIso, isoToDayNum, monthKeyOfDayNum } from "./dates";

const src = <T>(value: T | null): Sourced<T> => ({ value, source: "test fixture", page: "n/a" });

export function fixtureCrop(o: {
  id: string;
  name?: string;
  kc?: [number | null, number | null, number | null];
  days?: [number, number, number, number];
  plant?: string;
  heat?: number | null;
  spans?: boolean;
}): Crop {
  const kc = o.kc ?? [0.4, 1.1, 0.6];
  const d = o.days ?? [10, 20, 30, 20];
  return {
    id: o.id,
    name: o.name ?? o.id,
    kc: { ini: src(kc[0]), mid: src(kc[1]), end: src(kc[2]) },
    stageDays: { ini: src(d[0]), dev: src(d[1]), mid: src(d[2]), late: src(d[3]) },
    planting: { windowStart: src("01-01"), windowEnd: src("12-31"), defaultDate: src(o.plant ?? "04-15") },
    heatThresholdC: src(o.heat === undefined ? 35 : o.heat),
    spansNewYear: o.spans ?? false,
  };
}

/** Hand-built prepared climate over [startIso, endIso] with per-day functions of the day number. */
export function makeClimate(o: {
  start?: string;
  end?: string;
  et0?: (d: number) => number | null;
  precip?: (d: number) => number | null;
  tMax?: (d: number) => number | null;
}): PreparedClimate {
  const first = isoToDayNum(o.start ?? "1985-01-01");
  const last = isoToDayNum(o.end ?? "2025-12-31");
  const len = last - first + 1;
  const et0 = new Float64Array(len).fill(NaN);
  const precip = new Float64Array(len).fill(NaN);
  const tMax = new Float64Array(len).fill(NaN);
  const months = new Map<number, { totalMm: number; availableDays: number }>();
  for (let d = first; d <= last; d++) {
    const e = (o.et0 ?? (() => 5))(d);
    if (e !== null) et0[d - first] = e;
    const p = (o.precip ?? (() => 0))(d);
    if (p !== null) {
      precip[d - first] = p;
      const k = monthKeyOfDayNum(d);
      const m = months.get(k) ?? { totalMm: 0, availableDays: 0 };
      m.totalMm += p;
      m.availableDays += 1;
      months.set(k, m);
    }
    const t = (o.tMax ?? (() => 30))(d);
    if (t !== null) tMax[d - first] = t;
  }
  return {
    latDeg: 37.9,
    elevationM: 20,
    firstDay: first,
    lastDay: last,
    et0,
    precip,
    tMax,
    months,
    firstDate: dayNumToIso(first),
    lastDate: dayNumToIso(last),
    needCache: new WeakMap(),
    source: { origin: "saved", fetchedAt: "2026-01-01T00:00:00.000Z", lat: 37.9, lon: -121.6, elevationM: 20 },
  };
}

/** A PowerResult with constant mild weather (so ET0 is computed by the real FAO-56 code) and caller-controlled holes/rain. */
export function makePower(o: {
  start?: string;
  end?: string;
  precip?: (iso: string, d: number) => number | null;
  patch?: (rec: DailyRecord, d: number) => DailyRecord;
  elevationM?: number | null;
  status?: PowerResult["status"];
}): PowerResult {
  const first = isoToDayNum(o.start ?? "1985-01-01");
  const last = isoToDayNum(o.end ?? "2025-12-31");
  const days: DailyRecord[] = [];
  for (let d = first; d <= last; d++) {
    const iso = dayNumToIso(d);
    let rec: DailyRecord = {
      date: iso,
      tMaxC: 30,
      tMinC: 15,
      rhPct: 50,
      wind2mMs: 2,
      solarMJm2: 20,
      precipMm: o.precip ? o.precip(iso, d) : 0,
    };
    if (o.patch) rec = o.patch(rec, d);
    days.push(rec);
  }
  const zero = { tMaxC: 0, tMinC: 0, rhPct: 0, wind2mMs: 0, solarMJm2: 0, precipMm: 0, anyField: 0, totalDays: days.length };
  return {
    status: o.status ?? "ok",
    lat: 37.93,
    lon: -121.66,
    gridCell: { key: "test", latCenter: 38, lonCenter: -121.5 },
    elevationM: o.elevationM === undefined ? 20 : o.elevationM,
    units: { tMaxC: "C", tMinC: "C", rhPct: "%", wind2mMs: "m/s", solarMJm2: "MJ/m^2/day", precipMm: "mm/day" },
    requested: { start: o.start ?? "1985-01-01", end: o.end ?? "2025-12-31" },
    coverage: { start: days[0].date, end: days[days.length - 1].date },
    missing: zero,
    fetchedAt: "2026-02-03T10:00:00.000Z",
    sourceUrls: [],
    origin: "saved",
    days,
  };
}

export { dayNum };
