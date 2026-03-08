/**
 * ActionDispatch::Request
 *
 * Wraps a Rack environment hash and provides convenience accessors
 * mirroring the Rails Request API.
 */

import type { RackEnv } from "@rails-ts/rack";

export class Request {
  readonly env: RackEnv;

  constructor(env: RackEnv = {}) {
    this.env = { ...env };
    // Set defaults
    this.env["REQUEST_METHOD"] ??= "GET";
    this.env["SERVER_NAME"] ??= "localhost";
    this.env["SERVER_PORT"] ??= "80";
    this.env["PATH_INFO"] ??= "/";
    this.env["QUERY_STRING"] ??= "";
    this.env["rack.url_scheme"] ??= "http";
    this.env["rack.input"] ??= "";
  }

  // --- HTTP method ---

  get method(): string {
    // Check for method override via _method parameter or X-Http-Method-Override header
    if (this.requestMethod === "POST") {
      const override =
        (this.env["HTTP_X_HTTP_METHOD_OVERRIDE"] as string) ??
        this.params?.["_method"];
      if (override) {
        const upper = String(override).toUpperCase();
        if (["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(upper)) {
          return upper;
        }
      }
    }
    return this.requestMethod;
  }

  get requestMethod(): string {
    return ((this.env["REQUEST_METHOD"] as string) || "GET").toUpperCase();
  }

  get isGet(): boolean { return this.method === "GET"; }
  get isHead(): boolean { return this.method === "HEAD"; }
  get isPost(): boolean { return this.method === "POST"; }
  get isPut(): boolean { return this.method === "PUT"; }
  get isPatch(): boolean { return this.method === "PATCH"; }
  get isDelete(): boolean { return this.method === "DELETE"; }

  // --- URL components ---

  get scheme(): string {
    if (this.env["HTTP_X_FORWARDED_PROTO"]) {
      return (this.env["HTTP_X_FORWARDED_PROTO"] as string).split(",")[0].trim();
    }
    return (this.env["rack.url_scheme"] as string) || "http";
  }

  get ssl(): boolean {
    return this.scheme === "https";
  }

  get host(): string {
    const httpHost = this.env["HTTP_HOST"] as string | undefined;
    if (httpHost) {
      // Strip port from host if present
      return httpHost.replace(/:\d+$/, "");
    }
    return (this.env["SERVER_NAME"] as string) || "localhost";
  }

  get rawHost(): string {
    return (this.env["HTTP_HOST"] as string) ||
      `${this.env["SERVER_NAME"]}:${this.env["SERVER_PORT"]}`;
  }

  get port(): number {
    const httpHost = this.env["HTTP_HOST"] as string | undefined;
    if (httpHost) {
      const match = httpHost.match(/:(\d+)$/);
      if (match) return parseInt(match[1], 10);
    }
    return parseInt((this.env["SERVER_PORT"] as string) || "80", 10);
  }

  get standardPort(): number {
    return this.scheme === "https" ? 443 : 80;
  }

  get isStandardPort(): boolean {
    return this.port === this.standardPort;
  }

  get optionalPort(): string {
    return this.isStandardPort ? "" : `:${this.port}`;
  }

  get portString(): string {
    return this.isStandardPort ? "" : `:${this.port}`;
  }

  get hostWithPort(): string {
    return `${this.host}${this.portString}`;
  }

  get serverPort(): number {
    return parseInt((this.env["SERVER_PORT"] as string) || "80", 10);
  }

  // --- Path ---

  get path(): string {
    return (this.env["PATH_INFO"] as string) || "/";
  }

  get queryString(): string {
    return (this.env["QUERY_STRING"] as string) || "";
  }

  get fullpath(): string {
    const qs = this.queryString;
    return qs ? `${this.path}?${qs}` : this.path;
  }

  get originalFullpath(): string {
    return (this.env["ORIGINAL_FULLPATH"] as string) || this.fullpath;
  }

  get originalUrl(): string {
    return `${this.scheme}://${this.hostWithPort}${this.originalFullpath}`;
  }

  get url(): string {
    return `${this.scheme}://${this.hostWithPort}${this.fullpath}`;
  }

  // --- Domain / subdomains ---

  domain(tldLength = 1): string {
    const parts = this.host.split(".");
    return parts.slice(-(tldLength + 1)).join(".");
  }

  subdomains(tldLength = 1): string[] {
    const parts = this.host.split(".");
    return parts.slice(0, -(tldLength + 1));
  }

  subdomain(tldLength = 1): string {
    return this.subdomains(tldLength).join(".");
  }

  // --- Headers ---

  get contentType(): string | undefined {
    const ct = this.env["CONTENT_TYPE"] as string | undefined;
    if (!ct) return undefined;
    return ct.split(";")[0].trim() || undefined;
  }

  get mediaType(): string | undefined {
    return this.contentType;
  }

  get contentLength(): number | undefined {
    const cl = this.env["CONTENT_LENGTH"] as string | undefined;
    if (!cl) return undefined;
    const n = parseInt(cl, 10);
    return isNaN(n) ? undefined : n;
  }

  get userAgent(): string {
    return (this.env["HTTP_USER_AGENT"] as string) || "";
  }

  get accept(): string {
    return (this.env["HTTP_ACCEPT"] as string) || "";
  }

  get ifNoneMatch(): string | undefined {
    return this.env["HTTP_IF_NONE_MATCH"] as string | undefined;
  }

  get ifNoneMatchEtags(): string[] {
    const header = this.ifNoneMatch;
    if (!header) return [];
    return header.split(",").map(s => s.trim()).filter(Boolean);
  }

  // --- Request type checks ---

  get isXmlHttpRequest(): boolean {
    return (this.env["HTTP_X_REQUESTED_WITH"] as string)?.toLowerCase() === "xmlhttprequest";
  }

  get xhr(): boolean {
    return this.isXmlHttpRequest;
  }

  // --- IP addresses ---

  get remoteIp(): string {
    // Check for ActionDispatch::RemoteIp result first
    if (this.env["action_dispatch.remote_ip"]) {
      return String(this.env["action_dispatch.remote_ip"]);
    }
    // Fall back to REMOTE_ADDR
    return (this.env["REMOTE_ADDR"] as string) || "127.0.0.1";
  }

  get ip(): string {
    return this.remoteIp;
  }

  // --- Body ---

  get body(): string {
    const input = this.env["rack.input"];
    if (typeof input === "string") return input;
    return "";
  }

  get rawPost(): string {
    if (this.env["RAW_POST_DATA"]) {
      return String(this.env["RAW_POST_DATA"]);
    }
    return this.body;
  }

  // --- Parameters ---

  get params(): Record<string, string> | undefined {
    return this.env["action_dispatch.request.parameters"] as Record<string, string> | undefined;
  }

  get pathParameters(): Record<string, string> {
    return (this.env["action_dispatch.request.path_parameters"] as Record<string, string>) || {};
  }

  // --- Format ---

  get format(): string | undefined {
    // Check explicit format parameter
    const paramFormat = this.params?.["format"];
    if (paramFormat) return paramFormat;

    // Check path extension
    const ext = this.path.match(/\.(\w+)$/);
    if (ext) return ext[1];

    // Infer from Accept header
    const accept = this.accept;
    if (!accept || accept === "*/*") return "html";
    if (accept.includes("text/html")) return "html";
    if (accept.includes("application/xhtml+xml")) return "html";
    if (accept.includes("application/xml") || accept.includes("text/xml")) return "xml";
    if (accept.includes("text/plain")) return "text";
    if (accept.includes("application/json")) return "json";

    return undefined;
  }

  // --- Server software ---

  get serverSoftware(): string {
    return ((this.env["SERVER_SOFTWARE"] as string) || "").split("/")[0] || "";
  }

  // --- Variant ---

  private _variant: symbol | symbol[] | undefined;

  get variant(): symbol | symbol[] | undefined {
    return this._variant;
  }

  set variant(value: symbol | symbol[] | undefined) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v !== "symbol") {
          throw new TypeError("Variant must be a symbol or array of symbols");
        }
      }
    } else if (value !== undefined && typeof value !== "symbol") {
      throw new TypeError("Variant must be a symbol or array of symbols");
    }
    this._variant = value;
  }

  // --- Inspect ---

  inspect(): string {
    return `#<ActionDispatch::Request ${this.method} "${this.fullpath}">`;
  }

  // --- Session ---

  get session(): Record<string, unknown> {
    return (this.env["rack.session"] as Record<string, unknown>) || {};
  }

  // --- Static factory ---

  static create(env: RackEnv = {}): Request {
    return new Request(env);
  }
}
