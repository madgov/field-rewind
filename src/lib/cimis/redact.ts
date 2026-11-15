/** Replace the value of any appKey= query parameter. Safe on URLs and on free text that quotes a URL. */
export function redactUrl(text: string): string {
  return text.replace(/(appKey=)[^&\s"'<>)\]]*/gi, "$1REDACTED");
}

/** Remove the key itself (anywhere, e.g. echoed in an error body) and any appKey= value. */
export function redactText(text: string, key?: string | null): string {
  let out = redactUrl(text);
  if (key && key.length >= 4) out = out.split(key).join("REDACTED");
  return out;
}
