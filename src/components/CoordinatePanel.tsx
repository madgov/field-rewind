import Link from "next/link";
import { formatLat, formatLon, formatSigned, gridCellCenter, type Pin } from "./geo";

export default function CoordinatePanel({ pin }: { pin: Pin | null }) {
  if (!pin) {
    return (
      <div className="panel panel--empty" aria-live="polite">
        <h2 className="panel__title">No spot chosen yet</h2>
        <p>Tap or click the map to drop a pin on your farm, or pick one of the example places above.</p>
      </div>
    );
  }
  const cell = gridCellCenter(pin);
  return (
    <div className="panel" aria-live="polite">
      <h2 className="panel__title">Your spot</h2>
      <p className="panel__plain" key={`${pin.lat}|${pin.lon}`}>
        {formatLat(pin.lat)}, {formatLon(pin.lon)}
      </p>
      <Link className="panel__cta" href={`/shift?lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}`}>
        See how this field has shifted
      </Link>
      <Link className="panel__link" href={`/replay?lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}`}>
        Replay 40 seasons with your crops and water
      </Link>
      <dl className="panel__list">
        <div>
          <dt>Latitude</dt>
          <dd>{formatSigned(pin.lat)}</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{formatSigned(pin.lon)}</dd>
        </div>
      </dl>
      <div className="panel__cell">
        <h3>Climate grid square</h3>
        <p>
          Centred on {formatLat(cell.lat)}, {formatLon(cell.lon)}
        </p>
        <p className="panel__note">
          Weather history will come from regional climate, about 50 km grid. It describes the wider area, not a sensor in your field.
        </p>
      </div>
    </div>
  );
}
