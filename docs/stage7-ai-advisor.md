# Stage 7 addendum: AI field advisor (brief for the Stage 7 worker)

Status: Batch 1 (data, computed analysis, farmer inputs, advisor payload) is built: see docs/nutrient-sources.md. The model call, guard, UI and key handling (sections 4 to 6 below) are NOT built (Batch 2). Deviation from section 2: nutrient data lives in data/crops/nutrients.json beside the catalog, not inside it, so the replay's usable-crop rules are unchanged. Original instruction follows. Build it as part of Stage 7 integration, on `/replay`, after the farmer priorities, rotation soil-health comparison, local-expertise notes and what-if sliders exist, because it reads their outputs.

## What the user asked for
Use AI to read the app's own charts (average soil composition, temperature, rain), the farmer's irrigation budget, and published crop water and nutrient needs. Cross-reference them. Account for nutrients that are replenished (for example by legumes) and nutrients that are reused or drawn down every year. Explain how to avoid over-using the ground in a season and keep the field sustainable over time.

## The rule that decides the design
CLAUDE.md: every number comes from real data or a cited source, and all headline wording is generated from computed numbers. So:

**The model never originates a number, a crop parameter, or a claim about the field. Code computes everything. The model only turns a fixed, computed payload into plain-English prose.**

If the payload does not contain it, the text must not say it.

## 1. Inputs (all computed or user-entered, nothing recalled by the model)

From existing code, per pin:
- Climate: annual and per-decade rain, Tmax/Tmin, July Tmax (`src/lib/summary`), ET0 (`src/lib/et0`), years short by decade (`src/lib/replay`), shift result (`src/lib/shift`). Label stays "regional climate, about 50 km grid".
- Soil, US pins only (`src/lib/landform`): texture class, sand/silt/clay %, organic matter %, pH per horizon, profile available water (mm, top 100 cm), Kf erodibility, hydrologic group, drainage class, slope, erosion indicator. The SSURGO layer has NO plant-available N, P or K. Do not invent them.
- Ludhiana and any pin without coverage: pass soil as `{ status: "not available", reason }`. The model must say it is not available and must not fill the gap.

From the user (new form fields, validated, never defaulted):
- Irrigation budget and water price, converted to mm of supply with the existing `supplyMm` path. State the conversion in the UI (area, price per unit volume, result in mm).
- Field area, and expected yield per crop, only if the nutrient totals below are wanted. Without yield, show per-unit-of-yield figures only.
- Farmer priorities already planned for Stage 7.

## 2. New sourced data: crop nutrient need, removal, replenishment
Extend `src/lib/crops/types.ts` and `data/crops/catalog.json` with `Sourced<number>` fields, using the same pattern as Kc and stage days (`source`, `page`, `url`, `note`):
- Nutrient removal in harvested product per unit yield (N, P, K).
- Nitrogen fixed by legume crops, where a printed figure exists.
- Residue return and whether residues are removed (printed assumptions only).

The worker finds published tables (for example university extension crop-nutrient-removal tables, USDA/NRCS, FAO) and cites the exact table and row. Anything not found stays `value: null` with the reason, and the crop is excluded from that comparison, as CLAUDE.md requires. Do not fill values from memory. Region rows must match the crop's region note, same as `docs/crop-sources.md`.

## 3. Computed analysis (plain code, unit-tested, no model)
Write `src/lib/advisor/` that produces one JSON payload per pin and rotation:
1. Water: seasons short of water, years short by decade, irrigation need in mm vs the user's supply, and the gap, from the existing replay with the user's `supplyMm`.
2. Nutrient balance per rotation, per year: removal minus fixation, sourced values only, with a `nullFields` list for anything missing.
3. Over-use flags, each a computed boolean plus the numbers behind it: supply below need in N of 40 seasons; same crop family back to back; net removal above return across the rotation; erosion indicator high with bare-soil months; organic matter low for the texture class.
4. Sustainability comparison between the user's rotation and the alternatives already in the catalog (reuse the Stage 7 soil-health comparison, do not build a second one).
5. A `limits` array (reanalysis not a sensor, nutrient figures are published averages not soil tests, what is missing).

