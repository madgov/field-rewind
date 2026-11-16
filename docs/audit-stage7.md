# Audit of the Stage 7 additions against CLAUDE.md

This is the historical Stage 7 audit, retained with its original date, counts and browser results. It is not a fresh audit of the local checkout or current Vercel deployment. For later local production checks and the real Gemini checks at all three demo pins, see `docs/local-verification.md` and `docs/advisor-method.md`.

Date: 2026-11-16. Scope: nutrient data, rotation comparison, budget and priorities, local notes, the AI advisor, the what-if panel, `/glossary`, `/satellite-vs-ground`, and the footer links. Method: read the code and data, ran the full test suite (907 tests), lint, typecheck and a production build, and probed the built pages and routes with curl. A browser pass was added later the same day (see below).

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

## Browser and print checks (2026-11-16)
Run with Playwright's headless Chromium against the production build, on the example farm, at 1280x900 and 390x844. 73 checks; 71 pass. The scripted checks cover: the what-if sliders (drag, result, reset), the budget form (10000 / 200 per acre-foot / 100 acres gives 152 mm, applies to the page's supply, a zero budget is refused), yields, priorities (order, arrows, climate label), nutrient sources (16 links), metric toggle, the free-tier notice, the AI block's five states (not connected, rejected, rate limit, ok, stale), print (one A4 page, the new sections hidden), no horizontal scroll, no console or page errors, labels on every control, the footer links, and the home, shift, conditions, glossary, satellite and Ludhiana pages at phone width.
- The AI block states were exercised with a stubbed `/api/advisor` response so no Gemini quota was spent; the stubs are test inputs, not app data.
- Fixed because of these checks: the two "Where this comes from" and "Based on" toggles were under 44 px; priority rows were 28 px tall on desktop; source links were 17 px tall; yield inputs did not line up when labels wrapped.
- The two remaining "failures" are inline links inside a sentence (the expert-quote source names, 36 px tall), which are exempt from the 44 px target rule as text links. Checkboxes and radios are 22 px boxes inside label rows that are 44 px or taller, so the tap area is the whole row.
- Not covered: colour contrast measurement, a screen reader, keyboard tab order beyond the sliders, and real iOS or Android browsers (only Chromium with a phone-sized viewport and touch enabled).

## Open items at the time of this audit
- **Browser coverage is partial:** see the section above. Colour contrast, a screen reader and real phones were not tested.
- **AI reliability.** On the free tier the first reply often failed the check and was retried once, models were sometimes busy (HTTP 503), and quota ran out after about 25 test calls. Passing summaries had been seen for Brentwood and Ludhiana; Fresno had not yet been re-run after the fixes. All three later passed real requests through the local production app, as recorded in `docs/advisor-method.md`. That later check also found semantic errors despite validation passing, so general reliability and agronomic correctness remain unresolved.
- **Privacy.** On the free tier Google says content may be used to improve its products. The page says so next to the button; money, field size and typed rotation names are not sent.
- **What-if panel.** Slider values are not in the share link, and the main strips and gauges are not redrawn for the what-if; the panel has its own side-by-side view.
- **Glossary and satellite page.** Quotes were read once, not re-checked against a second fetch. Gaps are listed on the page (OpenET pixel size, several NASA layer resolutions, the CoCoRaHS instrument, the NLCD 2021 citation, the CIMIS page was blocked).
- **Carried over from earlier stages:** the CIMIS and OpenET panels ran for the first time on 2026-11-16 (both clients needed corrections to match the real APIs; see their docs); the effective-rain formula was verified from a secondary source; heat thresholds and planting windows were not re-verified against the papers; the crop values are California values and show a warning elsewhere; only 4 of 7 catalog crops are usable.
- **Content gaps:** only Fresno has a place-specific expert quote; replenishment is unknown for all crops until a legume with a sourced fixation figure is added.

## Later verification boundary

The subsequent local baseline passed 912 tests in 78 files, lint, typecheck and a production build. Local HTTP checks covered 13 pages, saved weather for all three pins, the 7-to-18 short-season what-if, invalid inputs and the offline AI response. Those were server and HTTP checks, not a rerun of the 73 historical browser checks above. Print text was inspected in rendered HTML, but pagination was not visually rechecked. The current Vercel homepage returned 200; its AI advisor remains unverified. The later SMAP/IMERG stage has its own final verification in `docs/local-verification.md`; it is outside this historical audit.

A documentation review on 2026-11-15 (America/Los_Angeles) corroborated the later HTTP results and all three accepted Gemini responses against their saved records. It did not rerun this audit. The demonstrated AI semantic errors remain open and should be addressed before extending the advisor's nutrient or market-price claims. See [the current evidence review and priorities](local-verification.md#evidence-review-and-current-priorities) and [the advisor follow-up](advisor-method.md#follow-up-from-the-saved-replies).
