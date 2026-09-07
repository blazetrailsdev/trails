import { beforeEach, afterEach, type TaskContext } from "vitest";
import { Notifications, type NotificationSubscriber } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { NullPool } from "../connection-adapters/abstract/connection-pool.js";
import { SchemaReflection, type SchemaCache } from "../connection-adapters/schema-cache.js";
import {
  dumpedTables,
  fingerprintOf,
  schemaShapes,
  templateSchemaCache,
  templateSchemaFingerprint,
} from "../support/schema-cache-dump.js";

interface TxnHost {
  transactionManager: {
    beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
    rollbackTransaction: () => Promise<void>;
    openTransactions: number;
  };
}

export type TransactionalFixturesAdapter = DatabaseAdapter;

function tm(adapter: TransactionalFixturesAdapter): TxnHost["transactionManager"] {
  const host = adapter as unknown as Partial<TxnHost>;
  if (!host.transactionManager) {
    throw new Error(
      `withTransactionalFixtures: adapter ${(adapter as { adapterName?: string }).adapterName ?? "unknown"} ` +
        `does not expose transactionManager`,
    );
  }
  return host.transactionManager;
}

/** @internal */
async function eagerWarmSchemaCache(adapter: TransactionalFixturesAdapter): Promise<void> {
  const sc = adapter.internalSchemaCache;
  const pool = adapter.pool == null || adapter.pool instanceof NullPool ? null : adapter.pool;
  if (!sc || pool === null) return;
  try {
    const dumped = await templateSchemaCache();
    if (dumped && (await replaySchemaCacheDump(adapter, pool, dumped))) return;
    await sc.addAll(pool);
  } catch {}
}

async function replaySchemaCacheDump(
  adapter: TransactionalFixturesAdapter,
  pool: ConnectionPool,
  dumped: SchemaCache,
): Promise<boolean> {
  const cached = dumpedTables(dumped.marshalDump());
  const shapes = await schemaShapes(adapter);
  if (fingerprintOf(shapes, cached) !== templateSchemaFingerprint()) return false;
  pool.schemaReflection = new SchemaReflection(null, dumped.initializeDup());
  const sc = adapter.internalSchemaCache;
  for (const table of shapes.keys()) {
    if (!cached.has(table)) await sc.add(pool, table);
  }
  return true;
}

/**
 * Register the once-per-file eager warm as a `beforeEach` guard.
 *
 * It cannot run in a `beforeAll`: callers register their schema-setup
 * `beforeAll` *after* calling the helper, so the schema does not yet exist when
 * ours would fire. Shared with the non-transactional path (`fixtures(...,
 * { useTransactionalTests: false })`), which skips
 * {@link withTransactionalFixtures} entirely and would otherwise leave the
 * cache cold — a model whose only declaration is `tableName` then reflects no
 * columns at all, because the sync `load_schema` can only answer from the cache
 * (`model-schema.ts` `loadSchemaFromCacheSync`), where Ruby loads lazily on
 * first attribute access.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the eager schema warm Ruby gets free from lazy synchronous load_schema (model_schema.rb:587).
 */
export function warmSchemaCacheBeforeFirstTest(
  getAdapter: () => TransactionalFixturesAdapter,
): void {
  let warmed = false;
  beforeEach(async () => {
    if (warmed) return;
    warmed = true;
    await eagerWarmSchemaCache(getAdapter());
  });
}

function pooledAdapterPool(adapter: TransactionalFixturesAdapter): ConnectionPool | null {
  const host = adapter as { pool?: unknown };
  const pool = host.pool;
  if (pool == null || pool instanceof NullPool) return null;
  return pool as ConnectionPool;
}

let fixtureConnectionPools: ConnectionPool[] | null = null;

let fixtureScopeDepth = 0;

let pinnedPools: ConnectionPool[] = [];

let connectionSubscriber: NotificationSubscriber | null = null;

let pendingPins: Promise<void>[] = [];

async function pinConnectionPool(pool: ConnectionPool): Promise<void> {
  await pool.pinConnectionBang({ fixture: true });
  pinnedPools.push(pool);
  await pool.leaseConnection();
}

export interface WithTransactionalFixturesOptions {
  eagerWarmSchemaCache?: boolean;

  usesTransaction?: string[];

  useTransactionalTests?: boolean;
}

export function withTransactionalFixtures(
  getAdapter: () => TransactionalFixturesAdapter,
  options: WithTransactionalFixturesOptions = {},
): void {
  const { eagerWarmSchemaCache: eagerWarm = true, usesTransaction: usesTransactionNames = [] } =
    options;
  if (eagerWarm) warmSchemaCacheBeforeFirstTest(getAdapter);
  let _txnOpenedForTest = false;

  beforeEach(async (ctx: TaskContext) => {
    const adapter = getAdapter();
    if (usesTransactionNames.includes(ctx.task.name)) {
      _txnOpenedForTest = false;
      return;
    }
    _txnOpenedForTest = true;
    const pool = pooledAdapterPool(adapter);
    if (pool) {
      if (fixtureConnectionPools === null) {
        fixtureConnectionPools = Base.connectionHandler.connectionPoolList("writing");
        if (!fixtureConnectionPools.includes(pool)) fixtureConnectionPools.push(pool);
        for (const p of fixtureConnectionPools) {
          await pinConnectionPool(p);
        }
      }
      fixtureScopeDepth++;
    } else {
      await tm(adapter).beginTransaction({ joinable: false, _lazy: false });
    }

    connectionSubscriber = Notifications.subscribe("!connection.active_record", (event) => {
      const payload = event.payload as { connection_name?: string; shard?: string };
      const connectionName = "connection_name" in payload ? payload.connection_name : undefined;
      const shard = "shard" in payload ? payload.shard : undefined;

      if (connectionName != null) {
        const newPool = Base.connectionHandler.retrieveConnectionPool(connectionName, { shard });
        if (newPool) {
          if (fixtureConnectionPools !== null && !fixtureConnectionPools.includes(newPool)) {
            fixtureConnectionPools.push(newPool);
            pendingPins.push(pinConnectionPool(newPool));
          }
        }
      }
    });
  });

  afterEach(async () => {
    if (connectionSubscriber) {
      Notifications.unsubscribe(connectionSubscriber);
      connectionSubscriber = null;
    }
    const pins = pendingPins;
    pendingPins = [];
    const pinResults = await Promise.allSettled(pins);
    if (!_txnOpenedForTest) {
      const failed = pinResults.find((r) => r.status === "rejected");
      if (failed) throw failed.reason;
      return;
    }
    const adapter = getAdapter();
    if (fixtureConnectionPools !== null && pooledAdapterPool(adapter) !== null) {
      if (--fixtureScopeDepth === 0) {
        const pools = pinnedPools;
        pinnedPools = [];
        for (const pool of pools) {
          await pool.unpinConnectionBang();
        }
        fixtureConnectionPools = null;
      }
    } else {
      const t = tm(adapter);
      while (t.openTransactions > 0) await t.rollbackTransaction();
    }
    const failed = pinResults.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  });
}
