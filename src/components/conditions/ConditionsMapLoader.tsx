"use client";

import dynamic from "next/dynamic";
import type { ConditionsMapProps } from "./ConditionsMap";

const ConditionsMap = dynamic(() => import("./ConditionsMap"), {
  ssr: false,
  loading: () => (
    <div className="map-loading cx-map-loading" role="status">
      Loading the map...
    </div>
  ),
});

/** Leaflet needs the browser, so the map is loaded without server rendering, like the pin picker on the home page. */
export default function ConditionsMapLoader(props: ConditionsMapProps) {
  return <ConditionsMap {...props} />;
}
