"use client";

import { useEffect, useRef } from "react";

const NUMBER = /\d[\d,]*(?:\.\d+)?/;

/** Counts the first number inside a generated string up from zero. Always ends on the exact original text. */
export default function CountUp({ text, delayMs = 0, durationMs = 1000 }: { text: string; delayMs?: number; durationMs?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const m = NUMBER.exec(text);
    if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const token = m[0];
    const target = Number(token.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = token.includes(".") ? token.length - token.indexOf(".") - 1 : 0;
    const grouped = token.includes(",");
    const render = (v: number) => {
      const body = v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
      return text.slice(0, m.index) + body + text.slice(m.index + token.length);
    };

    const el = ref.current;
    if (!el) return;
    const write = (v: string) => {
      el.textContent = v;
    };
    let raf = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      const t0 = performance.now() + delayMs;
      const tick = (now: number) => {
        const p = Math.min(1, Math.max(0, (now - t0) / durationMs));
        if (p >= 1) {
          write(text);
          return;
        }
        const eased = 1 - Math.pow(1 - p, 3);
        write(render(target * eased));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    write(render(0));
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect();
          run();
        }
      }, { threshold: 0.4 });
      io.observe(el);
    } else {
      run();
    }
    return () => {
      io?.disconnect();
      cancelAnimationFrame(raf);
      write(text);
    };
  }, [text, delayMs, durationMs]);

  return (
    <>
      <span ref={ref} aria-hidden="true">{text}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
