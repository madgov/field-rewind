"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { StripeProps } from "./stripeData";

export default function Stripes({ data }: { data: StripeProps }) {
  const { items } = data;
  const n = items.length;
  const rootRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const pick = (i: number, focus = false) => {
    const k = Math.max(0, Math.min(n - 1, i));
    setSel(k);
    if (focus) (barsRef.current?.children[k] as HTMLElement | undefined)?.focus();
  };

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width <= 0) return;
    pick(Math.floor(((e.clientX - r.left) / r.width) * n));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = sel ?? 0;
    const map: Record<string, number> = { ArrowLeft: cur - 1, ArrowRight: cur + 1, ArrowUp: cur - 1, ArrowDown: cur + 1, Home: 0, End: n - 1 };
    if (e.key in map) {
      e.preventDefault();
      pick(map[e.key], true);
    }
  };

  const active = sel !== null ? items[sel] : null;
  const cols: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };

  return (
    <div ref={rootRef} className={`strip${inView ? " is-in" : ""}`}>
      <div
        ref={barsRef}
        className="strip__bars"
        style={cols}
        role="group"
        aria-label={`${data.title}, one stripe per year. Use the arrow keys to move between years.`}
        onKeyDown={onKey}
        onPointerDown={fromPointer}
        onPointerMove={fromPointer}
      >
        {items.map((it, i) => (
          <button
            key={it.year}
            type="button"
            className={`stripe stripe--${it.period}${it.color === null ? " stripe--hatch" : ""}${sel === i ? " is-sel" : ""}`}
            style={{ "--i": i, background: it.color ?? undefined } as CSSProperties}
            tabIndex={i === (sel ?? 0) ? 0 : -1}
            aria-label={it.note ? `${it.text}. ${it.note}` : it.text}
            onFocus={() => setSel(i)}
          />
        ))}
      </div>

      <div className="strip__ticks" style={cols} aria-hidden="true">
        {data.ticks.map((t, k) => (
          <span
            key={t.year}
            className={`tick${k === 0 ? " tick--first" : ""}${t.index === n - 1 ? " tick--last" : ""}${t.minor ? " tick--minor" : ""}`}
            style={{ gridColumn: t.index + 1 }}
          >
            <span>{t.year}</span>
          </span>
        ))}
      </div>

      <div className="strip__brackets" style={cols} aria-hidden="true">
        {data.brackets.map((b) => (
          <span key={b.kind} className={`bracket bracket--${b.kind}`} style={{ gridColumn: `${b.from + 1} / ${b.to + 2}` }}>
            <span>{b.label}</span>
          </span>
        ))}
      </div>

      <div className="strip__readout">
        <button type="button" className="step-btn" aria-label="Previous year" disabled={sel === 0} onClick={() => pick((sel ?? 1) - 1, false)}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <p className="strip__now" aria-hidden="true">
          {active ? (
            <>
              <strong>{active.text}</strong>
              {active.note && <span className="strip__note"> ({active.note})</span>}
              {active.period === "none" && <span className="strip__note"> (in neither period)</span>}
            </>
          ) : (
            <span className="strip__hint">Hover, tap or drag across the stripes to read a year.</span>
          )}
        </p>
        <button type="button" className="step-btn" aria-label="Next year" disabled={sel === n - 1} onClick={() => pick((sel ?? -1) + 1, false)}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      <ul className="legend">
        {data.legend && (
          <li className="legend__ramp">
            <span className="legend__low">{data.legend.low}<small> lowest, {data.legend.lowYear}</small></span>
            <span className="legend__bar" style={{ background: data.legend.gradient }} aria-hidden="true" />
            <span className="legend__high">{data.legend.high}<small> highest, {data.legend.highYear}</small></span>
          </li>
        )}
        {data.hasFlagged && (
          <li className="legend__item"><span className="swatch swatch--hatch" aria-hidden="true" /> too many missing days</li>
        )}
        {data.hasNoValue && (
          <li className="legend__item"><span className="swatch swatch--hatch" aria-hidden="true" /> no value for this year</li>
        )}
        {data.neitherYears.length > 0 && (
          <li className="legend__item"><span className="swatch swatch--none" aria-hidden="true" /> dashed outline: {data.neitherYears.join(", ")} (in neither period)</li>
        )}
      </ul>
    </div>
  );
}
