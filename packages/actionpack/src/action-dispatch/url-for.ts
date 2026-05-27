/**
 * ActionDispatch::Http::URL / ActionController::UrlFor
 *
 * URL generation from options hash, mirroring Rails' url_for behavior.
 */

export interface UrlOptions {
  protocol?: string | false;
  host?: string;
  port?: number | string;
  path?: string;
  anchor?: string | { toParam(): string };
  trailing_slash?: boolean;
  only_path?: boolean;
  subdomain?: string | false | { toString(): string };
  domain?: string;
  tld_length?: number;
  user?: string;
  password?: string;
  params?: Record<string, unknown>;
  script_name?: string;
  original_script_name?: string;
}

export function urlFor(options: UrlOptions = {}): string {
  const protocol = normalizeProtocol(options.protocol ?? "http");
  const onlyPath = options.only_path ?? false;

  // Subdomain / domain rewriting
  let host = options.host;
  if (host !== undefined) {
    if (options.subdomain !== undefined) {
      host = rewriteSubdomain(host, options.subdomain, options.tld_length ?? 1);
    } else if (options.domain !== undefined) {
      host = rewriteDomain(host, options.domain, options.tld_length ?? 1);
    }
  }

  if (!onlyPath && !host) {
    throw new Error(
      "Missing host to link to! Please provide the :host parameter, set default_url_options[:host], or set :only_path to true",
    );
  }

  let path = options.path ?? "/";

  // Trailing slash
  if (options.trailing_slash && !path.endsWith("/")) {
    path = path + "/";
  }

  // Params
  if (options.params && Object.keys(options.params).length > 0) {
    const qs = buildQueryString(options.params);
    if (qs) {
      path = path + "?" + qs;
    }
  }

  // Anchor — encode unsafe chars but preserve RFC 3986 §3.3 safe pchar
  if (options.anchor !== undefined && options.anchor !== null) {
    const anchorStr =
      typeof options.anchor === "object" ? options.anchor.toParam() : options.anchor;
    if (anchorStr !== "") {
      path = path + "#" + encodeAnchor(String(anchorStr));
    }
  }

  if (onlyPath) {
    return path;
  }

  // Build full URL
  let portStr = "";
  if (options.port) {
    const port = typeof options.port === "string" ? parseInt(options.port, 10) : options.port;
    const defaultPort = protocol === "https://" ? 443 : 80;
    if (port !== defaultPort) {
      portStr = `:${port}`;
    }
  }

  let userInfo = "";
  if (options.user) {
    if (options.password) {
      userInfo = `${rackEscape(options.user)}:${rackEscape(options.password)}@`;
    } else {
      userInfo = `${rackEscape(options.user)}@`;
    }
  }

  const hostStr = host ?? "localhost";
  const scriptName =
    options.original_script_name != null
      ? options.original_script_name + (options.script_name ?? "")
      : (options.script_name ?? "");

  return `${protocol}${userInfo}${hostStr}${portStr}${scriptName}${path}`;
}

/**
 * Rewrite host subdomain. Mirrors ActionDispatch::Http::URL.rewrite_subdomain.
 * @internal
 */
function rewriteSubdomain(
  host: string,
  subdomain: string | false | { toString(): string },
  tldLength: number,
): string {
  // IP addresses are left unchanged
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;

  const parts = host.split(".");
  // domain = last (tld_length + 1) components, per Rails' domain_from()
  const domain = parts.slice(-(tldLength + 1)).join(".");

  if (subdomain === false || subdomain === "") return domain;

  const sub = typeof subdomain === "object" ? subdomain.toString() : (subdomain as string);
  return sub ? `${sub}.${domain}` : domain;
}

/**
 * Rewrite host domain. Mirrors ActionDispatch::Http::URL.rewrite_domain.
 * @internal
 */
function rewriteDomain(host: string, domain: string, tldLength: number): string {
  const parts = host.split(".");
  const subdomainParts = parts.slice(0, -(tldLength + 1));
  const subdomain = subdomainParts.join(".");
  return subdomain ? `${subdomain}.${domain}` : domain;
}

/** @internal */
function normalizeProtocol(proto: string | false): string {
  if (proto === false || proto === "//") return "//";
  const p = String(proto)
    .replace(/:\/\/$/, "")
    .replace(/:$/, "");
  return `${p}://`;
}

/** @internal */
function rackEscape(s: string): string {
  // Matches Rack::Utils.escape: encodes !'()* and converts %20 → +
  return encodeURIComponent(s)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%20/g, "+");
}

/**
 * Encode an anchor fragment: encode unsafe chars but preserve RFC 3986 §3.3 safe pchar.
 * @internal
 */
function encodeAnchor(anchor: string): string {
  return anchor
    .split("")
    .map((c) => (/[A-Za-z0-9\-._~!$&'()*+,;=:@]/.test(c) ? c : encodeURIComponent(c)))
    .join("");
}

/** @internal */
function buildQueryString(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const encodedKey = prefix
      ? `${prefix}%5B${encodeURIComponent(key)}%5D`
      : encodeURIComponent(key);

    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodedKey}%5B%5D=${encodeURIComponent(String(v))}`);
      }
    } else if (typeof value === "object") {
      const nested = buildQueryString(value as Record<string, unknown>, encodedKey);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodedKey}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}