## 4. The model call (server only)
- New route handler under `src/app/api/advisor/`. The model key is `ANTHROPIC_API_KEY` in server `.env` only. Add it to `.env.example` with an empty value. Never read it in a client component.
- Install `@anthropic-ai/sdk`. Before writing the call, re-invoke the `claude-api` skill and follow the TypeScript README. Do not copy request shapes from memory. Points from the skill that affect this call: use `claude-opus-5-5` unless the user names another model; thinking is always on for that model, set `output_config.effort` explicitly (default is `medium`); do not send `temperature`, `top_p`, `top_k` or `budget_tokens`; no forced `tool_choice`; no prefill; check `stop_reason` for `refusal` and `max_tokens` before reading `content`; stream if `max_tokens` is large. The skill also says to add the server-side `fallbacks` parameter on this model by default, so tell the user it is on.
- Use structured output (`output_config.format`) so the reply is a fixed shape: short sections (water, nutrients, what to change, what to watch), each sentence tagged with the payload field ids it relies on.
- System prompt rules: use only the supplied payload; no numbers except ones copied from it; say "not available" where the payload does; no yield, price or nutrient claims that are not in the payload; no fertilizer product advice or dosing; this is guidance from past weather, not a forecast and not a soil test.

## 5. Guard (this is the real enforcement, not the prompt)
After the call and before display:
- Extract every numeral from the reply and reject it if any is not present in the payload (allow only a short explicit list such as the years 1986 to 2025 and "40").
- Reject any section whose cited field ids do not exist in the payload.
- On rejection, show "AI summary not shown: it contained a figure that is not in your data" and the computed results alone. Do not retry silently into a different answer. Do not show any model text that failed the check.
- Unit-test the guard with a reply that adds a made-up figure, a reply that drops a "not available" note, and a clean reply.

## 6. Labels and states
- Label every AI block "Written by AI from the numbers above. Check against a local soil test and your extension office."
- Keep "regional climate, about 50 km grid" next to any climate figure.
- If the key is missing, render a blocked card in the style of `src/components/conditions/BlockedCard.tsx` ("AI field advisor not connected: needs ANTHROPIC_API_KEY on the server"). No placeholder text and no canned example advice.
- If a response is stored or replayed for example mode, show "saved response from [date]" and never "live". Store the payload hash with it, so a changed input invalidates the saved text.
- The computed tables, flags and charts must render without the model. The AI text is an extra, never the only place a result appears.

## 7. Tests and checks before calling it done
- Unit: nutrient balance arithmetic, null handling (unsourced crop is excluded and listed), over-use flags, budget to mm conversion, guard cases above.
- No test hits the live model. Test the route with the SDK client injected.
- Lint, build, print layout of the new block, mobile width, Ludhiana (soil not available) and a no-key state in the browser.
- Audit against CLAUDE.md: list every number on the new block and where it comes from.

## Known limits to state in the README
- SSURGO gives organic matter, texture, pH and water capacity, not plant-available N, P, K. The nutrient part is therefore crop removal and fixation from published tables, not a measurement of what is in this soil.
- Soil layers are US-only. Ludhiana gets the water analysis only.
- No market prices (USDA key not connected), so no income or cost-benefit claims.
- Past-weather replay, not a forecast.

## Open decisions for the user
1. Build now, or hold until the rest of Stage 7 is done (recommended: hold, since the advisor reads those outputs).
2. Anthropic API key for the server `.env` (new blocker, a cost per report).
3. Model: `claude-opus-5-5` by default. A cheaper model is the user's call.
4. Whether the user enters yield and area for per-field nutrient totals, or the app shows per-unit-yield figures only.
