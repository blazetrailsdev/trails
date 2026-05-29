/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::UrlConfig
 *
 * A configuration built from a connection URL. Parses the URL into a
 * config hash and merges with any provided configuration overrides.
 */
import { HashConfig } from "./hash-config.js";
import type { DatabaseConfigOptions } from "./database-config.js";
import { ConnectionUrlResolver } from "./connection-url-resolver.js";

export class UrlConfig extends HashConfig {
  readonly url: string;

  constructor(
    envName: string,
    name: string,
    url: string,
    configuration: DatabaseConfigOptions = {},
  ) {
    const urlHash = buildUrlHash(url);
    normalizeUrlHash(urlHash);
    super(envName, name, { ...configuration, ...urlHash });
    this.url = url;
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

// Mirrors: UrlConfig#initialize coercions — rename snake_case URL params to
// camelCase and coerce string booleans, matching Rails' post-merge fixups.
function normalizeUrlHash(hash: Record<string, unknown>): void {
  if ("schema_dump" in hash) {
    hash.schemaDump = hash.schema_dump === "false" ? false : hash.schema_dump;
    delete hash.schema_dump;
  } else if (hash.schemaDump === "false") {
    hash.schemaDump = false;
  }
  if ("query_cache" in hash) {
    hash.queryCache = hash.query_cache === "false" ? false : hash.query_cache;
    delete hash.query_cache;
  } else if (hash.queryCache === "false") {
    hash.queryCache = false;
  }
  if ("database_tasks" in hash) {
    const raw = hash.database_tasks;
    hash.databaseTasks = typeof raw === "string" ? raw !== "false" : raw;
    delete hash.database_tasks;
  }
  if (typeof hash.replica === "string") {
    hash.replica = hash.replica !== "false";
  }
}

// Mirrors: UrlConfig#build_url_hash
// jdbc:/http:/https: URLs are passed through untouched — they're adapter-specific
// connection strings, not URIs we should decompose.
/** @internal */
function buildUrlHash(url: string): DatabaseConfigOptions {
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
    return { url };
  }
  return new ConnectionUrlResolver(url).toHash();
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
