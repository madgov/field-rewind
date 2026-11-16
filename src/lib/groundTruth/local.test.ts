import { describe, expect, it } from "vitest";
import { blockPoints, majorityVote, parseCdlValue, toAlbers } from "./cdl";
import { compareToGauge, haversineKm, parseReports, parseStations } from "./gauge";
import { NLCD_CLASSES, nlcdClassFromCode, parseNlcdFeatureInfo } from "./nlcd";
import { nearestWellWithReadings, parseReadings, parseSites } from "./wells";

describe("CDL", () => {
  it("parses the service XML", () => {
    const xml = `<ns1:GetCDLValueResponse><Result>{x: -2.0, y: 1.0, value: 176, category: "Grass/Pasture", color: "#E9FFBE"}</Result></ns1:GetCDLValueResponse>`;
    expect(parseCdlValue(xml)).toEqual({ value: 176, category: "Grass/Pasture" });
    expect(parseCdlValue("<faultstring>Error: Failed to get value.</faultstring>")).toBeNull();
  });
  it("projects Brentwood to EPSG:5070 metres", () => {
    const { x, y } = toAlbers(37.93, -121.66);
    expect(x).toBeCloseTo(-2207011.6, 0);
    expect(y).toBeCloseTo(1954761.2, 0);
  });
  it("3 x 3 block: 9 distinct points 30 m apart, centre first", () => {
    const pts = blockPoints(1000, 2000);
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual({ x: 1000, y: 2000, centre: true });
    expect(new Set(pts.map((p) => `${p.x},${p.y}`)).size).toBe(9);
    expect(Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))).toBe(60);
  });
  const corn = { value: 1, category: "Corn" };
  const soy = { value: 5, category: "Soybeans" };
  const wheat = { value: 24, category: "Winter Wheat" };
  it("majority vote: clear winner", () => {
    const v = majorityVote(2020, [corn, corn, corn, corn, corn, soy, soy, wheat, wheat], corn);
    expect(v.majority).toEqual(corn);
    expect(v.agree).toBe(5);
    expect(v.sampled).toBe(9);
    expect(v.tie).toBe(false);
    expect(v.counts).toEqual({ Corn: 5, Soybeans: 2, "Winter Wheat": 2 });
  });
  it("tie goes to the centre pixel when it is among the tied classes, else lowest code", () => {
    const px = [corn, corn, soy, soy, wheat];
    expect(majorityVote(2020, px, soy).majority).toEqual(soy);
    expect(majorityVote(2020, px, wheat).majority).toEqual(corn);
    expect(majorityVote(2020, px, null).tie).toBe(true);
  });
  it("no pixel answered gives a null majority", () => {
    expect(majorityVote(2020, [], null)).toMatchObject({ majority: null, sampled: 0, agree: 0 });
  });
});

describe("NLCD", () => {
  it("maps palette index to the official class names", () => {
    expect(nlcdClassFromCode(82)).toEqual({ code: 82, name: "Cultivated Crops", year: 2021 });
    expect(nlcdClassFromCode(24)?.name).toBe("Developed, High Intensity");
    expect(nlcdClassFromCode(90)?.name).toBe("Woody Wetlands");
    expect(nlcdClassFromCode(0)).toBeNull();
    expect(Object.keys(NLCD_CLASSES)).toHaveLength(20);
  });
  it("parses feature info: class, empty, unknown", () => {
    expect(parseNlcdFeatureInfo('{"features":[{"properties":{"PALETTE_INDEX":82}}]}')).toEqual({ kind: "class", value: { code: 82, name: "Cultivated Crops", year: 2021 } });
    expect(parseNlcdFeatureInfo('{"features":[]}')).toEqual({ kind: "empty" });
    expect(parseNlcdFeatureInfo('{"features":[{"properties":{"PALETTE_INDEX":77}}]}')).toEqual({ kind: "unknown", code: 77 });
  });
});

