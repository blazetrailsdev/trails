/** @noRailsEquivalent PERMANENT */

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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
