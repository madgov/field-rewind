# AI field advisor (Stage 7, Batch 2)

Status: built, and run live against Google's Gemini service on 2026-11-16 with the user's free-tier key (see "Live results").

Provider: Google Gemini API, free tier, through the official `@google/genai` SDK. Key: `GEMINI_API_KEY` in the server environment only (never read in a client component, never in the data package, never in a response). Optional `GEMINI_MODEL`; the default is a model the Gemini pricing page lists as free of charge on 2026-11-15 (`DEFAULT_GEMINI_MODEL` in `src/lib/advisor/model.ts`). Google retires free models; if the default stops working the route shows "key-rejected" with the model name to check.

## What happens on "Send these results to Gemini"
1. The browser sends only choices: place, rotations, water supply in mm, yields per acre, priority order, and a water price only if typed. Budget amounts and field size never leave the browser.
2. `POST /api/advisor` (`src/app/api/advisor/route.ts`) validates the request, then rebuilds every figure on the server from the same saved or live data the pages use (`src/lib/advisor/server.ts`): weather record, replay, soil and terrain, satellite land cover, shift, nutrient comparison, priorities, local notes. The browser cannot supply numbers.
3. `forModel` trims what is sent: coordinates rounded to the 0.5 degree grid, unnamed places not named, no budget steps, and the water-cost priority removed (it is a money figure). On the free tier Google says content is "used to improve our products", so the notice is shown beside the button.
4. Gemini is asked for structured JSON: up to 4 sections, up to 3 paragraphs each, every paragraph listing the data paths it relies on (`facts`), plus a `notAvailable` list.
5. The reply goes through `checkReply` (`src/lib/advisor/guard.ts`). If any test fails, none of the model's text is shown and the reasons are listed. There is no retry and no repair.

## The checks (all must pass)
- Valid JSON of the expected shape; each paragraph cites at least one path; every cited path exists in the package (own properties only, so `constructor` and `__proto__` do not resolve) and is not a bare top-level key.
- Every numeral in a paragraph appears at one of the paths that paragraph cites (rounded forms of a number are accepted), or is one of 1985, 1986, 2025, 40, 50 (stated in the app's own labels). P2O5 and K2O tokens are ignored.
- No number spelled as a word from two upward, and no half, twice, double, dozen, percent. No digits in headings.
- No money words (profit, income, price, cost, revenue, currency symbols). No forecast wording, except "not a forecast".
- Every layer whose status is "not-available" (soil, erosion, landCover, water) must be named in `notAvailable`; naming an available layer is rejected. Soil-texture words are rejected when soil is not available. "Your field" and "your farm" are rejected when the satellite record says the point is not cropland.

What the check cannot do: it cannot tell whether a true figure was used in a misleading sentence, or whether advice is agronomically sound. The sentences are the model's; only the numbers and the not-available handling are enforced. Every paragraph has a "Based on" list so a reader can see which data it used.

## Labels and states
- Success: "Written by AI (Google Gemini) from the numbers on this page. Check it against a local soil test and your extension office." plus the generation time and model. Responses are not stored, so nothing is labelled as saved.
- No key: "AI field advisor is not connected" with the exact variable to set. No placeholder text.
- Rejected, rate-limited, key rejected, unreachable: each has its own message. The computed tables, priorities, nutrients and notes on the page work without the model.
- Changing inputs after a summary was written shows "You changed something since this summary was written."

## Live results (2026-11-16, free-tier key)
- `gemini-3.8-flash` (first choice, set in .env) was overloaded: one HTTP 503 "high demand" and then requests that never answered. `gemini-3.6-flash` and `gemini-3.5-flash-lite` answered in 2 to 9 seconds. The route therefore tries `GEMINI_MODEL`, then `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` (free-tier models named on the pricing page), each with a 20 s limit and one quick retry on a 503. The model that answered is named on the page.
- First live replies were cut off mid-answer: Gemini counts its private thinking against the output limit. Thinking is now set to low, the limit is 16384 tokens, and a reply that stopped at the limit is refused.
- The check rejected real replies for real reasons (invented paths, numbers not at a cited path, the word "two") and also for two false alarms of its own (the term ET0 read as the number 0; paths with hyphens such as `nutrients.yieldsEntered.winter-wheat`). Those were fixed and tested.
- One repair attempt: if the first reply fails, the reasons go back to the model once, and the new reply goes through the same check. A reply that fails twice is not shown. The route has about 60 s, so no repair is tried if the first attempt took more than 25 s.
- Passing runs seen: Brentwood (passed on the second attempt, `gemini-3.6-flash`), Ludhiana (passed first try twice, once on `gemini-3.5-flash-lite`, and noted the crop values are California values and that soil is not available). Fresno was rejected twice in an early run, before the path and threshold fixes, and has not been re-run to a result since. After a burst of about 25 calls the free tier answered 429 (limit reached) and the page showed the limit message, so the final fixes were checked on Ludhiana only.
- Pass rate is not high enough to be called reliable: the first attempt often fails and the lite model is more error-prone. That is expected to cost one extra call per summary against a small free quota.

## Tested
`src/lib/advisor/advisor.test.ts` (guard, run, request validation, trimming, against real saved Brentwood data) and `gemini.test.ts` (the SDK adapter against a local stand-in server: request shape, key sent as a header and not in the body, 429/403/500/empty/blocked/unreachable mapped). The stand-in proves the adapter, not Google's service or any model's real output.

## Not done / limits
- No live call has been made. Whether the model follows the prompt well enough to pass the check often is unknown until a key is set; a rejection shows the reasons so the prompt can be tuned.
- Free-tier rate limits are not stated on the pricing page; a 429 is reported plainly.
- A live request for a point that is not a demo pin may fetch soil and land cover from the network (about 17 to 34 s for land cover). Land cover is given 25 s, then reported as not available.
- No saved example answer exists for example mode (it would have to be a real model response, labelled "saved response from [date]").
- Not browser-tested in this batch: the server-rendered page was checked (the section, form, notice and Ludhiana gap render); clicks, typing and the AI block's states were not exercised in a browser.
