# Audit of the Stage 7 additions against CLAUDE.md

Date: 2026-11-16. Scope: nutrient data, rotation comparison, budget and priorities, local notes, the AI advisor, the what-if panel, `/glossary`, `/satellite-vs-ground`, and the footer links. Method: read the code and data, ran the full test suite (907 tests), lint, typecheck and a production build, and probed the built pages and routes with curl. No browser was available, so nothing was clicked, resized or printed.

## Hard rules

| Rule | Result | Evidence |
|---|---|---|
| No synthetic data, no silent mock fallback | Pass | Every failure path returns a named reason (`not-connected`, `rate-limited`, `model-missing`, `rejected`, "not available" for missing layers). The only constructed values are test inputs (yields, budget) in tests, labelled as such, and the existing labelled example farm. |
| Every number from real data or a cited source | Pass, with listed gaps | Nutrient figures carry source, page and URL (`data/crops/nutrients.json`, shown on the page under "Where each nutrient figure comes from"). Budget and yield conversions are unit definitions (304.8 mm per foot, 0.40468564224 ha per acre) or the farmer's own inputs. Quotes are word for word with a read date. Unsourced values are `null` and excluded; replenishment is "unknown", never zero. |
| Label POWER "regional climate, about 50 km grid" | Fixed in this audit | The new priorities card and the what-if panel carried POWER-derived numbers without the label; both now say it. The AI package carries the label and the reply check allows it. |
| Headlines generated from computed numbers | Pass | Priorities text, scenario sentences (`scenarioWording`) and findings on the new pages come from the app's wording code. AI text is shown only if every number sits at a path it cites. |
| Saved or cached responses say "saved response from [date]" | Pass | Package origin lines come from the same label code; findings on `/satellite-vs-ground` carry their saved-response labels. AI output is labelled "Written just now" with the time and model, and is not stored, so it is never shown as saved or live data. |
| Keys server side only | Pass | `GEMINI_API_KEY` is read only in `src/app/api/advisor/route.ts`. `.env` is git-ignored; no staged or committed file contains the key (checked by searching staged diffs for its value). The key is never in the data package or any response. |
| Work one stage at a time, no external deploy | Pass | Nothing is deployed or pushed. |

## Problems found and fixed during the audit
- **Offline switch did not cover Gemini.** With `FIELD_REWIND_OFFLINE` on, the advisor would still have contacted Google. It now returns "not connected" without sending anything (`src/lib/advisor/offline.ts`, tested).
- **Path lookup accepted `constructor`.** The reply check resolved cited paths with `in`, which reaches inherited properties. It now uses own properties only (tested).
- **The check had false alarms:** the term "ET0" read as the number 0, hyphenated keys such as `winter-wheat` could not be cited, the app's own decade labels were rejected, and the unit word "percent" was banned. Fixed and tested.
- **A live reply was cut off** because Gemini's thinking counted against the output limit. A cut-off reply is now refused, and thinking is set low.
- **Land-cover label.** NASS says Cropland Data Layer pixels are 10 m from 2024 while the app called the layer "30 m". The app's label and wording now say 30 m through 2023 and 10 m from 2024. The saved ground-truth files still carry the older source name until they are re-fetched.
- **Misnamed section numbers** in two docs after the what-if panel became section 4.

## Open items (not fixed)
- **Never seen in a browser:** form typing, the priority arrows, slider dragging and animation, the AI block's states, phone-width layout, keyboard order, colour contrast and print. The new sections are direct children of the page container that the print rule hides, but print was not previewed.
- **AI reliability.** On the free tier the first reply often fails the check and is retried once, models are sometimes busy (HTTP 503), and quota ran out after about 25 test calls. Passing summaries were seen for Brentwood and Ludhiana. Fresno has not been re-run to a result since the last fixes. The sustainability advice in passing summaries is thin.
- **Privacy.** On the free tier Google says content may be used to improve its products. The page says so next to the button; money, field size and typed rotation names are not sent.
- **What-if panel.** Slider values are not in the share link, and the main strips and gauges are not redrawn for the what-if; the panel has its own side-by-side view.
- **Glossary and satellite page.** Quotes were read once, not re-checked against a second fetch. Gaps are listed on the page (OpenET pixel size, several NASA layer resolutions, the CoCoRaHS instrument, the NLCD 2021 citation, the CIMIS page was blocked).
- **Carried over from earlier stages:** CIMIS and OpenET panels have never run (no keys); the effective-rain formula was verified from a secondary source; heat thresholds and planting windows were not re-verified against the papers; the crop values are California values and show a warning elsewhere; only 4 of 7 catalog crops are usable.
- **Content gaps:** only Fresno has a place-specific expert quote; replenishment is unknown for all crops until a legume with a sourced fixation figure is added.
