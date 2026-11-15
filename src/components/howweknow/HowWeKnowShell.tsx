"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

export const PANEL_ID = "how-we-know";
const HASH = `#${PANEL_ID}`;

/**
 * The collapsible frame. Closed by default; `#how-we-know` in the address opens it (on load and when the hash changes).
 * The contents are rendered on the server and stay in the page while closed, so opening is instant and needs no request.
 */
export default function HowWeKnowShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);

  const syncFromHash = useCallback(() => {
    if (window.location.hash === HASH) {
      setOpen(true);
      document.getElementById(PANEL_ID)?.scrollIntoView({ block: "start" });
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(syncFromHash, 0);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [syncFromHash]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      const base = window.location.pathname + window.location.search;
      window.history.replaceState(window.history.state, "", next ? base + HASH : base);
    } catch {
      /* a blocked history API only means the address is not updated */
    }
  };

  return (
    <section id={PANEL_ID} className={`hk-panel ${open ? "is-open" : ""} ${className}`} aria-labelledby="hk-title">
      <div className="hk-head">
        <div>
          <h2 id="hk-title" className="sh-h2 hk-title">How we know</h2>
          <p className="hk-sub">What the numbers rest on: the test of the formula, every data source, the limits of the weather record, and two outside checks.</p>
        </div>
        <button type="button" className="btn btn--ghost hk-toggle" aria-expanded={open} aria-controls="hk-body" onClick={toggle}>
          {open ? "Hide how we know" : "Show how we know"}
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="hk-chev"><path d="M2 4.2 6 8l4-3.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div id="hk-body" className="hk-body" hidden={!open}>{children}</div>
    </section>
  );
}
