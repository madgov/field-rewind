import Link from "next/link";
import { NDVI_SOURCES, MODIS_SOURCE } from "@/lib/ndvi/sources";
import { POWER_EXTRA_PARAMETER_CATALOGUE_URL } from "@/lib/powerExtra/constants";
import { LANDFORM_LABEL } from "@/lib/landform/label";
import { GROUND_TRUTH_LABEL } from "@/lib/groundTruth/label";
import { BadgeKey, DataBadge } from "./badges";
import { ChartScroll, ChartTable, TwoLines, YearBars } from "./charts";
import { GreenUpChart, NdviOverview } from "./ndviChart";
import { loadExtra, loadGround, loadLandform, loadModis, loadNdvi, loadPower } from "./load";
import { groundView, heatFrostView, landformView, soilWetnessView, vegetationView, fmtValue, n1, n0, n2 } from "./models";
import { Headline, More, Notice, Origin, ProblemCard, SectionShell, SourceList } from "./parts";

const REGIONAL = "regional climate, about 50 km grid";

function LoadFailed({ title, message, what }: { title: string; message: string; what: string }) {
  return <ProblemCard p={{ state: "problem", kind: "error", title, message, nextStep: `Reload this page to try again, or pick a saved example place below. ${what} is never estimated.` }} />;
}

// ------------------------------------------------------------------ a. heat and frost

