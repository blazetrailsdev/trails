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
import { ActiveRecord } from "../ar-config.js";

export class ConnectionUrlResolver {
  private readonly _adapter: string | null;
  private readonly _parsed: URL | null;
  private readonly _opaque: string | null;
  private readonly _query: string | null;
  private readonly _emptyAuthority: boolean;

  /**
   * @missingRailsCall parse — PERMANENT. Verified per-site (RFC 0106):
   *   `uri_parser.parse(url)` (`connection_url_resolver.rb:27`) —
   *   `URI::RFC2396_Parser` splits opaque (`scheme:path`) from hierarchical
   *   URIs, which WHATWG `new URL()` does not, so the constructor splits the
   *   scheme itself and only reaches `new URL()` for the hierarchical arm.
   * @missingRailsCall query — PERMANENT. Verified per-site (RFC 0106): `@uri.query`
   *   (`connection_url_resolver.rb:32`) — WHATWG `URL` spells the query
   *   component `search` (leading `?` included), so there is no `query` call for
   *   the comparator to credit.
   * @missingRailsCall split — PERMANENT. Name-collision false positive (story
   *   relation-delegation-rails-named-methods): exposing the `delegate ... to:
   *   :records` set under Rails names made `split`/`reverse`/`rindex` recognized
   *   ported method names, so this unrelated call to String#split /
   *   Array#reverse / String#rindex on a non-Relation receiver is flagged by the
   *   name-based wide call-set check.
   */
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

    this._adapter = ActiveRecord.protocolAdapters[scheme] ?? scheme;

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
   *
   * Merge precedence lives in {@link rawConfig}: hierarchical URIs let query
   * params win (Rails `reverse_merge`); opaque URIs let structural fields win
   * (Rails `merge`).
   */
  toHash(): DatabaseConfigOptions {
    const config: Record<string, unknown> = this.rawConfig();

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
    // `Hash[(@query || "").split("&").map { |pair| pair.split("=", 2) }]`
    // (connection_url_resolver.rb:61). Ruby's two-argument `String#split` keeps
    // the remainder in the last field, where JS' `split("=", 2)` discards it, so
    // the pair split is spelled with `indexOf`.
    return Object.fromEntries(
      (this._query ?? "")
        .split("&")
        .map((pair): [string, string] => {
          const eqIdx = pair.indexOf("=");
          return eqIdx === -1 ? [pair, ""] : [pair.slice(0, eqIdx), pair.slice(eqIdx + 1)];
        })
        .filter(([key]) => key !== ""),
    );
  }

  /**
   * @internal
   *
   * @missingRailsCall merge — PERMANENT. Verified per-site (RFC 0106):
   *   `query_hash.merge(...)` / `.reverse_merge(...)`
   *   (`connection_url_resolver.rb:64-77`) — a non-mutating Hash merge is an
   *   object spread in TS; the two precedences are the two spread orders.
   */
  private rawConfig(): Record<string, unknown> {
    if (this._opaque !== null) {
      // Opaque URI (Rails: query_hash.merge(adapter:, database:)) — structural
      // fields win over query params, so they are spread last.
      return {
        ...this.queryHash(),
        adapter: this._adapter,
        database: this._opaque,
      };
    }

    const parsed = this._parsed!;
    // When we used a placeholder host to work around WHATWG's empty-authority
    // misparse (http:///path), the hostname is "placeholder" — discard it.
    const hostname = this._emptyAuthority ? "" : parsed.hostname;
    // Hierarchical URI (Rails: query_hash.reverse_merge(...)) — query params win
    // over structural fields, so they are spread last.
    return {
      adapter: this._adapter,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: this.databaseFromPath(),
      // URL API wraps IPv6 addresses in brackets; strip them to match Rails behavior
      host: hostname ? hostname.replace(/^\[(.+)\]$/, "$1") : undefined,
      ...this.queryHash(),
    };
  }

  /**
   * @internal
   *
   * @missingRailsCall path — PERMANENT. Verified per-site (RFC 0106): `uri.path`
   *   (`connection_url_resolver.rb:94-100`) — WHATWG `URL` spells the path
   *   component `pathname`, so no `path` call is emitted.
   */
  private databaseFromPath(): string | undefined {
    const path = this._parsed?.pathname;
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
