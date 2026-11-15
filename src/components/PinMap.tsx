"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { normalizePin, samePin, type Pin } from "./geo";
import "./PinMap.css";

type Props = {
  value: Pin | null;
  onChange: (pin: Pin) => void;
};

// A CSS-drawn pin: avoids Leaflet's default marker images, which break under bundlers.
const pinIcon = L.divIcon({
  className: "fr-pin",
  html: '<span class="fr-pin__shadow"></span><span class="fr-pin__head"></span>',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

function restartDrop(marker: L.Marker | null) {
  const head = marker?.getElement()?.querySelector<HTMLElement>(".fr-pin__head");
  if (!head) return;
  head.classList.remove("fr-pin__head--drop");
  void head.offsetWidth; // force reflow so the animation restarts
  head.classList.add("fr-pin__head--drop");
}

function ClickToPlace({ onPick }: { onPick: (pin: Pin) => void }) {
  useMapEvents({
    click(e) {
      onPick(normalizePin(e.latlng.lat, e.latlng.lng));
    },
  });
  return null;
}

/** Flies to the pin when it was changed from outside the map (demo buttons). */
function FlyToExternal({ value, lastFromMap }: { value: Pin | null; lastFromMap: React.RefObject<Pin | null> }) {
  const map = useMap();
  useEffect(() => {
    if (!value || samePin(value, lastFromMap.current)) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const zoom = Math.max(map.getZoom(), 8);
    if (reduce) map.setView([value.lat, value.lon], zoom, { animate: false });
    else map.flyTo([value.lat, value.lon], zoom, { duration: 1.6 });
  }, [value, map, lastFromMap]);
  return null;
}

export default function PinMap({ value, onChange }: Props) {
  const markerRef = useRef<L.Marker | null>(null);
  const lastFromMap = useRef<Pin | null>(null);

  const pick = (pin: Pin) => {
    lastFromMap.current = pin;
    onChange(pin);
  };

  // Replay the drop animation whenever the pin moves.
  useEffect(() => {
    if (value) restartDrop(markerRef.current);
  }, [value]);

  const handlers = useMemo(
    () => ({
      dragend() {
        const ll = markerRef.current?.getLatLng();
        if (ll) pick(normalizePin(ll.lat, ll.lng));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange],
  );

  return (
    <MapContainer
      center={[25, -20]}
      zoom={2}
      minZoom={2}
      worldCopyJump
      scrollWheelZoom
      className="fr-map"
      attributionControl
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />
      <ClickToPlace onPick={pick} />
      <FlyToExternal value={value} lastFromMap={lastFromMap} />
      {value && (
        <Marker
          position={[value.lat, value.lon]}
          icon={pinIcon}
          draggable
          ref={markerRef}
          eventHandlers={handlers}
          alt="Selected farm location. Drag to move."
        />
      )}
    </MapContainer>
  );
}
