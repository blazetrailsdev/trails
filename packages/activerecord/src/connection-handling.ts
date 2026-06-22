import type { Base } from "./base.js";
import { WRITING_ROLE, READING_ROLE } from "./roles.js";
import type { DatabaseAdapter } from "./adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport";
import { DatabaseConfigurations, type RawConfigurations } from "./database-configurations.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { UrlConfig } from "./database-configurations/url-config.js";
import { DatabaseConfig } from "./database-configurations/database-config.js";
import {
  resolve as resolveConnectionAdapter,
  resolveSync as resolveConnectionAdapterSync,
} from "./connection-adapters.js";
import {
  buildAdapterArg,
  normalizeAdapterName,
  parseSqliteUrl,
} from "./connection-adapters/adapter-args.js";
import {
  AdapterNotFound,
  AdapterNotSpecified,
  ConnectionNotEstablished,
  ConfigurationError,
  NotImplementedError,
  ActiveRecordError,
} from "./errors.js";
import { permanentConnectionCheckout } from "./ar-config.js";
import { setDefaultTimezone } from "./type/internal/timezone.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  connectedToStack,
  currentRole as coreCurrentRole,
  currentShard as coreCurrentShard,
  isApplicationRecordClass as coreIsApplicationRecordClass,
} from "./core.js";
import { IsolatedExecutionState } from "@blazetrails/activesupport";

/**
 * Connection establishment and management for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::ConnectionHandling
 */

const PROHIBIT_SHARD_SWAPPING_KEY = Symbol.for("ar_prohibit_shard_swapping");

const QUERY_CONNECTION_KEY = Symbol.for("ar_query_connection");

/**
 * The connection yielded by the enclosing internal `with_connection` wrap
 * ({@link withQueryConnection}), or `null` outside one. Internal query and
 * transaction code reads this *threaded* connection instead of the deprecated
 * `Model.connection` getter, so it never flips the lease permanent — mirroring
 * Rails, which threads the `with_connection` block's `connection` parameter
 * through its query/transaction code rather than re-resolving `.connection`.
 *
 * @internal
 */
export function currentQueryConnection(): DatabaseAdapter | null {
  return IsolatedExecutionState.get<DatabaseAdapter>(QUERY_CONNECTION_KEY) ?? null;
}

/**
 * The threaded {@link currentQueryConnection}, but only when it belongs to
 * `modelClass`'s *own* pool — otherwise `null`. Internal reads use this so a
 * statement for model B that runs while only an outer wrap for a *different-pool*
 * model A is active (cross-database eager-load, or `update_columns` issued inside
 * another model's `transaction` block) resolves against B's pool rather than
 * adopting A's connection. The pool-identity check mirrors the `connection`
 * getter's guard; it returns `null` (so callers fall back to `.connection`) for a
 * directly-assigned adapter or a model whose `connectionPool()` throws (e.g. a
 * HABTM join model with no registered pool), preserving those models' existing
 * resolution — including `_resolveAdapter`'s `ConnectionNotEstablished` path.
 *
 * @internal
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
          return new AdapterClass(...adapterArg);
        },
      });
      pool.adapterReady = adapterReady;
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

  // Mirrors Rails: push the literal classes (`klasses: classes`) rather than
  // their resolved connection_class_for_self. The caller's CCFS is resolved
  // at read time in core.ts#matchesStack, so a `connected_to_many` scope
  // doesn't leak across abstract subclasses that happen to share a CCFS.
  const klasses = new Set<any>(normalized);
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
    // Mirrors Rails: push `[self]` (resolution to connection_class_for_self
    // happens at read time in core.ts#matchesStack).
    klasses: new Set([this]),
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
    return Promise.reject(err);
  }
}

/**
 * Run an internal query/transaction inside plain `with_connection` (matching
 * Rails' `with_connection`) so the pool releases its connection afterwards. The
 * yielded connection is threaded through {@link currentQueryConnection} so the
 * internal build/execute/callback path reads *it* rather than the deprecated
 * `Model.connection` getter — which would otherwise flip the lease permanent
 * under `permanent_connection_checkout = :deprecated | :disallowed`. A user who
 * explicitly calls `Model.lease_connection` inside the block still makes the
 * lease permanent (matching Rails), because that path goes through the getter.
 *
 * Runs the block inline (no wrap) when there is no lease to manage: a model
 * backed by a directly-assigned adapter (`Model.adapter = x`), or one without a
 * handler-registered pool (e.g. HABTM join models, whose `.connection` delegates
 * to the owner and whose `connectionPool()` therefore throws for a direct-adapter
 * owner).
 *
 * @internal
 */
