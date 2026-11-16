# AI field advisor (Stage 7, Batch 2)

Status: built. Real requests through the local production app passed for Fresno, Brentwood and Ludhiana on 2026-11-15 (America/Los_Angeles; the saved timestamps are on 2026-11-16 UTC). See "Subsequent real local checks" below. The current Vercel Gemini connection has not been verified.

Provider: Google Gemini API, free tier, through the official `@google/genai` SDK. Key: `GEMINI_API_KEY` in the server environment only (never read in a client component, never in the data package, never in a response). Optional `GEMINI_MODEL`; the default and fallback list are in `src/lib/advisor/model.ts`. The caller tries fallbacks for an unavailable, rate-limited or missing model. An HTTP 400, 401 or 403 is reported as "key-rejected"; it does not prove that the key alone caused the rejection. Model availability and quota can change.

## What happens on "Send these results to Gemini"
1. The browser sends only choices: place, rotations, water supply in mm, yields per acre, priority order, and a water price only if typed. Budget amounts and field size never leave the browser.
2. `POST /api/advisor` (`src/app/api/advisor/route.ts`) validates the request, then rebuilds the derived figures on the server from the same saved or live data the pages use (`src/lib/advisor/server.ts`): weather record, replay, soil and terrain, satellite land cover, shift, nutrient comparison, priorities, local notes. The browser supplies choices and farmer inputs such as water supply and yield assumptions, not precomputed replay or nutrient results.
3. `forModel` trims what is sent: coordinates rounded to the 0.5 degree grid, unnamed places not named, no budget steps, and the water-cost priority removed (it is a money figure). On the free tier Google says content is "used to improve our products", so the notice is shown beside the button.
4. Gemini is asked for structured JSON: up to 4 sections, up to 3 paragraphs each, every paragraph listing the data paths it relies on (`facts`), plus a `notAvailable` list.
5. The reply goes through `checkReply` (`src/lib/advisor/guard.ts`). If it fails and the first attempt took no more than 25 seconds, the reasons go back to the model for one repair attempt. The repaired reply must pass the same checks. If it still fails, or there is no time to repair it, none of the model's text is shown and the reasons are listed.

