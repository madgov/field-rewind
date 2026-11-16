"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ImageOverlay, MapContainer, Marker, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import "../PinMap.css";
import { cellAt, colourOf, LOW_SPOT_SENTENCE, NDVI_OVERLAY_LABEL, TERRAIN_OVERLAY_LABEL, type Bounds, type Legend, type NdviOverlayData, type TerrainOverlayData } from "./overlay";
import { isoDayText } from "./models";

export type ConditionsMapProps = {
  lat: number;
  lon: number;
  place: string;
  ndvi: NdviOverlayData | null;
  ndviMessage: string | null;
  terrain: TerrainOverlayData | null;
  terrainMessage: string | null;
};

type LayerId = "ndvi" | "slope" | "low" | "none";

const pinIcon = L.divIcon({
  className: "fr-pin",
  html: '<span class="fr-pin__shadow"></span><span class="fr-pin__head"></span>',
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

const SCALE = 14; // canvas pixels per data cell

/** Draw a grid as exact cells: one flat colour per cell, no smoothing. Cells with no value are hatched. */
function rasterUrl(values: ReadonlyArray<number | null>, rows: number, cols: number, legend: Legend): string {
  const c = document.createElement("canvas");
  c.width = cols * SCALE;
  c.height = rows * SCALE;
  const g = c.getContext("2d");
  if (!g) return "";
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const v = values[r * cols + k];
      const x = k * SCALE;
      const y = r * SCALE;
      if (v === null || !Number.isFinite(v)) {
        g.fillStyle = "#e6e1d0";
        g.fillRect(x, y, SCALE, SCALE);
        g.strokeStyle = "#5f5946";
        g.lineWidth = 1.5;
        g.beginPath();
        for (let t = -SCALE; t < SCALE; t += 5) {
          g.moveTo(x + t, y + SCALE);
          g.lineTo(x + t + SCALE, y);
        }
        g.save();
        g.beginPath();
        g.rect(x, y, SCALE, SCALE);
        g.clip();
        g.stroke();
        g.restore();
      } else {
        g.fillStyle = colourOf(legend, v).colour;
        g.fillRect(x, y, SCALE, SCALE);
      }
    }
  }
  return c.toDataURL("image/png");
}

const toLeaflet = (b: Bounds): L.LatLngBoundsExpression => [[b.south, b.west], [b.north, b.east]];

function FitTo({ bounds }: { bounds: Bounds }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(toLeaflet(bounds), { padding: [24, 24], animate: false });
  }, [map, bounds]);
  return null;
}

type Hover = { layer: LayerId; row: number; col: number } | null;

