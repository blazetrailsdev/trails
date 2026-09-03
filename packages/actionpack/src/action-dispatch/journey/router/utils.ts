export function normalizePath(path: string | null | undefined): string {
  let p = `/${path ?? ""}`.replace(/\/+/g, "/");
  if (p !== "/") {
    if (p.endsWith("/")) p = p.slice(0, -1);
    p = p.replace(/(%[a-f0-9]{2})/g, (m) => m.toUpperCase());
  }
  return p;
}

const UNSAFE_PATH = /[^a-zA-Z0-9\-._~!$&'()*+,;=:@/]/gu;
const UNSAFE_SEGMENT = /[^a-zA-Z0-9\-._~!$&'()*+,;=:@]/gu;
const UNSAFE_FRAGMENT = /[^a-zA-Z0-9\-._~!$&'()*+,;=:@/?]/gu;

function pctEncodeByte(b: number): string {
  return "%" + b.toString(16).toUpperCase().padStart(2, "0");
}

function pctEncode(unsafe: string): string {
  const enc = new TextEncoder().encode(unsafe);
  let out = "";
  for (const b of enc) out += pctEncodeByte(b);
  return out;
}

function escapeWith(component: string, pattern: RegExp): string {
  return component.replace(pattern, (m) => pctEncode(m));
}

export function escapePath(path: string): string {
  return escapeWith(path, UNSAFE_PATH);
}

export function escapeSegment(segment: string): string {
  return escapeWith(segment, UNSAFE_SEGMENT);
}

export function escapeFragment(fragment: string): string {
  return escapeWith(fragment, UNSAFE_FRAGMENT);
}

export function rackEscape(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

export function unescapeUri(uri: string): string {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  let i = 0;
  while (i < uri.length) {
    if (uri[i] === "%" && i + 2 < uri.length) {
      const hex = uri.slice(i + 1, i + 3);
      if (/^[a-fA-F0-9]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    }
    const cp = uri.codePointAt(i)!;
    for (const b of encoder.encode(String.fromCodePoint(cp))) bytes.push(b);
    i += cp > 0xffff ? 2 : 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}
