import {
  REQUEST_METHOD, SERVER_NAME, SERVER_PORT, SERVER_PROTOCOL,
  QUERY_STRING, PATH_INFO, SCRIPT_NAME, RACK_URL_SCHEME,
  RACK_INPUT, RACK_SESSION, RACK_SESSION_OPTIONS,
  HTTP_HOST, HTTP_PORT, HTTPS, HTTP_COOKIE,
  CONTENT_TYPE, CONTENT_LENGTH,
  GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS,
  RACK_REQUEST_QUERY_HASH, RACK_REQUEST_QUERY_STRING,
  RACK_REQUEST_FORM_HASH, RACK_REQUEST_FORM_INPUT,
  RACK_REQUEST_FORM_VARS, RACK_REQUEST_FORM_PAIRS,
  RACK_REQUEST_COOKIE_HASH, RACK_REQUEST_COOKIE_STRING,
} from "./constants.js";
import { parseNestedQuery } from "./utils.js";
import * as MediaTypeModule from "./media-type.js";

const FORM_DATA_MEDIA_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
];

function parseCookies(cookieStr: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieStr) return cookies;
  for (const pair of cookieStr.split(/;\s*/)) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const key = pair.substring(0, eqIdx).trim();
    const val = pair.substring(eqIdx + 1).trim();
    if (key && !(key in cookies)) {
      cookies[key] = val;
    }
  }
  return cookies;
}

function isTrustedProxy(ip: string): boolean {
  if (!ip) return false;
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|::1|fd|fc)/i.test(ip.trim());
}

export class Request {
  env: Record<string, any>;

  constructor(env: Record<string, any>) {
    this.env = env;
  }

  dup(): Request {
    return new (this.constructor as typeof Request)({ ...this.env });
  }

  has(key: string): boolean {
    return key in this.env;
  }

  get(key: string, defaultValue?: any): any {
    if (key in this.env) return this.env[key];
    if (typeof defaultValue === "function") return defaultValue();
    return defaultValue;
  }

  set(key: string, value: any): void {
    this.env[key] = value;
  }

  addHeader(key: string, value: string): void {
    const existing = this.env[key];
    if (existing) {
      this.env[key] = existing + "," + value;
    } else {
      this.env[key] = value;
    }
  }

  deleteHeader(key: string): any {
    const val = this.env[key];
    delete this.env[key];
    return val;
  }

  each(callback: (key: string, value: any) => void): void {
    for (const [k, v] of Object.entries(this.env)) {
      callback(k, v);
    }
  }

  get requestMethod(): string { return this.env[REQUEST_METHOD]; }
  get scriptName(): string { return this.env[SCRIPT_NAME] || ""; }
  set scriptName(v: string) { this.env[SCRIPT_NAME] = v; }
  get pathInfo(): string { return this.env[PATH_INFO] || "/"; }
  set pathInfo(v: string) { this.env[PATH_INFO] = v; }
  get queryString(): string { return this.env[QUERY_STRING] || ""; }
  get serverProtocol(): string { return this.env[SERVER_PROTOCOL]; }

  get contentType(): string | null {
    const ct = this.env[CONTENT_TYPE] || this.env["CONTENT_TYPE"];
    if (!ct || ct === "") return null;
    return ct;
  }

  get mediaType(): string | null {
    return MediaTypeModule.type(this.contentType);
  }

  get mediaTypeParams(): Record<string, string> {
    return MediaTypeModule.params(this.contentType);
  }

  get contentLength(): number | null {
    const cl = this.env[CONTENT_LENGTH] || this.env["CONTENT_LENGTH"];
    return cl ? parseInt(cl) : null;
  }

  get scheme(): string {
    const scheme = this.env[RACK_URL_SCHEME];
    if (scheme && scheme !== "http" && scheme !== "https") {
      return "http"; // prevent scheme abuse
    }
    return scheme || "http";
  }

  get ssl(): boolean {
    return this.scheme === "https" || this.env[HTTPS] === "on";
  }

  get host(): string {
    const httpHost = this.env[HTTP_HOST];
    if (httpHost) {
      // Strip port from host
      if (httpHost.includes(":")) {
        return httpHost.split(":")[0];
      }
      return httpHost;
    }
    return this.env[SERVER_NAME] || "localhost";
  }

