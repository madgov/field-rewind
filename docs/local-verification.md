# Local handoff verification

Checked on 2026-11-15 (America/Los_Angeles). This report records the earlier local baseline and interpretation changes, followed by a separate final verification of the SMAP/IMERG stage below. No deployment was performed.

## Verification boundaries

| Check | Recorded result | What it does not establish |
| --- | --- | --- |
| Local tests, lint, typecheck and production build | Passed; 912 tests in 78 files | The later SMAP/IMERG checks are recorded separately below |
| Local production HTTP checks | 13 pages returned 200; API and scenario checks below passed | Browser interactions, appearance, accessibility or real-phone behavior |
| Real Gemini calls through the local app | Fresno, Brentwood and Ludhiana returned HTTP 200 and app status `ok` | Fully accurate prose, every input/model, future availability or the Vercel connection |
| Existing Vercel deployment | Homepage returned HTTP 200 | Other current live routes or the live AI advisor |

No commit, push or deployment was performed. The original handoff's browser checks are historical evidence; they were not rerun here.

## Evidence review and current priorities

Reviewed on 2026-11-15 (America/Los_Angeles) against the saved local HTTP results, the three saved real Gemini responses and the current advisor validator. This was a documentation and evidence review; it did not rerun the test suite, build, browser checks or external services.

- `scratchpad/local-verification.json` contains 13 successful page requests, three saved-weather API requests, the 7-to-18 short-season scenario result, the offline advisor result and the two invalid-input checks described below.
- Each `scratchpad/gemini-<pin>-live.json` contains both HTTP 200 and app status `ok`. The saved models, attempt counts and UTC timestamps match `docs/advisor-method.md`. Local AI connectivity, including Fresno, is therefore already demonstrated for those inputs; it is not an outstanding first connection check.
- The saved Fresno and Ludhiana responses also confirm the semantic errors described below. An accepted reply establishes that the validator passed, not that the explanation is correct. The validator checks cited values and selected wording constraints; it does not establish causal relationships or the meaning of every metric.
- The 912-test result remains a recorded baseline. It does not certify the Earthdata work in progress or other later changes. The original Stage 7 browser audit is separate historical evidence.

Recommended next work, based on this evidence:

1. Address the demonstrated AI explanation errors: keep slope and soil erodibility independent, distinguish reference evapotranspiration from crop water use, and present the California-parameter warning where required. Verify the revised behavior against these saved failure examples and review new real replies. This work is still open.
2. Verify the deployed Gemini configuration and accepted replies on Vercel, then complete the outstanding browser, keyboard, accessibility and print checks. Record the tested environment and inputs separately from local results.
3. Resolve the remaining method-source gaps: effective rainfall was checked against a secondary source, and heat thresholds and planting windows still need the source rechecks listed in the historical audit.
4. After the core checks, consider completing one usable legume. Dry bean already exists but is excluded for missing planting dates. Source nitrogen fixation and any credit to the next crop separately; fixation alone does not establish soil replenishment or phosphorus and potassium gains. USDA price integration is a later feature; exact commodity, region, period and unit coverage has not been verified here, and prices alone would not establish profit.

## Verified

- Dependencies installed from `package-lock.json` with `npm ci`.
- `npm test -- --maxWorkers=2`: 78 test files, 912 tests passed. The adapter tests use a local stand-in server, not Google's service. A sandboxed run could not bind that server; running outside that restriction resolved it. Concurrent page checks also caused a saved-data test timeout; the final suite ran alone and passed without extending timeouts.
- `npm run lint`, `npm run typecheck`, and `npm run build`: passed.
- Production server in `FIELD_REWIND_OFFLINE=1` mode: 13 page requests returned HTTP 200 (home, glossary, satellite-vs-ground, dev, plus shift/replay/conditions for Brentwood, Fresno and Ludhiana). The pin pages carried saved-response and regional-climate labels.
- `/api/power` for each demo pin returned saved data, with 14,975 daily records per pin.
- `/api/scenario`: at 700 mm supply, wheat then maize changed from 7 to 18 short seasons out of 40 under 20% less rain and +2 C, matching the handoff. This was a two-rotation comparison using the real saved weather record.
- `/api/advisor` returned the explicit offline message without contacting Gemini. Invalid coordinates and an invalid scenario request returned HTTP 400.
- Server deployment traces include the saved layer files for shift, replay, conditions and the advisor/scenario APIs. No `.env` or `.env.local` file was listed in those traces.
- The existing public demo homepage returned HTTP 200. No other live feature was verified in this pass.

The later real Gemini checks used the configured local server key with outside calls enabled: Fresno passed in about 10 seconds on `gemini-3.6-flash` (one attempt), Brentwood in about 8 seconds on the same model (one attempt), and Ludhiana in about 20 seconds on `gemini-3.5-flash-lite` (two attempts, including one repair). Inputs, UTC timestamps, saved-response locations and semantic errors found during manual review are in `docs/advisor-method.md`. In particular, passing numeric/path validation did not prevent an unsupported causal statement in Fresno or the mislabelling of reference evapotranspiration as crop water demand in Ludhiana.

The local HTTP checks and their results are in ignored `scratchpad/verify-local.mjs` and `scratchpad/local-verification.json`. Run the script only against the production server started with `FIELD_REWIND_OFFLINE=1` on port 3100; it explicitly expects the AI offline response.

