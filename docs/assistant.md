# Farmer assistant (/ask), server side

## Steps
1. **Place search** `GET /api/geocode?q=...` (2 to 120 characters). The server asks OpenStreetMap Nominatim
   (`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5`, User-Agent `FieldRewind/0.1 (hackathon project)`, 8 s timeout)
   and returns up to 5 places with name, lat, lon, source and fetch time. On failure it returns the exact reason (HTTP status, timeout).
   No fallback results. Offline mode (`FIELD_REWIND_OFFLINE`) switches search off; the map still works.
2. **Understanding the farmer's words** `POST /api/assistant/understand {text}` (at most 2000 characters).
   - No `GEMINI_API_KEY`, or offline mode on: fixed rules on our server (`src/lib/assistant/parse.ts`). No AI.
   - Key set: Google Gemini lists only the raw mentions (crop words, numbers with the unit as said, priorities). Our code then matches
     crops to the sourced catalog and does every unit conversion. If Gemini fails or returns anything malformed, the fixed rules are used
     and the response says so. The `notice` field always names the method.
3. **The plan** is still computed by the existing `/api/advisor` route from real data. This step only fills in choices.

## What is sent where
- The place name you type goes to OpenStreetMap Nominatim.
- Your words go to Google only when a Gemini key is set on the server. Without a key nothing leaves our server.
- The AI never computes a number.

## Unit conversions (code, `parse.ts`)
| Said | To mm per season |
| --- | --- |
| mm | x 1 |
| inches | x 25.4 |
| feet, acre-feet per acre | x 304.8 |
| ML per hectare | x 100 (1000 m3 over 10,000 m2 = 0.1 m) |
| hectares to acres | x 2.47105, rounded to 1 decimal |

Supply is rounded to whole mm. If budget, water price and acres are all given and no supply was said, the supply comes from
`budgetToSupplyMm` in `src/lib/farmer/budget.ts` (budget / price per acre-foot / acres x 304.8; a price per megalitre uses the metric
path with 1 ML = 1000 m3 and 1 acre = 0.40468564224 ha). A budget "per acre" is multiplied by the acres first.

## Limits
- Only Winter wheat, Maize (grain corn), Cotton and Rice are usable in the replay today. Sunflower, sugar beet and dry bean are in the
  catalog but lack sourced values; they and any other crop (tomato, alfalfa, almond...) are listed as "not matched", never guessed.
- Up to 3 rotations ("or", "versus", "compared with", "option" start a new one), up to 6 crops each.
- The rules read digits only ("2.5", "30k", "30 thousand"), not spelled numbers like "two and a half".
- A budget without "per acre" is read as a total. Money amounts are not sent to the AI plan.
- Missing crops or supply come back as plain questions in `missing`.
