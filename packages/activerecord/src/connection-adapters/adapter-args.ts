function isRemoteLibsqlUrl(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("wss://") ||
    url.startsWith("ws://")
  );
}

function normalizeAdapterName(name: string): string {
  switch (name) {
    case "postgresql":
      return "postgresql";
    case "mysql2":
      return "mysql";
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

function parseSqliteUrl(url: string): string {
  if (url.startsWith("sqlite3://") || url.startsWith("sqlite://")) {
    const stripped = url.replace(/^sqlite3?:\/\//, "");
    return stripped || ":memory:";
  }
  return url;
}

/** @noRailsEquivalent PERMANENT */
export function buildAdapterArg(
  adapterName: string,
  configuration: Record<string, unknown>,
): unknown[] {
  const normalized = normalizeAdapterName(adapterName);
  const url = configuration.url as string | undefined;
  const database = configuration.database as string | undefined;
  if (normalized === "sqlite") {
    const resolvedUrl = url !== undefined && isRemoteLibsqlUrl(url) ? url : undefined;
    const filename = parseSqliteUrl(resolvedUrl || database || url || ":memory:");
    const { adapter: _sa, url: _su, database: _sd, authToken, syncUrl, ...options } = configuration;
    if (authToken !== undefined || syncUrl !== undefined) {
      const merged = { ...(options.driverOptions as Record<string, unknown> | undefined) };
      if (authToken !== undefined) merged.authToken = authToken;
      if (syncUrl !== undefined) merged.syncUrl = syncUrl;
      options.driverOptions = merged;
    }
    return Object.keys(options).length > 0 ? [filename, options] : [filename];
  }
  if (url && database === undefined) {
    const { adapter: _ua, url: _uu, ...urlRest } = configuration;
    if (Object.keys(urlRest).length === 0) {
      return [url];
    }
    const urlKey = normalized === "postgresql" ? "connectionString" : "uri";
    return [{ ...urlRest, [urlKey]: url }];
  }
  const { adapter: _a, url: _u, ...rest } = configuration;
  const adapterConfig: Record<string, unknown> = { ...rest };
  if (normalized === "mysql") {
    if (adapterConfig.host === undefined && !adapterConfig.socketPath && !adapterConfig.socket) {
      adapterConfig.host = "localhost";
    }
  } else if (adapterConfig.host === undefined) {
    adapterConfig.host = "localhost";
  }
  return [adapterConfig];
}
