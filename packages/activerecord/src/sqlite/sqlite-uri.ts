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
      // Malformed escapes (e.g. lone "%") keep databaseExists() total.
      return s;
    }
  };
  // `new URL` anchors a rootless path at "/", losing relativity. A `file:` body
  // that doesn't start with "/" (e.g. `file:foo.db`, `file:./foo.db`) is a
  // cwd-relative SQLite URI; strip any `?query`/`#frag` and return it as-is.
  const body = database.slice("file:".length);
  if (!body.startsWith("/")) {
    const sep = body.search(/[?#]/);
    return decode(sep === -1 ? body : body.slice(0, sep));
  }
  return decode(url.pathname);
}
