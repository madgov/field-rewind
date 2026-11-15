import "@/components/replay/replay.css";
import "./howweknow.css";
import { loadCimisComparison } from "@/lib/cimis";
import { CROP_CATALOG, usableCrops } from "@/lib/crops/catalog";
import { DEMO_PINS } from "@/lib/demoPins";
import { getClimate } from "@/lib/replay";
import { buildMonthlyTable, type MonthlyTable } from "@/lib/replay/monthly";
import { FIRST_SEASON, LAST_SEASON } from "@/lib/replay/types";
import type { PowerResult } from "@/lib/types";
import CropSources from "../replay/CropSources";
import Caveat50km from "./Caveat50km";
import CimisSection from "./CimisSection";
import DataSources from "./DataSources";
import Example18 from "./Example18";
import HowWeKnowShell from "./HowWeKnowShell";
import MethodSteps from "./MethodSteps";
import OpenEtSection from "./OpenEtSection";
import { buildExcludedCrops } from "./excluded";
import { loadOpenEtPanel } from "./openetData";

const near = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/**
 * Collapsible "How we know" panel for /replay and /shift. Server component: every value on it is computed or read here, at render time.
 * `power` must be a usable POWER result (status ok or partial).
 */
export default async function HowWeKnow({ page, power, place }: { page: "replay" | "shift"; power: PowerResult; place: string }) {
  const { days, ...header } = power;
  void days;
  const [cimis, openet] = await Promise.all([loadCimisComparison(), loadOpenEtPanel(power.lat, power.lon)]);
  const brentwood = DEMO_PINS.find((p) => p.id === "brentwood")!;
  const isBrentwood = near(power.lat, brentwood.lat) && near(power.lon, brentwood.lon);

  let monthlyTable: MonthlyTable | null = null;
  if (page === "replay" && openet.kind === "data") {
    const climate = getClimate(power);
    if (climate.ok) {
      const firstObs = openet.range.first ? Number(openet.range.first.slice(0, 4)) : FIRST_SEASON;
      monthlyTable = buildMonthlyTable(climate.climate, usableCrops(), Math.max(FIRST_SEASON, firstObs), LAST_SEASON);
    }
  }

  return (
    <HowWeKnowShell className={`hk-panel--${page}`}>
      <Example18 />
      <DataSources power={header} cimis={cimis} openet={openet} />
      <Caveat50km />
      <section className="hk-block" aria-labelledby="hk-crops-h">
        <h3 id="hk-crops-h" className="hk-h3">Where the crop numbers come from</h3>
        <CropSources crops={usableCrops()} excluded={buildExcludedCrops()} compiledOn={CROP_CATALOG.compiledOn} />
      </section>
      <CimisSection isBrentwood={isBrentwood} place={place} />
      <OpenEtSection data={openet} mode={page} monthlyTable={monthlyTable} />
      {page === "replay" && <MethodSteps />}
    </HowWeKnowShell>
  );
}
