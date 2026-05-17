import type { Base } from "./base.js";
import { WRITING_ROLE, READING_ROLE } from "./roles.js";
import type { DatabaseAdapter } from "./adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { getFsAsync, getPathAsync, getEnv } from "@blazetrails/activesupport";
import { DatabaseConfigurations, type RawConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { UrlConfig } from "./database-configurations/url-config.js";
import {
  _setAdapterClassResolver,
  type DatabaseConfig,
} from "./database-configurations/database-config.js";
import {
  resolve as resolveConnectionAdapter,
  resolveSync as resolveConnectionAdapterSync,
} from "./connection-adapters.js";
import {
  AdapterNotFound,
  AdapterNotSpecified,
  ConnectionNotEstablished,
  ConfigurationError,
  NotImplementedError,
} from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  connectedToStack,
  currentRole as coreCurrentRole,
  currentShard as coreCurrentShard,
  isApplicationRecordClass as coreIsApplicationRecordClass,
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

// Mirrors: self == Base — own-property marker set only on the literal Base class,
// not inherited by subclasses.
function isBaseClass(klass: typeof Base): boolean {
  return Object.prototype.hasOwnProperty.call(klass, "_isActiveRecordBase");
}

export function connectsTo(
  this: typeof Base,
  options: {
    database?: Record<string, string | Record<string, unknown>>;
    shards?: Record<string, Record<string, string | Record<string, unknown>>>;
  },
): ConnectionPool[] {
  if (!isBaseClass(this) && !this.abstractClass) {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_handling.rb:82 cluster=connection-pool
    throw new NotImplementedError(
      "`connects_to` can only be called on ActiveRecord::Base or abstract classes",
    );
  }

  const database = options.database ?? {};
  const shards = options.shards ?? {};

  if (Object.keys(database).length > 0 && Object.keys(shards).length > 0) {
    throw new ArgumentError(
      "`connects_to` can only accept a `database` or `shards` argument, but not both arguments.",
    );
  }

  const connections: ConnectionPool[] = [];
  // Mirrors Rails' flow: capture @shard_keys before the default-merge, then
  // inject {default: database} when no shards were given, then read
  // shards.keys.first for default_shard from the post-merge map.
  (this as any)._shardKeys = Object.keys(shards);
  const shardEntries: Record<string, Record<string, unknown>> = Object.keys(shards).length > 0
    ? shards
    : { default: database };
  (this as any)._defaultShard = Object.keys(shardEntries)[0];
  (this as any).connectionClass = true;

  for (const [shard, dbKeys] of Object.entries(shardEntries)) {
    for (const [role, dbKey] of Object.entries(dbKeys)) {
      const dbConfig = resolveConfigForConnection.call(this, dbKey);
      const adapterName = dbConfig.adapter ?? "";
      const adapterArg = buildAdapterArg(adapterName, dbConfig.configuration);
      // Kick off async load so the sync adapter cache is populated by the
      // time the pool first asks for a connection. The returned promise is
      // attached to the pool as `adapterReady` so callers running real
      // queries can await it before leaseConnection(). Capture any
      // rejection in `loadError` so the sync factory below can surface the
      // real cause (AdapterNotFound, loader import error, ...) instead of
      // a generic "not preloaded" message — and swallow the rejection on a
      // detached `.catch` so callers that never await `adapterReady` don't
      // trip an unhandled-promise warning.
      let loadError: unknown = null;
      const adapterReady: Promise<unknown> = adapterName
        ? resolveConnectionAdapter(adapterName).catch((err) => {
            loadError = err;
            throw err;
          })
        : Promise.resolve(null);
      adapterReady.catch(() => {});
      const pool = this.connectionHandler.establishConnection(dbConfig, {
        owner: this.connectionClassForSelf(),
        role,
        shard,
        adapterFactory: () => {
          if (loadError) throw loadError;
          const AdapterClass = resolveConnectionAdapterSync(adapterName);
          if (!AdapterClass) {
            throw new ConnectionNotEstablished(
              `Adapter ${adapterName || "(missing)"} for ${this.name} pool not preloaded; ` +
                `await the pool's \`adapterReady\` promise after \`connectsTo\` returns.`,
            );
          }
          return new AdapterClass(adapterArg);
        },
      });
      pool.adapterReady = adapterReady;
      connections.push(pool);
    }
  }

  return connections;
}

/**
 * Build the adapter-constructor argument used by `connectsTo` and
 * `establishConnection`. SQLite expects the database string directly; other
 * adapters take a config hash. Mirrors the inline normalization done by
 * `establishWithConfig`.
 *
 * @internal
 */
function buildAdapterArg(adapterName: string, configuration: Record<string, unknown>): unknown {
  const normalized = normalizeAdapterName(adapterName);
  const url = configuration.url as string | undefined;
  const database = configuration.database as string | undefined;
  if (normalized === "sqlite") {
    // Mirrors establishWithConfig's `url || config?.database || ":memory:"`
    // precedence so connectsTo and establishConnection normalize SQLite
    // configs identically. autoConnect already pre-zeroes `url` when the
    // configuration hash carries a `database`, so the resolved-database-
    // wins semantic is preserved on the public entrypoint.
    return parseSqliteUrl(url || database || ":memory:");
  }
  // Mirrors establishWithConfig's `else if (url) adapterArg = url` branch:
  // URL-only configs (e.g. opaque adapter strings like jdbc:...) are passed
  // through as the raw URL string. Hash-form configs (no url, or url + an
  // explicit database) get the normalized hash with username/host defaults.
  if (url && database === undefined) {
    return url;
  }
  const { adapter: _a, url: _u, username, ...rest } = configuration;
  const adapterConfig: Record<string, unknown> = { ...rest };
  if (adapterConfig.user === undefined && username !== undefined) {
    adapterConfig.user = username;
  }
  if (adapterConfig.host === undefined) {
    adapterConfig.host = "localhost";
  }
  return adapterConfig;
}

export function connectedTo<T>(
  this: typeof Base,
  options: { role?: string; shard?: string; preventWrites?: boolean },
  fn: () => T,
): T {
  if (!isBaseClass(this) && !this.abstractClass) {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_handling.rb:138 cluster=connection-pool
    throw new NotImplementedError(
      "calling `connected_to` is only allowed on ActiveRecord::Base or abstract classes.",
    );
  }

  if (!this.connectionClassQ() && !isPrimaryClass.call(this)) {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_handling.rb:142 cluster=connection-pool
    throw new NotImplementedError(
      "calling `connected_to` is only allowed on the abstract class that established the connection.",
    );
  }

  const { role, shard, preventWrites = false } = options;
  if (!role && !shard) {
    throw new ArgumentError("must provide a `shard` and/or `role`.");
  }

  return withRoleAndShard.call(this, role, shard, preventWrites, fn) as T;
}

type ConnectedToManyOptions = { role: string; shard?: string; preventWrites?: boolean };

// Mirrors Rails' connected_to_many(*classes, role:, ...) splat.
// Array form: connectedToMany([A, B], options, fn)
export function connectedToMany<T>(
  this: typeof Base,
  classes: (typeof Base)[],
  options: ConnectedToManyOptions,
  fn: () => T,
): T;
// Variadic form: connectedToMany(A, options, fn) or connectedToMany(A, B, options, fn) etc.
// At least one class is required before options+fn.
export function connectedToMany<T>(
  this: typeof Base,
  ...args: [typeof Base, ...(typeof Base)[], ConnectedToManyOptions, () => T]
): T;
export function connectedToMany<T>(this: typeof Base, ...args: unknown[]): T {
  const fn = args[args.length - 1] as () => T;
  const options = args[args.length - 2] as ConnectedToManyOptions;
  // Everything before options+fn: may be a single class, an array, or N positional classes.
  const classArgs = args.slice(0, args.length - 2);
  const normalized = classArgs.flat() as (typeof Base)[];

  if (normalized.length === 0) {
    throw new ArgumentError("must provide at least one class.");
  }

  if (!options?.role) {
    throw new ArgumentError("must provide a `role`.");
  }

  if (typeof fn !== "function") {
    throw new ArgumentError("must provide a block.");
  }

  if (!isBaseClass(this)) {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_handling.rb:169 cluster=connection-pool
    throw new NotImplementedError("connected_to_many can only be called on ActiveRecord::Base.");
  }

  if (normalized.some((klass) => isBaseClass(klass))) {
    // @nie disposition=keep-as-strategy-hook rails=activerecord/lib/active_record/connection_handling.rb:169 cluster=connection-pool
    throw new NotImplementedError("connected_to_many cannot include ActiveRecord::Base.");
  }

  const { role, shard } = options;
  const preventWrites = role === READING_ROLE || !!options.preventWrites;

  const klasses = new Set(normalized.map((klass) => klass.connectionClassForSelf()));
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
  const { role = WRITING_ROLE, shard = defaultShard.call(this) } = options;
  const preventWrites = role === READING_ROLE || !!options.preventWrites;
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
  fn: (conn: DatabaseAdapter) => T | Promise<T>,
  options?: { preventPermanentCheckout?: boolean; checkoutTimeout?: number },
): Promise<T> {
  try {
    return Promise.resolve(connectionPool.call(this).withConnection(fn, options)) as Promise<T>;
  } catch (err) {
    return Promise.reject(err) as Promise<T>;
  }
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

export const isConnected = isConnectedQ;

export function connection(this: typeof Base): DatabaseAdapter {
  const pool = connectionPool.call(this);
  if (pool.isPermanentLease()) return pool.leaseConnection();
  return pool.activeConnection ?? pool.leaseConnection();
}

export function isPrimaryClass(this: typeof Base): boolean {
  return this.name === "Base" || coreIsApplicationRecordClass.call(this as any);
}

export function adapterClass(this: typeof Base): Promise<new (...args: any[]) => DatabaseAdapter> {
  return connectionPool.call(this).dbConfig.adapterClass() as Promise<
    new (...args: any[]) => DatabaseAdapter
  >;
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
  // Check own property first to avoid prototype-static inheritance bleeding a
  // value set on Base/ApplicationRecord into unrelated abstract subclasses.
  // The recursive walk below handles cross-class inheritance explicitly.
  if (
    Object.prototype.hasOwnProperty.call(this, "_connectionSpecificationName") &&
    (this as any)._connectionSpecificationName != null
  ) {
    return (this as any)._connectionSpecificationName;
  }
  if (this.name === "Base") {
    return "Base";
  }
  // Primary classes (Base/ApplicationRecord) store their pool under "Base"
  // per PoolConfig#connectionDescriptor's normalization; reflect that here
  // so leaseConnection() lookups hit the right pool when connectsTo hasn't
  // run yet to plant _connectionSpecificationName.
  if (typeof (this as any).primaryClassQ === "function" && (this as any).primaryClassQ()) {
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

export function defaultShard(this: typeof Base): string {
  const connClass = this.connectionClassForSelf();
  return (connClass as any)._defaultShard ?? "default";
}

// --- Private helpers ---

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as any).then === "function";
}

// Mirrors Rails' `is_a? ActiveRecord::Relation` check. Requires both .load and
// .toArray to avoid false positives on unrelated objects that happen to have .load().
function isRelationLike(value: unknown): boolean {
  return (
    value != null &&
    typeof (value as any).load === "function" &&
    typeof (value as any).toArray === "function"
  );
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

/** @internal */
export function withRoleAndShard<T>(
  this: typeof Base,
  role: string | undefined,
  shard: string | undefined,
  preventWrites: boolean,
  fn: () => T,
): T {
  const resolvedPreventWrites = role === READING_ROLE || preventWrites;
  const connectionClass = this.connectionClassForSelf();
  const entry = {
    role,
    shard,
    preventWrites: resolvedPreventWrites,
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

  // Force-load any Relation within the role/shard scope so lazy queries don't
  // escape to a different connection context.
  // Mirrors: return_value.load if return_value.is_a? ActiveRecord::Relation (ensure pops stack)
  //
  // Check .load BEFORE isThenable: Relation is thenable (delegates .then to toArray),
  // so Promise.resolve(relation) would unwrap it to records instead of calling .load().
  if (isRelationLike(result)) {
    // Sync Relation returned: .load() is async, cleanup fires via withCleanup's .finally().
    // Guard against a sync throw from .load() (mirrors Rails' ensure semantics).
    let loaded: unknown;
    try {
      loaded = (result as any).load();
    } catch (error) {
      removeStackEntry(entry);
      throw error;
    }
    return withCleanup(loaded as unknown as T, () => removeStackEntry(entry));
  }

  if (isThenable(result)) {
    // Async fn: resolve first, then check if the resolved value is a Relation.
    const loaded = Promise.resolve(result as unknown).then((v) =>
      isRelationLike(v) ? (v as any).load() : v,
    );
    return withCleanup(loaded as unknown as T, () => removeStackEntry(entry));
  }

  return withCleanup(result, () => removeStackEntry(entry));
}

/** @internal */
export function appendToConnectedToStack(entry: {
  role?: string;
  shard?: string;
  preventWrites?: boolean;
  klasses: Set<any>;
}): void {
  if (isShardSwappingProhibited() && entry.shard) {
    throw new ArgumentError("cannot swap `shard` while shard swapping is prohibited.");
  }
  connectedToStack().push(entry);
}

// Delegates to ConnectionAdapters.resolve, which holds the registry of
// pre-registered and user-registered adapters.
async function _loadAdapter(name: string): Promise<new (arg: unknown) => DatabaseAdapter> {
  return resolveConnectionAdapter(name);
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
  if (!modelClass.name) throw new Error("Anonymous class is not allowed.");
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
  // Pass the original adapter name to the registry so caller overrides
  // like register("mysql2", ...) aren't shadowed by normalization.
  const AdapterClass = await _loadAdapter(adapterName);

  let adapterArg: unknown;
  if (normalized === "sqlite") {
    adapterArg = parseSqliteUrl(url || (config?.database as string) || ":memory:");
  } else if (url) {
    adapterArg = url;
  } else if (config) {
    adapterArg = buildAdapterArg(adapterName, config);
  } else {
    adapterArg = url;
  }

  const dbConfig = new HashConfig(
    getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? DatabaseConfigurations.defaultEnv,
    "primary",
    {
      adapter: adapterName,
      url,
      ...config,
    },
  );

  // Honor the active connected_to scope so callers like
  // `connected_to(role:, shard:) { establish_connection(db_config) }` register
  // the new pool under the current role/shard instead of writing/default.
  const role = coreCurrentRole.call(modelClass as any);
  const shard = coreCurrentShard.call(modelClass as any);

  modelClass.connectionHandler.establishConnection(dbConfig, {
    owner: modelClass.connectionClassForSelf(),
    role,
    shard,
    adapterFactory: () => new AdapterClass(adapterArg),
  });
}

async function autoConnect(modelClass: typeof Base): Promise<void> {
  // Prefer the in-memory configurations when set — Rails'
  // `establish_connection` (no args) reads from `Base.configurations`,
  // the same registry mutated by callers like
  // `TestDatabases.create_and_load_schema` (which suffixes `_database`
  // per worker before reconnect). Falling back to disk would re-read
  // unmutated configs and reconnect to the wrong database.
  const inMemory = (modelClass as any).configurations;
  let configs: DatabaseConfigurations;
  if (inMemory instanceof DatabaseConfigurations) {
    configs = inMemory;
  } else if (inMemory && typeof inMemory.toH === "function") {
    configs = DatabaseConfigurations.fromEnv(inMemory.toH());
  } else if (inMemory && typeof inMemory === "object") {
    configs = DatabaseConfigurations.fromEnv(inMemory);
  } else {
    const raw = await loadConfigFile(modelClass);
    configs = DatabaseConfigurations.fromEnv(raw);
  }
  const env = getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? DatabaseConfigurations.defaultEnv;
  const primaryConfigs = configs.configsFor({ envName: env, name: "primary" });
  const dbConfig = primaryConfigs[0] ?? configs.findDbConfig(env);

  if (!dbConfig) {
    throw new ConnectionNotEstablished(
      `No database configuration found for ${modelClass.name}. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }

  // The original URL is always usable for adapter inference (e.g.
  // `sqlite3:db/test.sqlite3` → "sqlite3"), even when the connection
  // target should be built from a (possibly-mutated) configuration hash.
  const originalUrl =
    (dbConfig instanceof UrlConfig ? dbConfig.url : undefined) ||
    (dbConfig.configuration.url as string | undefined) ||
    "";
  const adapterName =
    dbConfig.adapter || (originalUrl ? adapterNameFromUrl(originalUrl) : undefined);
  if (!adapterName) {
    throw new AdapterNotSpecified(
      `Database configuration for "${env}" must include an adapter name or a URL. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }

  // Prefer the configuration hash over the original URL string when an
  // explicit `database` is set — Rails' `establish_connection` resolves
  // from configuration_hash, not the raw URL, so callers that mutate
  // `_database` (e.g. TestDatabases.create_and_load_schema appending a
  // worker index) actually reconnect to the mutated DB. The URL is only
  // forwarded to the adapter layer when the configuration carries no
  // explicit `database` — i.e. for opaque adapter strings like `jdbc:`
  // that buildUrlHash passes through without decomposing.
  const cfgDatabase = (dbConfig.configuration as { database?: string }).database;
  const connectUrl = cfgDatabase ? "" : originalUrl;
  await establishWithConfig(
    modelClass,
    adapterName,
    connectUrl,
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

async function loadConfigFile(modelClass: typeof Base): Promise<RawConfigurations> {
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

async function loadJsonConfig(configPath: string): Promise<RawConfigurations> {
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

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 *
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention: a Concern
 * module exposes a `ClassMethods` object whose members become class methods
 * on any class that includes the Concern. Grouping them here keeps the
 * mixin surface colocated with the implementations, so adding a new class
 * method only requires touching this file — `base.ts` wires the whole
 * object in one line.
 */
export const ClassMethods = {
  connectsTo,
  connectedTo,
  connectedToMany,
  connectedToAllShards,
  connectingTo,
  connectedToQ,
  whilePreventingWrites,
  prohibitShardSwapping,
  isShardSwappingProhibited,
  clearQueryCachesForCurrentThread,
  leaseConnection,
  releaseConnection,
  withConnection,
  connectionDbConfig,
  connectionPool,
  retrieveConnection,
  isConnectedQ,
  isConnected,
  connection,
  isPrimaryClass,
  adapterClass,
  removeConnection,
  schemaCache,
  clearCacheBang,
  shardKeys,
  isSharded,
  defaultShard,
  withRoleAndShard,
  appendToConnectedToStack,
};

// Register adapter class resolver so DatabaseConfig#adapterClass and
// #newConnection can resolve adapters (matching Rails'
// ActiveRecord::ConnectionAdapters.resolve). Pass the adapter name through
// unchanged — the registry handles canonical names and aliases, so caller
// overrides like register("mysql2", ...) aren't shadowed by normalization.
_setAdapterClassResolver(async (adapterName) => _loadAdapter(adapterName));

/**
 * Resolve a config-or-env value through Base.configurations and set the
 * connection_specification_name on the calling class.
 *
 * Mirrors: ActiveRecord::ConnectionHandling#resolve_config_for_connection (private)
 *
 * @internal
 */
export function resolveConfigForConnection(
  this: typeof Base,
  configOrEnv: unknown,
): DatabaseConfig {
  if (!this.name) throw new Error("Anonymous class is not allowed.");
  // Mirrors Rails: connection_name = primary_class? ? Base.name : name, then
  // self.connection_specification_name = connection_name. The primary class
  // (Base/ApplicationRecord) stores its pool under "Base" — matching
  // PoolConfig#connectionDescriptor's primary-class normalization — so
  // subsequent connectionPool() lookups hit the right key. The reader uses
  // an own-property check so writing here doesn't bleed through JS static
  // inheritance into unrelated subclasses.
  (this as any)._connectionSpecificationName = isPrimaryClass.call(this) ? "Base" : this.name;
  return normalizeConfigurations(this).resolve(configOrEnv);
}

/**
 * Normalize a class's `configurations` static into a DatabaseConfigurations
 * instance. Mirror Rails' `Base.configurations.resolve(...)` entry point by
 * always returning a real configurations object — string env names then
 * surface AdapterNotSpecified with the available-configs hint instead of
 * silently passing through.
 *
 * Not cached: `DatabaseConfigurations.fromEnv(...)` also folds in
 * `DATABASE_URL`/`TRAILS_ENV` and updates `DatabaseConfigurations.current`,
 * so a (class, rawConfigs) cache key would miss later env-state changes
 * and leave `HashConfig.isPrimary()` consulting a stale registry.
 * Rebuilding per resolve mirrors Rails' `Base.configurations.resolve(...)`
 * and keeps the multi-shard `connectsTo` loop honest against later
 * configuration or env shifts — `fromEnv` is a thin per-call build.
 *
 * @internal
 */
function normalizeConfigurations(klass: typeof Base): DatabaseConfigurations {
  const rawConfigs = (klass as any).configurations;
  if (rawConfigs instanceof DatabaseConfigurations) return rawConfigs;
  if (rawConfigs && typeof rawConfigs === "object") {
    // Guard the `toH` call: raw config maps can carry arbitrary top-level
    // keys, so a non-function `toH` entry is real config data — not a
    // hash-like accessor to unwrap. Mirrors the same guard used in
    // `establishConnection`'s in-memory branch and in `test-databases.ts`.
    const toH = (rawConfigs as { toH?: unknown }).toH;
    const raw =
      typeof toH === "function" ? (toH.call(rawConfigs) as RawConfigurations) : rawConfigs;
    return DatabaseConfigurations.fromEnv(raw as RawConfigurations);
  }
  return DatabaseConfigurations.fromEnv({});
}
