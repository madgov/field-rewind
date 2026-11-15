// Test-only fixtures shaped like the documented CIMIS JSON response (https://et.water.ca.gov/Rest/Index).
export function rec(date: string, value: string | null, qc = " ", unit = "(mm)", station = "47") {
  return { Date: date, Julian: "1", Station: station, Standard: "metric", ZipCodes: "94548", Scope: "daily", DayAsceEto: { Value: value, Qc: qc, Unit: unit } };
}
export function body(records: unknown[]) {
  return { Data: { Providers: [{ Name: "cimis", Type: "station", Owner: "water.ca.gov", Records: records }] } };
}
export function jsonRes(status: number, payload: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(text, { status, headers });
}
