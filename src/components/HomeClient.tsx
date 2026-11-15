"use client";

import { useState } from "react";
import Link from "next/link";
import { DEMO_PINS } from "@/lib/demoPins";
import PinPicker from "./PinPicker";
import CoordinatePanel from "./CoordinatePanel";
import { EXAMPLE_FARM_LABEL, exampleFarmHref } from "./replay/exampleFarm";
import { samePin, type Pin } from "./geo";

export default function HomeClient() {
  const [pin, setPin] = useState<Pin | null>(null);
  // Next step: read `pin` here and fetch climate data for it.

  return (
    <>
      <header className="hero">
        <p className="hero__kicker">NASA Space Apps 2026</p>
        <h1 className="hero__title">Field Rewind</h1>
        <p className="hero__sub">
          Would your crop rotation have survived the last 40 seasons with your water supply?
        </p>
      </header>

      <main className="main">
        <section className="examplefarm" aria-labelledby="example-farm-h">
          <div>
            <h2 id="example-farm-h" className="examplefarm__title">Just want to see it work?</h2>
            <p className="examplefarm__text">
              Opens the 40-season replay for Brentwood with three example rotations and an example water supply, using a saved NASA weather response. It needs no connection to NASA. The rotations and supply are a constructed example, not a real farm&rsquo;s records.
            </p>
          </div>
          <Link className="examplefarm__btn" href={exampleFarmHref()}>{EXAMPLE_FARM_LABEL}</Link>
        </section>
        <section className="step" aria-labelledby="pick-heading">
          <h2 id="pick-heading" className="step__title">
            <span className="step__num" aria-hidden="true">1</span> Pick your field
          </h2>
          <div className="demos" role="group" aria-label="Example places">
            {DEMO_PINS.map((d) => {
              const active = samePin(pin, { lat: d.lat, lon: d.lon });
              return (
                <button
                  key={d.id}
                  type="button"
                  className="demo"
                  aria-pressed={active}
                  onClick={() => setPin({ lat: d.lat, lon: d.lon })}
                >
                  {d.name}
                </button>
              );
            })}
          </div>
          <div className="layout">
            <div className="mapwrap">
              <PinPicker value={pin} onChange={setPin} />
            </div>
            <CoordinatePanel pin={pin} />
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>Map data &copy; OpenStreetMap contributors.</p>
        <Link href="/dev">Data check (dev)</Link>
      </footer>
    </>
  );
}
