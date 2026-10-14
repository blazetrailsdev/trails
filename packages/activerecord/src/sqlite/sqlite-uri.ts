/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite-uri-helpers-port-memory-database-as-rails-computes-it
 */
export function isRemoteLibsqlUrl(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("wss://") ||
    url.startsWith("ws://")
  );
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE sqlite-uri-helpers-port-memory-database-as-rails-computes-it
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
