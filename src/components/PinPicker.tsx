"use client";

import dynamic from "next/dynamic";
import type { Pin } from "./geo";

export type { Pin };

type PinPickerProps = {
  /** Currently selected pin, or null when nothing is selected yet. */
  value: Pin | null;
  /** Called with a normalized pin (lat -90..90, lon -180..180) on click, tap, drag or when you change `value`. */
  onChange: (pin: Pin) => void;
};

const PinMap = dynamic(() => import("./PinMap"), {
  ssr: false,
  loading: () => (
    <div className="map-loading" role="status">
      Loading the map...
    </div>
  ),
});

/** Controlled map. Setting `value` from outside (e.g. a demo button) moves the pin and flies the map there. */
export default function PinPicker({ value, onChange }: PinPickerProps) {
  return <PinMap value={value} onChange={onChange} />;
}
