import type { MetricShift } from "@/lib/shift/types";
import Link from "next/link";
import { metricTone } from "./colors";

export type HeroTone = "pressure" | "relief" | "mixed" | "calm";

export function heroTone(metrics: MetricShift[]): HeroTone {
  const tones = metrics.map(metricTone);
  const p = tones.includes("pressure");
  const r = tones.includes("relief");
  if (p && r) return "mixed";
  if (p) return "pressure";
  if (r) return "relief";
  return "calm";
}

export default function Hero(props: {
  tone: HeroTone;
  place: string;
  gridText: string;
  headline: string;
  detail: string;
}) {
  return (
    <header className={`sh-hero sh-hero--${props.tone}`}>
      <div className="sh-hero__sun" aria-hidden="true" />
      <div className="sh-hero__furrows" aria-hidden="true" />
      <div className="sh-hero__inner">
        <Link href="/" className="sh-back">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Back to the map
        </Link>
        <p className="sh-hero__place">{props.place}</p>
        <h1 className="sh-hero__title">{props.headline}</h1>
        <p className="sh-hero__sub">{props.detail}</p>
        <ul className="sh-hero__chips">
          <li className="chip chip--strong">Regional climate, about 50 km grid</li>
          <li className="chip">{props.gridText}</li>
        </ul>
      </div>
    </header>
  );
}