## The checks (all must pass)
- Valid JSON of the expected shape; each paragraph cites at least one path; every cited path exists in the package (own properties only, so `constructor` and `__proto__` do not resolve) and is not a bare top-level key.
- Every numeral in a paragraph appears at one of the paths that paragraph cites (rounded forms of a number are accepted), or is one of 1985, 1986, 2025, 40, 50 (stated in the app's own labels). P2O5 and K2O tokens are ignored.
- No number spelled as a word from two upward, and no half, twice, double or dozen. The word "percent" is allowed, but its number must pass the same cited-value check. No digits in headings.
- No money words (profit, income, price, cost, revenue, currency symbols). No forecast wording, except "not a forecast".
- Every layer whose status is "not-available" (soil, erosion, landCover, water) must be named in `notAvailable`; naming an available layer is rejected. Soil-texture words are rejected when soil is not available. "Your field" and "your farm" are rejected when the satellite record says the point is not cropland.

What the check cannot do: it cannot tell whether a true figure was used in a misleading sentence, or whether advice is agronomically sound. The sentences are the model's; only the numbers and the not-available handling are enforced. Every paragraph has a "Based on" list so a reader can see which data it used.

## Labels and states
- Success: "Written by AI (Google Gemini) from the numbers on this page. Check it against a local soil test and your extension office." plus the generation time and model. The app does not persist or replay generated summaries. The ignored audit records described below are separate from the app's response handling.
- No key: "AI field advisor is not connected" with the exact variable to set. No placeholder text.
- Rejected, rate-limited, key rejected, unreachable: each has its own message. The computed tables, priorities, nutrients and notes on the page work without the model.
- Changing inputs after a summary was written shows "You changed something since this summary was written."

## Earlier live results (recorded as 2026-11-16, free-tier key)

This is the historical Stage 7 test record. Later local results are recorded separately below; these earlier failures are not the current status of the three demo checks.
- `gemini-3.8-flash` (first choice, set in .env) was overloaded: one HTTP 503 "high demand" and then requests that never answered. `gemini-3.6-flash` and `gemini-3.5-flash-lite` answered in 2 to 9 seconds. The route therefore tries `GEMINI_MODEL`, then `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` (free-tier models named on the pricing page), each with a 20 s limit and one quick retry on a 503. The model that answered is named on the page.
- First live replies were cut off mid-answer: Gemini counts its private thinking against the output limit. Thinking is now set to low, the limit is 16384 tokens, and a reply that stopped at the limit is refused.
- The check rejected real replies for real reasons (invented paths, numbers not at a cited path, the word "two") and also for two false alarms of its own (the term ET0 read as the number 0; paths with hyphens such as `nutrients.yieldsEntered.winter-wheat`). Those were fixed and tested.
- One repair attempt: if the first reply fails, the reasons go back to the model once, and the new reply goes through the same check. A reply that fails twice is not shown. The route has about 60 s, so no repair is tried if the first attempt took more than 25 s.
- Passing runs seen at that point: Brentwood (passed on the second attempt, `gemini-3.6-flash`), Ludhiana (passed first try twice, once on `gemini-3.5-flash-lite`, and noted the crop values are California values and that soil is not available). Fresno was rejected twice before the path and threshold fixes and had not yet been re-run to a result. After a burst of about 25 calls the free tier answered 429 (limit reached) and the page showed the limit message, so those final fixes were checked on Ludhiana only. Fresno subsequently passed in the local checks below.
- Pass rate is not high enough to be called reliable: the first attempt often fails and the lite model is more error-prone. That is expected to cost one extra call per summary against a small free quota.

## Tested
`src/lib/advisor/advisor.test.ts` (guard, run, request validation, trimming, against real saved Brentwood data) and `gemini.test.ts` (the SDK adapter against a local stand-in server: request shape, key sent as a header and not in the body, 429/403/500/empty/blocked/unreachable mapped). The stand-in proves the adapter, not Google's service or any model's real output.

## Not done / limits
- The recorded live results above are historical tests. Subsequent checks of all three pins through the local production app passed (see below), but the Vercel connection remains unverified and passing summaries are not reliable enough to promise on every request.
- Free-tier rate limits are not stated on the pricing page; a 429 is reported plainly.
- A live request for a point that is not a demo pin may fetch soil and land cover from the network (about 17 to 34 s for land cover). Land cover is given 25 s, then reported as not available.
- No saved example answer exists for example mode (it would have to be a real model response, labelled "saved response from [date]").
- Later browser checks exercised the form and AI display states with stubbed API responses; see `docs/audit-stage7.md`. Those checks do not verify Google's live service. Screen readers and real phones remain untested.

## Subsequent real local checks after the interpretation changes

Checked on 2026-11-15 (America/Los_Angeles), using the local production app's `/api/advisor` with outside calls enabled and the configured server key. All three requests used the constructed example rotations (wheat then maize; maize then cotton; rice, wheat, maize), 700 mm supply, no yield entries, and the water-dependability and lower-water-use priorities. These were real Google API calls, not stubbed responses. No deployment was performed.

| Demo pin | HTTP / app status | Model that answered | Elapsed | Validation attempts |
| --- | --- | --- | --- | --- |
| Fresno | 200 / ok | gemini-3.6-flash | about 10 s | 1 |
| Brentwood | 200 / ok | gemini-3.6-flash | about 8 s | 1 |
| Ludhiana | 200 / ok | gemini-3.5-flash-lite | about 20 s | 2 (one repair) |

The real responses are saved in ignored `scratchpad/gemini-<pin>-live.json`, each with its UTC timestamp. They are audit records, not saved summaries served by the app. Fresno's response was saved at 2026-11-16T06:30:33.717Z, Brentwood's at 2026-11-16T06:34:29.271Z, and Ludhiana's at 2026-11-16T06:34:49.290Z.

Manual inspection confirmed that Fresno was identified as non-cropland, missing yields left nutrient totals unknown, and Ludhiana reported soil data as unavailable and noted the California crop parameters. It also found semantic limits that the numeric/path validator does not catch:

- Fresno described the slope band as "giving" a soil erodibility factor, although those are separate inputs in the package.
- Ludhiana called annual reference evapotranspiration "crop water demand". Its California-parameter warning appeared later in the response rather than in the first section as requested by the prompt.

These runs confirm real local service connectivity, accepted replies for the tested inputs, and a repair path. They do not prove agronomic correctness, every fallback model, arbitrary coordinates, other input combinations, future quota/availability, or the Vercel environment. HTTP 200 alone is not the success criterion: the records also contain the app's `status: "ok"`. No application code was changed as part of these checks. For the separate local build, test and HTTP checks, see `docs/local-verification.md`.

## Follow-up from the saved replies

The documentation review on 2026-11-15 (America/Los_Angeles) rechecked all three saved response records and confirmed the results and semantic errors above. No new Google request was made during that review.

Local connectivity for the three tested inputs is complete. The open AI work is to address and recheck the misleading slope/erodibility relationship, the ET0 label and the placement of the outside-California warning, then verify the deployed service separately. These findings remain open; this documentation update does not change the prompt or validator. New checks should record both application acceptance and manual review of the explanation, because acceptance alone missed these errors.
