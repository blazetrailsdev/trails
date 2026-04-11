import type { Base } from "./base.js";
import type { DatabaseAdapter } from "./adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { DatabaseConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import {
  AdapterNotFound,
  AdapterNotSpecified,
  ConnectionNotEstablished,
  ConfigurationError,
} from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  connectedToStack,
  currentRole as coreCurrentRole,
  currentShard as coreCurrentShard,
} from "./core.js";
import { getAsyncContext } from "@blazetrails/activesupport";
import type { AsyncContext } from "@blazetrails/activesupport";

/**
 * Connection establishment and management for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ConnectionHandling
 */

let _prohibitContext: AsyncContext<boolean> | null = null;
let _prohibitContextAdapter: ReturnType<typeof getAsyncContext> | null = null;

function getProhibitContext(): AsyncContext<boolean> {
  const adapter = getAsyncContext();
  if (!_prohibitContext || _prohibitContextAdapter !== adapter) {
    _prohibitContextAdapter = adapter;
    _prohibitContext = adapter.create<boolean>();
  }
  return _prohibitContext;
}

// --- ConnectionHandling module methods (mixed into Base as static methods) ---

export function connectsTo(
  this: typeof Base,
  options: {
    database?: Record<string, string>;
    shards?: Record<string, Record<string, string>>;
  },
): ConnectionPool[] {
  const database = options.database ?? {};
  const shards = options.shards ?? {};

  if (Object.keys(database).length > 0 && Object.keys(shards).length > 0) {
    throw new ArgumentError(
      "`connectsTo` can only accept a `database` or `shards` argument, but not both.",
    );
  }

  const connections: ConnectionPool[] = [];
  const shardEntries = Object.keys(shards).length > 0 ? shards : { default: database };

  (this as any)._shardKeys = Object.keys(shardEntries);
  (this as any).connectionClass = true;

  const configs = DatabaseConfigurations.fromEnv((this as any).configurations?.toH?.() ?? {});

  for (const [shard, dbKeys] of Object.entries(shardEntries)) {
    for (const [role, dbKey] of Object.entries(dbKeys)) {
      const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;
      const found = configs.configsFor({ envName: env, name: dbKey });
      const dbConfig = found[0] ?? new HashConfig(env, dbKey, {});
      const pool = this.connectionHandler.establishConnection(dbConfig, {
        owner: this.connectionClassForSelf(),
        role,
        shard,
      });
      connections.push(pool);
    }
  }

  return connections;
}

export function connectedTo<T>(
  this: typeof Base,
  options: { role?: string; shard?: string; preventWrites?: boolean },
  fn: () => T,
): T {
  const { role, shard, preventWrites = false } = options;
  if (!role && !shard) {
    throw new ArgumentError("must provide a `shard` and/or `role`.");
  }

  return withRoleAndShard.call(this, role, shard, preventWrites, fn) as T;
}

export function connectedToMany<T>(
  this: typeof Base,
  classes: (typeof Base)[],
  options: { role: string; shard?: string; preventWrites?: boolean },
  fn: () => T,
): T {
  const { role, shard, preventWrites = false } = options;

  const klasses = new Set(classes.map((klass) => klass.connectionClassForSelf()));
  const entry = { role, shard, preventWrites, klasses };
  appendToConnectedToStack(entry);

  let result: T;
  try {
    result = fn();
  } catch (error) {
    removeStackEntry(entry);
    throw error;
  }

  return withCleanup(result, () => removeStackEntry(entry));
}

export function connectedToAllShards<T>(
  this: typeof Base,
  options: { role?: string; preventWrites?: boolean },
  fn: () => T,
): T[] | Promise<Awaited<T>[]> {
  const keys = shardKeys.call(this);
  const results: T[] = [];

  for (const shard of keys) {
    const result = connectedTo.call(
      this,
      { shard, role: options.role, preventWrites: options.preventWrites },
      fn,
    ) as T;

    if (isThenable(result)) {
      const asyncResults = async (): Promise<Awaited<T>[]> => {
        const awaited = results as Awaited<T>[];
        awaited.push((await result) as Awaited<T>);
        for (const remaining of keys.slice(keys.indexOf(shard) + 1)) {
          const r = connectedTo.call(
            this,
            { shard: remaining, role: options.role, preventWrites: options.preventWrites },
            fn,
          );
          awaited.push((await r) as Awaited<T>);
        }
        return awaited;
      };
      return asyncResults();
    }

    results.push(result);
  }

  return results;
}

