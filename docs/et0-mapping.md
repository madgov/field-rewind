# How NASA POWER maps to FAO-56 ET0

Implementation: `src/lib/et0/fao56.ts`. Method: FAO Irrigation and Drainage Paper 56 (Allen et al., 1998),
Penman-Monteith, daily step (Eq. 6), Chapters 3 and 4: https://www.fao.org/4/x0490e/x0490e07.htm and
https://www.fao.org/4/x0490e/x0490e08.htm. Equation numbers below are that document's.

## Input mapping

| NASA POWER field (app field) | FAO-56 quantity | How it is used |
|---|---|---|
| `T2M_MAX` (`tMaxC`) | Tmax | e0(Tmax) via Eq. 11; Tmean = (Tmax+Tmin)/2 (Eq. 9); longwave term (Eq. 39) |
| `T2M_MIN` (`tMinC`) | Tmin | e0(Tmin) via Eq. 11; Tmean; longwave term |
| `RH2M`, daily mean (`rhPct`) | RHmean | ea = RHmean/100 x (e0(Tmax)+e0(Tmin))/2 (Eq. 19) |
| `WS2M` (`wind2mMs`) | u2 | Already at 2 m, so the Eq. 47 height conversion is NOT applied |
| `ALLSKY_SFC_SW_DWN` (`solarMJm2`, MJ/m^2/day) | Rs | Used directly (no Angstrom Eq. 35). Rns = 0.77 Rs (Eq. 38) |
| Grid-cell elevation from POWER (`PowerResult.elevationM`) | z | Pressure P (Eq. 7), psychrometric constant (Eq. 8), clear-sky Rso (Eq. 37) |
| Latitude of the pin | latitude | Extraterrestrial radiation Ra (Eqs. 21-25) with day of year, which gives Rso |
| (not used) | G | G = 0 for daily steps (Eq. 42) |

`PRECTOTCORR` is not an ET0 input. A record with any of the five required fields missing gives `null`
(never filled or interpolated). Physically invalid values (RH outside 0-100, negative wind or radiation,
non-finite numbers) also give `null` from the adapter, so one bad day cannot crash a 40-year run.

## Edge-case decisions

- **Rs/Rso capped at 1.0.** FAO-56 states this limit under Eq. 39. Bright reanalysis days can exceed Rso.
- **Polar night (Rso < 0.1 MJ/m^2/day).** Rs/Rso is undefined. FAO-56 gives no rule for it, so we use 0.3, the value
  FAO-56 says "presumes total cloud cover" (hourly time step text, Chapter 4). Rn is then about zero or negative
  and the result is clamped to 0 anyway.
- **Sunset hour angle beyond the polar circle.** arccos argument clamped to [-1, 1] (ws = pi for polar day, 0 for
  polar night); same limit as FAO-56's Eq. 26/27 with X floored at 0.00001.
- **Negative ET0.** Eq. 6 can go negative on cold, dark, humid days (Rn < 0). FAO-56 defines no negative ET0, so the
  returned value is clamped at 0. The unclamped number is available as `et0Raw` from `et0DailyDetailed`.

## Approximations (read before trusting a number)

1. **Mean RH instead of max/min RH.** FAO-56 gives Eq. 19 only "in the absence of RHmax and RHmin" and says it
   "is less desirable than are Equations 17 or 18". POWER gives daily mean RH2M only. With Example 18's inputs
   RHmean = 73.5% gives ET0 of about 3.79 vs 3.88 mm/day (about 2% lower). With FAO-56's own Example 5, Eq. 19 gives
   ea = 1.78 kPa vs 1.70 kPa from Eq. 17. The size and sign of the difference depend on how far the humidity
   cycle is from symmetric, so it is not a fixed correction and we do not apply one.
2. **Reanalysis, not a station.** POWER is satellite and model reanalysis on a grid of roughly 50 km, not a
   weather station sited over irrigated reference grass (FAO-56 Chapter 3 describes such stations as the
   intended data source). Results describe regional climate and can be biased against a well-sited station.
   In arid areas, expect higher ET0 than an irrigated-station ETo, because a grid cell mixes dry surrounding land
   while a reference station sits over a wet grass surface. We have not measured this bias here; compare against
   CIMIS station data where available (Brentwood).
3. **Grid-cell elevation.** Pressure and Rso use the POWER grid-cell mean elevation, not the elevation of the
   actual field. The effect is small (P changes about 1.2% per 100 m) but is a real mismatch in hilly terrain.
4. **G = 0.** Correct for a daily step per FAO-56 Eq. 42, but a simplification for individual days.
5. **Rs from the reanalysis.** ALLSKY_SFC_SW_DWN is modelled, so the Rs/Rso cloud term in the longwave
   calculation inherits that model's cloud error. Rso uses Eq. 37 (no local calibration).
6. **Fixed constants.** Albedo 0.23, Gsc 0.0820 MJ/m^2/min, sigma 4.903e-9 as published; no local calibration.

## Validation against the published worked example

FAO-56 Example 18 (Uccle, Brussels, 6 July: 50.80 N, 100 m, Tmax 21.5, Tmin 12.3, RHmax 84, RHmin 63, 10 km/h
at 10 m, 9.25 h sunshine). Published ETo = 3.88, reported as 3.9 mm/day. This code, chaining Eq. 47, Eq. 21, Eq. 34,
Eq. 35 and Eq. 6 with Eq. 17, gives **3.880 mm/day** (unit test: `src/lib/et0/fao56.test.ts`), with every
intermediate (u2, es, ea, Ra, N, Rs, Rso, Rns, Rnl, Rn, slope, gamma) matching the printed value to its
printed precision. The mean-RH path with RHmean = 73.5% gives 3.787 mm/day.

Typos in the source document, found while testing: Example 18 prints "N = 16.1" then "n/N = 9.25/16.3"
(computed N is 16.10; n/N = 0.574 either way rounds to the printed 0.57), and wind "2,078" is 2.078 m/s.
Examples 10-12 round intermediate factors (e.g. Rns 11.1 where 0.77 x 14.5 = 11.17), so tests there allow 0.1.
