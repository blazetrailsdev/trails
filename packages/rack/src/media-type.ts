const SPLIT_PATTERN = /[;,]/;

export function type(contentType: string | null | undefined): string | null {
  if (!contentType || contentType.length === 0) return null;
  const t = contentType.split(SPLIT_PATTERN, 2)[0];
  return t.trimEnd().toLowerCase();
}

export function params(contentType: string | null | undefined): Record<string, string> {
  if (!contentType || contentType.length === 0) return {};
  const parts = contentType.split(SPLIT_PATTERN);
  const result: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const s = parts[i].trim();
    const eqIdx = s.indexOf("=");
    let k: string, v: string;
    if (eqIdx === -1) {
      k = s;
      v = "";
    } else {
      k = s.substring(0, eqIdx);
      v = stripDoubleQuotes(s.substring(eqIdx + 1));
    }
    result[k.toLowerCase()] = v;
  }
  return result;
}

function stripDoubleQuotes(str: string | undefined): string {
  if (str && str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return str || "";
}
