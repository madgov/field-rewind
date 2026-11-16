# Rotation traits and the priorities engine

Data: `data/rotation-traits/traits.json` (types and loader in `src/lib/rotationTraits/`). Engine: `src/lib/priorities/`. Compiled 2026-11-15. Every field is `{value, status, source{title,url,page_or_table}}`. `status: "unknown"` means no document opened for this project gave a value; it is shown as "no sourced value", counted as missing, and never imputed or inferred from a related crop.

Where a value was read: FAO-56 Chapter 8 and Chapter 6 HTML pages and the NASS Handbook 628 PDF were fetched and read in full text; ITIS was read through its web service; the UC ANR safflower publication, the CDFA FREP report and the cover-crop guidance were read as PDFs. The UC IPM dry bean and alfalfa pages were read through a page-reading tool, not as raw HTML, so their quotes are as that tool returned them.

## Crops covered
Catalog crops: winter wheat, maize (grain), cotton, rice, sunflower, sugar beet, dry bean. Candidates not in the catalog: alfalfa, safflower, sorghum (grain). Winter cover crops: cereal rye, common vetch. Cover crops are not catalog crops, so the replay cannot judge their water use; a rotation containing one gets facts but no water result.

## Traits

| Trait | Definition | Source |
|---|---|---|
| `family` | Botanical family of the crop's species | ITIS taxonomic hierarchy (https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_topic=TSN&search_value=TSN), rank Family. TSNs: wheat 42237, maize 42269, cotton 21711, rice 41976, sunflower 36616, sugar beet 20681, dry bean 26857, alfalfa 183623, safflower 501305, sorghum 42108, cereal rye 42090, common vetch 26355. ITIS puts sugar beet in Amaranthaceae. |
| `nitrogenFixing` | Whether the crop fixes atmospheric nitrogen | Alfalfa: CDFA FREP report 12-0385-SA (Putnam and Pettygrove, UC Davis), Abstract p. 1. Dry bean: UC IPM Dry Beans, Nitrogen Budget (UC ANR Pub. 3446, 12/08), table of fixation rates. Common vetch and cereal rye: cover-crop guidance (below), table p. 6, by the document's own grouping ("Legumes (Nitrogen Fixers)" versus "Grasses & Cereals"). Wheat, maize, cotton: the FREP abstract calls them "fertilizer-requiring crops" and "non-legume crops". |
| `nCredit` | Documented nitrogen credit to a following crop, with units and conditions | Alfalfa only: 70 to 130 lb N/acre to following wheat after many years of alfalfa, 3 California sites, 2011-2015 trials (FREP 12-0385-SA, abstract p. 1); earlier California estimates 40-80. Not applicable to one year of alfalfa in a short rotation. |
| `rootDepthM` | Maximum effective rooting depth, m; the range printed in the source. The engine uses the upper end | FAO-56 Chapter 8, Table 22 (https://www.fao.org/4/x0490e/x0490e0e.htm), column "Maximum Root Depth", footnote 1: larger values are for soils with no restricting layers. |
| `depletionFractionP` | FAO-56 p: the average fraction of total available soil water that can be depleted from the root zone before moisture stress (reduction in ET) occurs (Chapter 8, Eq. 83 text). A **proxy** for drought tolerance, not a measured rating | FAO-56 Table 22, column "Depletion Fraction p". Values apply for ETc about 5 mm/day (footnote 2). Rice's 0.20 is "of saturation" (footnote 4) and is flagged not comparable. |
| `residueRole` | Qualitative residue / organic-matter role | Cover crops only: cover-crop guidance p. 2 lists "Increased organic matter" as a benefit of cover cropping in general. No amount; not species-specific. |
| `soilStructureRole` | Qualitative soil-structure role | Safflower only: UC ANR Pub. 21565, Crop Rotation section, printed p. 9: deep root system "can improve water infiltration rates". |
| `forage` | Documented forage use | Alfalfa: FAO-56 Table 22 group "j. Forages", row "Alfalfa - for hay"; NASS California table has a "Hay, alfalfa" row. Maize: NASS Handbook 628, California table (p. 36), row "Corn for silage". Safflower: UC ANR Pub. 21565 (printed p. 10, Table 3): residues "provide good aftermath grazing for sheep and cattle" (residue grazing only). |
| `erosionCover` | Qualitative erosion-cover role | Cereal rye only: cover-crop guidance p. 6 table, "Reduced erosion; Nutrient capture". No percentage given in the document. |
| `droughtToleranceQualitative` | Verbal drought tolerance | Cereal rye "Moderate", common vetch "Low to moderate" (cover-crop guidance p. 6); safflower "thought to be a drought-resistant crop" but needs adequate soil moisture (UC ANR Pub. 21565, Water Use). |

Cover-crop guidance: "Cover Cropping in California's Water Scarce Environments" (Smither-Kopperl [USDA NRCS], Wauters, Light [UC ANR], Johnson, Kaveh, Zhou; Sustainable Conservation, 2025), https://suscon.org/wp-content/uploads/2025/05/Cover-Cropping-in-Californias-Water-Scarce-Environments-5.2.25.pdf. The PDF is an 8-page slide-format document; "p. 6" is its sixth page.

## Rotation principle
The crop-family fact is a rough stand-in for "not a host of the same pests". What the sources actually say: "Rotate with unrelated or non-susceptible hosts" and "Breaks pest cycles" (UC ANR slide deck "Cultural Practices for Pest and Disease Management in Vegetables", slides 3 and 4, https://ucanr.edu/sites/default/files/2011-02/75495.pdf); "Rotation to a nonhost crop can significantly reduce pest numbers and types in the field." (UC IPM Alfalfa, Crop Rotation Impacts on Pests). Neither says "different family". Host ranges are pest-specific (a different family can still share a pest), so family diversity is a coarse indicator only. Slide 6 of the same deck says crop rotation in general "Enhances soil quality" (organic matter balance, soil structure, erosion); this is not crop specific and is not used to score any crop.

## What is unknown, and why
- Nitrogen fixing: rice, sunflower, sugar beet, safflower, sorghum. No document opened states it. It is NOT inferred from family, so rotations containing them are not ranked on the nitrogen-fixing fact.
- Nitrogen credit: everything except alfalfa. Dry bean has fixation per season per bean type (bush common 20-40 lb N/acre/season in the UC IPM table) but no credit to the next crop; the two are different quantities.
- Root depth and p: cereal rye and common vetch (FAO-56 Table 22 has no row; "Rye Grass hay" and "Fababean" are different crops and were not substituted).
- Residue, soil structure, erosion cover, forage, drought-tolerance wording: unknown for most cash crops. Only the entries in the table above have a source. Wheat's forage use, for example, is unknown here although wheat can be grazed; no document opened says so.
- Bell bean: dropped. The cover-crop guidance lists it but gives no Latin name, and no source opened equates "bell bean" with a species.
- Market and price data: not connected (see below).

## Market data
`marketData` is `{status: "not-connected", reason, registerUrl}`. USDA NASS QuickStats requires a free API key (https://quickstats.nass.usda.gov/api); USDA AMS Market News needs its own credentials. No key is set up, so the app holds no prices, margins or incomes, and the "supplemental income" priority is shown but excluded from every ranking.

## Priorities engine (`src/lib/priorities`)
Inputs: rotations (crop id sequences, as used by the replay), a `ReplayResult` at the chosen supply, the criteria the farmer selected (a set, no weights) and constraints (supply in mm; an exclusion list of crop ids).

Facts per rotation (each line says where it comes from: the replay or the traits' citations):
- Water: short seasons among judged seasons in the last decade against the first decade, from the replay.
- Nitrogen-fixing years: crops with a sourced "yes" among the years of the cycle (each crop in the sequence is one year, repeating).
- Rooting depth: deepest crop and mean of maximum root depth (upper end of the FAO range).
- Family diversity: distinct families in the cycle, and back-to-back crops in the same family (including the last crop followed by the first).
- Forage: years with a crop documented as forage.
- Context only, never ranked: mean p (rice excluded), ground cover and residue notes.

Missing values: a fact is computed for ranking only if every crop in the cycle has a sourced value. Otherwise the table shows what is known ("at least k of n years"), names the crops without a value, and the rotation is not ranked on that fact.

Ranking rules (plain):
1. Only criteria the farmer selected are ranked. Supplemental income is not connected, so it is listed as not ranked.
2. Each fact is ranked among the included rotations: water, fewer short seasons in the last decade first; the other facts, higher first. Equal values tie (competition ranking: 1, 1, 3).
3. "Conserve water" and "Forage" are one fact each. "Improve soil structure and health" is three facts (nitrogen-fixing share, family diversity, root depth); its position is the unweighted mean of the fact ranks the rotation has, with the count shown ("2 of 3 facts").
4. With two or more rankable criteria, a clearly labelled "balanced view" is the unweighted mean of the rotation's positions on each criterion. A criterion with nothing to rank is dropped and named. There are no weights and no 0-100 score.
5. A rotation containing a crop on the farmer's exclusion list is shown but not ranked and does not take a place from others.

That deeper roots, more families and more nitrogen-fixing years "rank first" for soil health is this tool's stated rule, chosen for simplicity; the sources above support the direction qualitatively at best (for example safflower roots and infiltration), not as a measured soil-health score.

Judgment points (`judgmentPoints`): unknown traits by crop and trait, crops the replay cannot judge, exclusions, ties, the rice p caveat, income not connected, a pin outside California (crop values are California values), and the supply check: the replay is re-run at 90 and 110 percent of the chosen supply (through a `rerun` function the caller passes, so the module stays pure) and the report counts seasons that turn red at the lower supply and seasons that turn green at the higher one.

`LOCAL_EXPERTISE_NOTE` is the standing statement: the tool supports, and does not replace, an agronomist or local extension advisor; judgment matters for soil tests, local pests, equipment, labour, markets and water rights.
