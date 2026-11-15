import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { usableCrops } from "@/lib/crops/catalog";
import { buildSeasonTable, replayFromSeasonTable } from "@/lib/replay";
import { EXAMPLE_ROTATIONS, EXAMPLE_SUPPLY_MM } from "@/lib/replay/examples";
import type { FetchLike } from "./client";
import { OFFLINE_MESSAGE, offlineFromEnv } from "./offline";
import { createPowerService } from "./service";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "offline-test-"));
const throwingFetch = () =>
  vi.fn<FetchLike>(async () => {
    throw new Error("fetch must not be called");
  });

describe("example farm (saved Brentwood response) never touches the network", () => {
  it("returns the full replay result and never calls fetch, even with the offline switch off", async () => {
    const f = throwingFetch();
    const svc = createPowerService({ client: { fetchImpl: f, sleep: async () => {}, maxRetries: 0 }, offline: false, cacheDir: path.join(tmp(), "c") });
    const power = await svc.loadSavedDemoPin("brentwood");
    expect(power.status === "ok" || power.status === "partial").toBe(true);
    expect(power.origin).toBe("saved");
    expect(power.days.length).toBeGreaterThan(14000);

    const crops = usableCrops();
    const built = buildSeasonTable(power, crops);
    expect(built.status).toBe("ok");
    if (built.status !== "ok") return;
    expect(built.table.dataLabel).toMatch(/^Saved response from \d{1,2} \w{3} \d{4}/);
    const result = replayFromSeasonTable(built.table, crops, { rotations: EXAMPLE_ROTATIONS.map(({ name, sequence }) => ({ name, sequence })), supplyMm: EXAMPLE_SUPPLY_MM });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rotations).toHaveLength(3);
    const shortPerDecade = Object.fromEntries(result.rotations.map((r) => [r.name, r.decades.map((d) => d.short)]));
    expect(shortPerDecade).toEqual({
      "Wheat, then maize": [2, 2, 2, 1],
      "Maize, then cotton": [9, 8, 8, 8],
      "Rice, wheat, maize": [6, 4, 4, 6],
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("also works through getPowerData with the offline switch on (Brentwood cell is a saved pin)", async () => {
    const f = throwingFetch();
    const svc = createPowerService({ client: { fetchImpl: f }, offline: true, cacheDir: path.join(tmp(), "c") });
    const power = await svc.getPowerData(37.93, -121.66);
    expect(power.origin).toBe("saved");
    expect(["ok", "partial"]).toContain(power.status);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("offline switch", () => {
  it("returns a structured error (not a mock, not a crash) for a coordinate with no saved response, and never calls fetch", async () => {
    const f = throwingFetch();
    const svc = createPowerService({ client: { fetchImpl: f }, offline: true, cacheDir: path.join(tmp(), "c") });
    const r = await svc.getPowerData(10.5, 20.5);
    expect(r.status).toBe("error");
    expect(r.message).toBe(OFFLINE_MESSAGE);
    expect(r.days).toEqual([]);
    expect(r.coverage).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses a fresh refetch of a saved place too", async () => {
    const f = throwingFetch();
    const svc = createPowerService({ client: { fetchImpl: f }, offline: true, cacheDir: path.join(tmp(), "c") });
    const r = await svc.getPowerData(37.93, -121.66, { fresh: true });
    expect(r.status).toBe("error");
    expect(f).not.toHaveBeenCalled();
  });

  it("reads FIELD_REWIND_OFFLINE", () => {
    expect(offlineFromEnv({ FIELD_REWIND_OFFLINE: "1" })).toBe(true);
    expect(offlineFromEnv({ FIELD_REWIND_OFFLINE: "true" })).toBe(true);
    expect(offlineFromEnv({ FIELD_REWIND_OFFLINE: "0" })).toBe(false);
    expect(offlineFromEnv({})).toBe(false);
  });
});
