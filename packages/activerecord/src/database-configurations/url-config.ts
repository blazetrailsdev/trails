/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::UrlConfig
 *
 * A configuration built from a connection URL. Parses the URL into a
 * config hash and merges with any provided configuration overrides.
 */
import { NotImplementedError } from "../errors.js";
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
    super(envName, name, { ...configuration, ...buildUrlHash(url) });
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

// Mirrors: UrlConfig#build_url_hash
// jdbc:/http:/https: URLs are passed through untouched — they're adapter-specific
// connection strings, not URIs we should decompose. Strings without a leading
// scheme (e.g. SQLite ":memory:" or a bare filesystem path) are also passed
// through — they're not URLs at all, and Rails' URI parser accepts them as
// opaque but our JS URL parser doesn't.
/** @internal */
function buildUrlHash(url: string): DatabaseConfigOptions {
  if (
    !url ||
    url.startsWith("jdbc:") ||
    url.startsWith("http:") ||
    url.startsWith("https:") ||
    // Windows drive-letter paths (e.g. "C:\\path\\db.sqlite3") are filesystem
    // paths, not URLs, even though they have a single-letter "scheme".
    /^[A-Za-z]:[\\/]/.test(url) ||
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)
  ) {
    return { url };
  }
  return new ConnectionUrlResolver(url).toHash();
}

/** @internal */
function toBooleanBang(configurationHash: any, key: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations::UrlConfig#to_boolean! is not implemented",
  );
}
