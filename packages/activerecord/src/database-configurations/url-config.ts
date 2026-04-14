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
    super(envName, name, { ...configuration, ...buildUrlHash(url) });
    this.url = url;
  }
}

// Mirrors: UrlConfig#build_url_hash
// jdbc:/http:/https: URLs are passed through untouched — they're adapter-specific
// connection strings, not URIs we should decompose. Strings without a leading
// scheme (e.g. SQLite ":memory:" or a bare filesystem path) are also passed
// through — they're not URLs at all, and Rails' URI parser accepts them as
// opaque but our JS URL parser doesn't.
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
