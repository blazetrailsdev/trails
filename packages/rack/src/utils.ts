import { HTTP_COOKIE, SET_COOKIE, CONTENT_LENGTH, CONTENT_TYPE, TRANSFER_ENCODING, STATUS_WITH_NO_ENTITY_BODY } from "./constants.js";
import * as RackMime from "./mime.js";

export { STATUS_WITH_NO_ENTITY_BODY };

// Re-export errors
export class ParameterTypeError extends Error {
  constructor(message: string) { super(message); this.name = "ParameterTypeError"; }
}
export class InvalidParameterError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidParameterError"; }
}
export class ParamsTooDeepError extends Error {
  constructor(message: string) { super(message); this.name = "ParamsTooDeepError"; }
}

let _paramDepthLimit = 32;

export function getParamDepthLimit(): number { return _paramDepthLimit; }
export function setParamDepthLimit(v: number): void { _paramDepthLimit = v; }

export function clockTime(): number {
  return performance.now() / 1000;
}

export function escape(s: string | { toString(): string }): string {
  return encodeURIComponent(String(s)).replace(/%20/g, "+");
}

export function escapePath(s: string): string {
  return encodeURI(s);
}

export function unescapePath(s: string): string {
  return decodeURI(s);
}

export function unescape(s: string): string {
  return decodeURIComponent(s.replace(/\+/g, " "));
}

export function parseQuery(qs: string, separator?: string): Record<string, string | string[] | null> {
  if (!qs) return {};
  const sep = separator ? new RegExp(`[${separator.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`) : /[&]/;
  const result: Record<string, string | string[] | null> = {};

  for (const part of qs.split(sep)) {
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    let key: string, value: string | null;
    if (eqIdx === -1) {
      key = unescape(part);
      value = null;
    } else {
      key = unescape(part.substring(0, eqIdx));
      value = unescape(part.substring(eqIdx + 1));
    }
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value as string);
      } else {
        result[key] = [existing as string, value as string];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function parseNestedQuery(qs: string | null | undefined, _separator?: string): Record<string, any> {
  if (!qs) return {};
  const result: Record<string, any> = {};

  for (const part of qs.split(/&/)) {
    if (!part) continue;
    const eqIdx = part.indexOf("=");
    let key: string, value: string | null;
    if (eqIdx === -1) {
      key = unescape(part);
      value = null;
    } else {
      key = unescape(part.substring(0, eqIdx));
      value = unescape(part.substring(eqIdx + 1));
    }
    normalizeParams(result, key, value, 0);
  }
  return result;
}

function normalizeParams(params: any, name: string, v: string | null, depth: number): void {
  if (depth >= _paramDepthLimit) {
    throw new ParamsTooDeepError("param depth limit exceeded");
  }

  // Simple key: "foo"
  if (!name.includes("[")) {
    params[name] = v;
    return;
  }

  // Parse bracket notation
  const match = name.match(/^([^\[]*)((?:\[[^\]]*\])*)$/);
  if (!match || !match[1]) {
    // Keys like "[]", "[a]" etc with no prefix
    params[name] = v;
    return;
  }

  const prefix = match[1];
  const rest = match[2];

  if (!rest || rest === "") {
    params[prefix] = v;
    return;
  }

  // Extract bracket segments
  const brackets = rest.match(/\[[^\]]*\]/g) || [];

  // Check if there's trailing content after the last bracket
  const fullBrackets = brackets.join("");
  const afterBrackets = rest.substring(fullBrackets.length);

  if (afterBrackets) {
    // e.g. "g[h]i=8" => brackets = ["[h]"], afterBrackets = "i"
    // Treat as nested with the last key including the remainder
    const keys = [prefix, ...brackets.map(b => b.slice(1, -1))];
    const lastKey = keys.pop()!;
    const realLastKey = lastKey + afterBrackets;
    let current = params;
    for (const k of keys) {
      if (!(k in current) || typeof current[k] !== "object" || Array.isArray(current[k])) {
        current[k] = {};
      }
      current = current[k];
    }
    current[realLastKey] = v;
    return;
  }

  const keys = brackets.map(b => b.slice(1, -1));
  setNestedValue(params, prefix, keys, v, depth);
}

