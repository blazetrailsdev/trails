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

/**
 * Normalize adapter aliases to their canonical name.
 *
 *   postgres / postgresql  → postgresql
 *   mysql / mysql2         → mysql
 *   sqlite / sqlite3       → sqlite
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
      return "sqlite";
    default:
      return name;
  }
}

/**
 * Strip the `sqlite[3]://` URL prefix, returning a bare filename
 * (`":memory:"`, path, or empty → `":memory:"`).
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
    // Prefer an explicit `database` over `url` so caller-mutated configs
    // (e.g. autoConnect rewriting the database for a per-worker slot, db:create
    // swapping in a fresh database name) win over the original URL — matches
    // the non-SQLite branch which only falls back to `url` when `database` is
    // unset.
    const filename = parseSqliteUrl(database || url || ":memory:");
    // Keep only the SQLite3Adapter constructor's `options` keys so we don't
    // forward unrelated database.yml entries (pool, host, etc.) into the
    // options object. The adapter ignores unknown keys today but accepting
    // them here would lock in a foot-gun.
    const { readonly, driver, pragmas, strict, statementLimit, preparedStatements } =
      configuration as Record<string, unknown>;
    const options: Record<string, unknown> = {};
    if (readonly !== undefined) options.readonly = readonly;
    if (driver !== undefined) options.driver = driver;
    if (pragmas !== undefined) options.pragmas = pragmas;
    if (strict !== undefined) options.strict = strict;
    if (statementLimit !== undefined) options.statementLimit = statementLimit;
    if (preparedStatements !== undefined) options.preparedStatements = preparedStatements;
    return Object.keys(options).length > 0 ? [filename, options] : [filename];
  }
  if (url && database === undefined) {
    return [url];
  }
  const { adapter: _a, url: _u, username, ...rest } = configuration;
  const adapterConfig: Record<string, unknown> = { ...rest };
  if (adapterConfig.user === undefined && username !== undefined) {
    adapterConfig.user = username;
  }
  // mysql2 uses `socketPath`; database.yml uses `socket`. Normalise here so
  // all callers benefit, not just the DatabaseTasks path.
  if (normalized === "mysql") {
    if (
      adapterConfig.socket !== undefined &&
      adapterConfig.socket !== "" &&
      adapterConfig.socketPath === undefined
    ) {
      adapterConfig.socketPath = adapterConfig.socket;
      delete adapterConfig.socket;
    }
    if (adapterConfig.host === undefined && !adapterConfig.socketPath) {
      adapterConfig.host = "localhost";
    }
  } else if (adapterConfig.host === undefined) {
    adapterConfig.host = "localhost";
  }
  return [adapterConfig];
}
