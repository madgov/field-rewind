"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { Crop } from "@/lib/crops/types";
import { EXAMPLE_LABEL, FIRST_SEASON, type ReplayOk, type SeasonResult } from "@/lib/replay/types";
import { WATER_RESULT_MEANING, WATER_RESULT_LIMIT } from "@/lib/replay/wording";
import { formatInches, formatMm } from "@/lib/shift/units";
import { powerOriginLine } from "../shift/format";
import type { PowerResult } from "@/lib/types";
import type { CropRegionNotice } from "@/lib/crops/region";
import { cellKind, decadeCountText } from "./cells";
import { exampleInputsNote } from "./printText";

type Header = Omit<PowerResult, "days">;

/** Printed-only strip: one SVG per rotation. The meaning is carried by shape (outlined tick box / solid notched cross / hatched), not by colour. */
function PrintStrip({ rotation, abbr }: { rotation: ReplayOk["rotations"][number]; abbr: Record<string, string> }) {
  const cw = 26;
  const ch = 18;
  const labelW = 150;
  const rowH = 31;
  const w = labelW + 10 * cw;
  const h = rotation.decades.length * rowH;
  return (
    <svg className="pr-strip" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label={`${rotation.name}: ${rotation.headline}`}>
      <defs>
        <pattern id="pr-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="4" fill="#fff" />
          <line x1="0" y1="0" x2="0" y2="4" stroke="#444" strokeWidth="1.4" />
        </pattern>
      </defs>
      {rotation.decades.map((d, di) => {
        const y0 = di * rowH;
        const seasons = rotation.seasons.filter((s) => s.year >= d.startYear && s.year <= d.endYear);
        return (
          <g key={d.label}>
            <text x={0} y={y0 + 12} className="pr-dl">{d.label}</text>
            <text x={0} y={y0 + 23} className="pr-dc">{decadeCountText(d)}</text>
            {seasons.map((s, i) => (
              <PrintCell key={s.year} s={s} x={labelW + i * cw} y={y0 + 2} w={cw - 3} h={ch} abbr={abbr[s.cropId] ?? "?"} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PrintCell({ s, x, y, w, h, abbr }: { s: SeasonResult; x: number; y: number; w: number; h: number; abbr: string }) {
  const kind = cellKind(s);
  const label = `${String(s.year).slice(2)}${abbr}`;
  const mx = x + w / 2;
  const my = y + h / 2 - 1;
  return (
    <g>
      {kind === "ok" && (
        <>
          <rect x={x} y={y} width={w} height={h} className="pr-ok" />
          <path d={`M${mx - 4} ${my} l3 3.2 l5.4 -6.4`} className="pr-tick" />
        </>
      )}
      {kind === "short" && (
        <>
          {/* shorter, solid, notched top: reads as "short" even in black and white */}
          <path d={`M${x} ${y + h} V${y + 7} L${x + w * 0.25} ${y + 3} L${x + w * 0.5} ${y + 7} L${x + w * 0.75} ${y + 3} L${x + w} ${y + 7} V${y + h} Z`} className="pr-short" />
          <path d={`M${mx - 3.4} ${my + 1.5} l6.8 6.8 M${mx + 3.4} ${my + 1.5} l-6.8 6.8`} className="pr-cross" />
        </>
      )}
      {kind === "grey" && <rect x={x} y={y} width={w} height={h} className="pr-grey" />}
      <text x={x + w / 2} y={y + h + 7} textAnchor="middle" className="pr-yr">{label}</text>
    </g>
  );
}

export type PrintMeta = { url: string; date: string } | null;

export function usePrintMeta(): [PrintMeta, () => void] {
  const [meta, setMeta] = useState<PrintMeta>(null);
  const capture = () => {
    // flushSync so the URL and date are in the page before the browser lays it out for printing.
    flushSync(() => setMeta({ url: window.location.href, date: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) }));
  };
  useEffect(() => {
    window.addEventListener("beforeprint", capture);
    return () => window.removeEventListener("beforeprint", capture);
  }, []);
  return [meta, capture];
}

function usedSources(crops: Crop[]): string[] {
  const seen = new Set<string>();
  for (const c of crops) {
    for (const f of [c.kc.ini, c.kc.mid, c.kc.end, c.stageDays.ini, c.stageDays.dev, c.stageDays.mid, c.stageDays.late, c.planting.windowStart, c.planting.windowEnd, c.planting.defaultDate, c.heatThresholdC]) {
      if (f.value !== null && f.value !== undefined) seen.add(f.source);
    }
  }
  return [...seen];
}

/** The one-page "Water Reality Check". Hidden on screen; shown by the print stylesheet while everything else is hidden. */
export default function PrintReport(props: {
  result: ReplayOk;
  place: string;
  gridText: string;
  header: Header;
  exampleRotations: boolean;
  exampleSupply: boolean;
  region: CropRegionNotice;
  abbr: Record<string, string>;
  usedCrops: Crop[];
  meta: PrintMeta;
}) {
  const { result, header } = props;
  const sources = usedSources(props.usedCrops);
  const exampleNote = exampleInputsNote(props.exampleRotations, props.exampleSupply);
  return (
    <section className="pr" aria-hidden="true" data-testid="print-report">
      <header className="pr-head">
        <h1 className="pr-title">Water Reality Check</h1>
        <p className="pr-q">Would this supply have met these rotations&rsquo; modelled water needs ({FIRST_SEASON} to 2025)?</p>
        <p className="pr-pin"><strong>{props.place}</strong>. {props.gridText}. Regional climate, about 50 km grid.</p>
        <p className="pr-supply"><strong>Water supply:</strong> {formatMm(result.supplyMm)} ({formatInches(result.supplyMm)}) per season.</p>
        <p className="pr-flags">
          <strong>Weather data: {powerOriginLine(header)}</strong>
          {exampleNote && <> <strong>{EXAMPLE_LABEL}</strong> {exampleNote}</>}
        </p>
        <p className="pr-region"><strong>Crop values:</strong> {props.region.region}.</p>
        {props.region.shortWarning && <p className="pr-regionwarn" data-testid="print-region-warning"><strong>Warning:</strong> {props.region.shortWarning}</p>}
      </header>

      {result.rotations.map((r, i) => (
        <article key={i} className="pr-rot">
          <h2 className="pr-rname">{r.name}: <span className="pr-rcrops">{r.cropNames.join(", then ")}</span></h2>
          <p className="pr-headline">{r.headline}.</p>
          <PrintStrip rotation={r} abbr={props.abbr} />
        </article>
      ))}

      <p className="pr-legend">
        How to read the strips: an outlined box with a tick means supply covers modelled need; a solid, shorter, notched box with a cross means short of water; a hatched box means not enough data to judge. Each box shows the harvest year (two digits) and a crop letter: {props.usedCrops.map((c) => `${props.abbr[c.id]} = ${c.name}`).join(", ")}.
      </p>

      <section className="pr-notes">
        <h2 className="pr-h">Sources</h2>
        <ul>
          <li>Weather: NASA POWER daily data (community AG), regional climate, about 50 km grid; {powerOriginLine(header).replace(/\.$/, "")}.</li>
          <li>Crop water demand: FAO Irrigation and Drainage Paper 56 (Allen et al. 1998): Penman-Monteith ET0 (Ch. 3 to 4) and crop factors (Ch. 6).</li>
          <li>Crop values: {sources.join("; ")}.</li>
          <li>Rain that counts: USDA Soil Conservation Service monthly formula as used in FAO CROPWAT (formula verified from a secondary source, not an FAO page: M. Todorovic, CIHEAM-IAMB, ClimaSouth slides, 2016).</li>
        </ul>
        <h2 className="pr-h">Caveats</h2>
        <ul>
          <li>{WATER_RESULT_MEANING} {WATER_RESULT_LIMIT}</li>
          <li>No soil water is carried between seasons, and no delivery losses are counted: the supply is compared with the net crop need.</li>
          <li>Ten seasons per decade is a small sample. The counts describe what the record shows, not a trend or a forecast.</li>
        </ul>
      </section>

      <footer className="pr-foot">
        <span>{props.meta ? props.meta.url : ""}</span>
        <span>Printed {props.meta ? props.meta.date : ""}</span>
      </footer>
    </section>
  );
}
