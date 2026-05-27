/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::ConnectionUrlResolver
 *
 * Expands a connection string into a config hash.
 *
 * Example:
 *   const url = "postgresql://foo:bar@localhost:9000/foo_test?pool=5";
 *   new ConnectionUrlResolver(url).toHash();
 *   // => { adapter: "postgresql", host: "localhost", port: 9000,
 *   //      database: "foo_test", username: "foo", password: "bar", pool: "5" }
 */
import type { DatabaseConfigOptions } from "./database-config.js";

// Scheme-to-adapter mapping (Rails' ActiveRecord.protocol_adapters).
// E.g., "postgres" → "postgresql".
const PROTOCOL_ADAPTERS: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql2",
  mysql2: "mysql2",
  sqlite: "sqlite3",
  sqlite3: "sqlite3",
};

export class ConnectionUrlResolver {
  private readonly _adapter: string | null;
  private readonly _parsed: URL | null;
  private readonly _opaque: string | null;
  private readonly _query: string | null;
  private readonly _emptyAuthority: boolean;

  constructor(url: string) {
    if (!url || url.trim() === "") {
      throw new Error("Database URL cannot be empty");
    }

    // Attempt to parse as a standard URL (scheme://...). Opaque URIs
    // (scheme:path, no //) need special handling — URL parser treats them
    // as hierarchical but with empty host. For SQLite's "sqlite3:foo.db"
    // (relative path), we detect and handle as opaque.
    const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(\/\/)?(.*)$/);
    if (!schemeMatch) {
      throw new Error(`Invalid database URL: ${redactUrl(url)}`);
    }

    // URI schemes are case-insensitive (RFC 3986 §3.1) — Ruby's URI parser
    // lowercases on read. Match that so `Postgres://...` resolves correctly.
    const scheme = schemeMatch[1].toLowerCase().replace(/-/g, "_");
    const hasAuthority = !!schemeMatch[2];
    const rest = schemeMatch[3];

    this._adapter = PROTOCOL_ADAPTERS[scheme] ?? scheme;

    if (hasAuthority) {
      // Standard URL: scheme://user:pass@host:port/path?query
      // Swap to http:// for URL parser (it only supports certain schemes).
      // WHATWG URL misparses `http:///path` (empty authority) by treating the
      // first path segment as hostname. Detect the empty-authority case and
      // prepend a placeholder host so parsing is correct, then discard it.
      const emptyAuthority = rest.startsWith("/");
      const normalized = emptyAuthority ? `http://placeholder${rest}` : `http://${rest}`;
      try {
        this._parsed = new URL(normalized);
        this._emptyAuthority = emptyAuthority;
        this._opaque = null;
        this._query = this._parsed.search ? this._parsed.search.slice(1) : null;
      } catch {
        throw new Error(`Invalid database URL: ${redactUrl(url)}`);
      }
    } else {
      this._emptyAuthority = false;
      // Opaque URI: scheme:path[?query]
      const queryIdx = rest.indexOf("?");
      if (queryIdx >= 0) {
        this._opaque = rest.slice(0, queryIdx);
        this._query = rest.slice(queryIdx + 1);
      } else {
        this._opaque = rest;
        this._query = null;
      }
      this._parsed = null;
    }
  }

  /**
   * Mirrors: ConnectionUrlResolver#to_hash
   */
  toHash(): DatabaseConfigOptions {
    // Mirrors Rails: query_hash.reverse_merge(...) — query params take precedence
    // over structural fields (adapter, host, etc.) from the URL authority.
    const config: Record<string, unknown> = { ...this.rawConfig(), ...this.queryHash() };

    // Remove null/undefined/empty values (Rails: compact_blank)
    for (const key of Object.keys(config)) {
      const val = config[key];
      if (val === null || val === undefined || val === "") {
        delete config[key];
      }
    }

    // URI-decode string values
    for (const key of Object.keys(config)) {
      const val = config[key];
      if (typeof val === "string") {
        try {
          config[key] = decodeURIComponent(val);
        } catch {
          // leave as-is if decoding fails
        }
      }
    }

    return config as DatabaseConfigOptions;
  }

  /** @internal */
  private get uri(): URL | null {
    return this._parsed;
  }

  /** @internal */
  private get uriParser(): { unescape(s: string): string } {
    return { unescape: decodeURIComponent };
  }

  /** @internal */
  private get resolvedAdapter(): string | null {
    return this._adapter;
  }

  /** @internal */
  private queryHash(): Record<string, string> {
    if (!this._query) return {};
    const result: Record<string, string> = {};
    for (const pair of this._query.split("&")) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx === -1) {
        if (pair) result[pair] = "";
      } else {
        const k = pair.slice(0, eqIdx);
        const v = pair.slice(eqIdx + 1);
        if (k) result[k] = v;
      }
    }
    return result;
  }

  /** @internal */
  private rawConfig(): Record<string, unknown> {
    if (this._opaque !== null) {
      // Opaque URI: adapter + database (from opaque part)
      return {
        adapter: this._adapter,
        database: this._opaque,
      };
    }

    const parsed = this._parsed!;
    // When we used a placeholder host to work around WHATWG's empty-authority
    // misparse (http:///path), the hostname is "placeholder" — discard it.
    const hostname = this._emptyAuthority ? "" : parsed.hostname;
    return {
      adapter: this._adapter,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: this.databaseFromPath(parsed.pathname),
      // URL API wraps IPv6 addresses in brackets; strip them to match Rails behavior
      host: hostname ? hostname.replace(/^\[(.+)\]$/, "$1") : undefined,
    };
  }

  /** @internal */
  private databaseFromPath(path: string): string | undefined {
    if (!path) return undefined;
    // SQLite uses the full path as database name; others strip the leading slash
    if (this._adapter === "sqlite3") {
      return path;
    }
    return path.startsWith("/") ? path.slice(1) : path;
  }
}

// Strip user:pass@ from scheme://user:pass@host... so errors can be safely
// logged without leaking credentials embedded in connection URLs.
function redactUrl(url: string): string {
  return url.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1***@");
}
