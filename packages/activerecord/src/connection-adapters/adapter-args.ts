/**
 * Adapter-argument normalization helpers.
 *
 * Extracted from `connection-handling.ts` so `ConnectionPool.newConnection()`
 * can auto-resolve adapters from `dbConfig.adapter` + `dbConfig.configuration`
 * without back-edging through connection-handling.
 *
 * Mirrors Rails' `ActiveRecord::DatabaseConfigurations::HashConfig#connect`,
 * which builds the adapter constructor argument from the resolved
 * configuration hash.
 *
 * @internal
 */
import { AdapterNotFound } from "../errors.js";

/**
 * Best-effort adapter inference from a connection URL or scheme-less SQLite
 * shorthand. Returns the canonical adapter name, or `undefined` when the URL
 * carries no recognizable scheme/extension (e.g. a bare filesystem path or an
 * opaque `jdbc:` string). Used at config-build time so a scheme-less `:memory:`
 * shorthand already names its adapter on the resolved configuration hash.
 *
 * @internal
 */
export function inferAdapterNameFromUrl(url: string): string | undefined {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgresql";
  }
  if (url.startsWith("mysql://") || url.startsWith("mysql2://")) {
    return "mysql";
  }
  if (
    url.startsWith("sqlite://") ||
    url.startsWith("sqlite3://") ||
    url.endsWith(".sqlite3") ||
    url.endsWith(".db") ||
    url === ":memory:"
  ) {
    return "sqlite";
  }
  return undefined;
}

/**
 * Like {@link inferAdapterNameFromUrl} but raises `AdapterNotFound` when the
 * URL carries no recognizable adapter, for connect-time paths that require one.
 */
export function adapterNameFromUrl(url: string): string {
  const inferred = inferAdapterNameFromUrl(url);
  if (inferred !== undefined) return inferred;
  throw new AdapterNotFound(
    `Cannot detect database adapter from URL "${url}". ` +
      `Use a URL starting with postgres://, mysql://, or sqlite://, ` +
      `or pass { adapter: "postgresql", url: "..." }`,
  );
}

/**
 * Returns true for URL schemes that identify a remote libsql/Turso endpoint.
 * Inlined here (rather than imported from sqlite/libsql.ts) so adapter-args
 * does not transitively load the optional `libsql` native peer dependency.
 */
function isRemoteLibsqlUrl(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("wss://") ||
    url.startsWith("ws://")
  );
}

/**
 * Normalize adapter aliases to their canonical name.
 *
 *   postgres / postgresql          → postgresql
 *   mysql / mysql2                 → mysql
 *   sqlite / sqlite3 / node-sqlite → sqlite
 *
 * SQLite client-library adapters share the `(filename, options)` constructor
 * shape (their subclasses inherit it from `AbstractSQLite3Adapter`), so they
 * normalize to `sqlite` for argument building. This only affects
 * constructor-argument shape; class resolution still keys off the raw name.
 */
export function normalizeAdapterName(name: string): string {
  switch (name) {
    case "postgresql":
    case "postgres":
      return "postgresql";
    case "mysql":
    case "mysql2":
      return "mysql";
    case "sqlite":
    case "sqlite3":
    case "node-sqlite":
    case "expo-sqlite":
    case "libsql":
    case "libsql-remote":
    case "libsql-replica":
      return "sqlite";
    default:
      return name;
  }
}

/**
 * Strip the `sqlite[3]://` URL prefix, returning a bare filename
 * (`":memory:"`, path, or empty → `":memory:"`). Remote libsql URLs
 * (`libsql://`, `http(s)://`, `ws(s)://`) are passed through unchanged so the
 * driver receives the full endpoint URL.
 */
