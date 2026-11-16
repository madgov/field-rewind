import { describe, expect, it } from "vitest";
import { mapNominatim, nominatimUrl, searchPlaces, validateQuery } from "./geocode";

describe("geocode helpers", () => {
  it("validates the query length", () => {
    expect(validateQuery("a").ok).toBe(false);
    expect(validateQuery("x".repeat(121)).ok).toBe(false);
    expect(validateQuery(null).ok).toBe(false);
    expect(validateQuery("  Fresno ")).toEqual({ ok: true, q: "Fresno" });
  });

  it("builds the Nominatim URL", () => {
    expect(nominatimUrl("Brentwood, California")).toBe("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=Brentwood%2C%20California");
  });

  it("maps rows and drops bad ones", () => {
    const rows = [
      { display_name: "Brentwood, CA", lat: "37.93", lon: "-121.69" },
      { display_name: "Nowhere", lat: "abc", lon: "1" },
      { lat: "1", lon: "1" },
    ];
    expect(mapNominatim(rows)).toEqual([{ name: "Brentwood, CA", lat: 37.93, lon: -121.69 }]);
    expect(mapNominatim({ error: "x" })).toBeNull();
  });

  it("reports an HTTP failure as it is", async () => {
    const f = (async () => new Response("busy", { status: 429 })) as unknown as typeof fetch;
    expect(await searchPlaces("Fresno", f)).toEqual({ status: "error", message: "OpenStreetMap place search returned HTTP 429." });
  });
});
