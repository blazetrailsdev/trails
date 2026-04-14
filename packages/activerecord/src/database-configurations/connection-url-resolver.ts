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
  sqlite: "sqlite3",
};

export class ConnectionUrlResolver {
  private readonly _adapter: string | null;
  private readonly _parsed: URL | null;
  private readonly _opaque: string | null;
  private readonly _query: string | null;

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
      // Swap to http:// for URL parser (it only supports certain schemes),
      // then extract the parts.
      const normalized = `http://${rest}`;
      try {
        this._parsed = new URL(normalized);
        this._opaque = null;
        this._query = this._parsed.search ? this._parsed.search.slice(1) : null;
      } catch {
        throw new Error(`Invalid database URL: ${redactUrl(url)}`);
      }
    } else {
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
    const config: Record<string, unknown> = { ...this._queryHash(), ...this._rawConfig() };

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

  private _queryHash(): Record<string, string> {
    if (!this._query) return {};
    const result: Record<string, string> = {};
    for (const pair of this._query.split("&")) {
      const [k, v] = pair.split("=", 2);
      if (k) result[k] = v ?? "";
    }
    return result;
  }

  private _rawConfig(): Record<string, unknown> {
    if (this._opaque !== null) {
      // Opaque URI: adapter + database (from opaque part)
      return {
        adapter: this._adapter,
        database: this._opaque,
      };
    }

    const parsed = this._parsed!;
    return {
      adapter: this._adapter,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: this._databaseFromPath(parsed.pathname),
      host: parsed.hostname || undefined,
    };
  }

  private _databaseFromPath(path: string): string | undefined {
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