export function parseSqliteUrl(url: string): string {
  if (url.startsWith("sqlite3://") || url.startsWith("sqlite://")) {
    const stripped = url.replace(/^sqlite3?:\/\//, "");
    return stripped || ":memory:";
  }
  return url;
}

/**
 * Build the adapter-constructor argument *tuple* from a configuration hash.
 * Returned as an array so callers can spread directly: `new Klass(...args)`.
 *
 * Shape per adapter:
 *  - SQLite: `[filename, options]` — `SQLite3Adapter(filename, options?)`
 *    preserves SQLite-specific keys (`readonly`, `driver`, `pragmas`,
 *    `strict`, `statementLimit`, `preparedStatements`).
 *  - PG/MySQL: `[config]` — single config object (or URL string).
 *
 * Mirrors the inline normalization in `connectsTo` / `establishWithConfig`
 * and is the resolver used by {@link ConnectionPool#newConnection} when no
 * `adapterFactory` is provided.
 */
export function buildAdapterArg(
  adapterName: string,
  configuration: Record<string, unknown>,
): unknown[] {
  const normalized = normalizeAdapterName(adapterName);
  const url = configuration.url as string | undefined;
  const database = configuration.database as string | undefined;
  if (normalized === "sqlite") {
    // Remote libsql URLs (`libsql://`, `https://`, etc.) in `url` take
    // precedence over `database` — the URL is the connection endpoint, not a
    // local filename. For local adapters, prefer `database` over `url` so
    // caller-mutated configs (e.g. autoConnect per-worker slots) win.
    const resolvedUrl = url !== undefined && isRemoteLibsqlUrl(url) ? url : undefined;
    // Use `||` (not `??`) so empty-string database/url values fall through to
    // the next candidate, matching the pre-existing behaviour of this function.
    const filename = parseSqliteUrl(resolvedUrl || database || url || ":memory:");
    // Keep only the SQLite3Adapter constructor's `options` keys so we don't
    // forward unrelated database.yml entries (pool, host, etc.) into the
    // options object. The adapter ignores unknown keys today but accepting
    // them here would lock in a foot-gun.
    const {
      readonly,
      driver,
      pragmas,
      strict,
      timeout,
      statementLimit,
      preparedStatements,
      driverOptions,
      authToken,
      syncUrl,
    } = configuration;
    const options: Record<string, unknown> = {};
    if (readonly !== undefined) options.readonly = readonly;
    if (driver !== undefined) options.driver = driver;
    if (pragmas !== undefined) options.pragmas = pragmas;
    if (strict !== undefined) options.strict = strict;
    // Rails' SQLite3Adapter reads `@config[:timeout]` and applies it as the
    // driver's busy timeout (sqlite3_adapter.rb:821-826); `config.example.yml:84`
    // sets it on both arunit entries.
    if (timeout !== undefined) options.timeout = timeout;
    if (statementLimit !== undefined) options.statementLimit = statementLimit;
    if (preparedStatements !== undefined) options.preparedStatements = preparedStatements;
    if (driverOptions !== undefined) options.driverOptions = driverOptions;
    // Merge authToken into any pre-existing driverOptions so callers that pass
    // both { authToken, driverOptions: { tls: true } } don't lose the latter.
    // syncUrl (embedded-replica mode) and authToken both belong in
    // driverOptions; merge so callers that also pass a driverOptions object
    // keep its keys.
    if (authToken !== undefined || syncUrl !== undefined) {
      const merged = { ...(options.driverOptions as Record<string, unknown> | undefined) };
      if (authToken !== undefined) merged.authToken = authToken;
      if (syncUrl !== undefined) merged.syncUrl = syncUrl;
      options.driverOptions = merged;
    }
    return Object.keys(options).length > 0 ? [filename, options] : [filename];
  }
  if (url && database === undefined) {
    // A bare URL string is the simplest connection arg, but when the config
    // also carries adapter options (e.g. `advisory_locks`, `prepared_statements`)
    // those must reach the adapter too — Rails' UrlConfig merges the parsed URL
    // with the rest of the configuration hash. Forward the URL under the
    // adapter-specific connection key alongside the remaining options instead
    // of dropping them. Pure-URL configs (no extra keys) keep the `[url]` form.
    // `username` is deliberately NOT remapped here. Rails maps the credential
    // inside the adapter constructor (postgresql_adapter.rb:326), so forward
    // Rails' spelling untouched and let Mysql2Adapter/PostgreSQLAdapter apply
    // the mapping with Ruby-truthiness precedence. Remapping here as well used
    // to shadow the constructor entirely — this layer stripped `username`, so
    // the constructor never saw it — and did so with the wrong precedence.
    const { adapter: _ua, url: _uu, ...urlRest } = configuration;
    if (Object.keys(urlRest).length === 0) {
      return [url];
    }
    const urlKey = normalized === "postgresql" ? "connectionString" : "uri";
    return [{ ...urlRest, [urlKey]: url }];
  }
  // As in the URL branch above: `username` passes through under Rails'
  // spelling and the adapter constructor maps it to the driver-native `user`.
  const { adapter: _a, url: _u, ...rest } = configuration;
  const adapterConfig: Record<string, unknown> = { ...rest };
  // `socket` is deliberately NOT remapped here, for the same reason as
  // `username` above: this layer used to strip it before the adapter saw it,
  // shadowing the constructor entirely. Mysql2Adapter#constructor owns the
  // single `socket` -> `socketPath` mapping; forward Rails' spelling untouched.
  if (normalized === "mysql") {
    // The host default must still look at BOTH spellings — a `socket`-only
    // config is socket-bound even though `socketPath` is not set yet.
    if (adapterConfig.host === undefined && !adapterConfig.socketPath && !adapterConfig.socket) {
      adapterConfig.host = "localhost";
    }
  } else if (adapterConfig.host === undefined) {
    adapterConfig.host = "localhost";
  }
  return [adapterConfig];
}
