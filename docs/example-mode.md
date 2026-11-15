# Example mode and the offline switch

## The example farm

"Load example farm (Brentwood)" is a link on the home page and on every error, no-coverage and loading screen of `/shift` and `/replay`. It opens:

`/replay?lat=37.9300&lon=-121.6600&example=1&r1=...&s=700` (the rotation and supply parameters come from `exampleFarmHref()` in `src/components/replay/exampleFarm.ts`).

With `example=1` the replay page:

1. Reads only the committed saved NASA POWER response `data/power/brentwood.json` through `loadSavedDemoPin("brentwood")`. It never goes through the live-fetch path, so it makes zero upstream requests.
2. Runs the same normalizer (`normalizePower`) and the same replay engine (`buildSeasonTable`, `replayFromSeasonTable`) as live mode. Nothing is hardcoded or stored as a result.
3. Shows "Saved response from [date]" (the real fetch date inside the saved file) in the page header, the example banner, "Where this came from" in the How we know panel, and the printed report. It never looks live.
4. Keeps the label "Constructed example, not records of a real farm." for the three rotations and the 700 mm supply.

If the saved file is missing or unreadable the page shows the provider-error screen. It does not fall back to live or made-up data.

## Offline switch

Environment variable: `FIELD_REWIND_OFFLINE` (set to `1`, `true`, `yes` or `on`). Server side only.

When on, the NASA POWER service (`src/lib/power/service.ts`):

- makes no network call at all;
- ignores the runtime cache (memory and `.cache/power`), which only holds earlier live fetches;
- still serves the committed saved responses for places in the same 0.5 degree grid square as Brentwood, Fresno or Ludhiana;
- returns a structured `status: "error"` result for anything else, with the message in `OFFLINE_MESSAGE` (`src/lib/power/offline.ts`). The pages show this as the provider-error screen with the example farm offered and no "Try again" button.

Run it:

```
npm run build
FIELD_REWIND_OFFLINE=1 npx next start -p 3100
```

Notes: the OpenET and CIMIS panels read saved files only and never call out while a page loads. The map on the home page still loads OpenStreetMap tiles in the visitor's browser; that is not a server request and is not covered by the switch.