describe("CoCoRaHS", () => {
  const rep = (d: string, amt: string, stamp: string) => `<DailyPrecipReport><ObservationDate>${d}</ObservationDate><TotalPrecipAmt>${amt}</TotalPrecipAmt><DateTimeStamp>${stamp}</DateTimeStamp></DailyPrecipReport>`;
  it("parses inches to mm, keeps NA as null (not zero), keeps the later duplicate", () => {
    const xml = `<Cocorahs><DailyPrecipReports>${rep("2020-01-02", "0.10", "a")}${rep("2020-01-01", "NA", "a")}${rep("2020-01-03", "0.00", "a")}${rep("2020-01-02", "0.20", "b")}</DailyPrecipReports></Cocorahs>`;
    const r = parseReports(xml);
    expect(r.map((x) => x.date)).toEqual(["2020-01-01", "2020-01-02", "2020-01-03"]);
    expect(r[0]?.precipMm).toBeNull();
    expect(r[1]?.precipMm).toBeCloseTo(5.08, 10);
    expect(r[2]?.precipMm).toBe(0);
  });
  it("compares only days the gauge reported and the product has a value", () => {
    const reports = [
      { date: "d1", precipMm: 10 },
      { date: "d2", precipMm: 0 },
      { date: "d3", precipMm: null }, // unreadable report: skipped
      { date: "d4", precipMm: 5 }, // product has no value: skipped
    ];
    const product = new Map<string, number | null>([["d1", 8], ["d2", 1], ["d3", 50], ["d4", null], ["d5", 100]]); // d5: gauge did not report
    const s = compareToGauge(reports, product)!;
    expect(s.n).toBe(2);
    expect(s.gaugeTotalMm).toBe(10);
    expect(s.productTotalMm).toBe(9);
    expect(s.biasMmPerDay).toBeCloseTo(-0.5, 12);
    expect(s.ratio).toBeCloseTo(0.9, 12);
    expect(s.wetDays).toEqual({ threshold: 1, both: 1, gaugeOnly: 0, productOnly: 1, neither: 0 });
    expect(compareToGauge([{ date: "x", precipMm: null }], product)).toBeNull();
  });
  it("orders stations by distance", () => {
    const st = (id: string, lat: number, lon: number) => `<Station><StationNumber>${id}</StationNumber><StationName>${id}</StationName><Latitude>${lat}</Latitude><Longitude>${lon}</Longitude><StationStatus>Reporting</StationStatus></Station>`;
    const s = parseStations(`<Stations>${st("far", 38.5, -121.66)}${st("near", 37.94, -121.66)}</Stations>`, 37.93, -121.66);
    expect(s.map((x) => x.id)).toEqual(["near", "far"]);
    expect(s[0]?.distanceKm).toBeCloseTo(1.11, 1);
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1);
  });
});

describe("NWIS wells", () => {
  const site = (id: string, lon: number, lat: number) => ({ type: "Feature", properties: { id, monitoring_location_name: id + "-name" }, geometry: { type: "Point", coordinates: [lon, lat] } });
  const row = (id: string, time: string, value: string | null) => ({ type: "Feature", properties: { monitoring_location_id: id, time, value, unit_of_measure: "ft", approval_status: "Approved", qualifier: ["Static"] }, geometry: { type: "Point", coordinates: [-121.7, 37.9] } });
  it("picks the nearest well with a reading since a date, and the nearest with any", () => {
    const sites = parseSites(JSON.stringify({ features: [site("far", -121.2, 37.93), site("near", -121.65, 37.93)] }), 37.93, -121.66);
    expect(sites.map((s) => s.id)).toEqual(["near", "far"]);
    const rows = parseReadings(JSON.stringify({ features: [row("far", "2023-07-12T12:00:00+00:00", "24.82"), row("near", "1981-08-06T12:00:00+00:00", "7.20"), row("near", "bad", "x"), row("near", "1981-07-01T12:00:00+00:00", "")] }));
    expect(rows).toHaveLength(2); // blank and non-numeric rows dropped
    expect(rows[0]).toMatchObject({ date: "2023-07-12", value: 24.82, unit: "ft", qualifier: "Static" });
    const any = nearestWellWithReadings(rows, sites, 37.93, -121.66, null)!;
    expect(any.id).toBe("near");
    expect(any.readings[0]?.value).toBe(7.2);
    const recent = nearestWellWithReadings(rows, sites, 37.93, -121.66, "2015-01-01")!;
    expect(recent.id).toBe("far");
    expect(recent.name).toBe("far-name");
    expect(nearestWellWithReadings(rows, sites, 37.93, -121.66, "2030-01-01")).toBeNull();
  });
});