export async function HeatFrostSection({ lat, lon }: { lat: number; lon: number }) {
  const [extra, power] = await Promise.all([loadExtra(lat, lon), loadPower(lat, lon)]);
  const title = "Heat and frost";
  if (!extra.ok) return <SectionShell id="frost" title={title}><LoadFailed title="Frost history is not available" message={extra.message} what="Frost history" /></SectionShell>;
  const v = heatFrostView(extra.value, power.ok ? power.value : null);
  if (v.state === "problem") return <SectionShell id="frost" title={title} badges={["reanalysis"]} label={REGIONAL}><ProblemCard p={v} /></SectionShell>;
  const shiftHref = `/shift?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
  return (
    <SectionShell id="frost" title={title} badges={["reanalysis"]} label={v.label}>
      <Headline>{v.headline}</Headline>
      <Origin>{v.originLine}</Origin>
      {v.partialNote && <Notice tone="caveat">{v.partialNote}</Notice>}
      {v.lines.length > 0 && <ul className="cx-lines">{v.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      <figure className="cx-figure">
        <figcaption className="cx-figcap">Frost days each year</figcaption>
        <ChartScroll label="Chart of frost days each year, 1985 to 2025. Scroll sideways on a small screen.">
          <YearBars id="cx-frost-days" title="Frost days each year" desc="One bar per year, 1985 to 2025. Hatched years have too much missing data to count. Dashed lines mark the average of 1985 to 2004 and of 2006 to 2025." points={v.frostDays.points} unit="frost days" digits={0} periodMeans={{ early: v.frostDays.earlyMean, late: v.frostDays.lateMean }} tone="frost" gapReason="too many missing days to count" />
        </ChartScroll>
        <ChartTable caption="Frost days each year" head={["Year", "Frost days", "Frost-free days", "Last spring frost", "First autumn frost"]} rows={v.dateRows.map((r, i) => [r.year, r.frostDays === null ? "no value" : r.frostDays, v.frostFree.points[i]?.value ?? "no value", r.last ?? (r.frostDays === null ? "no value" : "none"), r.first ?? (r.frostDays === null ? "no value" : "none")])} />
      </figure>
      {!v.southern && (
        <figure className="cx-figure">
          <figcaption className="cx-figcap">Frost-free season each year</figcaption>
          <ChartScroll label="Chart of the frost-free season each year. Scroll sideways on a small screen.">
            <YearBars id="cx-frost-free" title="Frost-free season each year" desc="One bar per year: days between the last spring frost and the first autumn frost." points={v.frostFree.points} unit="days" digits={0} periodMeans={{ early: v.frostFree.earlyMean, late: v.frostFree.lateMean }} tone="free" gapReason="too many missing days to count" />
          </ChartScroll>
        </figure>
      )}
      <div className="cx-linkrow">
        <p className="cx-hot">
          {"unavailable" in v.hot ? <>Hot days over 35 °C are not available here: {v.hot.unavailable}</> : <><strong>Hot days over 35 °C:</strong> {v.hot.detail}</>}
        </p>
        <Link className="btn btn--ghost" href={shiftHref}>See the hot-days shift page</Link>
      </div>
      <More>
        <p>{v.definition}</p>
        <p>This describes what the weather record shows at this spot. It does not say why anything changed. Frost and hot days come from {REGIONAL}: a reconstruction of past weather, not a thermometer in your field. A frost on your field can happen on a night the grid square does not flag, and the other way round.</p>
        {v.crossCheck && <p>{v.crossCheck}</p>}
        <p>Source: NASA POWER daily data, parameter FROST_DAYS, community AG ({" "}<a href={POWER_EXTRA_PARAMETER_CATALOGUE_URL} rel="noreferrer">parameter catalogue</a>). {v.originLine}</p>
      </More>
    </SectionShell>
  );
}

// ------------------------------------------------------------------ b. soil wetness

export async function SoilWetnessSection({ lat, lon }: { lat: number; lon: number }) {
  const extra = await loadExtra(lat, lon);
  const title = "Soil wetness (modelled)";
  if (!extra.ok) return <SectionShell id="soil" title={title}><LoadFailed title="Soil wetness history is not available" message={extra.message} what="Soil wetness" /></SectionShell>;
  const v = soilWetnessView(extra.value);
  if (v.state === "problem") return <SectionShell id="soil" title={title} badges={["reanalysis"]} label={REGIONAL}><ProblemCard p={v} /></SectionShell>;
  return (
    <SectionShell id="soil" title={title} badges={["reanalysis"]} label={v.label}>
      <Headline>{v.headline}</Headline>
      <Origin>{v.originLine}</Origin>
      <Notice>{v.modelledNote}</Notice>
      {v.lines.length > 0 && <ul className="cx-lines">{v.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
      <figure className="cx-figure">
        <figcaption className="cx-figcap">Growing-season (April to September) wetness compared with the average</figcaption>
        <p className="cx-note">{v.baselineText}</p>
        <ChartScroll label="Chart of growing-season soil wetness against the 1985 to 2025 average. Scroll sideways on a small screen.">
          <YearBars id="cx-soil" title="Growing-season soil wetness compared with the 1985 to 2025 average" desc="One bar per year. Bars above the zero line are wetter than average, below are drier. Hatched years have too much missing data." points={v.points} unit="wetness vs average" digits={2} kind="anomaly" tone="soil" gapReason="too many missing days to count" />
        </ChartScroll>
        <ChartTable caption="Growing-season soil wetness by year" head={["Year", "Growing-season wetness (0 to 1)", "Difference from average"]} rows={v.points.map((p, i) => [p.year, v.means[i]?.mean == null ? "no value" : fmtValue(v.means[i].mean, 2), p.value === null ? "no value" : fmtValue(p.value, 2)])} />
      </figure>
      <More>
        <p>{v.definition}</p>
        <p>The NASA POWER soil wetness numbers come from a computer model (MERRA-2) that estimates wetness from weather. They are not readings from a soil probe, they do not know about your irrigation or drainage, and they describe the whole grid square.</p>
        {v.dryDayLine && (
          <>
            <p><strong>Dry-day count (shown with its caveat):</strong> {v.dryDayLine}</p>
            <p>{v.dryDayCaveat}</p>
          </>
        )}
        <p>Source: NASA POWER daily data, parameter GWETROOT (root zone soil wetness), community AG. {v.originLine}</p>
      </More>
    </SectionShell>
  );
}

// ------------------------------------------------------------------ c. vegetation

export async function VegetationSection({ lat, lon }: { lat: number; lon: number }) {
  const [ndvi, modis, ground] = await Promise.all([loadNdvi(lat, lon), loadModis(lat, lon), loadGround(lat, lon)]);
  const title = "Vegetation seen from space";
  if (!ndvi.ok) return <SectionShell id="veg" title={title}><LoadFailed title="Satellite vegetation record is not available" message={ndvi.message} what="The satellite record" /></SectionShell>;
  const v = vegetationView(ndvi.value, modis, ground.ok ? ground.value : null);
  if (v.state === "problem") return <SectionShell id="veg" title={title} badges={["satellite"]}><ProblemCard p={v} /></SectionShell>;
  return (
    <SectionShell id="veg" title={title} badges={["satellite"]} label="Landsat 30 m pixel at the pin">
      <Headline>{v.headline}</Headline>
      <Origin>{v.originLine}{v.modisOriginLine ? ` MODIS: ${v.modisOriginLine}` : ""}</Origin>
      {v.partialNote && <Notice tone="caveat">{v.partialNote}</Notice>}
      <Notice tone="caveat">
        <p className="cx-notice__title">Read this pixel with care</p>
        <ul className="cx-lines">
          <li>{v.caveat}</li>
          {v.pixelFacts.map((f) => <li key={f}>{f}</li>)}
        </ul>
      </Notice>
      <ul className="cx-lines">
        <li>{v.peakLine}</li>
        <li>{v.bareLine}</li>
        <li>{v.stressLine}{v.stressItems.length > 0 && " The most recent are listed below."}</li>
      </ul>
      {v.stressItems.length > 0 && <ul className="cx-lines cx-lines--small">{v.stressItems.map((s) => <li key={s}>{s}</li>)}</ul>}
      <figure className="cx-figure">
        <figcaption className="cx-figcap">Every clear observation, 1985 to 2025</figcaption>
        <NdviOverview id="cx-ndvi" observations={v.observations} modis={v.modis} ind={v.indicators} />
        {v.modis && v.modisLabel && <p className="cx-note">{v.modisLabel} This 250 m record starts in 2000 and is drawn as small crosses.</p>}
      </figure>
      <figure className="cx-figure">
        <figcaption className="cx-figcap">When the crop greens up, and how sure we are</figcaption>
        {v.greenUpLines.length > 0 && <ul className="cx-lines cx-lines--small">{v.greenUpLines.map((l) => <li key={l}>{l}</li>)}</ul>}
        <GreenUpChart id="cx-greenup" ind={v.indicators} />
      </figure>
      {v.sensorNote && <p className="cx-note">{v.sensorNote} Satellites used in this record: {v.satellites.map((s) => `${s.name} (${s.count.toLocaleString("en-US")})`).join(", ")}.</p>}
      <More>
        <p>NDVI (normalised difference vegetation index) compares how much red and near-infrared light a surface reflects. Green plants reflect much more near-infrared, so higher numbers mean more green plant cover. It is a real satellite observation of a single 30 m pixel. It is not a field boundary and it cannot see through cloud, so it only has days when the sky was clear over the pin.</p>
        <p>Rules used: a green-up date is when a smoothed curve first crosses {Math.round(v.indicators.definitions.greenUpFraction * 100)} percent of the way from the year&rsquo;s lowest to highest NDVI (our own declared choice). A bare spell is a run of clear observations below an NDVI of {v.indicators.bareThreshold}. A stress flag marks a clear observation that is unusually low against the same time of year in other years, by at least {v.indicators.definitions.stressMinDrop} NDVI, and it needs {v.indicators.definitions.stressMinYears} or more comparison years. A flag does not tell crop stress apart from a different crop, an early harvest or haze.</p>
        <SourceList sources={[...NDVI_SOURCES, ...(v.modis ? [MODIS_SOURCE] : [])]} />
      </More>
    </SectionShell>
  );
}

// ------------------------------------------------------------------ d. soil and terrain

export async function LandformSection({ lat, lon }: { lat: number; lon: number }) {
  const l = await loadLandform(lat, lon);
  const title = "Soil and terrain";
  if (!l.ok) return <SectionShell id="land" title={title}><LoadFailed title="Soil and terrain are not available" message={l.message} what="Soil and terrain" /></SectionShell>;
  const v = landformView(l.value);
  if (v.state === "problem") return <SectionShell id="land" title={title} badges={["terrain", "soilsurvey"]}><ProblemCard p={v} /></SectionShell>;
  const t = l.value.terrain;
  const terrainHeadline = t.status === "ok" ? `The ground here is ${n0(t.summary.centerElevationM)} m above sea level, with a slope of ${n1(t.summary.centerSlopePct)} percent at the pin.` : `Terrain is not available: ${t.message}`;
  const soilHeadline = l.value.soil.status === "ok" ? `The soil survey maps this spot as ${l.value.soil.derived.textureClass ?? l.value.soil.derived.dominantName}${l.value.soil.derived.profileAwc ? `, holding about ${n0(l.value.soil.derived.profileAwc.mm)} mm of plant-available water in the top 100 cm` : ""}.` : null;
  return (
    <SectionShell id="land" title={title} badges={["terrain", "soilsurvey"]}>
      <Headline>{terrainHeadline}</Headline>
      {soilHeadline && <Headline>{soilHeadline}</Headline>}
      {v.originLine && <Origin>{v.originLine}</Origin>}
      <div className="cx-cols">
        <div className="cx-card">
          <h3 className="cx-h3">Terrain <DataBadge kind="terrain" /></h3>
          {v.terrain.length === 0 ? <ProblemCard p={{ state: "problem", kind: "error", title: "Terrain is not available", message: t.status === "error" ? t.message : "No terrain data.", nextStep: "Reload this page to try again, or pick a saved example place below." }} /> : (
            <dl className="cx-facts">{v.terrain.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}<span className="cx-src">{f.source}</span></dd></div>)}</dl>
          )}
        </div>
        <div className="cx-card">
          <h3 className="cx-h3">Soil <DataBadge kind="soilsurvey" /></h3>
          {!v.soil.available ? (
            <>
              {v.usOnly && <p className="cx-usonly"><strong>{v.usOnly}</strong></p>}
              <ProblemCard p={{ state: "problem", kind: v.usOnly ? "no-coverage" : "error", title: v.usOnly ? "No soil survey map for this place" : "Soil survey is not available", message: v.soil.message ?? "No message.", nextStep: v.usOnly ? "Pick a place in the United States to see soil survey facts. The terrain facts on the left do not depend on it." : "Reload this page to try again." }} />
            </>
          ) : (
            <>
              <dl className="cx-facts">{v.soil.facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}<span className="cx-src">{f.source}</span></dd></div>)}</dl>
              {v.soil.hydrologic && <p className="cx-meaning"><strong>What group {v.soil.hydrologic.group} means:</strong> {v.soil.hydrologic.meaning}</p>}
            </>
          )}
        </div>
      </div>
      <div className="cx-card">
        <h3 className="cx-h3">Slope and erodibility, as separate facts</h3>
        <p className="cx-erosion-label"><strong>{v.erosion.label}.</strong></p>
        <ul className="cx-lines">
          <li>{v.erosion.slopeFact}</li>
          <li>{v.erosion.kfFact}</li>
        </ul>
        <p className="cx-note">NRCS slope bands: {v.erosion.slopeBands.map((b) => (b === v.erosion.activeBand ? `[${b}] (this spot)` : b)).join("; ")}.</p>
        <p className="cx-note">{v.erosion.note}</p>
      </div>
      <More>
        <p>{LANDFORM_LABEL}</p>
        {v.terrainLines.length > 0 && <ul className="cx-lines">{v.terrainLines.map((x) => <li key={x}>{x}</li>)}</ul>}
        {v.soil.lines.length > 0 && <ul className="cx-lines">{v.soil.lines.map((x) => <li key={x}>{x}</li>)}</ul>}
        {v.caveats.length > 0 && <ul className="cx-lines">{v.caveats.map((x) => <li key={x}>{x}</li>)}</ul>}
        <p>Slope bands are the NRCS slope breaks (National Soil Survey Handbook 430-H, 622.23). Kf classes follow NSSH 618.60. The soil survey is a map of areas that each stand for a mix of soils, so it describes the mapped area and not a measured spot.</p>
      </More>
    </SectionShell>
  );
}

// ------------------------------------------------------------------ e. ground checks

function Missing({ kind, message, name }: { kind: "error" | "no-coverage" | "not-checked"; message: string; name: string }) {
  return <ProblemCard p={{ state: "problem", kind, title: `${name}: nothing to show`, message, nextStep: kind === "no-coverage" ? "This check covers the United States only. Pick a place in the United States to see it." : kind === "not-checked" ? "This check is only run for the saved example places Brentwood and Fresno." : "Reload this page to try again, or pick a saved example place below." }} />;
}

export async function GroundSection({ lat, lon }: { lat: number; lon: number }) {
  const g = await loadGround(lat, lon);
  const title = "Ground checks";
  if (!g.ok) return <SectionShell id="ground" title={title}><LoadFailed title="Ground checks are not available" message={g.message} what="Ground checks" /></SectionShell>;
  const v = groundView(g.value);
  if (v.state === "problem") return <SectionShell id="ground" title={title}><ProblemCard p={v} /></SectionShell>;
  const dm = v.daymet;
  return (
    <SectionShell id="ground" title={title}>
      <Headline>{v.headline}</Headline>
      <p className="cx-note">{GROUND_TRUTH_LABEL}</p>
      <BadgeKey kinds={["reanalysis", "interpolated", "gauge", "satellite"]} />

      <div className="cx-card">
        <h3 className="cx-h3">Rain and temperature: NASA POWER against Daymet <DataBadge kind="reanalysis" /> <DataBadge kind="interpolated" /></h3>
        {dm.status === "ok" ? (
          <>
            <Origin>{dm.originLine}</Origin>
            <ul className="cx-lines">{dm.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <ChartScroll label="Chart of yearly rain, NASA POWER against Daymet. Scroll sideways on a small screen.">
              <TwoLines id="cx-rain" title="Yearly rain: NASA POWER and Daymet" desc={`Two lines, one point per year from ${dm.rain[0]?.year} to ${dm.rain[dm.rain.length - 1]?.year}. Dashed with triangles is NASA POWER; solid with circles is Daymet.`} aName="NASA POWER" bName="Daymet" unit="mm a year" data={dm.rain.map((r) => ({ year: r.year, a: r.powerMm, b: r.daymetMm }))} />
            </ChartScroll>
            <ul className="cx-key" aria-label="Chart key">
              <li><svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 7h24" className="cx-line cx-line--a" /><path d="M14 3l3.6 6.4h-7.2z" className="cx-mk cx-mk--a" /></svg> NASA POWER (reanalysis, about 50 km)</li>
              <li><svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true"><path d="M2 7h24" className="cx-line cx-line--b" /><circle cx="14" cy="7" r="3" className="cx-mk cx-mk--b" /></svg> Daymet (1 km, from ground stations)</li>
            </ul>
            <p className="cx-note">Ratio of totals (POWER divided by Daymet): {dm.ratioOfTotals === null ? "not defined" : n2(dm.ratioOfTotals)}. R-squared of yearly totals: {dm.r2 === null ? "not defined" : n2(dm.r2)}. Daily high: POWER minus Daymet {n1(dm.tMaxBias)} °C on average; daily low: {n1(dm.tMinBias)} °C.</p>
            <ChartTable caption="Yearly rain, NASA POWER and Daymet" head={["Year", "NASA POWER (mm)", "Daymet (mm)", "Ratio"]} rows={dm.rain.map((r) => [r.year, n0(r.powerMm), n0(r.daymetMm), r.ratio === null ? "not defined" : n2(r.ratio)])} />
            {dm.caveats.length > 0 && <ul className="cx-lines cx-lines--small">{dm.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
          </>
        ) : <Missing kind={dm.kind as "error"} message={dm.message} name="Daymet comparison" />}
      </div>

      <div className="cx-card">
        <h3 className="cx-h3">One rain gauge <DataBadge kind="gauge" /></h3>
        {v.gauge.status === "ok" ? (
          <>
            <Origin>{v.gauge.originLine}</Origin>
            <ul className="cx-lines">{v.gauge.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="cx-note">A single gauge is indicative only. It is one spot, kilometres from the grid squares.</p>
          </>
        ) : <Missing kind={v.gauge.kind as "error"} message={v.gauge.message} name="Rain gauge check" />}
      </div>

      <div className="cx-card">
        <h3 className="cx-h3">What the land has been, by satellite classification <DataBadge kind="satellite" /></h3>
        {v.crops.status === "ok" ? (
          <>
            <Origin>{v.crops.originLine}</Origin>
            <ul className="cx-lines">{v.crops.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <ol className="cx-timeline" aria-label="Crop history by year">
              {v.crops.years.map((y) => (
                <li key={y.year} className={y.agree < y.sampled ? "is-mixed" : ""}>
                  <span className="cx-timeline__year">{y.year}</span>
                  <span className="cx-timeline__cat">{y.category}</span>
                  <span className="cx-timeline__agree">{y.agree} of {y.sampled} pixels agree{y.tie ? ", tie" : ""}</span>
                </li>
              ))}
            </ol>
          </>
        ) : <Missing kind={v.crops.kind as "error"} message={v.crops.message} name="Crop history" />}
        {v.nlcd.status === "ok" ? (
          <>
            <p className="cx-landcover"><strong>{v.nlcd.line}</strong></p>
            <Origin>{v.nlcd.originLine}</Origin>
          </>
        ) : <Missing kind={v.nlcd.kind as "error"} message={v.nlcd.message} name="Land cover" />}
      </div>

      <div className="cx-card">
        <h3 className="cx-h3">Nearest well <DataBadge kind="gauge" /></h3>
        {v.wells.status === "ok" ? (
          <>
            <Origin>{v.wells.originLine}</Origin>
            <ul className="cx-lines">{v.wells.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </>
        ) : <Missing kind={v.wells.kind as "error"} message={v.wells.message} name="Well check" />}
      </div>
      <More>
        <p>This section compares two gridded products with each other, and with a few ground records. It is not a verdict on which is right.</p>
        {v.caveats.length > 0 && <ul className="cx-lines">{v.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}
        <SourceList
          sources={[
            ...(dm.status === "ok" ? [{ name: dm.sourceName, citation: "Daymet V4 R1, ORNL DAAC.", url: dm.sourceUrl }] : []),
            ...(v.gauge.status === "ok" ? [{ name: v.gauge.sourceName, citation: "Volunteer gauge reports.", url: v.gauge.sourceUrl }] : []),
            ...(v.crops.status === "ok" ? [{ name: v.crops.sourceName, citation: "Majority of a 3 by 3 block of 30 m pixels.", url: v.crops.sourceUrl }] : []),
            ...(v.nlcd.status === "ok" ? [{ name: v.nlcd.sourceName, citation: "Land cover class at the pin.", url: v.nlcd.sourceUrl }] : []),
            ...(v.wells.status === "ok" ? [{ name: v.wells.sourceName, citation: "Field measurements of depth to water.", url: v.wells.sourceUrl }] : []),
          ]}
        />
      </More>
    </SectionShell>
  );
}
