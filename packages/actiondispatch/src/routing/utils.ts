/**
 * ActionDispatch::Journey::Router::Utils
 *
 * URI escaping utilities matching Rails behavior.
 */

/** Escape a full path (preserves `/`). */
export function escapePath(path: string): string {
  return path
    .split("/")
    .map((seg) => escapeSegment(seg).replace(/%2B/gi, "+"))
    .join("/");
}

/** Escape a single path segment (encodes `/`). */
export function escapeSegment(segment: string): string {
  return encodeURIComponent(segment)
    .replace(/%20/g, "%20")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/\+/g, "%2B");
}

/** Escape a URI fragment (preserves `/` and `?`). */
export function escapeFragment(fragment: string): string {
  return escapePath(fragment).replace(/%3F/gi, "?");
}

/** Unescape a URI string. */
export function unescapeUri(uri: string): string {
  return decodeURIComponent(uri.replace(/\+/g, "%20"));
}
