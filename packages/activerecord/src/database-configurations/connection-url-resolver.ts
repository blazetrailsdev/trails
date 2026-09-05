import type { DatabaseConfigOptions } from "./database-config.js";
import { ActiveRecord } from "../ar-config.js";

export class ConnectionUrlResolver {
  private readonly _adapter: string | null;
  private readonly _parsed: URL | null;
  private readonly _opaque: string | null;
  private readonly _query: string | null;
  private readonly _emptyAuthority: boolean;

  /** @missingRailsCall split — PERMANENT */
  constructor(url: string) {
    if (!url || url.trim() === "") {
      throw new Error("Database URL cannot be empty");
    }

    const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(\/\/)?(.*)$/);
    if (!schemeMatch) {
      if (/^[^/?#]*:/.test(url)) {
        throw new Error(`Invalid database URL: ${redactUrl(url)}`);
      }
      this._adapter = null;
      this._opaque = null;
      this._emptyAuthority = true;
      this._parsed = new URL(`http://placeholder/${url.replace(/^\//, "")}`);
      this._query = this._parsed.search ? this._parsed.search.slice(1) : null;
      return;
    }

    const scheme = schemeMatch[1].toLowerCase().replace(/-/g, "_");
    const hasAuthority = !!schemeMatch[2];
    const rest = schemeMatch[3];

    this._adapter = ActiveRecord.protocolAdapters[scheme] ?? scheme;

    if (hasAuthority) {
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

  toHash(): DatabaseConfigOptions {
    const config: Record<string, unknown> = this.rawConfig();

    for (const key of Object.keys(config)) {
      const val = config[key];
      if (val === null || val === undefined || val === "") {
        delete config[key];
      }
    }

    for (const key of Object.keys(config)) {
      const val = config[key];
      if (typeof val === "string") {
        try {
          config[key] = decodeURIComponent(val);
        } catch {}
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
   * @missingRailsCall merge — PERMANENT
   */
  private rawConfig(): Record<string, unknown> {
    if (this._opaque !== null) {
      return {
        ...this.queryHash(),
        adapter: this._adapter,
        database: this._opaque,
      };
    }

    const parsed = this._parsed!;
    const hostname = this._emptyAuthority ? "" : parsed.hostname;
    return {
      adapter: this._adapter,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: this.databaseFromPath(),
      host: hostname ? hostname.replace(/^\[(.+)\]$/, "$1") : undefined,
      ...this.queryHash(),
    };
  }

  /**
   * @internal
   * @missingRailsCall path — PERMANENT
   */
  private databaseFromPath(): string | undefined {
    const path = this._parsed?.pathname;
    if (!path) return undefined;
    if (this._adapter === "sqlite3") {
      return path;
    }
    return path.startsWith("/") ? path.slice(1) : path;
  }
}

function redactUrl(url: string): string {
  return url.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1***@");
}
