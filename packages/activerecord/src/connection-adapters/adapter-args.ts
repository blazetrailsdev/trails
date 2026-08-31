/** @internal */
import { AdapterNotFound } from "../errors.js";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
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

export function adapterNameFromUrl(url: string): string {
  const inferred = inferAdapterNameFromUrl(url);
  if (inferred !== undefined) return inferred;
  throw new AdapterNotFound(
    `Cannot detect database adapter from URL "${url}". ` +
      `Use a URL starting with postgres://, mysql://, or sqlite://, ` +
      `or pass { adapter: "postgresql", url: "..." }`,
  );
}

function isRemoteLibsqlUrl(url: string): boolean {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("wss://") ||
    url.startsWith("ws://")
  );
}

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

export function parseSqliteUrl(url: string): string {
  if (url.startsWith("sqlite3://") || url.startsWith("sqlite://")) {
    const stripped = url.replace(/^sqlite3?:\/\//, "");
    return stripped || ":memory:";
  }
  return url;
}

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
