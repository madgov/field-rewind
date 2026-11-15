import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadSavedCimis } from "./index";
import { body, rec } from "./testFixtures";

describe("loadSavedCimis", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cimis-test-"));
  it("returns no-saved-data with the next step when the file is missing (no fabricated series)", async () => {
    const r = await loadSavedCimis(path.join(dir, "missing.json"));
    expect(r.status).toBe("no-saved-data");
    expect(r.days).toEqual([]);
    expect(r.nextStep).toMatch(/fetch-cimis/);
  });
  it("normalizes a saved file, labels it as saved, re-redacts URLs", async () => {
    const f = path.join(dir, "s.json");
    fs.writeFileSync(f, JSON.stringify({ station: 47, fetchedAt: "2026-03-04T10:00:00.000Z", sourceUrls: ["https://et.water.ca.gov/api/data?appKey=LEAK&targets=47"], responses: [body([rec("2020-01-01", "1.2", "R"), rec("2020-01-02", null, "N")])] }));
    const r = await loadSavedCimis(f);
    expect(r.status).toBe("ok");
    expect(r.origin).toBe("saved");
    expect(r.savedLabel).toBe("saved response from 2026-03-04");
    expect(r.days).toHaveLength(2);
    expect(JSON.stringify(r)).not.toContain("LEAK");
    expect(r.coverage).toEqual({ start: "2020-01-01", end: "2020-01-01" });
  });
  it("reports unreadable or wrong-shape files as error", async () => {
    const f = path.join(dir, "bad.json");
    fs.writeFileSync(f, "{not json");
    expect((await loadSavedCimis(f)).status).toBe("error");
    fs.writeFileSync(f, JSON.stringify({ foo: 1 }));
    expect((await loadSavedCimis(f)).status).toBe("error");
  });
});
