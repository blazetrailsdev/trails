import { fetch } from "@blazetrails/ruby-compat";
import { MIME_TYPES } from "./mime-types.js";

export { MIME_TYPES };

export function mimeType(
  ext: string,
  fallback: string | null = "application/octet-stream",
): string | null {
  return fetch(MIME_TYPES, String(ext).toLowerCase(), fallback);
}

export function match(value: string, matcher: string): boolean {
  const [v1, v2] = value.split("/", 2);
  const [m1, m2] = matcher.split("/", 2);
  return (m1 === "*" || v1 === m1) && (m2 === undefined || m2 === "*" || m2 === v2);
}
