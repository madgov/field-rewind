# Field Rewind (NASA Space Apps 2026, Field Shift)

Question the app answers: "Would your crop rotation have survived the last 40 seasons with your water supply?"
Solo builder, one day. Ship a public Vercel URL early and keep it deployable at all times.

## Hard rules
- NEVER use synthetic data or silent mock fallbacks. If an API is blocked, report the exact blocker.
- Every number shown must come from real data or a cited source. Every crop parameter carries a source; if unsourced, mark unknown and exclude.
- Label NASA POWER results "regional climate, about 50 km grid". It is reanalysis, not a farm sensor.
- All headline wording is generated from computed numbers. If there is no shift, say so.
- Cached or saved responses must always say "saved response from [date]", never look live.
- API keys (CIMIS, OpenET) live in server-side .env only. Never commit them.
- Work ONE stage at a time. Stop after the stage, report real results and limits.
- Do not read large cached JSON files in full. Summarize them with a script (head, counts, min/max).
- Do not deploy externally unless a stage says so.

## Stack
Next.js (App Router, TypeScript), Leaflet + OpenStreetMap, NASA POWER daily API (community AG),
FAO-56 Penman-Monteith ET0, CIMIS station 47 (Brentwood), OpenET (optional panel).

## Demo pins
Brentwood CA (37.93, -121.66), Fresno CA (36.74, -119.79), Ludhiana, Punjab (30.90, 75.85).

## Tier order (cut from the bottom when behind)
1. Must: public URL, cached POWER for 3 pins, FAO-56 unit test, "your field has shifted", 40-season strip with years short by decade, CIMIS chart.
2. Scrubber with animated water gauge, then OpenET panel (90 min cap), then printable one-page report.
3. Stretch: Spanish text, climate-twin, "what's next" slide.

## Design
Real motion: animated hero, animated stripes, gauge animation. Not a static layout. Mobile friendly. Plain English, no jargon.


## Planned stages
1 foundation and unit test; 2 "your field has shifted" screen; 3 crops, 40-season replay, scrubber; 4 CIMIS check, OpenET panel, "How we know", printable report; 5 offline example mode, error states, audit.