export function connectingTo(
  this: typeof Base,
  options: { role?: string; shard?: string; preventWrites?: boolean },
): void {
  const { role = "writing", shard = "default", preventWrites = false } = options;
  appendToConnectedToStack({
    role,
    shard,
    preventWrites,
    klasses: new Set([this.connectionClassForSelf()]),
  });
}

export function connectedToQ(
  this: typeof Base,
  options: { role: string; shard?: string },
): boolean {
  return (
    coreCurrentRole.call(this as any) === options.role &&
    coreCurrentShard.call(this as any) === (options.shard ?? "default")
  );
}

export function whilePreventingWrites<T>(this: typeof Base, fn: () => T, enabled = true): T {
  return connectedTo.call(
    this,
    { role: coreCurrentRole.call(this as any), preventWrites: enabled },
    fn,
  ) as T;
}

export function prohibitShardSwapping<T>(fn: () => T, enabled = true): T {
  return getProhibitContext().run(enabled, fn);
}

export function isShardSwappingProhibited(): boolean {
  return getProhibitContext().getStore() ?? false;
}

export function clearQueryCachesForCurrentThread(this: typeof Base): void {
  this.connectionHandler.eachConnectionPool(null, (pool) => {
    const conn = pool.activeConnection;
    if (conn && typeof (conn as any).clearQueryCache === "function") {
      (conn as any).clearQueryCache();
    }
  });
}

export function leaseConnection(this: typeof Base): DatabaseAdapter {
  return connectionPool.call(this).leaseConnection();
}

export function releaseConnection(this: typeof Base): boolean {
  return connectionPool.call(this).releaseConnection();
}

export function withConnection<T>(
  this: typeof Base,
  fn: (conn: DatabaseAdapter) => T,
  options?: { preventPermanentCheckout?: boolean },
): T {
  return connectionPool.call(this).withConnection(fn, options);
}

export function connectionDbConfig(this: typeof Base) {
  return connectionPool.call(this).dbConfig;
}

export function connectionPool(this: typeof Base): ConnectionPool {
  const name = connectionSpecificationName.call(this);
  return this.connectionHandler.retrieveConnectionPool(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
    strict: true,
  })!;
}

export function retrieveConnection(this: typeof Base): DatabaseAdapter {
  const name = connectionSpecificationName.call(this);
  return this.connectionHandler.retrieveConnection(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
  });
}

export function isConnectedQ(this: typeof Base): boolean {
  const name = connectionSpecificationName.call(this);
  return this.connectionHandler.isConnected(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
  });
}

export function removeConnection(this: typeof Base): void {
  const name = connectionSpecificationName.call(this);
  if (
    this.connectionHandler.retrieveConnectionPool(name, {
      role: coreCurrentRole.call(this as any),
      shard: coreCurrentShard.call(this as any),
    })
  ) {
    (this as any)._connectionSpecificationName = undefined;
  }
  this.connectionHandler.removeConnectionPool(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
  });
}

export function connectionSpecificationName(this: typeof Base): string {
  if ((this as any)._connectionSpecificationName != null) {
    return (this as any)._connectionSpecificationName;
  }
  if (this.name === "Base") {
    return "Base";
  }
  if ((this as any).connectionClassQ?.()) {
    return this.name;
  }
  const parent = Object.getPrototypeOf(this);
  if (parent && typeof parent === "function" && parent !== this) {
    return connectionSpecificationName.call(parent as typeof Base);
  }
  return "Base";
}

export function schemaCache(this: typeof Base) {
  const pool = connectionPool.call(this);
  return pool.poolConfig.schemaCache ?? (pool as any).schemaCache;
}

export function clearCacheBang(this: typeof Base): void {
  const cache = schemaCache.call(this);
  if (cache && typeof (cache as any).clearBang === "function") {
    (cache as any).clearBang();
  }
}

export function shardKeys(this: typeof Base): string[] {
  const connClass = this.connectionClassForSelf();
  return (connClass as any)._shardKeys ?? [];
}

