import { beforeAll, afterAll } from "vitest";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadSchema } from "./load-schema-helper.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "../test-fixtures/with-transactional-fixtures.js";

export interface AdapterSuiteOptions<A extends TransactionalFixturesAdapter> {
  /** Builds the adapter once per file in `beforeAll`. */
  factory: () => A | Promise<A>;
  /**
   * Extra DDL or raw setup (CREATE EXTENSION, CREATE FOREIGN TABLE, etc.)
   * that isn't expressible via the canonical schema. Runs after the canonical
   * schema is laid and before `withTransactionalFixtures` opens its first
   * transaction, so DDL committed here is visible to every test and not
   * rolled back at the file boundary.
   *
   * On PostgreSQL DDL is transactional, so DDL committed in `setup` is
   * permanent; on MySQL/MariaDB it auto-commits regardless. Either way,
   * `setup` should be idempotent (use `IF NOT EXISTS` / `DROP IF EXISTS`)
   * because adapter-cluster tests are often re-run against a live DB.
   */
  setup?: (adapter: A) => Promise<void>;
  /** Optional teardown beyond `close()`. Runs before close in `afterAll`. */
  teardown?: (adapter: A) => Promise<void>;
  /** Call `adapter.close()` in afterAll when present. Default `true`. */
  closeOnTeardown?: boolean;
}

export interface AdapterSuiteHandle<A extends TransactionalFixturesAdapter> {
  /**
   * The adapter created in `beforeAll`. Access only from inside `it` /
   * `beforeEach` / nested `describe` callbacks — throws if read before the
   * top-level `beforeAll` runs.
   */
  readonly adapter: A;
}

/**
 * Boilerplate-free wrapper around the canonical adapter-cluster test pattern:
 *
 * ```
 * beforeAll(() => adapter = factory(); loadSchema(adapter); setup(adapter));
 * withTransactionalFixtures(() => adapter);
 * afterAll(() => teardown(adapter); adapter.close());
 * ```
 *
 * Designed for `adapters/**\/*.test.ts` files that currently rebuild the
 * adapter (and re-run DDL) per test via `beforeEach`. Hoisting to a single
 * `beforeAll` is the prerequisite for transactional fixtures to deliver the
 * Phase-6 wall-clock improvement (B6.5).
 *
 * @example
 *   const suite = setupAdapterSuite({
 *     factory: () => new PostgreSQLAdapter(PG_TEST_URL),
 *     setup: async (adapter) => {
 *       await adapter.exec(`CREATE EXTENSION IF NOT EXISTS citext`);
 *     },
 *   });
 *
 *   describeIfPg("PostgresqlCitextTest", () => {
 *     it("inserts a row", async () => {
 *       await suite.adapter.execute(`INSERT INTO ...`);
 *     });
 *   });
 */
export function setupAdapterSuite<A extends TransactionalFixturesAdapter>(
  opts: AdapterSuiteOptions<A>,
): AdapterSuiteHandle<A> {
  let adapter: A | undefined;

  beforeAll(async () => {
    adapter = await opts.factory();
    await loadSchema(adapter as unknown as DatabaseAdapter);
    if (opts.setup) await opts.setup(adapter);
  });

  withTransactionalFixtures(() => {
    if (!adapter) {
      throw new Error(
        "setupAdapterSuite: adapter accessed before beforeAll completed — " +
          "check that `factory` did not throw",
      );
    }
    return adapter;
  });

  afterAll(async () => {
    if (!adapter) return;
    try {
      if (opts.teardown) await opts.teardown(adapter);
    } finally {
      if (opts.closeOnTeardown !== false) {
        const close = (adapter as unknown as { close?: () => Promise<void> }).close;
        if (typeof close === "function") await close.call(adapter);
      }
      adapter = undefined;
    }
  });

  return {
    get adapter(): A {
      if (!adapter) {
        throw new Error(
          "setupAdapterSuite: adapter not yet initialized — read it from " +
            "inside `it`/`beforeEach`, not at module load time",
        );
      }
      return adapter;
    },
  };
}
