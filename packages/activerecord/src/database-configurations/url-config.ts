/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::UrlConfig
 *
 * A configuration built from a connection URL. Parses the URL into a
 * config hash and merges with any provided configuration overrides.
 */
import { HashConfig } from "./hash-config.js";
import { _setConfigurationHash, type DatabaseConfigOptions } from "./database-config.js";
import { ConnectionUrlResolver } from "./connection-url-resolver.js";
import { inferAdapterNameFromUrl } from "../connection-adapters/adapter-args.js";

export class UrlConfig extends HashConfig {
  readonly url: string;

  /**
   * @missingRailsCall merge — PERMANENT: Verified per-site (RFC 0106):
   *   `@configuration_hash.merge(build_url_hash)` (`url_config.rb:43`) — a
   *   non-mutating Hash merge is an object spread in TS.
   */
  constructor(
    envName: string,
    name: string,
    url: string,
    configuration: DatabaseConfigOptions = {},
  ) {
    super(envName, name, configuration);

    this.url = url;
    // `@configuration_hash = @configuration_hash.merge(build_url_hash)`
    // (url_config.rb:43) — a non-mutating Hash merge is an object spread in TS,
    // and the base class freezes its hash, so the result goes through the
    // internal writer rather than assigning the (readonly) accessor.
    const configurationHash: Record<string, unknown> = {
      ...this.configurationHash,
      ...this.buildUrlHash(),
    };
    camelizeUrlKeys(configurationHash);

    if (configurationHash.schemaDump === "false") {
      configurationHash.schemaDump = false;
    }

    if (configurationHash.queryCache === "false") {
      configurationHash.queryCache = false;
    }

    toBooleanBang(configurationHash, "replica");
    toBooleanBang(configurationHash, "databaseTasks");

    _setConfigurationHash(this, configurationHash as DatabaseConfigOptions);
  }

  // Mirrors: UrlConfig#build_url_hash
  // jdbc:/http:/https: URLs are passed through untouched — they're adapter-specific
  // connection strings, not URIs we should decompose.
  /** @internal */
  private buildUrlHash(): DatabaseConfigOptions {
    const url = this.url;
    if (
      !url ||
      url.startsWith("jdbc:") ||
      url.startsWith("http:") ||
      url.startsWith("https:") ||
      // Windows drive-letter paths (e.g. "C:\\path\\db.sqlite3") are filesystem
      // paths, not URLs, even though they have a single-letter "scheme".
      /^[A-Za-z]:[\\/]/.test(url)
    ) {
      return { url };
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      // Scheme-less string. Rails' URI parser turns a bare word ("foo", "foo-bar")
      // into `{ database: "foo" }`, overriding the config's database. Filesystem-style
      // SQLite connection strings (":memory:", bare paths with "/", "\\" or ".")
      // are not database names — pass those through as `{ url }` unchanged so the
      // UrlConfig#database accessor can fall back to the path.
      if (/^[A-Za-z0-9_-]+$/.test(url)) {
        return { database: url };
      }
      // Scheme-less SQLite shorthand (`:memory:`, bare `.sqlite3`/`.db` paths).
      // Rails' URL configs always parse a scheme, so their configuration_hash
      // always carries an adapter; trails' scheme-less shorthand otherwise
      // wouldn't. Infer it here at build time so the resolved config already
      // names its adapter and the handler's resolvePoolConfig doesn't have to
      // raise AdapterNotSpecified (no connect-time backfill needed).
      const adapter = inferAdapterNameFromUrl(url);
      return adapter ? { url, adapter } : { url };
    }
    return new ConnectionUrlResolver(url).toHash();
  }

  // Mirrors Rails' UrlConfig — when the configuration hash doesn't carry an
  // explicit `database`, fall back to parsing the URL's path. Necessary for
  // URL-only sqlite configs (`{ adapter: "sqlite3", url: "db/test.sqlite3" }`)
  // where buildUrlHash leaves `configuration.database` undefined: callers
  // like TestDatabases.create_and_load_schema rely on `db_config.database`.
  override get database(): string | undefined {
    const explicit = super.database;
    if (explicit !== undefined) return explicit;
    return databaseFromUrl(this.url);
  }
}

function databaseFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  // Mirror buildUrlHash: Windows drive-letter paths (e.g. `C:/db.sqlite3`)
  // are valid WHATWG URLs (`protocol: "c:"`) but they're filesystem
  // paths, not URIs. URL parsing would silently drop the drive letter.
  if (/^[A-Za-z]:[\\/]/.test(url)) return url;
  try {
    const parsed = new URL(url);
    // Mirrors Rails: the database name is only ever derived from the URL
    // path, never the host. URLs like `postgres://localhost` (no path)
    // legitimately have no database name — falling back to `host` would
    // silently mask a misconfiguration and route reconnects/creation at
    // a database called "localhost".
    const path = parsed.pathname.replace(/^\//, "");
    return path || undefined;
  } catch {
    // Bare filesystem paths and `:memory:` aren't parseable URLs but are
    // the database name themselves.
    return url;
  }
}

// A URL query string carries the Ruby key spelling verbatim
// (`?schema_dump=false`), so the config keys it produces are renamed to the
// camelCase spellings `url_config.rb:45-56` reads before Rails' own coercions
// run. Rails has no counterpart: its keys are already symbols.
function camelizeUrlKeys(hash: Record<string, unknown>): void {
  for (const [snake, camel] of [
    ["schema_dump", "schemaDump"],
    ["query_cache", "queryCache"],
    ["database_tasks", "databaseTasks"],
  ] as const) {
    if (snake in hash) {
      hash[camel] = hash[snake];
      delete hash[snake];
    }
  }
}

/**
 * Convert a string value at `key` in `configurationHash` to a boolean in-place.
 * String "false" → false; any other string → true. Non-string values are untouched.
 *
 * Mirrors: ActiveRecord::DatabaseConfigurations::UrlConfig#to_boolean! (private)
 *
 * @internal
 */
export function toBooleanBang(configurationHash: Record<string, unknown>, key: string): void {
  if (typeof configurationHash[key] === "string") {
    configurationHash[key] = configurationHash[key] !== "false";
  }
}