export function withQueryConnection<T>(modelClass: typeof Base, run: () => Promise<T>): Promise<T> {
  const klass = modelClass as unknown as {
    _adapter?: unknown;
    connectionPool?(): ConnectionPool | null | undefined;
  };
  if (klass._adapter || typeof klass.connectionPool !== "function") return run();
  let pool: ConnectionPool | null | undefined;
  try {
    pool = klass.connectionPool();
  } catch {
    return run();
  }
  if (!pool || typeof pool.withConnection !== "function") return run();
  return Promise.resolve(
    pool.withConnection((conn) => IsolatedExecutionState.scope(QUERY_CONNECTION_KEY, conn, run)),
  ) as Promise<T>;
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

const CONNECTION_DEPRECATION_MSG =
  "Called deprecated `ActiveRecord::Base.connection` method. " +
  "Either use `with_connection` or `lease_connection`.";

/** @deprecated */
export function connection(this: typeof Base): DatabaseAdapter {
  // Fast path: directly assigned via `Model.adapter = x` (tests + simple setups)
  if ((this as any)._adapter) return (this as any)._adapter;
  // Inside an internal `withQueryConnection` wrap, resolve to the connection it
  // threaded for *this* pool — without flipping the lease permanent. This keeps
  // schema-reflection reads on the wrapped query/transaction path (columnsHash,
  // timestamp columns, …) off the deprecated-getter lease, matching Rails, which
  // threads the `with_connection` block parameter through that code. An explicit
  // `lease_connection()` still goes straight to the pool and makes the lease
  // permanent.
  const threaded = threadedConnectionFor(this);
  if (threaded) return threaded;
  const pool = connectionPool.call(this);
  if (pool.isPermanentLease()) {
    const setting = permanentConnectionCheckout;
    if (setting === "deprecated") {
      console.warn("DEPRECATION WARNING: " + CONNECTION_DEPRECATION_MSG);
    } else if (setting === "disallowed") {
      throw new ActiveRecordError(CONNECTION_DEPRECATION_MSG);
    }
    return pool.leaseConnection();
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

/**
 * Synchronous, non-leasing variant of {@link adapterClass}. Resolves the
 * adapter constructor from a directly-assigned `_adapter` (test/simple setups)
 * or the pool's pre-warmed sync adapter cache, without ever leasing a
 * connection. Returns `null` when no pool/adapter is resolvable yet. Mirrors
 * Rails' `model.adapter_class` — a class-level lookup that does not check out a
 * connection — for code paths (e.g. `column_name_with_order_matcher`) that only
 * need static adapter metadata.
 */
export function adapterClassSync(
  this: typeof Base,
): (new (...args: any[]) => DatabaseAdapter) | null {
  const directAdapter = (this as any)._adapter;
  if (directAdapter) {
    return directAdapter.constructor as new (...args: any[]) => DatabaseAdapter;
  }
  let pool: ConnectionPool | undefined;
  try {
    pool = connectionPool.call(this);
  } catch {
    return null;
  }
  return pool.dbConfig.adapterClassSync() as (new (...args: any[]) => DatabaseAdapter) | null;
}

export function removeConnection(this: typeof Base): DatabaseConfig | undefined {
  const name = connectionSpecificationName.call(this);
  if (
    this.connectionHandler.retrieveConnectionPool(name, {
      role: coreCurrentRole.call(this as any),
      shard: coreCurrentShard.call(this as any),
    })
  ) {
    (this as any)._connectionSpecificationName = undefined;
  }
  return this.connectionHandler.removeConnectionPool(name, {
    role: coreCurrentRole.call(this as any),
    shard: coreCurrentShard.call(this as any),
  });
}

export function connectionSpecificationName(this: typeof Base): string {
  // Mirrors Rails' connection_specification_name reader (connection_handling.rb:316-320):
  //   if @connection_specification_name.nil?
  //     return self == Base ? Base.name : superclass.connection_specification_name
  //   @connection_specification_name
  //
  // Three branches, in order:
  //   1. Non-nil own property → explicit assignment; return it.
  //   2. Nil own property (cleared by removeConnection) → walk parent chain.
  //      primaryClassQ/connectionClassQ are NOT consulted here, matching Rails
  //      where nil always delegates regardless of connection_class?.
  //   3. No own property → derive from class shape (TS-specific shortcuts).

  const ownHas = Object.prototype.hasOwnProperty.call(this, "_connectionSpecificationName");

  // Branch 1: explicit value.
  if (ownHas && (this as any)._connectionSpecificationName != null) {
    return (this as any)._connectionSpecificationName;
  }

  // Branch 2: explicitly cleared → parent walk (Base terminates).
  if (ownHas) {
    if (this.name === "Base") return "Base";
    const parent = Object.getPrototypeOf(this);
    if (parent && typeof parent === "function" && parent !== this) {
      return connectionSpecificationName.call(parent as typeof Base);
    }
    return "Base";
  }

  // Branch 3: no own property — derive from class shape.
  // Base is always its own terminal; primary classes (ApplicationRecord) store
  // their pool under "Base" per PoolConfig#connectionDescriptor's normalization.
  if (this.name === "Base") return "Base";
  if (typeof (this as any).primaryClassQ === "function" && (this as any).primaryClassQ()) {
    return "Base";
  }
  // connectionClass = true means establish_connection or connectsTo was called
  // and planted a pool under this class's name without setting the ivar explicitly.
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
  // Mirrors Rails `with_role_and_shard`: push `[self]` raw, and let
  // core.ts#matchesStack resolve the caller's connection_class_for_self at
  // read time. Pushing the pre-resolved CCFS would leak a scope opened on
  // an abstract subclass without `connectsTo` (so CCFS walks up to Base)
  // into every pool.
  const entry = {
    role,
    shard,
    preventWrites: resolvedPreventWrites,
    klasses: new Set<any>([this]),
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
    return withCleanup(loaded as T, () => removeStackEntry(entry));
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
  } else {
    // Mirrors Rails `establish_connection(config_or_env)`
    // (connection_handling.rb:51-54): every input — string URL, hash, or an
    // already-resolved DatabaseConfig (the `run_without_connection` restore
    // path) — funnels through `resolve_config_for_connection`, which plants the
    // connection_specification_name and then `configurations.resolve(...)` (a
    // no-op that returns the object unchanged for a DatabaseConfig). The
    // resolved object then goes to the handler verbatim, so the pool stores it
    // as-is instead of rebuilding a fresh UrlConfig/HashConfig. tz validation
    // and buildAdapterArg live inside establishWithDbConfig.
    const dbConfig = resolveConfigForConnection.call(modelClass, config);
    await establishWithDbConfig(modelClass, dbConfig);
  }
}

/**
 * Validate a `default_timezone` entry in an `establish_connection` config,
 * returning the normalized value (or `null` when absent).
 *
 * Rails stores the connection's `default_timezone` as per-adapter instance
 * state (`AbstractAdapter#default_timezone`, abstract_adapter.rb:167/219-220),
 * so two simultaneous connections can cast in different zones. Our date/time
 * casting resolves the zone from the process-wide `setDefaultTimezone`, so the
 * caller applies the validated value to that singleton on success — giving the
 * same observable result for the single-connection case the tests exercise.
 * The multi-connection divergence (last establish_connection wins for all
 * subsequent casts) is a tracked fidelity deviation, not yet converged; see
 * RFC 0023 (surfaced-deviations).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter.validate_default_timezone
 */
function validateConfigDefaultTimezone(config: { [key: string]: unknown }): "utc" | "local" | null {
  // Rails reads only `config[:default_timezone]` (abstract_adapter.rb:73-81);
  // no camelCase alias.
  const raw = config.default_timezone;
  if (raw == null) return null;
  if (raw !== "utc" && raw !== "local") {
    throw new ArgumentError("default_timezone must be either 'utc' or 'local'");
  }
  return raw;
}

/**
 * Mirrors Rails `establish_connection(db_config)` where the argument is already
 * a resolved `DatabaseConfig`. Derives the adapter name and connection URL from
 * the object — exactly as {@link autoConnect} does for the config it looks up —
 * and threads the object through {@link establishWithConfig} so the pool stores
 * the captured config verbatim instead of rebuilding one from its hash.
 */
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

  // The handler reads the adapter off the resolved config (resolvePoolConfig).
  // When it was inferred from a bare URL — e.g. the `:memory:` shorthand a
  // DATABASE_URL carries with no scheme — rather than present in the hash,
  // surface it on the config so the verbatim object the pool stores still
  // names its adapter. Rails' URL configs always parse a scheme, so their
  // configuration_hash always carries an adapter; this restores that invariant
  // for the scheme-less shorthand the old rebuild path used to backfill.
  if (!dbConfig.adapter) {
    (config as { adapter?: string }).adapter = adapterName;
  }

  await establishWithConfig(modelClass, adapterName, connectUrl, config, dbConfig);
  if (tz) setDefaultTimezone(tz);
}

/**
 * Derive the adapter name and the URL to forward to the adapter layer from a
 * resolved DatabaseConfig. Shared by {@link autoConnect} (config looked up from
 * `Base.configurations`) and {@link establishWithDbConfig} (config handed
 * straight to `establish_connection`) so the two resolution paths can't drift.
 *
 * The original URL is always usable for adapter inference (e.g.
 * `sqlite3:db/test.sqlite3` → "sqlite3"), even when the connection target
 * should be built from a (possibly-mutated) configuration hash.
 *
 * `connectUrl` prefers the configuration hash over the raw URL string when an
 * explicit `database` is set — Rails' `establish_connection` resolves from
 * `configuration_hash`, not the raw URL, so callers that mutate `_database`
 * (e.g. TestDatabases.create_and_load_schema appending a worker index) actually
 * reconnect to the mutated DB. The URL is only forwarded to the adapter layer
 * when the configuration carries no explicit `database` — i.e. for opaque
 * adapter strings like `jdbc:` that buildUrlHash passes through without
 * decomposing.
 */
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
  const normalized = normalizeAdapterName(adapterName);
  // Pass the original adapter name to the registry so caller overrides
  // like register("mysql2", ...) aren't shadowed by normalization.
  const AdapterClass = await _loadAdapter(adapterName);

  // For SQLite, preserve adapter options (pragmas, strict, readonly, driver,
  // etc.) by routing through buildAdapterArg whenever a config hash is given;
  // bare-URL inputs fall through to the simple filename path.
  let adapterArgs: unknown[];
  if (config) {
    adapterArgs = buildAdapterArg(adapterName, config);
  } else if (normalized === "sqlite") {
    adapterArgs = [parseSqliteUrl(url || ":memory:")];
  } else {
    adapterArgs = [url];
  }

  // Mirror Rails' db_config_handler (database_configurations.rb:65-70):
  // `url ? UrlConfig.new(env, name, url, config) : HashConfig.new(...)`.
  // A UrlConfig parses the URL into its hash and surfaces the database name
  // living in the path — e.g. the per-worker slot DB `rails_js_test_2` that
  // test-setup-worker-db.ts suffixes on — natively via the URL fallback
  // (url-config.ts), so `connectionDbConfig().database` is no longer undefined.
  //
  // The raw `url` is stripped from the config override before it reaches
  // UrlConfig — Rails' build_db_config_from_hash deletes :url from the hash so
  // the URL lives only on `@url`, and `configuration_hash` carries the parsed
  // discrete fields (database/host/port/...) rather than the verbatim string.
  // This matches the resolver path (database-configurations.ts:246) and the
  // "url removed from hash" parity test.
  const env = DatabaseConfigurations.currentEnv();
  let dbConfig: DatabaseConfig;
  if (dbConfigOverride) {
    dbConfig = dbConfigOverride;
  } else if (url) {
    const { url: _droppedUrl, ...configWithoutUrl } = config ?? {};
    dbConfig = new UrlConfig(env, "primary", url, { adapter: adapterName, ...configWithoutUrl });
  } else {
    dbConfig = new HashConfig(env, "primary", { adapter: adapterName, url, ...config });
  }

  // Mirror Rails: establish_connection makes the receiver its own connection
  // class so it gets an independent pool entry under its own name instead of
  // inheriting the Base pool. Without this Tag.establishConnection and
  // Tag2.establishConnection both resolve connectionClassForSelf() → Base and
  // register under the same "Base" pool key, defeating cross-connection
  // isolation tests.
  modelClass.connectionClass = true;

  // Honor the active connected_to scope so callers like
  // `connected_to(role:, shard:) { establish_connection(db_config) }` register
  // the new pool under the current role/shard instead of writing/default.
  const role = coreCurrentRole.call(modelClass as any);
  const shard = coreCurrentShard.call(modelClass as any);

  modelClass.connectionHandler.establishConnection(dbConfig, {
    owner: modelClass.connectionClassForSelf(),
    role,
    shard,
    adapterFactory: () =>
      new (AdapterClass as new (...args: unknown[]) => DatabaseAdapter)(...adapterArgs),
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
  const env = DatabaseConfigurations.currentEnv();
  const primaryConfigs = configs.configsFor({ envName: env, name: "primary" });
  const dbConfig = primaryConfigs[0] ?? configs.findDbConfig(env);

  if (!dbConfig) {
    throw new ConnectionNotEstablished(
      `No database configuration found for ${modelClass.name}. ` +
        `Add config/database.json, set DATABASE_URL, or call ${modelClass.name}.establishConnection(url)`,
    );
  }

  // Rails has no separate no-arg path: `config_or_env ||= DEFAULT_ENV` then the
  // same `resolve_config_for_connection` funnel (connection_handling.rb:50-53).
  // The looked-up DatabaseConfig is handed straight to the shared object funnel
  // — adapter/url derivation and the handler call live in establishWithDbConfig
  // — instead of re-deriving and rebuilding a fresh config here.
  await establishWithDbConfig(modelClass, dbConfig);
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

// Re-exports for backward compat — these now live in adapter-args.ts so
// ConnectionPool can use them without back-edging through connection-handling.
export {
  normalizeAdapterName,
  parseSqliteUrl,
  buildAdapterArg,
} from "./connection-adapters/adapter-args.js";

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
