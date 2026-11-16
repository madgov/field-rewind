import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGeminiCaller, ModelError, RESPONSE_SCHEMA } from "./model";

// A local stand-in for the Gemini HTTP endpoint. It checks what the real SDK sends and returns Gemini-shaped answers.
// It proves the adapter's request shape and error mapping only; it is NOT a test of Google's service or of any model's output.
let server: http.Server;
let base = "";
type Mode = "ok" | "429" | "403" | "404" | "500" | "503" | "empty" | "blocked" | "hang" | "truncated";
let mode: Mode = "ok";
/** Overrides `mode` for a single model name found in the request path. */
let perModel: Record<string, Mode> = {};
const sockets = new Set<import("node:net").Socket>();
let last: { url: string; headers: http.IncomingHttpHeaders; body: Record<string, unknown> } | null = null;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    sockets.add(req.socket);
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      last = { url: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : {} };
      const hit = Object.keys(perModel).find((m) => (req.url ?? "").includes(`/${m}:`));
      const m: Mode = hit ? perModel[hit] : mode;
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (m === "429") return send(429, { error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } });
      if (m === "403") return send(403, { error: { code: 403, message: "bad key", status: "PERMISSION_DENIED" } });
      if (m === "404") return send(404, { error: { code: 404, message: "model not found", status: "NOT_FOUND" } });
      if (m === "503") return send(503, { error: { code: 503, message: "high demand", status: "UNAVAILABLE" } });
      if (m === "hang") return;
      if (m === "truncated") return send(200, { candidates: [{ content: { role: "model", parts: [{ text: '{"sections":[{"id":"wat' }] }, finishReason: "MAX_TOKENS" }] });
      if (m === "500") return send(500, { error: { code: 500, message: "oops", status: "INTERNAL" } });
      if (m === "empty") return send(200, { candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP" }] });
      if (m === "blocked") return send(200, { promptFeedback: { blockReason: "SAFETY" } });
      send(200, { candidates: [{ content: { role: "model", parts: [{ text: '{"sections":[],"notAvailable":[]}' }] }, finishReason: "STOP" }] });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => { sockets.forEach((x) => x.destroy()); server.close(() => r()); }));

const REQ = { system: "SYS", user: "USER", schema: RESPONSE_SCHEMA };
const caller = () => createGeminiCaller("TEST_KEY_NOT_REAL", "test-model", { baseUrl: base });

describe("Gemini adapter against a local stand-in", () => {
  it("sends the model, system instruction, JSON mime type and schema, with the key in a header and not in the body", async () => {
    mode = "ok";
    const out = await caller()(REQ);
    expect(out.text).toBe('{"sections":[],"notAvailable":[]}');
    expect(last!.url).toContain("test-model:generateContent");
    expect(last!.headers["x-goog-api-key"]).toBe("TEST_KEY_NOT_REAL");
    const body = JSON.stringify(last!.body);
    expect(body).not.toContain("TEST_KEY_NOT_REAL");
    expect(body).toContain("SYS");
    expect(body).toContain("USER");
    expect(body).toContain("application/json");
    expect(body).toContain("notAvailable");
  });

  it("maps 429 to rate-limited, 403 to key-rejected, 500 to unavailable", async () => {
    for (const [m, kind] of [["429", "rate-limited"], ["403", "key-rejected"], ["500", "unavailable"]] as const) {
      mode = m;
      await expect(caller()(REQ)).rejects.toMatchObject({ kind });
    }
  });

  it("a 404 names GEMINI_MODEL and the model that was tried", async () => {
    mode = "404";
    await expect(caller()(REQ)).rejects.toMatchObject({ kind: "model-missing", message: expect.stringContaining("GEMINI_MODEL") });
    await expect(caller()(REQ)).rejects.toMatchObject({ message: expect.stringContaining("test-model") });
  });

  it("reports an empty answer and a blocked prompt instead of returning text", async () => {
    mode = "empty";
    await expect(caller()(REQ)).rejects.toMatchObject({ kind: "empty" });
    mode = "blocked";
    await expect(caller()(REQ)).rejects.toMatchObject({ kind: "blocked" });
    await expect(caller()(REQ)).rejects.toBeInstanceOf(ModelError);
  });

  it("a busy first model (503) falls through to the next model, and the model that answered is named", async () => {
    mode = "ok";
    perModel = { "busy-model": "503" };
    const c = createGeminiCaller("TEST_KEY_NOT_REAL", ["busy-model", "second-model"], { baseUrl: base });
    const out = await c(REQ);
    expect(out.model).toBe("second-model");
    expect(last!.url).toContain("second-model:generateContent");
    perModel = {};
  });

  it("a one-off 503 gets one quick retry on the same model before any fallback", async () => {
    let calls = 0;
    const orig = server.listeners("request")[0] as (req: http.IncomingMessage, res: http.ServerResponse) => void;
    server.removeAllListeners("request");
    server.on("request", (req, res) => {
      calls++;
      if (calls === 1) {
        req.resume();
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: 503, message: "high demand", status: "UNAVAILABLE" } }));
      } else orig(req, res);
    });
    mode = "ok";
    perModel = {};
    const out = await createGeminiCaller("K", ["only-model", "never-used"], { baseUrl: base, busyRetryDelayMs: 5 })(REQ);
    expect(out.model).toBe("only-model");
    expect(calls).toBe(2);
    server.removeAllListeners("request");
    server.on("request", orig);
  });

  it("a model that never answers is abandoned after the timeout and the next model is used", async () => {
    perModel = { "slow-model": "hang" };
    const c = createGeminiCaller("TEST_KEY_NOT_REAL", ["slow-model", "fast-model"], { baseUrl: base, timeoutMs: 300 });
    const out = await c(REQ);
    expect(out.model).toBe("fast-model");
    perModel = {};
  });

  it("when every model is busy the error says so; a rejected key does not try other models", async () => {
    perModel = { a: "503", b: "429" };
    await expect(createGeminiCaller("K", ["a", "b"], { baseUrl: base })(REQ)).rejects.toMatchObject({ kind: "rate-limited" });
    perModel = { a: "403", b: "ok" };
    await expect(createGeminiCaller("K", ["a", "b"], { baseUrl: base })(REQ)).rejects.toMatchObject({ kind: "key-rejected" });
    expect(last!.url).toContain("/a:");
    perModel = {};
  });

  it("a timeout with no other model is reported as unavailable and names the model", async () => {
    perModel = { only: "hang" };
    await expect(createGeminiCaller("K", "only", { baseUrl: base, timeoutMs: 200 })(REQ)).rejects.toMatchObject({ kind: "unavailable", message: expect.stringContaining("only") });
    perModel = {};
  });

  it("a reply cut off at the output limit is refused, not passed on as text, and does not try other models", async () => {
    perModel = { cut: "truncated", other: "ok" };
    await expect(createGeminiCaller("K", ["cut", "other"], { baseUrl: base })(REQ)).rejects.toMatchObject({ kind: "truncated" });
    perModel = {};
  });

  it("asks for low thinking and a large output limit", async () => {
    mode = "ok";
    await caller()(REQ);
    const cfg = JSON.stringify(last!.body);
    expect(cfg).toContain("maxOutputTokens\":16384");
    expect(cfg).toMatch(/thinkingLevel/i);
  });

  it("reports an unreachable service as unavailable", async () => {
    const dead = createGeminiCaller("TEST_KEY_NOT_REAL", "m", { baseUrl: "http://127.0.0.1:1" });
    await expect(dead(REQ)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
