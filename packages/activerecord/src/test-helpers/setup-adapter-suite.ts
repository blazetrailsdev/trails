import { beforeAll, afterAll } from "vitest";
import type { DatabaseAdapter } from "../adapter.js";
import { defineSchema, type Schema } from "./define-schema.js";

/**
 * Subset of {@link DefineSchemaOpts} exposed through this helper.
 *
 * `useTransactionalTests: false` is intentionally rejected: the helper sets
 * schema up exactly once in `beforeAll`, but when transactional fixtures are
 * opted out, the global `resetTestAdapterState` beforeEach (in
 * `test-setup-ar.ts`) drops every table before each test. The shared schema
 * would vanish and subsequent tests would fail. Files needing per-test
 * schema mutation should call `defineSchema` directly inside their own
 * `beforeEach` rather than this helper.
 */
export interface AdapterSuiteSchemaOpts {
  dropExisting?: boolean;
}
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "./with-transactional-fixtures.js";

export interface AdapterSuiteOptions<A extends TransactionalFixturesAdapter> {
  /** Builds the adapter once per file in `beforeAll`. */
  factory: () => A | Promise<A>;
  /**
   * Schema to declare via {@link defineSchema}. Defaults to `{}` so the file
   * is marked Phase-5 compliant even when no expressible tables exist
   * (e.g. PG-only types created via raw DDL in {@link setup}).
   */
  schema?: Schema;
  schemaOptions?: AdapterSuiteSchemaOpts;
  /**
   * Extra DDL or raw setup (CREATE EXTENSION, CREATE FOREIGN TABLE, etc.)
   * that isn't expressible via {@link defineSchema}. Runs after
   * `defineSchema` and before `withTransactionalFixtures` opens its first
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
 * beforeAll(() => adapter = factory(); defineSchema(adapter, schema); setup(adapter));
 * withTransactionalFixtures(() => adapter);
 * afterAll(() => teardown(adapter); adapter.close());
 * ```
 *
 * Designed for `adapters/**\/*.test.ts` files that currently rebuild the
 * adapter (and re-run DDL) per test via `beforeEach`. Hoisting to a single
 * `beforeAll` is the prerequisite for transactional fixtures to deliver the
 * Phase-6 wall-clock improvement (`docs/activerecord-100-plan.md` B6.5).
 *
 * @example
 *   const suite = setupAdapterSuite({
 *     factory: () => new PostgreSQLAdapter(PG_TEST_URL),
 *     schema: { users: { name: "string" } },
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
    await defineSchema(
      adapter as unknown as DatabaseAdapter,
      opts.schema ?? {},
      opts.schemaOptions,
    );
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
