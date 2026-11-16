import type { ReactNode } from "react";

/**
 * The kind of data behind a series. The text is always shown, the shape is a second cue, and the one-line tooltip says what the kind means.
 * (A longer explanation of these kinds is planned for a later stage.)
 */
export type BadgeKind = "satellite" | "reanalysis" | "interpolated" | "gauge" | "terrain" | "soilsurvey";

export const BADGES: Record<BadgeKind, { label: string; tip: string; shape: "diamond" | "square" | "circle" | "triangle" | "hex" | "bar" }> = {
  satellite: {
    label: "Satellite observation",
    tip: "A picture taken from space and turned into a number, or a map classified from such pictures. It sees only clear days and one pixel at a time.",
    shape: "diamond",
  },
  reanalysis: {
    label: "Reanalysis model",
    tip: "A computer reconstruction of past weather from satellites and weather models, on a grid about 50 km across. It is not a sensor in your field.",
    shape: "square",
  },
  interpolated: {
    label: "Interpolated from ground stations",
    tip: "Weather-station readings spread over a regular grid by a mathematical method. Closer to the ground than a reanalysis, but still not a sensor in your field.",
    shape: "circle",
  },
  gauge: {
    label: "Ground gauge",
    tip: "A reading taken at one spot on the ground by an instrument or a person, such as a rain gauge or a well measurement.",
    shape: "triangle",
  },
  terrain: {
    label: "Elevation model (SRTM-derived)",
    tip: "Ground height measured by radar on the Space Shuttle in 2000 and reprocessed by NASA. It is a surface model: buildings and trees raise it.",
    shape: "hex",
  },
  soilsurvey: {
    label: "Soil survey map",
    tip: "A map drawn by soil scientists from field surveys. Each map area stands for a mix of soils, not one measured spot.",
    shape: "bar",
  },
};

function Shape({ shape }: { shape: (typeof BADGES)[BadgeKind]["shape"] }): ReactNode {
  const p = { fill: "currentColor" } as const;
  switch (shape) {
    case "diamond": return <path d="M6 1 11 6 6 11 1 6Z" {...p} />;
    case "square": return <rect x="1.5" y="1.5" width="9" height="9" {...p} />;
    case "circle": return <circle cx="6" cy="6" r="4.8" {...p} />;
    case "triangle": return <path d="M6 1 11 11H1Z" {...p} />;
    case "hex": return <path d="M3 1.5h6L11.5 6 9 10.5H3L0.5 6Z" {...p} />;
    default: return <path d="M1 3h10v2H1ZM1 7h10v2H1Z" {...p} />;
  }
}

export function DataBadge({ kind }: { kind: BadgeKind }) {
  const b = BADGES[kind];
  return (
    <span className={`cx-badge cx-badge--${kind}`} title={b.tip} data-badge={kind}>
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><Shape shape={b.shape} /></svg>
      <span>{b.label}</span>
      <span className="sr-only">. {b.tip}</span>
    </span>
  );
}

/** A visible key to the badges used in a section, so the one-line meanings are readable on a touch screen too. */
export function BadgeKey({ kinds }: { kinds: BadgeKind[] }) {
  return (
    <ul className="cx-badgekey" aria-label="What the data-type badges mean">
      {kinds.map((k) => (
        <li key={k}>
          <strong>{BADGES[k].label}:</strong> {BADGES[k].tip}
        </li>
      ))}
    </ul>
  );
}
