# Reference pages: /glossary and /satellite-vs-ground

Status: built and tested, not browser-checked (no browser was available). Sources read 2026-11-16 (UTC). Footer links use `SITE_LINKS` from `src/components/site/links.ts`. Later Earthdata additions are described in `docs/earthdata.md`.

## What is where
- Content as data: `data/site/glossary.json` (33 terms) and `data/site/satellite-vs-ground.json` (16 layers, 3 "why both" statements, a gaps list). Both carry a source registry (title, publisher, URL, read date). Every statement lists the documents it was written from: a web document (with where it was read and a short word-for-word quote) or one of this repo's own method documents (path and section).
- Loaders and types: `src/lib/site/` (`glossary.ts`, `satellite.ts`, `resolve.ts`, `types.ts`). `findings.ts` builds the "what this app found" blocks from the committed saved responses using the app's existing wording functions (`groundCheckWording`, `cropHistoryWording`, `ndviWording`), so every sentence is generated from the saved numbers and carries the layer's own "Saved response from [date]" label. `findingsCached.ts` wraps it in `"use cache"` (as `src/app/dev/page.tsx` does), so both pages are static (`next build` shows them as prerendered) and no change to `next.config.ts` file tracing is needed.
- Pages and components: `src/app/glossary/page.tsx`, `src/app/satellite-vs-ground/page.tsx`, `src/components/site/` (SiteShell with the animated hero, GlossaryList, SatelliteView, FindingsView, SourceList, `site.css`, `links.ts`).
- Tests: `src/lib/site/site.test.ts` (25 tests): every entry has sources with https URLs and a read date, quotes present, repo paths exist, links go to real routes, ECOSTRESS/GLDAS remain blocked, SMAP/IMERG are saved contextual observations, and CIMIS/OpenET are labelled as saved comparisons, findings come out finite from the real saved files, and the components render without NaN or undefined text.

## How content was sourced
Web pages were fetched with curl and their tags stripped, so each quote is page text; PDFs (Arkansas FSA2176, NRCS Soil Data Access column descriptions, NRCS NEH Part 630 chapter 7, NMSU A-129) were read with pypdf; the NASA POWER parameter catalogue was read as JSON. Statements about what this app does are written from `docs/*.md` and the code, and cite them.

## Sources used (all opened)
FAO-56 chapters 1 and 6; FAO "Irrigation Water Management: Irrigation Water Needs" ch. 4; NASA POWER methodology and parameter catalogue; NASA GMAO MERRA-2; ECMWF reanalysis fact sheet; NASA Earth Observatory NDVI article; USGS Landsat 8; NASA Earthdata MOD13Q1 and NASADEM records; NRCS SSURGO page, Soil Data Access column descriptions and NEH Part 630 ch. 7; ORNL Daymet description and the Earthdata Daymet record; USDA NASS Cropland Data Layer pages (FAQ and announcements); USGS NLCD page and MRLC About; CoCoRaHS About; USGS Groundwater Climate Response Network fact sheet; California DWR CIMIS station record (data.gov); OpenET home page; NSIDC SMAP page; NASA GPM IMERG page; ECOSTRESS home page; NASA LDAS GLDAS page; University of Arkansas FSA2176; NMSU A-129 (nitrogen fixation) and H-644 (leaching). URLs are in the data files.

## Gaps (also shown on the satellite-vs-ground page)
- OpenET native pixel size: not stated in the documents read.
- ECOSTRESS and GLDAS remain unimplemented, with no resolution quoted here. SMAP and IMERG now have product-specific resolution, quality and period information; see `docs/earthdata.md`. Their dated snapshots are separate from the 40-season replay.
- CoCoRaHS instrument: the About page read does not name it.
- CIMIS: the official CIMIS home page returned only its title and a UC Davis page returned access denied (HTTP 403); the description comes from the DWR catalog record on data.gov ("over 145" stations).
- NASA POWER's methodology page says "assimilation models" and never "reanalysis"; the app's word reanalysis rests on MERRA-2 being described by NASA as one. Both facts are stated on the glossary page.
- NLCD 2021 dataset citation is still unconfirmed (as in docs/ground-truth.md).
- NMSU H-644 is a guide for pecan and fruit trees; it is used only to explain the word leaching.
- Quotes were not re-checked against a second fetch; one soil-column quote had a PDF line break removed.
- NEH7 was read from the copy at damtoolbox.org that `src/lib/landform/soil.ts` already cites; the official NRCS directives index was not opened.

## Things noticed outside this task (not changed)
- NASS says CDL pixels are 10 m from 2024 (30 m for 2008 to 2023). The app samples a 3 by 3 block of points 30 m apart for every year (`docs/ground-truth.md`, `src/lib/groundTruth`). Its layer label and wording were corrected on 2026-11-16 to say 30 m pixels through 2023 and 10 m from 2024; the saved data files still carry the older source name. The glossary and satellite pages state the 10 m change and the 30 m sampling.
- The Landsat NDVI saved series for Ludhiana starts 1 Nov 1989 (docs/ndvi.md), unlike the 1985 start of the others.

## Not verified
No browser was available: layout at phone width, keyboard order, colour contrast, the hero animation and print output were not looked at. The built HTML was fetched from `next start` and checked for headings, article counts, saved-response labels, "Not connected" rows and the absence of NaN/undefined.