## Local corrections

- Added the public demo URL to the README and clarified that saved CIMIS/OpenET panels do not need runtime keys.
- Corrected the satellite-vs-ground page: CIMIS and OpenET have saved responses and are used, rather than being "never run". Included saved-response dates, comparison links and method limits. Updated existing assertions that required the obsolete text.
- Reconciled contradictory AI, CIMIS and OpenET method documentation with the implementation and recorded authenticated responses. Historical API probes remain labelled as historical.
- Added durable Git ignore rules for `demo-video/` and `scratchpad/`.

## Remaining steps toward the handoff standard

1. Verify the Vercel production Gemini environment and real accepted responses there. The three local real-service calls passed, but local success does not establish deployment configuration.
2. Run browser interaction, console, NDVI overlay, keyboard, contrast and screen-reader checks. Browser access was unavailable in this session; HTTP checks do not verify those behaviors. Real phones remain untested.
3. Confirm the intended GitHub repository and compare these local changes before uploading. This folder has no `.git` metadata, so its branch, commit and relationship to the handoff commit are unverified.
4. When deployment is requested again, use the existing Vercel project, configure `GEMINI_API_KEY` and `GEMINI_MODEL` on the server, deploy and repeat the live checks. GitHub holds the source; Vercel hosts the running app. Never upload `.env`, demo videos or scratch files.
5. Complete and verify Earthdata as a separate stage. That work is in progress and is not covered by the 912-test baseline above. No Earthdata token was used in the checks recorded in this report.
6. Resolve and recheck the AI semantic errors recorded in `docs/advisor-method.md`; accepted numeric/path validation does not close those findings. See the priority order above.

No commit, push or deployment was performed. The local server was stopped after verification. Next.js emitted a non-fatal warning about an unrelated lockfile in the parent home directory; it excluded that directory, and the build passed.

## Step 1: clarify the meaning of results

Completed locally on 2026-11-15 (America/Los_Angeles):

- Replaced the crop-survival question on home, replay, metadata and the print report with a comparison of modelled water need against the selected supply.
- Defined "covered" and "short" beside the main results and in the print report. Both explicitly state that the water comparison does not predict crop survival, yield or soil-health change. Season captions, accessible cell labels and water-demand labels identify the model context.
- Renamed yield fields to "Your yield assumptions" and explained their use: nutrient-removal estimates only, with no predicted yield or adjustment for water shortages.
- Clarified that nutrient removal does not measure remaining soil nutrients or soil-health improvement. Reworded the related priorities to describe the actual metrics.
- Carried these limits into the AI data package and prompt. No real Gemini call was made during this wording stage; the separate subsequent calls are recorded above. Prompt instructions do not establish that a live model will always follow them.
- Updated the README and replay method. No water, crop, yield or nutrient calculation was changed.

Validation: all 912 tests passed with two workers; lint, typecheck and production build passed. Repeated the local offline page/API checks for all three pins. The wheat-maize what-if still returned 7 to 18 short seasons out of 40. The rendered replay HTML contained the yield and nutrient explanations and the shared water interpretation in both screen and print markup; the old survival question was absent. Print pagination and browser appearance were not visually rechecked in this stage.

## Final SMAP/IMERG stage verification

Completed locally on 2026-11-15 (America/Los_Angeles), after the real NASA fetches and integration:

- Full suite: **921 tests in 79 files passed** (`npm test -- --maxWorkers=2`). Lint, typecheck and production build passed. This supersedes the earlier 912-test baseline for this local stage.
- Repeated the 13-page local production HTTP checks and saved-weather/scenario/invalid-input/offline-advisor checks. The wheat-maize scenario remains 7 to 18 short seasons out of 40; no replay calculation changed.
- Started the production server with `FIELD_REWIND_OFFLINE=1` and an empty `EARTHDATA_TOKEN`. All three conditions pages returned HTTP 200 and rendered the new section, saved-response date, observation periods, SMAP quality exclusions, IMERG totals and interpretation limits. An additional unsupported-location request returned 200 with the explicit Earthdata gap and no substituted values.
- IMERG July 2025 amounts were 0 mm at Brentwood, 1.488 mm at Fresno and 252.96 mm at Ludhiana, shown rounded on the page. SMAP had seven returned daily records per pin, with raw retrievals on four dates at Brentwood and three each at Fresno and Ludhiana. None passed the recommended-quality rule in this morning sample; the display correctly withholds those moisture values. See `docs/earthdata.md` for provider bugs, source/version details and quality handling.
- The conditions deployment trace includes all three Earthdata JSON files and no `.env` files. Scanned 359 source, script, saved-Earthdata and built-client files: no configured credential values were found. Saved observations contain no signed download URLs or account metadata.
- New HTTP results are in ignored `scratchpad/earthdata-http-checks.json`; rendered pages are in `scratchpad/earthdata-<pin>-page.html`.

The runtime reads saved files only; the token belongs on the fetch machine. ECOSTRESS and GLDAS/NLDAS remain unimplemented. Earthdata observations are contextual and are not inputs to the replay or Gemini payload. Browser visual/interaction checks remain unavailable, so these HTTP checks do not certify layout, accessibility, real phones or live Vercel behavior. No commit, push or deployment was performed; the local server was stopped after verification.
