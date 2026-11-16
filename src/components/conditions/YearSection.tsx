import HarmonizedYearly from "./HarmonizedYearly";
import { loadExtra, loadGround, loadNdvi, loadPower } from "./load";
import { buildHarmonized } from "./models";
import { Headline, SectionShell, More } from "./parts";

export async function YearSection({ lat, lon }: { lat: number; lon: number }) {
  const [power, extra, ndvi, ground] = await Promise.all([loadPower(lat, lon), loadExtra(lat, lon), loadNdvi(lat, lon), loadGround(lat, lon)]);
  const data = buildHarmonized({ power, extra, ndvi, ground });
  const have = data.layers.filter((l) => !l.unavailable);
  return (
    <SectionShell id="year" title="Harmonized yearly view" badges={["reanalysis", "interpolated", "satellite"]}>
      <Headline>
        {have.length === 0
          ? "None of the yearly layers is available for this place."
          : `${have.length} of ${data.layers.length} layers have yearly values for this place, ${data.firstYear} to ${data.lastYear}, lined up so the same year can be read across them.`}
      </Headline>
      <HarmonizedYearly data={data} />
      <More>
        <p>Every row is one value per calendar year. Frost days, soil wetness, rain and hot days are summed or averaged from NASA POWER daily data; Daymet rain is its yearly total; peak NDVI is the highest clear Landsat observation of the year. A year with too much missing data, or with no clear satellite observation, is hatched and left empty.</p>
        <p>Putting layers side by side shows whether years line up. It does not show that one thing caused another, and the layers describe areas of very different size.</p>
      </More>
    </SectionShell>
  );
}
