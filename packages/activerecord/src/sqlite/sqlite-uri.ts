/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function isInMemoryDatabase(database: string): boolean {
  if (database === ":memory:") return true;
  if (!database.startsWith("file:")) return false;
  if (database.startsWith("file::memory:")) return true;
  const q = database.indexOf("?");
  if (q === -1) return false;
  return new URLSearchParams(database.slice(q + 1)).get("mode") === "memory";
}

/**
 * Decode `file:` URIs (including `file://`, percent-encoding, and `?mode=`
 * query strings) and `:memory:` aliases. Returns `null` for memory databases,
 * otherwise the decoded filesystem path.
 *
 * Shared by the URI-aware SQLite drivers — node:sqlite and libsql both enable
 * `SQLITE_OPEN_URI`, so (unlike better-sqlite3, whose build doesn't set it and
 * opens the string literally) they open a rootless `file:foo.db` relative to
 * the cwd, not as a literal file named `file:foo.db`. So this resolver
 * preserves relative `file:` paths (returning `foo.db`, not `/foo.db`) so
 * `databaseExists()` checks the path `open()` actually uses; only `file:/...`
 * / `file://host/...` is absolute.
 * @internal
 * @noRailsEquivalent CONVERGEABLE the file:/:memory: handling Ruby leaves to SQLITE_OPEN_URI in SQLite3Adapter.new_client (sqlite3_adapter.rb:34).
 */
export function resolveUriDatabasePath(database: string): string | null {
  if (database === ":memory:") return null;
  if (!database.startsWith("file:")) return database;
  if (database.startsWith("file::memory:")) return null;
  let url: URL;
  try {
    url = new URL(database, "file:///");
  } catch {
    return database;
  }
  if (url.searchParams.get("mode") === "memory") return null;
  const decode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const body = database.slice("file:".length);
  if (!body.startsWith("/")) {
    const sep = body.search(/[?#]/);
    return decode(sep === -1 ? body : body.slice(0, sep));
  }
  return decode(url.pathname);
}