export function isSharded(this: typeof Base): boolean {
  return shardKeys.call(this).length > 0;
}

// --- Private helpers ---

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as any).then === "function";
}

function withCleanup<T>(result: T, cleanup: () => void): T {
  if (isThenable(result)) {
    return Promise.resolve(result).finally(cleanup) as T;
  }
  cleanup();
  return result;
}

function removeStackEntry(entry: object): void {
  const stack = connectedToStack();
  const index = stack.lastIndexOf(entry as any);
  if (index !== -1) stack.splice(index, 1);
}

function withRoleAndShard<T>(
  this: typeof Base,
  role: string | undefined,
  shard: string | undefined,
  preventWrites: boolean,
  fn: () => T,
): T {
  const connectionClass = this.connectionClassForSelf();
  const entry = {
    role,
    shard,
    preventWrites,
    klasses: new Set([connectionClass]),
  };
  appendToConnectedToStack(entry);

  let result: T;
  try {
    result = fn();
  } catch (error) {
    removeStackEntry(entry);
    throw error;
  }

  return withCleanup(result, () => removeStackEntry(entry));
}

function appendToConnectedToStack(entry: {
  role?: string;
  shard?: string;
  preventWrites?: boolean;
  klasses: Set<any>;
}): void {
  if (isShardSwappingProhibited() && entry.shard) {
    // Check if the shard would actually change
    for (const klass of entry.klasses) {
      const current = coreCurrentShard.call(klass);
      if (current !== entry.shard) {
        throw new ArgumentError("cannot swap `shard` while shard swapping is prohibited.");
      }
    }
  }
  connectedToStack().push(entry);
}

const _adapterCache: Record<string, new (...args: any[]) => DatabaseAdapter> = {};

async function _loadAdapter(normalized: string): Promise<new (...args: any[]) => DatabaseAdapter> {
  if (_adapterCache[normalized]) return _adapterCache[normalized];
  let Cls: new (...args: any[]) => DatabaseAdapter;
  if (normalized === "sqlite") {
    Cls = (await import("./connection-adapters/sqlite3-adapter.js")).SQLite3Adapter;
  } else if (normalized === "postgresql") {
    Cls = (await import("./adapters/postgresql-adapter.js")).PostgreSQLAdapter;
  } else if (normalized === "mysql") {
    Cls = (await import("./adapters/mysql2-adapter.js")).Mysql2Adapter;
  } else {
    throw new AdapterNotFound(
      `Unknown database adapter "${normalized}". Supported adapters: postgresql, mysql, sqlite`,
    );
  }
  _adapterCache[normalized] = Cls;
  return Cls;
}

export async function establishConnection(
  modelClass: typeof Base,
  config?:
    | string
    | {
        adapter?: string;
        url?: string;
        database?: string;
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        [key: string]: unknown;
      },
): Promise<void> {
  // Clear cached adapters up the prototype chain (Base → ApplicationRecord → Model)
  let current: any = modelClass;
  while (current && typeof current === "function") {
    if ("_adapter" in current) {
      current._adapter = null;
    }
    const proto = Object.getPrototypeOf(current.prototype);
    if (!proto) break;
    const parent = proto.constructor;
    if (!parent || parent === current) break;
    current = parent;
  }

  if (config === undefined) {
    await autoConnect(modelClass);
    return;
  }

  const resolved = resolveConfig(modelClass, config);
  await establishWithConfig(modelClass, resolved.adapterName, resolved.url, resolved.config);
}

async function establishWithConfig(
  modelClass: typeof Base,
  adapterName: string,
  url: string,
  config?: Record<string, unknown>,
): Promise<void> {
  const normalized = normalizeAdapterName(adapterName);
  const AdapterClass = await _loadAdapter(normalized);

  let adapterArg: unknown;
  if (normalized === "sqlite") {
    adapterArg = parseSqliteUrl(url || (config?.database as string) || ":memory:");
  } else if (url) {
    adapterArg = url;
  } else if (config) {
    const { adapter: _a, url: _u, username, ...rest } = config;
    const adapterConfig: Record<string, unknown> = { ...rest };
    if (adapterConfig.user === undefined && username !== undefined) {
      adapterConfig.user = username;
    }
    if (adapterConfig.host === undefined) {
      adapterConfig.host = "localhost";
    }
    adapterArg = adapterConfig;
  } else {
    adapterArg = url;
  }

  const dbConfig = new HashConfig(
    process.env.NODE_ENV || DatabaseConfigurations.defaultEnv,
    "primary",
    { adapter: adapterName, url, ...config },
  );

  modelClass.connectionHandler.establishConnection(dbConfig, {
    owner: modelClass.connectionClassForSelf(),
    adapterFactory: () => new AdapterClass(adapterArg),
  });
}

