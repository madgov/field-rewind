import type { PowerResult } from "@/lib/types";
import type { ShiftResult } from "@/lib/shift/types";
import { formatTempC, formatTempF } from "@/lib/shift/units";
import { formatUtc } from "./format";

type Rules = Extract<ShiftResult, { status: "ok" }>["rules"];
type Header = Omit<PowerResult, "days">;

export default function Provenance({ power, rules }: { power: Header; rules?: Rules }) {
  const when = formatUtc(power.fetchedAt);
  const origin =
    power.origin === "saved"
      ? `Saved response from ${when}.`
      : power.origin === "cache"
        ? `Fetched from NASA POWER on ${when} (cached).`
        : `Fetched from NASA POWER just now, ${when}.`;
  return (
    <section className="prov" aria-labelledby="prov-h">
      <h2 id="prov-h" className="sh-h2">Where this came from</h2>
      <p className="prov__origin"><strong>{origin}</strong></p>
      <p>
        Regional climate, about 50 km grid. NASA POWER is reanalysis (a computer reconstruction of past weather), not a sensor in your field.
      </p>
      {power.message && <p className="prov__msg">{power.message}</p>}
      {power.status === "partial" && !power.message && (
        <p className="prov__msg">
          Some data is missing: {power.missing.anyField.toLocaleString("en-US")} of {power.missing.totalDays.toLocaleString("en-US")} days have at least one missing value. Missing days are never filled in.
        </p>
      )}
      {rules && (
        <ul className="prov__rules">
          <li>
            A hot day is a day when the highest temperature is over {formatTempC(rules.hotDayThresholdC)} ({formatTempF(rules.hotDayThresholdC)}).
          </li>
          <li>
            A year with more than {rules.maxMissingDaysPerYear} missing days is left out of the averages, and each period needs at least {rules.minYearsPerPeriod} usable years to be compared.
          </li>
          <li>{rules.clearChangeRule}</li>
        </ul>
      )}
      <h3 className="prov__h3">Source requests</h3>
      <ul className="srclist">
        {power.sourceUrls.map((u) => (
          <li key={u}>
            <a href={u} rel="noreferrer">{u}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