function Pointer({ onMove }: { onMove: (lat: number, lon: number) => void }) {
  useMapEvents({
    mousemove: (e) => onMove(e.latlng.lat, e.latlng.lng),
    click: (e) => onMove(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function LegendView({ legend, extra }: { legend: Legend; extra?: React.ReactNode }) {
  return (
    <div className="cx-legend" role="group" aria-label={`Legend: ${legend.title}`}>
      <p className="cx-legend__title">
        {legend.title} ({legend.unit}). Real range in this data: {legend.min.toFixed(legend.digits)} to {legend.max.toFixed(legend.digits)}.
      </p>
      <ol className="cx-legend__bins">
        {legend.bins.map((b) => (
          <li key={b.index}>
            <span className="cx-legend__sw" style={{ background: b.colour }} aria-hidden="true" />
            <span className="cx-legend__lab">{b.label}</span>
          </li>
        ))}
        {extra}
      </ol>
    </div>
  );
}

export default function ConditionsMap({ lat, lon, place, ndvi, ndviMessage, terrain, terrainMessage }: ConditionsMapProps) {
  const [layer, setLayer] = useState<LayerId>(ndvi ? "ndvi" : terrain ? "slope" : "none");
  const [dateIdx, setDateIdx] = useState(ndvi ? ndvi.dates.length - 1 : 0);
  const [playing, setPlaying] = useState(false);
  const [outlines, setOutlines] = useState(true);
  const [opacity, setOpacity] = useState(0.8);
  const [hover, setHover] = useState<Hover>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  // Play steps through the saved clear dates. It never starts by itself.
  useEffect(() => {
    if (!playing || !ndvi) return;
    const t = setInterval(() => setDateIdx((i) => (i + 1) % ndvi.dates.length), reduced ? 1800 : 1100);
    return () => clearInterval(t);
  }, [playing, ndvi, reduced]);

  const activeBounds: Bounds | null = layer === "ndvi" && ndvi ? ndvi.bounds : (layer === "slope" || layer === "low") && terrain ? terrain.bounds : null;
  const fitBounds: Bounds = terrain?.bounds ?? ndvi?.bounds ?? { west: lon - 0.006, east: lon + 0.006, south: lat - 0.005, north: lat + 0.005 };

  const url = useMemo(() => {
    if (typeof document === "undefined") return "";
    let out = "";
    if (layer === "ndvi" && ndvi) out = rasterUrl(ndvi.dates[Math.min(dateIdx, ndvi.dates.length - 1)].values, ndvi.rows, ndvi.cols, ndvi.legend);
    else if (layer === "slope" && terrain) out = rasterUrl(terrain.slopePct, terrain.rows, terrain.cols, terrain.slopeLegend);
    else if (layer === "low" && terrain) out = rasterUrl(terrain.relElevM, terrain.rows, terrain.cols, terrain.lowSpotLegend);
    return out;
  }, [layer, dateIdx, ndvi, terrain]);

  const onMove = (la: number, lo: number) => {
    if (!activeBounds || layer === "none") return setHover(null);
    const rows = layer === "ndvi" ? ndvi!.rows : terrain!.rows;
    const cols = layer === "ndvi" ? ndvi!.cols : terrain!.cols;
    const c = cellAt(activeBounds, rows, cols, la, lo);
    setHover(c ? { layer, ...c } : null);
  };

  const cellBounds = (h: NonNullable<Hover>): Bounds => {
    const b = activeBounds!;
    const rows = h.layer === "ndvi" ? ndvi!.rows : terrain!.rows;
    const cols = h.layer === "ndvi" ? ndvi!.cols : terrain!.cols;
    const dLat = (b.north - b.south) / rows;
    const dLon = (b.east - b.west) / cols;
    return { north: b.north - h.row * dLat, south: b.north - (h.row + 1) * dLat, west: b.west + h.col * dLon, east: b.west + (h.col + 1) * dLon };
  };

  const readout = (() => {
    if (!hover || hover.layer !== layer) return "Move the pointer over the coloured squares, or tap one, to read its real value.";
    const i = hover.row * (layer === "ndvi" ? ndvi!.cols : terrain!.cols) + hover.col;
    const where = `row ${hover.row + 1}, column ${hover.col + 1}`;
    if (layer === "ndvi" && ndvi) {
      const d = ndvi.dates[dateIdx];
      const v = d.values[i];
      return v === null ? `Pixel ${where}: no value on ${isoDayText(d.date)} (hidden by the cloud, shadow or snow check).` : `Pixel ${where}: NDVI ${v.toFixed(2)} (${colourOf(ndvi.legend, v).label}) on ${isoDayText(d.date)}, ${d.satellite}.`;
    }
    if (layer === "slope" && terrain) return `Cell ${where}: slope ${terrain.slopePct[i].toFixed(1)} percent, ground height ${terrain.elevationM[i].toFixed(0)} m.`;
    if (layer === "low" && terrain) return `Cell ${where}: ${terrain.relElevM[i].toFixed(1)} m above the lowest cell in the window (ground height ${terrain.elevationM[i].toFixed(0)} m).`;
    return "";
  })();

  const cur = ndvi ? ndvi.dates[Math.min(dateIdx, ndvi.dates.length - 1)] : null;
  const radio = (id: LayerId, label: string, enabled: boolean) => (
    <label className={`cx-radio ${enabled ? "" : "is-disabled"}`}>
      <input type="radio" name="cx-layer" value={id} checked={layer === id} disabled={!enabled} onChange={() => { setLayer(id); setPlaying(false); setHover(null); }} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="cx-mapwrap">
      <fieldset className="cx-layers">
        <legend>Map layer</legend>
        <div className="cx-layers__row">
          {radio("ndvi", "Landsat NDVI (real 30 m pixels)", !!ndvi)}
          {radio("slope", "Slope", !!terrain)}
          {radio("low", "Low spots (height above the lowest point)", !!terrain)}
          {radio("none", "None, outlines only", true)}
        </div>
        <label className="cx-check"><input type="checkbox" checked={outlines} onChange={(e) => setOutlines(e.target.checked)} /> Show the edges of each data window</label>
        <label className="cx-opacity">Overlay strength <input type="range" min={0.3} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} aria-label="Overlay strength" /></label>
      </fieldset>
      {!ndvi && ndviMessage && <p className="cx-maplayermsg" role="status"><strong>Satellite windows:</strong> {ndviMessage}</p>}
      {!terrain && terrainMessage && <p className="cx-maplayermsg" role="status"><strong>Terrain:</strong> {terrainMessage}</p>}

      {layer === "ndvi" && ndvi && cur && (
        <div className="cx-timeline-ctl" role="group" aria-label="Satellite date timeline">
          <button type="button" className="btn btn--ghost cx-play" aria-pressed={playing} onClick={() => setPlaying((p) => !p)}>
            {playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="step-btn" aria-label="Previous date" onClick={() => { setPlaying(false); setDateIdx((i) => Math.max(0, i - 1)); }} disabled={dateIdx <= 0}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <input className="cx-range" type="range" min={0} max={ndvi.dates.length - 1} step={1} value={dateIdx} onChange={(e) => { setPlaying(false); setDateIdx(Number(e.target.value)); }} aria-label="Satellite date" aria-valuetext={`${isoDayText(cur.date)}, ${cur.satellite}`} />
          <button type="button" className="step-btn" aria-label="Next date" onClick={() => { setPlaying(false); setDateIdx((i) => Math.min(ndvi.dates.length - 1, i + 1)); }} disabled={dateIdx >= ndvi.dates.length - 1}>
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7.5 4 13.5 10l-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          <p className="cx-timeline-ctl__now" aria-live="polite">
            <strong>{isoDayText(cur.date)}</strong>, {cur.satellite}, {Math.round(cur.validFraction * 100)} percent of pixels clear. Date {dateIdx + 1} of {ndvi.dates.length}.
          </p>
          {reduced && <p className="cx-note">Your device asks for less motion, so nothing plays by itself. Press Play to step through the dates slowly, or use the slider.</p>}
        </div>
      )}

      <div className="cx-map" aria-label={`Map around ${place} with real data overlays`}>
        <MapContainer center={[lat, lon]} zoom={15} minZoom={3} maxZoom={19} scrollWheelZoom={false} className="fr-map cx-leaflet" attributionControl>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' maxZoom={19} />
          <FitTo bounds={fitBounds} />
          <Pointer onMove={onMove} />
          {url && activeBounds && layer !== "none" && <ImageOverlay url={url} bounds={toLeaflet(activeBounds)} opacity={opacity} className="cx-raster" />}
          {outlines && ndvi && (
            <Rectangle bounds={toLeaflet(ndvi.bounds)} pathOptions={{ color: "#0b57d0", weight: 3, dashArray: "8 6", fill: false }} interactive={false}>
              <Tooltip sticky direction="top" className="cx-edge-tip">Landsat window, about {Math.round(ndvi.extentM.eastWest)} m</Tooltip>
            </Rectangle>
          )}
          {outlines && terrain && (
            <Rectangle bounds={toLeaflet(terrain.bounds)} pathOptions={{ color: "#8c2981", weight: 3, dashArray: "2 6", fill: false }} interactive={false}>
              <Tooltip sticky direction="bottom" className="cx-edge-tip">Terrain window, about {(terrain.extentM.eastWest / 1000).toFixed(1)} by {(terrain.extentM.northSouth / 1000).toFixed(1)} km</Tooltip>
            </Rectangle>
          )}
          {hover && activeBounds && <Rectangle bounds={toLeaflet(cellBounds(hover))} pathOptions={{ color: "#ffffff", weight: 3, fill: false }} interactive={false} />}
          {hover && activeBounds && <Rectangle bounds={toLeaflet(cellBounds(hover))} pathOptions={{ color: "#000000", weight: 1.5, fill: false }} interactive={false} />}
          <Marker position={[lat, lon]} icon={pinIcon} alt={`Pin at ${place}`} keyboard={false} />
        </MapContainer>
      </div>

      <p className="cx-readout" aria-live="polite" role="status">{readout}</p>
      {outlines && (ndvi || terrain) && (
        <ul className="cx-key cx-edgekey" aria-label="What the outlines on the map are">
          {ndvi && <li><svg width="30" height="8" viewBox="0 0 30 8" aria-hidden="true"><path d="M0 4h30" stroke="#0b57d0" strokeWidth="3" strokeDasharray="8 6" /></svg> Landsat window, about {Math.round(ndvi.extentM.eastWest)} m across</li>}
          {terrain && <li><svg width="30" height="8" viewBox="0 0 30 8" aria-hidden="true"><path d="M0 4h30" stroke="#8c2981" strokeWidth="3" strokeDasharray="2 6" /></svg> Terrain window, about {(terrain.extentM.eastWest / 1000).toFixed(1)} by {(terrain.extentM.northSouth / 1000).toFixed(1)} km</li>}
        </ul>
      )}

      {layer === "ndvi" && ndvi && (
        <>
          <p className="cx-overlaylabel"><strong>{NDVI_OVERLAY_LABEL}</strong> {ndvi.originLine}</p>
          <LegendView legend={ndvi.legend} extra={<li><span className="cx-legend__sw cx-legend__sw--hatch" aria-hidden="true" /><span className="cx-legend__lab">Hatched: no value (cloud, shadow or snow)</span></li>} />
        </>
      )}
      {layer === "slope" && terrain && (
        <>
          <p className="cx-overlaylabel"><strong>{TERRAIN_OVERLAY_LABEL}</strong> {terrain.originLine}</p>
          <LegendView legend={terrain.slopeLegend} />
        </>
      )}
      {layer === "low" && terrain && (
        <>
          <p className="cx-overlaylabel"><strong>{TERRAIN_OVERLAY_LABEL}</strong> {terrain.originLine}</p>
          <LegendView legend={terrain.lowSpotLegend} />
          <p className="cx-note">{LOW_SPOT_SENTENCE}</p>
        </>
      )}
      {layer === "none" && <p className="cx-note">No overlay is drawn. The dashed outlines show how far each saved data window reaches around the pin.</p>}
    </div>
  );
}