function setNestedValue(params: any, prefix: string, keys: string[], v: string | null, depth: number): void {
  if (depth >= _paramDepthLimit) {
    throw new ParamsTooDeepError("param depth limit exceeded");
  }

  if (keys.length === 0) {
    // Direct assignment
    if (prefix in params) {
      const existing = params[prefix];
      if (typeof existing === "string" || existing === null) {
        params[prefix] = v;
      } else if (Array.isArray(existing)) {
        // Overwrite array with scalar
        params[prefix] = v;
      } else {
        // It's a hash - type error
        throw new ParameterTypeError(`expected Hash (got String) for param \`${prefix}'`);
      }
    } else {
      params[prefix] = v;
    }
    return;
  }

  const firstKey = keys[0];
  const restKeys = keys.slice(1);

  if (firstKey === "") {
    // Array push: foo[]=bar
    if (!(prefix in params)) {
      params[prefix] = [];
    }
    const arr = params[prefix];
    if (!Array.isArray(arr)) {
      if (typeof arr === "string" || arr === null) {
        throw new ParameterTypeError(`expected Array (got ${typeof arr === "string" ? "String" : "NilClass"}) for param \`${prefix}'`);
      }
      throw new ParameterTypeError(`expected Array (got ${arr?.constructor?.name || typeof arr}) for param \`${prefix}'`);
    }

    if (restKeys.length === 0) {
      arr.push(v);
    } else {
      // Nested within array: foo[][bar]=1
      if (arr.length === 0 || shouldStartNewHash(arr[arr.length - 1], restKeys)) {
        arr.push({});
      }
      const lastItem = arr[arr.length - 1];
      setNestedValue(lastItem, restKeys[0], restKeys.slice(1), v, depth + 1);
    }
    return;
  }

  // Hash key: foo[bar]
  if (!(prefix in params)) {
    params[prefix] = {};
  }
  const container = params[prefix];
  if (typeof container === "string" || container === null) {
    throw new ParameterTypeError(`expected Hash (got String) for param \`${prefix}'`);
  }
  if (Array.isArray(container)) {
    throw new ParameterTypeError(`expected Array (got ${container.constructor.name}) for param \`${prefix}'`);
  }
  setNestedValue(container, firstKey, restKeys, v, depth + 1);
}

function shouldStartNewHash(lastItem: any, keys: string[]): boolean {
  if (typeof lastItem !== "object" || lastItem === null || Array.isArray(lastItem)) return true;
  // Start a new hash if the first non-array key already exists
  let current = lastItem;
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === "") return false; // Array access, don't decide here
    if (keys[i] in current) {
      if (i === keys.length - 1) return true; // leaf key already exists
      current = current[keys[i]];
      if (typeof current !== "object" || current === null || Array.isArray(current)) return true;
    } else {
      return false;
    }
  }
  return false;
}

export function buildQuery(params: Record<string, string | string[] | null>): string {
  return Object.entries(params).map(([k, v]) => {
    if (Array.isArray(v)) {
      return v.map(x => `${escape(k)}=${escape(x)}`).join("&");
    }
    return v === null || v === undefined ? escape(k) : `${escape(k)}=${escape(v)}`;
  }).join("&");
}

export function buildNestedQuery(value: any, prefix?: string): string {
  if (Array.isArray(value)) {
    return value.map(v => buildNestedQuery(v, `${prefix}[]`)).join("&");
  } else if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => buildNestedQuery(v, prefix ? `${prefix}[${k}]` : k))
      .filter(s => s.length > 0)
      .join("&");
  } else if (value === null || value === undefined) {
    if (prefix === undefined) throw new ArgumentError("value must be a Hash");
    return escape(prefix);
  } else {
    if (prefix === undefined) throw new ArgumentError("value must be a Hash");
    return `${escape(prefix)}=${escape(String(value))}`;
  }
}

export class ArgumentError extends Error {
  constructor(message: string) { super(message); this.name = "ArgumentError"; }
}

export function qValues(header: string): [string, number][] {
  if (!header) return [];
  return header.split(",").map(part => {
    const [value, ...paramParts] = part.split(";").map(s => s.trim());
    let quality = 1.0;
    const params = paramParts.join(";");
    const match = params.match(/q=([\d.]+)/);
    if (match) quality = parseFloat(match[1]);
    return [value, quality] as [string, number];
  });
}

