import { Notifications } from "@blazetrails/activesupport";
import {
  typeCastedBinds,
  toSqlAndBinds,
  arelFromRelation,
  type DatabaseStatementsHost,
} from "./database-statements.js";
import { Result } from "../../result.js";
import {
  executionContextId,
  registerContextExitHook,
} from "./connection-pool/execution-context.js";

/**
 * Matches the locking suffixes Rails refuses to cache (`SELECT ... FOR
 * UPDATE` and friends). Mirrors `arel.locked` short-circuit in
 * `QueryCache#select_all`.
 */
const LOCKED_QUERY = /\bFOR\s+(UPDATE|SHARE|NO\s+KEY\s+UPDATE|KEY\s+SHARE)\b/i;

const DEFAULT_MAX_SIZE = 100;

/**
 * LRU cache store for query results.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::Store
 */
export class Store {
  private _map = new Map<string, Record<string, unknown>[]>();
  private _maxSize: number;
  private _version: { value: number } | null;
  private _currentVersion: number;
  enabled = false;
  dirties = true;

  constructor(version: { value: number } | null = null, maxSize: number = DEFAULT_MAX_SIZE) {
    this._maxSize = maxSize;
    this._version = version;
    this._currentVersion = version?.value ?? 0;
  }

  /** @internal */
  private checkVersion(): void {
    if (this._version && this._version.value !== this._currentVersion) {
      this._map.clear();
      this._currentVersion = this._version.value;
    }
  }

  get size(): number {
    this.checkVersion();
    return this._map.size;
  }

  get empty(): boolean {
    this.checkVersion();
    return this._map.size === 0;
  }

  isDirties(): boolean {
    return this.dirties;
  }

  get(key: string): Record<string, unknown>[] | undefined {
    this.checkVersion();
    if (!this.enabled) return undefined;
    const entry = this._map.get(key);
    if (entry) {
      // Move to end (LRU)
      this._map.delete(key);
      this._map.set(key, entry);
    }
    return entry;
  }

  computeIfAbsent(
    key: string,
    compute: () => Promise<Record<string, unknown>[]>,
  ): Promise<Record<string, unknown>[]> {
    this.checkVersion();
    if (!this.enabled) return compute();

    const cached = this.get(key);
    if (cached !== undefined) {
      return Promise.resolve(cached.map((row) => ({ ...row })));
    }

    return compute().then((result) => {
      if (this._maxSize <= 0) {
        // maxSize of 0 or negative disables caching — return without storing
        return result;
      }
      if (this._map.size >= this._maxSize) {
        const firstKey = this._map.keys().next().value;
        if (firstKey !== undefined) this._map.delete(firstKey);
      }
      this._map.set(key, result);
      return result.map((row) => ({ ...row }));
    });
  }

