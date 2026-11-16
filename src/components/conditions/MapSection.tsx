import { landformOriginLine } from "@/lib/landform/label";
import { buildNdviOverlay, buildTerrainOverlay } from "./overlay";
import { isoDayText } from "./models";
import { loadLandform, loadNdviGrids } from "./load";
import ConditionsMapLoader from "./ConditionsMapLoader";
import { Headline, More, Notice, SectionShell } from "./parts";

/** Real saved Landsat windows and the real NASADEM grid, drawn into their exact lon/lat bounds. Server part: gathers and shapes the data. */
export default async function MapSection({ lat, lon, place }: { lat: number; lon: number; place: string }) {
  const [grids, landform] = await Promise.all([loadNdviGrids(lat, lon), loadLandform(lat, lon)]);
  const ndvi = grids.ok ? buildNdviOverlay(grids.value.grids, grids.value.originLine) : null;
  const ndviMessage = grids.ok ? (ndvi ? null : "The saved satellite windows hold no usable values.") : grids.message;
  const t = landform.ok ? landform.value.terrain : null;
  const terrain = t && t.status === "ok" && t.grid ? buildTerrainOverlay(t.grid, landformOriginLine({ origin: t.origin, fetchedAt: t.fetchedAt })) : null;
  const terrainMessage = terrain ? null : !landform.ok ? landform.message : t && t.status === "error" ? t.message : "The terrain grid was not returned for this place.";

  const parts: string[] = [];
  if (ndvi) parts.push(`${ndvi.dates.length} clear Landsat dates from ${isoDayText(ndvi.dates[0].date)} to ${isoDayText(ndvi.dates[ndvi.dates.length - 1].date)}, each a window about ${Math.round(ndvi.extentM.eastWest)} m across`);
  if (terrain) parts.push(`a terrain window about ${(terrain.extentM.eastWest / 1000).toFixed(1)} by ${(terrain.extentM.northSouth / 1000).toFixed(1)} km`);
  const headline = parts.length ? `This map can show ${parts.join(" and ")}.` : "No overlay data is available for this place, so the map shows only the pin.";
  return (
    <SectionShell id="map" title="Look at the ground" badges={["satellite", "terrain"]}>
      <Headline>{headline}</Headline>
      {!ndvi && !terrain && <Notice tone="caveat">Nothing is drawn in place of the missing data. The messages below say exactly what is missing.</Notice>}
      <ConditionsMapLoader lat={lat} lon={lon} place={place} ndvi={ndvi} ndviMessage={ndviMessage} terrain={terrain} terrainMessage={terrainMessage} />
      <More>
        <p>Each coloured square is one real data cell, drawn into the exact longitude and latitude edges of its grid. The colours are a sequential scale that stays readable for common colour-vision differences, and each colour step is also labelled with its numbers in the legend. Hovering or tapping a square shows its real value.</p>
        <p>The satellite windows are not a field boundary: a real field may be larger or smaller, and the pin may sit on an edge, a road or a farmyard. The terrain model is a surface model, so buildings and trees raise it.</p>
        <p>Frost zones inside a field are not mapped here. The low-spot view only shows ground height relative to the lowest cell in the window.</p>
      </More>
    </SectionShell>
  );
}