export function forwardedValues(header: string | null | undefined): Record<string, string[]> | null {
  if (!header) return null;
  header = header.replace(/\n/g, ";");
  const result: Record<string, string[]> = {};

  for (const field of header.split(";")) {
    for (const pair of field.split(",")) {
      const trimmed = pair.trim().replace(/\s*=\s*/, "=");
      if (!trimmed) continue;
      const match = trimmed.match(/^(by|for|host|proto)="?([^"]+)"?$/i);
      if (!match) return null;
      const key = match[1].toLowerCase();
      if (!result[key]) result[key] = [];
      result[key].push(match[2]);
    }
  }
  return result;
}

export function bestQMatch(header: string, availableMimes: string[]): string | null {
  const values = qValues(header);
  let bestMatch: string | null = null;
  let bestScore = -Infinity;

  for (const [reqMime, quality] of values) {
    const match = availableMimes.find(am => RackMime.match(am, reqMime));
    if (!match) continue;
    const wildcards = (match.split("/", 2).filter(p => p === "*").length) * -10;
    const score = wildcards + quality;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = match;
    }
  }
  return bestMatch;
}

export function escapeHtml(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}

export function selectBestEncoding(available: string[], acceptEncoding: [string, number][]): string | null {
  const expanded: [string, number, number][] = [];

  for (const [m, q] of acceptEncoding) {
    const preference = available.indexOf(m);
    const pref = preference === -1 ? available.length : preference;

    if (m === "*") {
      const acceptNames = acceptEncoding.map(a => a[0]);
      for (const m2 of available.filter(a => !acceptNames.includes(a))) {
        expanded.push([m2, q, pref]);
      }
    } else {
      expanded.push([m, q, pref]);
    }
  }

  const candidates = expanded
    .sort((a, b) => a[1] !== b[1] ? b[1] - a[1] : a[2] - b[2])
    .map(e => e[0]);

  if (!candidates.includes("identity")) {
    candidates.push("identity");
  }

  for (const [m, q] of expanded) {
    if (q === 0.0) {
      const idx = candidates.indexOf(m);
      if (idx !== -1) candidates.splice(idx, 1);
    }
  }

  for (const c of candidates) {
    if (available.includes(c)) return c;
  }
  return null;
}

export function parseCookiesHeader(value: string | null | undefined): Record<string, string> {
  if (!value) return {};
  const cookies: Record<string, string> = {};
  for (const cookie of value.split(/; */)) {
    if (!cookie) continue;
    const eqIdx = cookie.indexOf("=");
    let key: string, val: string;
    if (eqIdx === -1) {
      key = cookie;
      val = "";
    } else {
      key = cookie.substring(0, eqIdx);
      val = cookie.substring(eqIdx + 1);
    }
    try {
      if (!(key in cookies)) cookies[key] = unescape(val);
    } catch {
      if (!(key in cookies)) cookies[key] = val;
    }
  }
  return cookies;
}

export function parseCookies(env: Record<string, any>): Record<string, string> {
  return parseCookiesHeader(env[HTTP_COOKIE]);
}

