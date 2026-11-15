import type { DailyRecord } from "../types";

export type JulyTmax =
  | { available: true; meanC: number; yearsUsed: number; firstYear: number; lastYear: number }
  | { available: false; reason: string };

/**
 * Mean of daily maximum temperature (T2M_MAX) over every July in the record, using only Julys with all 31 days present.
 * Mean of all those days pooled (each complete July has 31 days, so this equals the mean of the yearly July means).
 */
export function julyMeanTmax(days: DailyRecord[]): JulyTmax {
  const byYear = new Map<number, { sum: number; n: number }>();
  for (const d of days) {
    if (d.date.slice(5, 7) !== "07" || d.tMaxC === null) continue;
    const y = Number(d.date.slice(0, 4));
    const e = byYear.get(y) ?? { sum: 0, n: 0 };
    e.sum += d.tMaxC;
    e.n += 1;
    byYear.set(y, e);
  }
  const full = [...byYear.entries()].filter(([, e]) => e.n === 31).sort((a, b) => a[0] - b[0]);
  if (!full.length) return { available: false, reason: "No July with all 31 days of daily maximum temperature in this record." };
  const sum = full.reduce((s, [, e]) => s + e.sum, 0);
  return { available: true, meanC: sum / (full.length * 31), yearsUsed: full.length, firstYear: full[0][0], lastYear: full[full.length - 1][0] };
}

/**
 * Official NOAA NCEI U.S. Climate Normals 1991-2020, monthly maximum-temperature normal, Fresno station.
 * Value read from the NCEI Data Service on 2026-11-15 (MLY-TMAX-NORMAL for month 07 = 36.5 C, which is 97.7 F in standard units).
 * Station: FRESNO YOSEMITE INTL AP, CA US (USW00093193), 36.78 N, 119.72 W, 101.5 m.
 * Note: a station AIRPORT normal for a different period (1991-2020) than the POWER record used here (1985-2025), so the comparison is rough.
 */
export const FRESNO_JULY_TMAX_NORMAL = {
  valueC: 36.5,
  station: "FRESNO YOSEMITE INTL AP, CA US (USW00093193)",
  period: "1991-2020",
  retrievedOn: "2026-11-15",
  url: "https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=USW00093193&dataTypes=MLY-TMAX-NORMAL&format=json&units=metric",
  productUrl: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
} as const;