async function autoConnect(modelClass: typeof Base): Promise<void> {
  const raw = await loadConfigFile(modelClass);
  const configs = DatabaseConfigurations.fromEnv(raw);
  const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;
  const primaryConfigs = configs.configsFor({ envName: env, name: "primary" });
  const dbConfig = primaryConfigs[0] ?? configs.findDbConfig(env);

  if (!dbConfig) {
    throw new ConnectionNotEstablished(
      `No database configuration found for ${modelClass.name}. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }

  const url = dbConfig.configuration.url || "";
  const adapterName = dbConfig.adapter || (url ? adapterNameFromUrl(url) : undefined);
  if (!adapterName) {
    throw new AdapterNotSpecified(
      `Database configuration for "${env}" must include an adapter name or a URL. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }
  await establishWithConfig(
    modelClass,
    adapterName,
    url,
    dbConfig.configuration as Record<string, unknown>,
  );
}

function resolveConfig(
  modelClass: typeof Base,
  config: string | { adapter?: string; url?: string; database?: string; [key: string]: unknown },
): { adapterName: string; url: string; config?: Record<string, unknown> } {
  let url: string;
  let adapterName: string | undefined;
  let fullConfig: Record<string, unknown> | undefined;

  if (typeof config === "string") {
    url = config;
  } else {
    adapterName = config.adapter;
    url = config.url || "";
    fullConfig = config as Record<string, unknown>;
  }

  if (!adapterName && !url && !fullConfig?.database) {
    throw new AdapterNotSpecified(
      "Database configuration must include a url, database, or adapter name",
    );
  }

  if (!adapterName) {
    adapterName = adapterNameFromUrl(url || (fullConfig?.database as string) || "");
  }

  return { adapterName, url, config: fullConfig };
}

async function loadConfigFile(modelClass: typeof Base): Promise<Record<string, any>> {
  if ((modelClass as any)._configPath) {
    return loadJsonConfig((modelClass as any)._configPath);
  }

  const pathAdapter = await getPathAsync();
  const fsAdapter = await getFsAsync();
  const cwd = process.cwd();
  const tsCandidates = [
    pathAdapter.resolve(cwd, "config", "database.ts"),
    pathAdapter.resolve(cwd, "config", "database.js"),
    pathAdapter.resolve(cwd, "src", "config", "database.ts"),
    pathAdapter.resolve(cwd, "src", "config", "database.js"),
  ];

  for (const candidate of tsCandidates) {
    if (fsAdapter.existsSync(candidate)) {
      try {
        const { pathToFileURL } = await import("node:url");
        const mod = await import(pathToFileURL(candidate).href);
        return mod.default ?? mod;
      } catch (error: unknown) {
        throw new Error(
          `Failed to load database config at ${candidate}: ${(error as Error).message}`,
          { cause: error },
        );
      }
    }
  }

  return loadJsonConfig(pathAdapter.resolve(cwd, "config", "database.json"));
}

async function loadJsonConfig(configPath: string): Promise<Record<string, any>> {
  try {
    const fsAdapter = await getFsAsync();
    return JSON.parse(fsAdapter.readFileSync(configPath, "utf-8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new ConfigurationError(
      `Failed to load database config at ${configPath}: ${(error as Error).message}`,
      { cause: error },
    );
  }
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

export function adapterNameFromUrl(url: string): string {
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
  throw new AdapterNotFound(
    `Cannot detect database adapter from URL "${url}". ` +
      `Use a URL starting with postgres://, mysql://, or sqlite://, ` +
      `or pass { adapter: "postgresql", url: "..." }`,
  );
}