  clear(): void {
    this._map.clear();
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::QueryCacheRegistry
 */
export class QueryCacheRegistry {
  private _caches = new Map<string, Store>();

  computeIfAbsent(key: string, create: () => Store): Store {
    let cache = this._caches.get(key);
    if (!cache) {
      cache = create();
      this._caches.set(key, cache);
    }
    return cache;
  }

  getCache(key: string): Store {
    return this.computeIfAbsent(key, () => new Store());
  }

  clear(): void {
    for (const cache of this._caches.values()) {
      cache.clear();
    }
    this._caches.clear();
  }

  deleteStore(key: string): void {
    this._caches.delete(key);
  }
}

/**
 * Module-level registry of live ConnectionPoolConfigurations. Wired so the
 * execution-context exit hook in `withExecutionContext` can evict each pool's
 * per-context Store, mirroring Rails' GC of `IsolatedExecutionState.context`.
 */
const ACTIVE_CACHE_CONFIGS = new Set<WeakRef<ConnectionPoolConfiguration>>();

function evictQueryCacheStoresForContext(contextId: string): void {
  for (const ref of ACTIVE_CACHE_CONFIGS) {
    const cfg = ref.deref();
    if (!cfg) {
      ACTIVE_CACHE_CONFIGS.delete(ref);
      continue;
    }
    cfg.deleteStore(contextId);
  }
}

registerContextExitHook(evictQueryCacheStoresForContext);

/**
 * Host interface for QueryCache connection-level mixin methods.
 */
export interface QueryCachePool {
  enableQueryCache?<T>(fn: () => T | Promise<T>): T | Promise<T>;
  disableQueryCache?<T>(fn: () => T | Promise<T>, opts?: { dirties?: boolean }): T | Promise<T>;
  enableQueryCacheBang?(): void;
  disableQueryCacheBang?(): void;
  clearQueryCache?(): void;
  dirtiesQueryCache?: boolean;
}

export interface QueryCacheHost extends DatabaseStatementsHost {
  _queryCache: Store | null;
  pool?: DatabaseStatementsHost["pool"] & QueryCachePool;
  /**
   * Re-entrancy depth of the wired write methods. A `dirtiesQueryCache` wrapper
   * bumps it around its (async) call ONLY when that call is itself dirtying (not
   * on a `"SCHEMA"` reflection read or an `uncached(dirties: false)` write), so a
   * lower-level `executeMutation` — which every CRUD write funnels through — can
   * tell it is nested inside an already-dirtying write and skip a second clear.
   * DDL reaches `executeMutation` directly (depth 0) and clears, matching Rails'
   * `execute`-based DDL. @internal
   */
  _writeDirtyDepth?: number;
  // Mixed in from the QueryCache module below. Dispatched through `this` (not
  // the module-level functions) so a per-connection override is honored, as in
  // Rails' `def connection.cache_notification_info`.
  cacheNotificationInfo(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
  ): Record<string, unknown>;
  cacheNotificationInfoResult(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
    result: Record<string, unknown>[],
  ): Record<string, unknown>;
  lookupSqlCache(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
  ): Record<string, unknown>[] | undefined;
  cacheSql(
    sql: string,
    name: string | null | undefined,
    binds: unknown[],
    execute: () => Promise<Record<string, unknown>[]>,
  ): Promise<Record<string, unknown>[]>;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache::ConnectionPoolConfiguration
 *
 * Mixin for connection pools that manages the per-thread query cache.
 */
export class ConnectionPoolConfiguration {
  private _threadQueryCaches = new QueryCacheRegistry();
  private _queryCacheMaxSize: number | null;
  private _queryCacheVersion = { value: 0 };
  private _pinnedCount = 0;

  constructor(queryCacheConfig?: number | false | null) {
    if (queryCacheConfig === 0 || queryCacheConfig === false) {
      this._queryCacheMaxSize = null;
    } else if (typeof queryCacheConfig === "number") {
      this._queryCacheMaxSize = queryCacheConfig;
    } else {
      this._queryCacheMaxSize = DEFAULT_MAX_SIZE;
    }
    ACTIVE_CACHE_CONFIGS.add(new WeakRef(this));
  }

  /** @internal */
  deleteStore(contextId: string): void {
    this._threadQueryCaches.deleteStore(contextId);
  }

  checkoutAndVerify(connection: QueryCacheHost): QueryCacheHost {
    // Mirrors Rails' `connection.query_cache ||= query_cache`: only assign if
    // the connection has no cache yet. Checkin nulls `_queryCache`, so this
    // is equivalent to an unconditional set in steady state — but matches
    // Rails for callers that wire a Store directly before pool adoption.
    if (!connection._queryCache) connection._queryCache = this.queryCache;
    return connection;
  }

  async disableQueryCache<T>(
    fn: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): Promise<T> {
    const { dirties = true } = options;
    const qc = this.queryCache;
    const oldEnabled = qc.enabled;
    const oldDirties = qc.dirties;
    qc.enabled = false;
    qc.dirties = dirties;
    try {
      return await fn();
    } finally {
      qc.enabled = oldEnabled;
      qc.dirties = oldDirties;
    }
  }

  async enableQueryCache<T>(fn: () => T | Promise<T>): Promise<T> {
    const qc = this.queryCache;
    const oldEnabled = qc.enabled;
    const oldDirties = qc.dirties;
    qc.enabled = true;
    qc.dirties = true;
    try {
      return await fn();
    } finally {
      qc.enabled = oldEnabled;
      qc.dirties = oldDirties;
    }
  }

  enableQueryCacheBang(): void {
    const qc = this.queryCache;
    qc.enabled = true;
    qc.dirties = true;
  }

  /**
   * Whether this pool's query cache is disabled by configuration
   * (`db_config.query_cache == false`). The authoritative gate now lives in
   * `QueryCache.run`, mirroring Rails' `next if pool.db_config&.query_cache == false`.
   */
  get queryCacheDisabled(): boolean {
    return this._queryCacheMaxSize === null;
  }

  disableQueryCacheBang(): void {
    const qc = this.queryCache;
    qc.enabled = false;
    qc.dirties = true;
  }

  get queryCacheEnabled(): boolean {
    return this.queryCache.enabled;
  }

  get dirtiesQueryCache(): boolean {
    return this.queryCache.dirties;
  }

  clearQueryCache(): void {
    if (this._pinnedCount > 0) {
      this._queryCacheVersion.value++;
    }
    this.queryCache.clear();
  }

  get queryCache(): Store {
    return this._threadQueryCaches.computeIfAbsent(String(executionContextId()), () => {
      return new Store(this._queryCacheVersion, this._queryCacheMaxSize ?? 0);
    });
  }

  /** @internal */
  incrementPinnedCount(): void {
    this._pinnedCount++;
  }

  /** @internal */
  decrementPinnedCount(): void {
    this._pinnedCount--;
  }
}

// ---------------------------------------------------------------------------
// Connection-level mixin functions
// Mirrors: ActiveRecord::ConnectionAdapters::QueryCache (module mixed into connection)
// ---------------------------------------------------------------------------

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#query_cache (attr_accessor)
 */
export function queryCache(this: QueryCacheHost): Store | null {
  return this._queryCache;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#query_cache_enabled
 */
export function queryCacheEnabled(this: QueryCacheHost): boolean {
  return this._queryCache?.enabled ?? false;
}

/**
 * Enable the query cache within the block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#cache
 */
export async function cache<T>(this: QueryCacheHost, fn: () => T | Promise<T>): Promise<T> {
  if (this.pool?.enableQueryCache) {
    return this.pool.enableQueryCache(fn) as Promise<T>;
  }
  const qc = this._queryCache;
  if (!qc) return fn() as Promise<T>;
  const oldEnabled = qc.enabled;
  const oldDirties = qc.dirties;
  qc.enabled = true;
  qc.dirties = true;
  try {
    return await fn();
  } finally {
    qc.enabled = oldEnabled;
    qc.dirties = oldDirties;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#enable_query_cache!
 */
export function enableQueryCacheBang(this: QueryCacheHost): void {
  if (this.pool?.enableQueryCacheBang) {
    this.pool.enableQueryCacheBang();
    return;
  }
  const qc = this._queryCache;
  if (qc) {
    qc.enabled = true;
    qc.dirties = true;
  }
}

/**
 * Disable the query cache within the block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#uncached
 */
export async function uncached<T>(
  this: QueryCacheHost,
  fn: () => T | Promise<T>,
  options: { dirties?: boolean } = {},
): Promise<T> {
  const { dirties = true } = options;
  if (this.pool?.disableQueryCache) {
    return this.pool.disableQueryCache(fn, { dirties }) as Promise<T>;
  }
  const qc = this._queryCache;
  if (!qc) return fn() as Promise<T>;
  const oldEnabled = qc.enabled;
  const oldDirties = qc.dirties;
  qc.enabled = false;
  qc.dirties = dirties;
  try {
    return await fn();
  } finally {
    qc.enabled = oldEnabled;
    qc.dirties = oldDirties;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#disable_query_cache!
 */
export function disableQueryCacheBang(this: QueryCacheHost): void {
  if (this.pool?.disableQueryCacheBang) {
    this.pool.disableQueryCacheBang();
    return;
  }
  const qc = this._queryCache;
  if (qc) {
    qc.enabled = false;
    qc.dirties = true;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#clear_query_cache
 */
export function clearQueryCache(this: QueryCacheHost): void {
  if (this.pool?.clearQueryCache) {
    this.pool.clearQueryCache();
    return;
  }
  this._queryCache?.clear();
}

/** The base (uncached) `selectAll` signature the override wraps via `super`. */
type BaseSelectAll = (
  this: QueryCacheHost,
  arel: string | unknown,
  name?: string | null,
  binds?: unknown[],
  opts?: { allowRetry?: boolean; preparable?: boolean | null },
) => Promise<Result>;

/**
 * Wrap a base `selectAll` (e.g. the one mixed in from `DatabaseStatements`)
 * with the query cache. When the cache is enabled and the query is not locked
 * (`FOR UPDATE` & friends), results are served from / stored in the cache;
 * otherwise the call delegates straight to `original` (Rails' `super`).
 *
 * The cache stores row hashes (`Result#toArray`), so a hit is reconstructed
 * via `Result.fromRowHashes` — matching the retired `QueryCacheAdapter`
 * wrapper's behavior.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache#select_all
 * (query_cache.rb:236), which does `lookup_sql_cache(...) || super` /
 * `cache_sql(...) { super }`.
 */
export function makeCachedSelectAll(original: BaseSelectAll): BaseSelectAll {
  return async function cachedSelectAll(
    this: QueryCacheHost,
    arel: string | unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null },
  ): Promise<Result> {
    // Rails' QueryCache#select_all first unwraps a Relation to its Arel AST
    // (`arel = arel_from_relation(arel)`), then converts the Arel node to
    // SQL + binds via `to_sql_and_binds` before consulting the cache. A SQL
    // string passes through both steps unchanged with its binds intact.
    arel = arelFromRelation(arel);
    const [sql, resolvedBinds, compiledPreparable] = toSqlAndBinds.call(
      this as DatabaseStatementsHost,
      arel,
      binds ?? [],
    );
    binds = resolvedBinds;
    // Rails query_cache.rb:242/248: to_sql_and_binds replaces the incoming
    // preparable with collector.preparable for Arel inputs, and query_cache
    // forwards that returned value to super. Mirror that: compiledPreparable
    // (non-null only for Arel inputs via the visitor) wins; opts.preparable
    // (relation._lastSelectPreparable for string inputs) is the fallback.
    const resolvedPreparable = compiledPreparable ?? opts?.preparable;
    const forwardOpts = { ...opts, preparable: resolvedPreparable };
    const qc = this._queryCache;
    if (qc?.enabled && !LOCKED_QUERY.test(sql)) {
      // Rails splits this by `async`: the sync path is `cache_sql { super }`
      // (which itself tracks `hit` and instruments, query_cache.rb:283,291-296),
      // the async path is `lookup_sql_cache(...) || super`. trails has no async
      // FutureResult path, so it always takes the `lookup_sql_cache || cacheSql`
      // shape. INVARIANT: there must be no `await` between this lookupSqlCache
      // and the cacheSql below — lookupSqlCache runs synchronously and cacheSql
      // reaches `Store.computeIfAbsent`'s synchronous `get` immediately, so
      // nothing can populate the key in between. That is why trails' cacheSql
      // carries no `hit`/instrument branch of its own: a hit is always caught
      // and instrumented here by lookupSqlCache; Rails' hit branch effectively
      // lives in `Store.computeIfAbsent` (the dup-on-hit path). Break the
      // no-await invariant and a concurrent write could turn the cacheSql call
      // into a silent, uninstrumented cache hit.
      const cached = this.lookupSqlCache(sql, name, binds ?? []);
      if (cached !== undefined) {
        return Result.fromRowHashes(cached.map((r) => ({ ...r })));
      }
      const rows = await this.cacheSql(sql, name, binds ?? [], async () => {
        const result = await original.call(this, sql, name, binds, forwardOpts);
        return result.toArray();
      });
      return Result.fromRowHashes(rows);
    }
    return original.call(this, sql, name, binds, forwardOpts);
  };
}

/**
 * Run `original` with `_writeDirtyDepth` incremented for the whole (possibly
 * async) call, so a nested `executeMutation` sees depth > 0 and skips its own
 * clear. The counter must stay raised until the returned promise settles —
 * `executeMutation` is awaited *inside* `original`, after it returns the
 * promise — so bracket both the sync and async completion paths.
 * @internal
 */
function withWriteDirtyDepth(host: QueryCacheHost, original: () => unknown): unknown {
  host._writeDirtyDepth = (host._writeDirtyDepth ?? 0) + 1;
  const release = (): void => {
    host._writeDirtyDepth = (host._writeDirtyDepth ?? 0) - 1;
  };
  let result: unknown;
  try {
    result = original();
  } catch (err) {
    release();
    throw err;
  }
  if (result != null && typeof (result as { then?: unknown }).then === "function") {
    return (result as Promise<unknown>).then(
      (value) => {
        release();
        return value;
      },
      (err) => {
        release();
        throw err;
      },
    );
  }
  release();
  return result;
}

/** @internal Reassign each named prototype slot to a cache-dirtying wrapper. */
function wireDirties(
  base: { prototype: object },
  methodNames: string[],
  skipSchemaReflection: boolean,
): void {
  const proto = base.prototype as Record<string, unknown>;
  for (const methodName of methodNames) {
    const original = proto[methodName];
    if (typeof original !== "function") continue;

    proto[methodName] = function (this: QueryCacheHost, ...args: unknown[]) {
      // Clear unconditionally, mirroring Rails' `dirties_query_cache` (each wired
      // method clears via `super`, query_cache.rb:13). The clear is idempotent, so
      // a nested wired write clearing an already-cleared cache is harmless — do NOT
      // gate the clear on `_writeDirtyDepth`: under concurrent writes on one
      // connection (`Promise.all([a.save(), b.save()])`) B would be *entered* while
      // A's depth is still raised across its await and would skip its clear, going
      // stale. The depth guard lives only at the `executeMutation` leaf, where it
      // keeps a single logical CRUD write to one clear (`times: 1`).
      const dirtying =
        !!this._queryCache?.dirties && !(skipSchemaReflection && args.includes("SCHEMA"));
      if (dirtying) {
        this._queryCache!.clear();
        // Raise the write-dirty scope ONLY when this call is itself dirtying, so
        // the leaf `executeMutation` it funnels into defers (times: 1). A
        // non-dirtying call — cache off, `uncached(dirties: false)`, or a
        // `"SCHEMA"` reflection *read* — must NOT raise the counter: a read that
        // held `_writeDirtyDepth > 0` would make a DDL `executeMutation` entered in
        // its window skip its clear (the counter is named for *writes*). The
        // nested leaf of a non-dirtying write won't clear anyway — same `dirties`
        // gate — so skipping the bump changes nothing there.
        return withWriteDirtyDepth(this, () =>
          (original as (...a: unknown[]) => unknown).apply(this, args),
        );
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/**
 * Wraps the named write methods on `base.prototype` so each clears the
 * per-connection query cache (when its `dirties` flag is set) before
 * delegating to the original implementation. Rails uses `class_eval` to
 * redefine each method as `clear if pool.dirties_query_cache; super`; here we
 * reassign the prototype slot to a wrapper that calls through to the captured
 * original.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache.dirties_query_cache
 */
export function dirtiesQueryCache(base: { prototype: object }, ...methodNames: string[]): void {
  wireDirties(base, methodNames, false);
}

/**
 * Like {@link dirtiesQueryCache}, but skips the clear for schema-reflection
 * queries (name `"SCHEMA"`). Use this ONLY for `execute`/`execQuery`: Rails
 * routes schema reflection through the permanently-unwrapped `internal_exec_query`,
 * so it never dirties the cache, whereas trails reuses the wrapped
 * `execute`/`exec_query` (with name `"SCHEMA"`) for reflection. Skipping those
 * reproduces Rails' behavior (otherwise re-reflecting columns inside a `cache`
 * block would evict the cache). This is deliberately NOT applied to the generic
 * write wiring — a real mutation whose `name` happened to be `"SCHEMA"` (e.g.
 * `truncate(table, "SCHEMA")`) must still dirty — and within `execute`/`execQuery`
 * the only non-SQL string argument is the `name`, so the check can't false-match
 * a bind (binds are passed as an array, never the bare string `"SCHEMA"`).
 */
export function dirtiesQueryCacheExceptSchema(
  base: { prototype: object },
  ...methodNames: string[]
): void {
  wireDirties(base, methodNames, true);
}

/**
 * Wraps `executeMutation` (the low-level write/DDL primitive) so it clears the
 * query cache only when NOT nested inside an already-wired write. Rails wires
 * `dirties_query_cache` on the public `execute`, through which DDL runs, so
 * schema changes clear the cache. trails routes DDL through `executeMutation`;
 * wiring it here reproduces that. But CRUD writes funnel
 * `execInsert`/`execUpdate`/`execDelete` (already wired) → `executeMutation`, so
 * an unconditional clear here would double-clear each logical write (breaking
 * the `times: 1` expiry assertions). The `_writeDirtyDepth` guard, raised by the
 * outer wired wrapper for the duration of its async call, tells this leaf it is
 * nested and must defer to the outer clear. DDL reaches `executeMutation` at
 * depth 0 and clears. Transaction control (`BEGIN`/`COMMIT`) bypasses
 * `executeMutation` on the real adapters (they use `internalExecute`), so it is
 * unaffected.
 *
 * `executeBatch` (fixture loading, `truncate_tables`) DOES currently funnel
 * through the cache-wired `executeMutation` / `execute` and so still dirties,
 * whereas Rails' `execute_batch` → `raw_execute` is outside the dirties set. On
 * PG (the only adapter with its own `executeBatch`, looping the already-wired
 * `execute`) that clear is pre-#4858; on sqlite/mysql2 the abstract mixin loops
 * `executeMutation`, which THIS PR wired, so a bare batch (`"Fixtures Load"`) goes
 * from zero clears to one per statement there — newly introduced, not pre-existing.
 * Either way the clear is idempotent, gated on `dirties`, and batches run outside
 * `cache` blocks, so the effect is nil; routing `executeBatch` through the unwired
 * `rawExecute` to match Rails is tracked by story
 * `converge-execute-batch-through-raw-execute`.
 *
 * The leaf guard is instance-scoped rather than stack-local, which is sufficient
 * for its sole job — collapsing a single sequential CRUD write
 * (`execInsert`/`execUpdate`/`execDelete` → `executeMutation`) to one clear so the
 * `times: 1` expiry tests hold. It is NOT extended to the `wireDirties` wrappers
 * (they clear unconditionally): doing so would make B skip its clear when entered
 * during A's still-pending write on the same connection.
 *
 * KNOWN LIMITATION (accepted): because the scope spans the outer write's whole
 * async duration, a concurrent DDL on the SAME leased connection —
 * `Promise.all([post.save(), conn.addColumn(...)])` — can enter `executeMutation`
 * while the `save` holds depth 1 and skip its clear, leaving a read that
 * repopulated the cache during the `save`'s await stale (Rails' DDL `execute`
 * clears unconditionally via `super`). This is far more exotic than concurrent
 * CRUD and interleaving DDL with a save on one connection is unusual; the real
 * fix is not a better guard but removing the whole `execute`/`executeMutation`
 * split (Rails has one `perform_query`), which deletes this counter and the
 * hazard with it — tracked by story `unify-execute-mutation-into-perform-query`,
 * which supersedes this PR's wiring.
 *
 * Unlike {@link dirtiesQueryCacheExceptSchema}, this leaf does NOT skip on a
 * `"SCHEMA"` name: that skip exists because trails reuses the wrapped
 * `execute`/`exec_query` for schema *reflection reads* (Rails routes those
 * through the unwrapped `internal_exec_query`). `executeMutation` only ever runs
 * mutations/DDL — a mutation named `"SCHEMA"` must still dirty — so honouring
 * `name` here would be wrong, matching the same rationale
 * `dirtiesQueryCacheExceptSchema` gives for the generic write wiring.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache.dirties_query_cache
 * (as applied to `execute`, the DDL entry point).
 */
export function dirtiesQueryCacheUnlessNested(
  base: { prototype: object },
  ...methodNames: string[]
): void {
  const proto = base.prototype as Record<string, unknown>;
  for (const methodName of methodNames) {
    const original = proto[methodName];
    if (typeof original !== "function") continue;

    proto[methodName] = function (this: QueryCacheHost, ...args: unknown[]) {
      if (this._queryCache?.dirties && (this._writeDirtyDepth ?? 0) === 0) {
        this._queryCache.clear();
      }
      return (original as (...a: unknown[]) => unknown).apply(this, args);
    };
  }
}

/**
 * No-op base implementation. Each concrete adapter overrides
 * `AbstractAdapter#checkVersion` directly to raise when incompatible.
 *
 * @internal
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#check_version
 */
export function checkVersion(this: QueryCacheHost): void {}

/** @internal */
function unsetQueryCacheBang(this: QueryCacheHost): void {
  this._queryCache = null;
}

/** @internal */
function cacheNotificationInfo(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
): Record<string, unknown> {
  const userTx = (this as any).currentTransaction?.()?.userTransaction ?? null;
  const transaction =
    userTx !== null && typeof userTx?.isOpen === "function" && userTx.isOpen() ? userTx : null;
  return {
    sql,
    binds,
    // KNOWN DIVERGENCE (story: type-casted-binds-payload-self-dispatch). Rails
    // calls the adapter-dispatched Quoting#type_casted_binds (quoting.rb:224);
    // this standalone helper never reaches adapter `type_cast`. trails has the
    // faithful port at quoting.ts:451, but 16 payload producers across the
    // adapters disagree on how they fill this slot (free function / raw binds /
    // hardcoded [] / forwarded param), so converging this one flips SQLite's
    // cached binds 1 -> 1n and desyncs it from the uncached payload. The sweep
    // moves all 16 at once.
    type_casted_binds: () => typeCastedBinds(binds),
    name,
    connection: this,
    cached: true,
    transaction,
  };
}

/** @internal */
function cacheNotificationInfoResult(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
  result: Record<string, unknown>[],
): Record<string, unknown> {
  const payload = this.cacheNotificationInfo(sql, name, binds);
  payload["row_count"] = result.length;
  return payload;
}

/**
 * Build the query-cache key. `JSON.stringify` throws on `BigInt`, and under the
 * PG bigserial default-PK flip a default-PK bind casts to a JS `BigInt`, so
 * stringify the binds with a replacer that renders BigInt losslessly.
 * @internal
 */
function sqlCacheKey(sql: string, binds: unknown[]): string {
  return binds && binds.length > 0
    ? JSON.stringify([sql, binds], (_k, v) => (typeof v === "bigint" ? `${v}n` : v))
    : sql;
}

/** @internal */
function lookupSqlCache(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
): Record<string, unknown>[] | undefined {
  const qc = this._queryCache;
  if (!qc) return undefined;
  const key = sqlCacheKey(sql, binds);
  const result = qc.get(key);
  if (result !== undefined) {
    Notifications.instrument(
      "sql.active_record",
      this.cacheNotificationInfoResult(sql, name, binds, result),
    );
  }
  return result;
}

/** @internal */
function cacheSql(
  this: QueryCacheHost,
  sql: string,
  name: string | null | undefined,
  binds: unknown[],
  execute: () => Promise<Record<string, unknown>[]>,
): Promise<Record<string, unknown>[]> {
  const qc = this._queryCache;
  if (!qc) return execute();
  const key = sqlCacheKey(sql, binds);
  return qc.computeIfAbsent(key, execute);
}

/**
 * Mixin object for AbstractAdapter: bundles private QueryCache helpers so
 * `include(AbstractAdapter, QueryCache)` credits them to the host class.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::QueryCache (included in AbstractAdapter)
 */
export const QueryCache = {
  unsetQueryCacheBang,
  lookupSqlCache,
  cacheSql,
  cacheNotificationInfoResult,
  cacheNotificationInfo,
};
