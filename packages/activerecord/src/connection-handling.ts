import type { Base } from "./base.js";
import { WRITING_ROLE, READING_ROLE } from "./roles.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { UrlConfig } from "./database-configurations/url-config.js";
import {
  DatabaseConfig,
  _setConfigurationHash,
} from "./database-configurations/database-config.js";
import { resolve as resolveConnectionAdapter } from "./connection-adapters.js";
import { adapterNameFromUrl } from "./connection-adapters/adapter-args.js";
import { AdapterNotSpecified, NotImplementedError, ActiveRecordError } from "./errors.js";
import { ActiveRecord } from "./ar-config.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  connectedToStack,
  currentRole as coreCurrentRole,
  currentShard as coreCurrentShard,
  isApplicationRecordClass as coreIsApplicationRecordClass,
  configurations as baseConfigurations,
} from "./core.js";
import { IsolatedExecutionState } from "@blazetrails/activesupport";

const PROHIBIT_SHARD_SWAPPING_KEY = Symbol.for("ar_prohibit_shard_swapping");

const QUERY_CONNECTION_KEY = Symbol.for("ar_query_connection");

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function currentQueryConnection(): DatabaseAdapter | null {
  return IsolatedExecutionState.get<DatabaseAdapter>(QUERY_CONNECTION_KEY) ?? null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function threadedConnectionFor(modelClass: typeof Base): DatabaseAdapter | null {
  const threaded = currentQueryConnection();
  if (!threaded) return null;
  if ((modelClass as any)._adapter) return null;
  try {
    return connectionPool.call(modelClass).activeConnection === threaded ? threaded : null;
  } catch {
    return null;
  }
}

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
  (this as any)._shardKeys = Object.keys(shards);
  const shardEntries: Record<string, Record<string, unknown>> = Object.keys(shards).length > 0
    ? shards
    : { default: database };
  (this as any)._defaultShard = Object.keys(shardEntries)[0];
  (this as any).connectionClass = true;

  for (const [shard, dbKeys] of Object.entries(shardEntries)) {
    for (const [role, dbKey] of Object.entries(dbKeys)) {
      const dbConfig = resolveConfigForConnection.call(this, dbKey);
      const pool = this.connectionHandler.establishConnection(dbConfig, {
        ownerName: this.connectionClassForSelf(),
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

export function connectedToMany<T>(
  this: typeof Base,
  classes: (typeof Base)[],
  options: ConnectedToManyOptions,
  fn: () => T,
): T;
export function connectedToMany<T>(
  this: typeof Base,
  ...args: [typeof Base, ...(typeof Base)[], ConnectedToManyOptions, () => T]
): T;
export function connectedToMany<T>(this: typeof Base, ...args: unknown[]): T {
  const fn = args[args.length - 1] as () => T;
  const options = args[args.length - 2] as ConnectedToManyOptions;
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

  const klasses: any[] = [...normalized];
  let entry!: Parameters<typeof appendToConnectedToStack>[0];
  appendToConnectedToStack((entry = { role, shard, preventWrites, klasses }));

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
    klasses: [this],
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
  return IsolatedExecutionState.scope(PROHIBIT_SHARD_SWAPPING_KEY, enabled, fn);
}

export function isShardSwappingProhibited(): boolean {
  return IsolatedExecutionState.get<boolean>(PROHIBIT_SHARD_SWAPPING_KEY) ?? false;
}

export function clearQueryCachesForCurrentThread(this: typeof Base): void {
  this.connectionHandler.eachConnectionPool((pool) => {
    (pool as unknown as { clearQueryCache?: () => void }).clearQueryCache?.();
  });
}

export function leaseConnection(this: typeof Base): Promise<DatabaseAdapter> {
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
    const pool = leasablePool(this);
    if (!pool) return Promise.resolve(fn(connection.call(this))) as Promise<T>;
    return Promise.resolve(
      pool.withConnection(
        (conn) =>
          IsolatedExecutionState.scope(QUERY_CONNECTION_KEY, conn, () => Promise.resolve(fn(conn))),
        options,
      ),
    ) as Promise<T>;
  } catch (err) {
    return Promise.reject(err);
  }
}

/** @internal */
function leasablePool(modelClass: typeof Base): ConnectionPool | null {
  const klass = modelClass as unknown as {
    _adapter?: unknown;
    connectionPool?(): ConnectionPool | null | undefined;
  };
  if (klass._adapter || typeof klass.connectionPool !== "function") return null;
  let pool: ConnectionPool | null | undefined;
  try {
    pool = klass.connectionPool();
  } catch {
    return null;
  }
  if (!pool || typeof pool.withConnection !== "function") return null;
  return pool;
}

export function connectionDbConfig(this: typeof Base) {
  return connectionPool.call(this).dbConfig;
}

export function connectionPool(this: typeof Base): ConnectionPool {
  return this.connectionHandler.retrieveConnectionPool(connectionSpecificationName.call(this), {
    role: this.currentRole(),
    shard: this.currentShard(),
    strict: true,
  })!;
}

export function retrieveConnection(this: typeof Base): Promise<DatabaseAdapter> {
  return this.connectionHandler.retrieveConnection(connectionSpecificationName.call(this), {
    role: this.currentRole(),
    shard: this.currentShard(),
  });
}

export function connectedQ(this: typeof Base): boolean {
  const name = connectionSpecificationName.call(this);
  return this.connectionHandler.isConnected(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
  });
}

const CONNECTION_DEPRECATION_MSG =
  "Called deprecated `ActiveRecord::Base.connection` method. " +
  "Either use `with_connection` or `lease_connection`.";

/** @deprecated */
export function connection(this: typeof Base): DatabaseAdapter {
  if ((this as any)._adapter) return (this as any)._adapter;
  const pool = connectionPool.call(this);
  if (pool.isPermanentLease()) {
    const setting = ActiveRecord.permanentConnectionCheckout;
    if (setting === "deprecated") {
      console.warn("DEPRECATION WARNING: " + CONNECTION_DEPRECATION_MSG);
    } else if (setting === "disallowed") {
      throw new ActiveRecordError(CONNECTION_DEPRECATION_MSG);
    }
    return pool.leaseConnectionSync();
  }
  return pool.activeConnection!;
}

export function isPrimaryClass(this: typeof Base): boolean {
  return this.name === "Base" || coreIsApplicationRecordClass.call(this as any);
}

export function adapterClass(this: typeof Base): Promise<new (...args: any[]) => DatabaseAdapter> {
  return connectionPool.call(this).dbConfig.adapterClass() as Promise<
    new (...args: any[]) => DatabaseAdapter
  >;
}

export function adapterClassSync(
  this: typeof Base,
): (new (...args: any[]) => DatabaseAdapter) | null {
  const directAdapter = (this as any)._adapter;
  if (directAdapter) {
    return directAdapter.constructor as new (...args: any[]) => DatabaseAdapter;
  }
  return connectionPool.call(this).dbConfig.adapterClassSync() as
    | (new (...args: any[]) => DatabaseAdapter)
    | null;
}

export function removeConnection(this: typeof Base): DatabaseConfig | undefined {
  const name = connectionSpecificationName.call(this);
  if (
    this.connectionHandler.retrieveConnectionPool(name, {
      role: this.currentRole(),
      shard: this.currentShard(),
    })
  ) {
    (this as any)._connectionSpecificationName = undefined;
  }
  return this.connectionHandler.removeConnectionPool(name, {
    role: this.currentRole(),
    shard: this.currentShard(),
  });
}

export function connectionSpecificationName(this: typeof Base): string {
  const ownHas = Object.prototype.hasOwnProperty.call(this, "_connectionSpecificationName");

  if (ownHas && (this as any)._connectionSpecificationName != null) {
    return (this as any)._connectionSpecificationName;
  }

  if (ownHas) {
    if (this.name === "Base") return "ActiveRecord::Base";
    const parent = Object.getPrototypeOf(this);
    if (parent && typeof parent === "function" && parent !== this) {
      return connectionSpecificationName.call(parent as typeof Base);
    }
    return "ActiveRecord::Base";
  }

  if (this.name === "Base") return "ActiveRecord::Base";
  if (typeof (this as any).primaryClassQ === "function" && (this as any).primaryClassQ()) {
    return "ActiveRecord::Base";
  }
  if ((this as any).connectionClassQ?.()) {
    return this.name;
  }
  const parent = Object.getPrototypeOf(this);
  if (parent && typeof parent === "function" && parent !== this) {
    return connectionSpecificationName.call(parent as typeof Base);
  }
  return "ActiveRecord::Base";
}

export function schemaCache(this: typeof Base) {
  return connectionPool.call(this).schemaCache;
}

export function clearCacheBang(this: typeof Base): void {
  const cache = schemaCache.call(this);
  if (cache && typeof cache.clearBang === "function") {
    cache.clearBang();
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

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return value != null && typeof (value as any).then === "function";
}

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
  let entry!: Parameters<typeof appendToConnectedToStack>[0];
  appendToConnectedToStack(
    (entry = {
      role,
      shard,
      preventWrites: resolvedPreventWrites,
      klasses: [this] as any[],
    }),
  );

  let result: T;
  try {
    result = fn();
  } catch (error) {
    removeStackEntry(entry);
    throw error;
  }

  if (isRelationLike(result)) {
    let loaded: unknown;
    try {
      loaded = (result as any).load();
    } catch (error) {
      removeStackEntry(entry);
      throw error;
    }
    return withCleanup(loaded as T, () => removeStackEntry(entry));
  }

  if (isThenable(result)) {
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
  klasses: any[];
}): void {
  if (isShardSwappingProhibited() && entry.shard) {
    throw new ArgumentError("cannot swap `shard` while shard swapping is prohibited.");
  }
  connectedToStack().push(entry);
}

async function _loadAdapter(name: string): Promise<new (arg: unknown) => DatabaseAdapter> {
  return resolveConnectionAdapter(name);
}

export const DEFAULT_ENV = (): string => DatabaseConfigurations.defaultEnv;

/**
 * @missingRailsCall call — PERMANENT
 * @missingRailsCall connection_handler — PERMANENT
 */
export async function establishConnection(
  modelClass: typeof Base,
  configOrEnv?:
    | string
    | DatabaseConfig
    | {
        adapter?: string;
        url?: string;
        database?: string;
        host?: string;
        port?: number | string;
        username?: string;
        password?: string;
        [key: string]: unknown;
      },
): Promise<void> {
  if (!modelClass.name) throw new Error("Anonymous class is not allowed.");
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

  configOrEnv ??= DEFAULT_ENV();
  const dbConfig = modelClass.resolveConfigForConnection(configOrEnv);
  await establishWithDbConfig(modelClass, dbConfig);
}

function validateConfigDefaultTimezone(config: { [key: string]: unknown }): "utc" | "local" | null {
  const raw = config.default_timezone;
  if (raw == null) return null;
  if (raw !== "utc" && raw !== "local") {
    throw new ArgumentError("default_timezone must be either 'utc' or 'local'");
  }
  return raw;
}

async function establishWithDbConfig(
  modelClass: typeof Base,
  dbConfig: DatabaseConfig,
): Promise<void> {
  const config = dbConfig.configuration as Record<string, unknown>;
  const tz = validateConfigDefaultTimezone(config);

  const { adapterName, connectUrl } = deriveAdapterAndUrl(dbConfig);
  if (!adapterName) {
    throw new AdapterNotSpecified(
      `Database configuration for "${dbConfig.envName}" must include an adapter name or a URL.`,
    );
  }

  let configForConnect = config;
  if (!dbConfig.adapter) {
    configForConnect = _setConfigurationHash(dbConfig, {
      ...config,
      adapter: adapterName,
    }) as Record<string, unknown>;
  }

  await establishWithConfig(modelClass, adapterName, connectUrl, configForConnect, dbConfig);
  if (tz) ActiveRecord.defaultTimezone = tz;
}

function deriveAdapterAndUrl(dbConfig: DatabaseConfig): {
  adapterName: string | undefined;
  connectUrl: string;
} {
  const originalUrl =
    (dbConfig instanceof UrlConfig ? dbConfig.url : undefined) ||
    (dbConfig.configuration.url as string) ||
    "";
  const adapterName =
    dbConfig.adapter || (originalUrl ? adapterNameFromUrl(originalUrl) : undefined);
  const connectUrl = (dbConfig.configuration as { database?: string }).database ? "" : originalUrl;
  return { adapterName, connectUrl };
}

async function establishWithConfig(
  modelClass: typeof Base,
  adapterName: string,
  url: string,
  config?: Record<string, unknown>,
  dbConfigOverride?: DatabaseConfig,
): Promise<void> {
  await _loadAdapter(adapterName);

  const env = DatabaseConfigurations.defaultEnv;
  let dbConfig: DatabaseConfig;
  if (dbConfigOverride) {
    dbConfig = dbConfigOverride;
  } else if (url) {
    const { url: _droppedUrl, ...configWithoutUrl } = config ?? {};
    dbConfig = new UrlConfig(env, "primary", url, { adapter: adapterName, ...configWithoutUrl });
  } else {
    dbConfig = new HashConfig(env, "primary", { adapter: adapterName, url, ...config });
  }

  modelClass.connectionClass = true;

  const role = coreCurrentRole.call(modelClass as any);
  const shard = coreCurrentShard.call(modelClass as any);

  modelClass.connectionHandler.establishConnection(dbConfig, {
    ownerName: modelClass.connectionClassForSelf(),
    role,
    shard,
  });
}

export {
  normalizeAdapterName,
  parseSqliteUrl,
  buildAdapterArg,
} from "./connection-adapters/adapter-args.js";
export { adapterNameFromUrl };

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
  connectedQ,
  connection,
  isPrimaryClass,
  adapterClass,
  adapterClassSync,
  removeConnection,
  schemaCache,
  clearCacheBang,
  shardKeys,
  isSharded,
  defaultShard,
  withRoleAndShard,
  appendToConnectedToStack,
};

/** @internal */
export function resolveConfigForConnection(
  this: typeof Base,
  configOrEnv: unknown,
): DatabaseConfig {
  if (!this.name) throw new Error("Anonymous class is not allowed.");
  (this as any)._connectionSpecificationName = isPrimaryClass.call(this)
    ? "ActiveRecord::Base"
    : this.name;
  return baseConfigurations().resolve(configOrEnv);
}
