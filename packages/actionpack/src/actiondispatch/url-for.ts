/**
 * ActionDispatch::Http::URL / ActionController::UrlFor
 *
 * URL generation from options hash, mirroring Rails' url_for behavior.
 */

export interface UrlOptions {
  protocol?: string;
  host?: string;
  port?: number | string;
  path?: string;
  anchor?: string;
  trailing_slash?: boolean;
  only_path?: boolean;
  subdomain?: string;
  domain?: string;
  tld_length?: number;
  user?: string;
  password?: string;
  params?: Record<string, unknown>;
  script_name?: string;
}

export function urlFor(options: UrlOptions = {}): string {
  const protocol = normalizeProtocol(options.protocol ?? "http");
  const host = options.host;
  const onlyPath = options.only_path ?? false;

  if (!onlyPath && !host) {
    throw new Error("Missing host to link to! Please provide the :host parameter, set default_url_options[:host], or set :only_path to true");
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

  // Anchor
  if (options.anchor !== undefined) {
    if (options.anchor === "") {
      // empty anchor — no fragment
    } else {
      path = path + "#" + encodeURIComponent(options.anchor);
    }
  }

  if (onlyPath) {
    return path;
  }

  // Build full URL
  let portStr = "";
  if (options.port) {
    const port = typeof options.port === "string" ? parseInt(options.port, 10) : options.port;
    const defaultPort = protocol === "https" ? 443 : 80;
    if (port !== defaultPort) {
      portStr = `:${port}`;
    }
  }

  let userInfo = "";
  if (options.user) {
    if (options.password) {
      userInfo = `${encodeURIComponent(options.user)}:${encodeURIComponent(options.password)}@`;
    } else {
      userInfo = `${encodeURIComponent(options.user)}@`;
    }
  }

  const hostStr = options.host ?? "localhost";
  const scriptName = options.script_name ?? "";

  return `${protocol}://${userInfo}${hostStr}${portStr}${scriptName}${path}`;
}

function normalizeProtocol(proto: string): string {
  return proto.replace(/:\/\/$/, "").replace(/:$/, "");
}

function buildQueryString(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}%5B%5D=${encodeURIComponent(String(v))}`);
      }
    } else if (typeof value === "object") {
      for (const [subKey, subVal] of Object.entries(value as Record<string, unknown>)) {
        if (subVal !== null && subVal !== undefined) {
          parts.push(`${encodeURIComponent(key)}%5B${encodeURIComponent(subKey)}%5D=${encodeURIComponent(String(subVal))}`);
        }
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}
