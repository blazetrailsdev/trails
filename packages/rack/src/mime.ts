import { MIME_TYPES } from "./mime-types.js";

export { MIME_TYPES };

export function mimeType(ext: string, fallback: string | null = "application/octet-stream"): string | null {
  const key = ext.toLowerCase();
  return key in MIME_TYPES ? MIME_TYPES[key] : fallback;
}

export function match(value: string, matcher: string): boolean {
  const [v1, v2] = value.split("/", 2);
  const [m1, m2] = matcher.split("/", 2);
  return (m1 === "*" || v1 === m1) && (m2 === undefined || m2 === "*" || m2 === v2);
}