  get port(): number {
    const httpHost = this.env[HTTP_HOST];
    if (httpHost && httpHost.includes(":")) {
      return parseInt(httpHost.split(":")[1]);
    }
    const httpPort = this.env[HTTP_PORT];
    if (httpPort) return parseInt(httpPort);
    const serverPort = this.env[SERVER_PORT];
    if (serverPort && serverPort !== "80" && serverPort !== "443") return parseInt(serverPort);
    return this.ssl ? 443 : 80;
  }

  get serverPort(): number {
    return parseInt(this.env[SERVER_PORT] || "80");
  }

  get authority(): string {
    const p = this.port;
    if ((this.ssl && p === 443) || (!this.ssl && p === 80)) {
      return this.host;
    }
    return `${this.host}:${p}`;
  }

  get serverAuthority(): string {
    const p = this.serverPort;
    return `${this.env[SERVER_NAME]}:${p}`;
  }

  get hostWithPort(): string {
    return this.authority;
  }

  get baseUrl(): string {
    return `${this.scheme}://${this.authority}${this.scriptName}`;
  }

  get url(): string {
    const qs = this.queryString;
    return `${this.baseUrl}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  get fullpath(): string {
    const qs = this.queryString;
    return `${this.scriptName}${this.pathInfo}${qs ? "?" + qs : ""}`;
  }

  get referrer(): string | null {
    return this.env["HTTP_REFERER"] || null;
  }

  get userAgent(): string | null {
    return this.env["HTTP_USER_AGENT"] || null;
  }

  get xhr(): boolean {
    return (this.env["HTTP_X_REQUESTED_WITH"] || "").toLowerCase() === "xmlhttprequest";
  }

  get prefetch(): boolean {
    const purpose = (this.env["HTTP_X_MOZ"] || "").toLowerCase();
    const secPurpose = (this.env["HTTP_SEC_PURPOSE"] || "").toLowerCase();
    const purpose2 = (this.env["HTTP_PURPOSE"] || "").toLowerCase();
    return purpose === "prefetch" || secPurpose === "prefetch" || purpose2 === "prefetch";
  }

  get cookies(): Record<string, string> {
    const cookieStr = this.env[HTTP_COOKIE] || "";
    if (this.env[RACK_REQUEST_COOKIE_STRING] === cookieStr && this.env[RACK_REQUEST_COOKIE_HASH]) {
      return this.env[RACK_REQUEST_COOKIE_HASH];
    }
    const parsed = parseCookies(cookieStr);
    this.env[RACK_REQUEST_COOKIE_STRING] = cookieStr;
    this.env[RACK_REQUEST_COOKIE_HASH] = parsed;
    return parsed;
  }

  get GET(): Record<string, any> {
    const qs = this.queryString;
    if (this.env[RACK_REQUEST_QUERY_STRING] === qs && this.env[RACK_REQUEST_QUERY_HASH]) {
      return this.env[RACK_REQUEST_QUERY_HASH];
    }
    const parsed = parseNestedQuery(qs);
    this.env[RACK_REQUEST_QUERY_STRING] = qs;
    this.env[RACK_REQUEST_QUERY_HASH] = parsed;
    return parsed;
  }

  get POST(): Record<string, any> {
    if (this.env[RACK_REQUEST_FORM_HASH]) {
      return this.env[RACK_REQUEST_FORM_HASH];
    }

    const input = this.env[RACK_INPUT];
    if (!input) {
      this.env[RACK_REQUEST_FORM_HASH] = {};
      return {};
    }

    const mt = this.mediaType;
    if (!mt || !FORM_DATA_MEDIA_TYPES.includes(mt)) {
      this.env[RACK_REQUEST_FORM_HASH] = {};
      return {};
    }

    let body: string;
    if (typeof input.read === "function") {
      body = input.read() || "";
    } else if (typeof input === "string") {
      body = input;
    } else {
      body = "";
    }

    // Safari sends \0 for empty forms
    if (body === "\0") body = "";

    const parsed = parseNestedQuery(body);
    this.env[RACK_REQUEST_FORM_HASH] = parsed;
    this.env[RACK_REQUEST_FORM_VARS] = body;
    this.env[RACK_REQUEST_FORM_INPUT] = input;
    return parsed;
  }

  get formPairs(): [string, string][] {
    // Use cached form vars if available
    if (this.env[RACK_REQUEST_FORM_VARS] !== undefined) {
      const body = this.env[RACK_REQUEST_FORM_VARS];
      if (!body) return [];
      return this._parseFormPairs(body);
    }

    const input = this.env[RACK_INPUT];
    if (!input) return [];

    const mt = this.mediaType;
    if (!mt || !FORM_DATA_MEDIA_TYPES.includes(mt)) return [];

    let body: string;
    if (typeof input.read === "function") {
      body = input.read() || "";
    } else {
      body = "";
    }

    if (!body) return [];
    return this._parseFormPairs(body);
  }

  private _parseFormPairs(body: string): [string, string][] {
    const pairs: [string, string][] = [];
    for (const part of body.split("&")) {
      if (!part) continue;
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) {
        pairs.push([decodeURIComponent(part), ""]);
      } else {
        pairs.push([
          decodeURIComponent(part.substring(0, eqIdx)),
          decodeURIComponent(part.substring(eqIdx + 1)),
        ]);
      }
    }
    return pairs;
  }

  get params(): Record<string, any> {
    return { ...this.GET, ...this.POST };
  }

  updateParam(key: string, value: any): void {
    const get = this.GET;
    const post = this.POST;
    if (key in post) {
      post[key] = value;
    } else {
      get[key] = value;
    }
  }

  deleteParam(key: string): any {
    const post = this.POST;
    if (key in post) {
      const val = post[key];
      delete post[key];
      return val;
    }
    const get = this.GET;
    if (key in get) {
      const val = get[key];
      delete get[key];
      return val;
    }
    return undefined;
  }

  get session(): Record<string, any> {
    return this.env[RACK_SESSION] || (this.env[RACK_SESSION] = {});
  }

  get sessionOptions(): Record<string, any> {
    return this.env[RACK_SESSION_OPTIONS] || (this.env[RACK_SESSION_OPTIONS] = {});
  }

  get ip(): string {
    const trustedProxyFn = this.env["rack.request.trusted_proxy"];
    const remoteAddr = this.env["REMOTE_ADDR"] || "127.0.0.1";

    // false means trust nothing - just use REMOTE_ADDR
    if (trustedProxyFn === false) {
      return remoteAddr;
    }

    const trustFn: (ip: string) => boolean = trustedProxyFn === true
      ? () => true
      : (typeof trustedProxyFn === "function"
        ? trustedProxyFn
        : isTrustedProxy);

    const forwarded = this.env["HTTP_X_FORWARDED_FOR"];
    const clientIp = this.env["HTTP_CLIENT_IP"];

    if (forwarded) {
      const ips = forwarded.split(",").map((s: string) => s.trim()).filter(Boolean);

      // Check for spoofing: if client-ip not in forwarded chain and not trusted
      if (clientIp) {
        const clientInForwarded = ips.includes(clientIp);
        if (!clientInForwarded && !trustFn(clientIp)) {
          return clientIp;
        }
      }

      // Find the first untrusted IP from the right
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!trustFn(ips[i])) {
          return ips[i];
        }
      }
    }

    if (clientIp && !trustFn(clientIp)) {
      return clientIp;
    }

    return remoteAddr;
  }

  get acceptEncoding(): Array<[string, number]> {
    const header = this.env["HTTP_ACCEPT_ENCODING"] || "";
    return header.split(",").map((part: string) => {
      const [enc, ...rest] = part.trim().split(";");
      let q = 1.0;
      for (const r of rest) {
        const m = r.trim().match(/^q=(.+)/);
        if (m) q = parseFloat(m[1]);
      }
      return [enc.trim(), q] as [string, number];
    }).filter(([enc]: [string, number]) => enc !== "");
  }

  get acceptLanguage(): Array<[string, number]> {
    const header = this.env["HTTP_ACCEPT_LANGUAGE"] || "";
    return header.split(",").map((part: string) => {
      const [lang, ...rest] = part.trim().split(";");
      let q = 1.0;
      for (const r of rest) {
        const m = r.trim().match(/^q=(.+)/);
        if (m) q = parseFloat(m[1]);
      }
      return [lang.trim(), q] as [string, number];
    }).filter(([lang]: [string, number]) => lang !== "");
  }

  isGet(): boolean { return this.requestMethod === GET; }
  isPost(): boolean { return this.requestMethod === POST; }
  isPut(): boolean { return this.requestMethod === PUT; }
  isPatch(): boolean { return this.requestMethod === PATCH; }
  isDelete(): boolean { return this.requestMethod === DELETE; }
  isHead(): boolean { return this.requestMethod === HEAD; }
  isOptions(): boolean { return this.requestMethod === OPTIONS; }
}
