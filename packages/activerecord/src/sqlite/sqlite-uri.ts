/**
 * @noRailsEquivalent PERMANENT Rails leaves file:/:memory: handling to SQLITE_OPEN_URI inside the sqlite3 gem (sqlite3_adapter.rb:82); the JS drivers disagree about it, so trails resolves the URI itself.
 */

/**
 * True for SQLite in-memory database names per the SQLite URI spec
 * (https://www.sqlite.org/inmemorydb.html): `:memory:`, `file::memory:...`,
 * and named in-memory URIs whose query string carries a real `mode=memory`
 * parameter (e.g. `file:memdb1?mode=memory&cache=shared`).
 *
 * Parses the query string rather than substring-matching, so a path that
 * merely contains the text `mode=memory` (`file:/tmp/mode=memory.db`) is not
 * misclassified. This is the single predicate both `SQLite3Adapter` and
 * `SQLiteDatabaseTasks` classify with.
 *
 * No Rails counterpart: Rails never asks the question — `sqlite3_adapter.rb` compares
 * `@config[:database]` against the literal `":memory:"`, and
 * `tasks/sqlite_database_tasks.rb` operates on `db_config.database` directly
 * and shells out. trails needs it for the `sqlite3_mem` lane, whose database is
 * a shared-cache in-memory URI rather than the bare `:memory:` alias.
 *
 * @internal
 * @noRailsEquivalent PERMANENT Rails compares the config database against the literal ":memory:" inline (sqlite3_adapter.rb:82); the sqlite3_mem lane needs a URI-aware predicate.
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
 * @noRailsEquivalent CONVERGEABLE the file:/:memory: handling Ruby leaves to SQLITE_OPEN_URI in SQLite3Adapter.new_client (sqlite3_adapter.rb:82).
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
