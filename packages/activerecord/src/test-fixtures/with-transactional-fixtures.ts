import { beforeEach } from "vitest";
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

export type TransactionalFixturesAdapter = DatabaseAdapter;

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
 * { useTransactionalTests: false })`), which would otherwise leave the cache
 * cold — a model whose only declaration is `tableName` then reflects no
 * columns at all, because the sync `load_schema` can only answer from the cache
 * (`model-schema.ts` `loadSchemaFromCacheSync`), where Ruby loads lazily on
 * first attribute access.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the eager schema warm Ruby gets free from lazy synchronous load_schema (model_schema.rb:587).
 */
export function warmSchemaCacheBeforeFirstTest(): void {
  let warmed = false;
  beforeEach(async () => {
    if (warmed) return;
    warmed = true;
    await Base.withConnection(eagerWarmSchemaCache);
  });
}

export interface WithTransactionalFixturesOptions {
  usesTransaction?: string[];

  useTransactionalTests?: boolean;
}