const VALID_COOKIE_KEY = /^[!#$%&'*+\-.^_`|~0-9a-zA-Z]+$/;

export function setCookieHeader(key: string, value: string | string[] | Record<string, any>): string {
  if (!VALID_COOKIE_KEY.test(key)) {
    throw new ArgumentError(`invalid cookie key: ${JSON.stringify(key)}`);
  }

  let domain = "", path = "", maxAge = "", expires = "", secure = "", httponly = "", sameSite = "", partitioned = "";
  let values: string[];

  if (typeof value === "object" && !Array.isArray(value)) {
    const opts = value as Record<string, any>;
    if (opts.domain) domain = `; domain=${opts.domain}`;
    if (opts.path) path = `; path=${opts.path}`;
    if (opts.max_age !== undefined) maxAge = `; max-age=${opts.max_age}`;
    if (opts.expires) expires = `; expires=${httpDate(opts.expires)}`;
    if (opts.secure) secure = "; secure";
    if ("httponly" in opts ? opts.httponly : opts.http_only) httponly = "; httponly";
    if (opts.same_site !== undefined && opts.same_site !== false && opts.same_site !== null) {
      const ss = opts.same_site;
      if (ss === "none" || ss === "None") sameSite = "; samesite=none";
      else if (ss === "lax" || ss === "Lax") sameSite = "; samesite=lax";
      else if (ss === true || ss === "strict" || ss === "Strict") sameSite = "; samesite=strict";
      else throw new ArgumentError(`Invalid :same_site value: ${JSON.stringify(ss)}`);
    }
    if (opts.partitioned) partitioned = "; partitioned";
    const v = opts.value;
    values = Array.isArray(v) ? v : [v ?? ""];
  } else if (Array.isArray(value)) {
    values = value;
  } else {
    values = [value];
  }

  return `${key}=${values.map(v => escape(v)).join("&")}${domain}${path}${maxAge}${expires}${secure}${httponly}${sameSite}${partitioned}`;
}

export function setCookieHeaderBang(headers: Record<string, any>, key: string, value: any): void {
  const header = headers[SET_COOKIE];
  if (header) {
    if (Array.isArray(header)) {
      header.push(setCookieHeader(key, value));
    } else {
      headers[SET_COOKIE] = [header, setCookieHeader(key, value)];
    }
  } else {
    headers[SET_COOKIE] = setCookieHeader(key, value);
  }
}

function httpDate(date: Date): string {
  return date.toUTCString().replace(/GMT$/, "GMT");
}

export function deleteSetCookieHeader(key: string, value: Record<string, any> = {}): string {
  return setCookieHeader(key, { ...value, max_age: "0", expires: new Date(0), value: "" });
}

export function deleteSetCookieHeaderBang(header: string[] | string | null, key: string, value: Record<string, any> = {}): string | string[] {
  if (header !== null && header !== undefined) {
    const arr = Array.isArray(header) ? header : [header];
    arr.push(deleteSetCookieHeader(key, value));
    return arr;
  }
  return deleteSetCookieHeader(key, value);
}

export function deleteCookieHeaderBang(headers: Record<string, any>, key: string, value: Record<string, any> = {}): null {
  headers[SET_COOKIE] = deleteSetCookieHeaderBang(headers[SET_COOKIE], key, value);
  return null;
}

export function rfc2822(time: Date): string {
  // Format: "Thu, 01 Jan 1970 00:00:00 -0000"
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = days[time.getUTCDay()];
  const day = String(time.getUTCDate()).padStart(2, "0");
  const mon = months[time.getUTCMonth()];
  const year = time.getUTCFullYear();
  const h = String(time.getUTCHours()).padStart(2, "0");
  const m = String(time.getUTCMinutes()).padStart(2, "0");
  const s = String(time.getUTCSeconds()).padStart(2, "0");
  return `${d}, ${day} ${mon} ${year} ${h}:${m}:${s} -0000`;
}

export function byteRanges(env: Record<string, any>, size: number): [number, number][] | null {
  return getByteRanges(env["HTTP_RANGE"], size);
}

export function getByteRanges(httpRange: string | null | undefined, size: number): [number, number][] | null {
  if (size === 0) return null;
  if (!httpRange) return null;
  const match = httpRange.match(/bytes=([^;]+)/);
  if (!match) return null;
  const ranges: [number, number][] = [];

  for (const spec of match[1].split(/,[ \t]*/)) {
    if (!spec.includes("-")) return null;
    const parts = spec.split("-");
    let r0s = parts[0], r1s = parts[1];
    let r0: number, r1: number;

    if (!r0s || r0s === "") {
      if (r1s === undefined || r1s === null || r1s === "") return null;
      r0 = size - parseInt(r1s, 10);
      if (r0 < 0) r0 = 0;
      r1 = size - 1;
    } else {
      r0 = parseInt(r0s, 10);
      if (!r1s || r1s === "") {
        r1 = size - 1;
      } else {
        r1 = parseInt(r1s, 10);
        if (r1 < r0) return null;
        if (r1 >= size) r1 = size - 1;
      }
    }
    if (r0 <= r1) ranges.push([r0, r1]);
  }

  // Check if sum of ranges exceeds size
  const totalBytes = ranges.reduce((sum, [a, b]) => sum + (b - a + 1), 0);
  if (totalBytes > size) return [];

  return ranges;
}

export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export function statusCode(status: number | string | symbol): number {
  if (typeof status === "number") return status;
  const s = String(status);
  // Try numeric parse first
  const num = parseInt(s, 10);
  if (!isNaN(num) && String(num) === s) return num;
  // Symbol/string lookup
  const code = SYMBOL_TO_STATUS_CODE[s];
  if (code !== undefined) return code;
  const obsolete = OBSOLETE_SYMBOLS_TO_STATUS_CODES[s];
  if (obsolete !== undefined) {
    let msg = `Status code ${JSON.stringify(s)} is deprecated and will be removed in a future version of Rack.`;
    const mapping = OBSOLETE_SYMBOL_MAPPINGS[s];
    if (mapping) msg += ` Please use ${JSON.stringify(mapping)} instead.`;
    console.warn(msg);
    return obsolete;
  }
  throw new ArgumentError(`Unrecognized status code :${s}`);
}

export const HTTP_STATUS_CODES: Record<number, string> = {
  100: "Continue", 101: "Switching Protocols", 102: "Processing", 103: "Early Hints",
  200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information",
  204: "No Content", 205: "Reset Content", 206: "Partial Content",
  207: "Multi-Status", 208: "Already Reported", 226: "IM Used",
  300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other",
  304: "Not Modified", 305: "Use Proxy", 307: "Temporary Redirect", 308: "Permanent Redirect",
  400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden",
  404: "Not Found", 405: "Method Not Allowed", 406: "Not Acceptable",
  407: "Proxy Authentication Required", 408: "Request Timeout", 409: "Conflict",
  410: "Gone", 411: "Length Required", 412: "Precondition Failed", 413: "Content Too Large",
  414: "URI Too Long", 415: "Unsupported Media Type", 416: "Range Not Satisfiable",
  417: "Expectation Failed", 421: "Misdirected Request", 422: "Unprocessable Content",
  423: "Locked", 424: "Failed Dependency", 425: "Too Early", 426: "Upgrade Required",
  428: "Precondition Required", 429: "Too Many Requests", 431: "Request Header Fields Too Large",
  451: "Unavailable For Legal Reasons", 500: "Internal Server Error", 501: "Not Implemented",
  502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout",
  505: "HTTP Version Not Supported", 506: "Variant Also Negotiates",
  507: "Insufficient Storage", 508: "Loop Detected", 511: "Network Authentication Required",
};

const SYMBOL_TO_STATUS_CODE: Record<string, number> = {};
for (const [code, msg] of Object.entries(HTTP_STATUS_CODES)) {
  SYMBOL_TO_STATUS_CODE[msg.toLowerCase().replace(/[\s-]/g, "_")] = parseInt(code);
}

const OBSOLETE_SYMBOLS_TO_STATUS_CODES: Record<string, number> = {
  payload_too_large: 413,
  unprocessable_entity: 422,
  bandwidth_limit_exceeded: 509,
  not_extended: 510,
};

const OBSOLETE_SYMBOL_MAPPINGS: Record<string, string> = {
  payload_too_large: "content_too_large",
  unprocessable_entity: "unprocessable_content",
};

export function cleanPathInfo(pathInfo: string): string {
  const parts = pathInfo.split(/[/\\]/);
  const clean: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") { clean.pop(); continue; }
    clean.push(part);
  }
  let result = clean.join("/");
  if (parts.length === 0 || parts[0] === "") result = "/" + result;
  return result;
}

export function validPath(path: string): boolean {
  return !path.includes("\0");
}

// Context utility
export class Context {
  readonly for: any;
  readonly app: any;

  constructor(appF: any, appR: any) {
    if (!appF || typeof appF.context !== "function") {
      throw new Error("running context does not respond to #context");
    }
    this.for = appF;
    this.app = appR;
  }

  call(env: any): any {
    return this.for.context(env, this.app);
  }

  recontext(app: any): Context {
    return new Context(this.for, app);
  }

  context(env: any, app: any = this.app): any {
    return this.recontext(app).call(env);
  }
}
