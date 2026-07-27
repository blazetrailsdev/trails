/**
 * `ActiveRecord::TestFixtures` — the `fixtures()` DSL and the setup/teardown
 * that seeds and pins a fixture set for a test scope.
 *
 * Rails home: `activerecord/lib/active_record/test_fixtures.rb` — `module
 * TestFixtures` (`:6`), `use_transactional_tests` (`:34`), `fixtures` (`:56`). This is
 * **library** code, not test support: Rails ships it inside `lib/`, so this
 * file sits at the package root under the kebab rendering of that filename
 * rather than under `test-helpers/`. It was misfiled as
 * `test-helpers/use-fixtures.ts` (RFC 0064 bucket D). The `test_fixtures.rb`
 * responsibilities that are large enough to warrant their own module live in
 * the sibling `test-fixtures/` directory, mirroring how Rails splits
 * `fixtures.rb` across `lib/active_record/fixture_set/`.
 */
import { afterEach, beforeEach } from "vitest";
import {
  prepareModelFixtures,
  prepareJoinTableFixtures,
  insertPreparedFixtureSets,
  effectiveFixtureKey,
  type PreparedFixtureSet,
} from "./fixtures.js";
import {
  fixtureRegistry,
  isJoinTableEntry,
  type FixtureName,
  type RegistryModel,
  type RegistryData,
  type IsJoinTableName,
} from "./test-helpers/fixtures-registry.js";
export type { FixtureName } from "./test-helpers/fixtures-registry.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { registerModel } from "./associations.js";
import { setupHandlerSuite } from "./support/setup-handler-suite.js";
import {
  withTransactionalFixtures,
  type WithTransactionalFixturesOptions,
} from "./test-fixtures/with-transactional-fixtures.js";
import { leaseFixtureConnection } from "./test-fixtures/fixture-connection.js";

/**
 * A tableless fixture entry: seeds rows directly into the named table with no
 * model class. Mirrors Rails' "naked" fixture path — the table's schema columns
 * are validated at seed time, but no `ActiveRecord::Base` subclass is involved.
 *
 * The accessor key is the `table` value as-is (e.g. `{ table: "accounts" }` →
 * `result.accounts`). Rows return as plain resolved-attribute objects.
 */
export type TablelessFixtureEntry = {
  table: string;
  data: Record<string, Record<string, unknown>>;
};

export { FixtureSet } from "./fixtures.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

export type FixtureMap = Record<string, [BaseClass, Record<string, FixtureAttrs>]>;

/**
 * Internally-resolved fixture set. `model === null` marks a HABTM join-table set
 * (seeded via {@link defineJoinTableFixtures}); otherwise it's a model-backed set.
 * `table` is the DB table to seed and clean.
 */
type ResolvedFixtureSet = {
  table: string;
  model: BaseClass | null;
  data: Record<string, FixtureAttrs>;
};
type ResolvedFixtureMap = Record<string, ResolvedFixtureSet>;

type FixtureAccessor<T extends BaseClass, K extends string> = {
  (name: K): InstanceType<T>;
  all(): InstanceType<T>[];
};

/** Accessor for a HABTM join-table set: rows are plain resolved-attribute objects (no model instance). */
type JoinTableAccessor<K extends string> = {
  (name: K): Record<string, unknown>;
  all(): Record<string, unknown>[];
};

export type UseFixturesResult<M extends FixtureMap> = {
  [K in keyof M]: M[K] extends [
    infer T extends BaseClass,
    Record<infer N extends string, FixtureAttrs>,
  ]
    ? FixtureAccessor<T, N>
    : never;
};

/**
 * Result of the `string[]` overload: one accessor per requested fixture-set name,
 * with the label union pulled from the registry entry's data keys.
 */
export type UseFixturesByNameResult<N extends FixtureName> = {
  [K in N]: IsJoinTableName<K> extends true
    ? JoinTableAccessor<Extract<keyof RegistryData<K>, string>>
    : FixtureAccessor<RegistryModel<K>, Extract<keyof RegistryData<K>, string>>;
};

export interface FixturesConnectionOpts {
  /**
   * Caller-supplied connection/adapter thunk. When set, {@link fixtures}
   * seeds, cleans, and (when transactional) pins fixtures
   * through this connection instead of the default pool lease
   * ({@link leaseFixtureConnection}).
   *
   * Mirrors Rails loading a fixture set through a model-specific `connection`
   * (multi-database suites) or through a suite's own adapter. Composes with
   * `useTransactionalTests: false`: when non-transactional, the thunk is the raw
   * seed/clean connection; when transactional, the savepoint wrapper pins it too.
   */
  connection?: () => DatabaseAdapter;
}

/**
 * Resolves fixture-set names through the registry into the `[Model, data]` map shape.
 * Model classes are dynamic-imported (see {@link FixtureRegistryEntry}), so this is async.
 *
 * Two requested sets backed by the same table (e.g. `deadParrots`/`liveParrots`
 * → `parrots`, `dogs`/`otherDogs` → `dogs`) load together in one call: the
 * loader prepares every set, MERGES their rows per table, and issues a single
 * `insertFixturesSet` that deletes each table once and inserts all rows together
 * (see {@link insertPreparedFixtureSets}), mirroring how Rails loads multiple
 * same-table fixture files (fixtures.rb groups by table then unshifts all rows).
 * The only rejected case is genuinely-conflicting rows: two same-table sets whose
 * rows resolve to the same primary key. A row's key is resolved the way the loader
 * derives it — an explicit pin on the model's real primary-key column, else the
 * label-derived CRC32 id — in one keyspace, so a pinned id and a colliding derived
 * id are both caught. Join-table sets (no model) concatenate and are not guarded.
 *
 * @internal
 */
export async function resolveFixtureNames(
  names: readonly FixtureName[],
): Promise<ResolvedFixtureMap> {
  const map: ResolvedFixtureMap = {};
  // Per-table map of already-claimed primary-key values → a descriptor of the set
  // (and label) that claimed each, so two same-table sets whose rows resolve to the
  // same PK are rejected while disjoint sets merge cleanly. The key is the row's
  // effective PK (explicit pin OR the label-derived CRC32 id, in one keyspace),
  // computed off the model's real primaryKey column — see effectiveFixtureKey.
  const tableRowKeys = new Map<string, Map<string, string>>();
  for (const name of names) {
    const entry = fixtureRegistry[name] as (typeof fixtureRegistry)[FixtureName] | undefined;
    if (!entry) {
      throw new Error(
        `useFixtures: no fixture set named "${name}" in the registry — add it to fixtures-registry.ts`,
      );
    }
    // Join-table sets have no model class — resolve straight to the literal table.
    // A model entry may declare an `addOn` (e.g. the encryption bootstrap) that
    // MUST run before its model thunk: the model's import-time side effects
    // (`encrypts()`) throw unless the add-on registered its hooks first.
    let table: string;
    let model: BaseClass | null;
    if (isJoinTableEntry(entry)) {
      table = entry.joinTable;
      model = null;
    } else {
      if ("addOn" in entry) await entry.addOn?.();
      const resolved = await entry.model();
      // A declared fixture set makes its model resolvable, exactly as Rails'
      // `fixtures :authors` autoloads the `Author` constant on first reference —
      // no explicit `registerModel` call in the test. The thunk may return an
      // array whose first element is the table-bearing model and the rest are
      // extra classes to register alongside it (STI subclasses so `findStiClass`
      // resolves each row's inheritance-column value; HABTM targets whose join
      // table the loader writes). The array form routes any STI subclass through
      // `registerSubclass`. Idempotent across files/tests (Map.set).
      const models = (Array.isArray(resolved) ? resolved : [resolved]) as BaseClass[];
      registerModel(models);
      const m = models[0];
      table = m.tableName;
      model = m;
    }
    // Same-table sets merge (each accessor keeps its own rows), but two rows that
    // resolve to the same primary key would clobber each other — reject that. Only
    // model-backed sets have a PK; join-table sets (model === null) concatenate.
    if (model !== null) {
      let rowKeys = tableRowKeys.get(table);
      if (rowKeys === undefined) {
        rowKeys = new Map();
        tableRowKeys.set(table, rowKeys);
      }
      for (const [label, row] of Object.entries(entry.data)) {
        // Resolve to the row's actual PK value the way the loader does, so an
        // explicit pin and a label-derived id share one keyspace (see
        // effectiveFixtureKey). Keyed on the model's real primaryKey column.
        const key = effectiveFixtureKey(model, label, row);
        const prior = rowKeys.get(key);
        if (prior !== undefined) {
          throw new Error(
            `useFixtures: ${prior} and "${name}" (${label}) both map to table "${table}" with a ` +
              `row that resolves to the same primary key; same-table sets load together, but ` +
              `two rows sharing a primary key collide. Rename the label or change the pinned id.`,
          );
        }
        rowKeys.set(key, `"${name}" (${label})`);
      }
    }
    map[name] = { table, model, data: entry.data };
  }
  return map;
}

/**
 * Whether fixture rows must be DELETEd in teardown, or whether an outer
 * transaction will discard them for us.
 *
 * The skip is confined to **PostgreSQL**, the sole adapter where the DELETE is
 * actively harmful: a test that deliberately raised `StatementInvalid` aborts
 * the whole PG transaction (SQLSTATE 25P02), so a subsequent DELETE on that
 * pinned connection fails with "current transaction is aborted, commands
 * ignored…", poisoning teardown for the next test (or a vitest `retry` re-run).
 * MySQL/MariaDB and SQLite do not abort the transaction on a failed statement,
 * so they never hit that — and on MySQL an implicit commit (DDL auto-commits,
 * `test_fixtures` caveat) can durably persist seeded fixtures that the rollback
 * then cannot undo, making the DELETE the *only* cleanup. So off PG the DELETE
 * must always run (unchanged behavior).
 *
 * On PG the skip fires only for rows a still-open transaction will roll back —
 * precisely "were this test's `beforeEach` inserts seeded inside a transaction
 * that is still open now?". That mirrors Rails' `teardown_fixtures`, where the
 * rollback IS the teardown and no DELETE is issued. Both conditions are load-
 * bearing:
 *   - `seededInTransaction` alone would wrongly skip if that transaction had
 *     since committed/closed (rows now durable) — so we also require it open.
 *   - `openTransactions > 0` alone is unsafe on the non-transactional /
 *     `usesTransaction`-opt-out path: there the fixtures are autocommitted
 *     before the test body runs, so a test body that leaves its *own*
 *     transaction/savepoint open wraps none of those committed rows — skipping
 *     the DELETE would leak them. Gating on `seededInTransaction` confines the
 *     skip to rows the open transaction actually owns.
 */
function shouldDeleteFixtureRows(adapter: DatabaseAdapter, seededInTransaction: boolean): boolean {
  if (adapter.adapterName !== "postgres") return true;
  return !(seededInTransaction && adapter.openTransactions > 0);
}

/** Returns true for "table/relation does not exist" errors from any adapter. */
function isTableMissingError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("no such table") || // SQLite
    /Table '.*' doesn't exist/i.test(msg) || // MySQL: Table 'db.tbl' doesn't exist
    /relation ".*" does not exist/i.test(msg) // PostgreSQL: relation "tbl" does not exist
  );
}

/**
 * Result of the tableless overload: one `JoinTableAccessor` per entry, keyed by `table`.
 * The label union is derived from `entry.data`'s own keys so `accessor("root")` is
 * compile-time checked when the data literal is inlined (same pattern as the by-name overload).
 */
export type UseTablelessFixturesResult<T extends readonly TablelessFixtureEntry[]> = {
  [E in T[number] as E["table"]]: JoinTableAccessor<Extract<keyof E["data"], string>>;
};

/**
 * Implements the tableless overload of `useFixtures`. Seeds each entry directly
 * into the named table via {@link defineJoinTableFixtures} — no model class required.
 * Columns are validated against the live schema; unknown columns throw at seed time.
 * @internal
 */
function useTablelessFixtures(
  entries: readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
): Record<string, unknown> {
  // Tableless entries key their accessor by `table`, so two entries on the same
  // table would clobber each other's store slot. (Model-backed same-table sets in
  // resolveFixtureNames merge instead, because they key by set name.)
  const seenTables = new Set<string>();
  for (const { table } of entries) {
    if (seenTables.has(table)) {
      throw new Error(
        `useFixtures: two tableless entries both target table "${table}"; ` +
          `the second insert would delete the first entry's rows. Use a single entry instead.`,
      );
    }
    seenTables.add(table);
  }

  const keys = entries.map((e) => e.table);
  const store: Record<string, Record<string, unknown>> = {};
  // Whether the most recent seed ran inside an open transaction (the fixture
  // pin). Read in afterEach — see shouldDeleteFixtureRows.
  let seededInTransaction = false;

  beforeEach(async () => {
    const adapter = getAdapter();
    // Prepare every entry then insert through one insertFixturesSet — one
    // referential-integrity toggle per load (see the by-name loader above).
    const prepared: PreparedFixtureSet[] = [];
    const tables: string[] = [];
    for (const { table, data } of entries) {
      prepared.push(await prepareJoinTableFixtures(adapter, table, data));
      tables.push(table);
    }
    const results = await insertPreparedFixtureSets(adapter, prepared);
    seededInTransaction = adapter.openTransactions > 0;
    results.forEach((result, i) => {
      store[tables[i]] = result;
    });
  });

  afterEach(async () => {
    const adapter = getAdapter();
    if (shouldDeleteFixtureRows(adapter, seededInTransaction)) {
      for (const { table } of [...entries].reverse()) {
        try {
          await adapter.executeMutation(`DELETE FROM ${adapter.quoteTableName(table)}`);
        } catch (e) {
          if (!isTableMissingError(e)) throw e;
        }
      }
    }
    for (const key of keys) delete store[key];
  });

  const result: Record<string, unknown> = {};
  for (const { table } of entries) {
    const accessor = (name: string) => {
      const set = store[table];
      if (!set)
        throw new Error(`useFixtures: fixture set "${table}" not loaded — call inside a test`);
      const row = set[name];
      if (!row) throw new Error(`useFixtures: no fixture named "${name}" in set "${table}"`);
      return row;
    };
    accessor.all = () => {
      const set = store[table];
      if (!set)
        throw new Error(`useFixtures: fixture set "${table}" not loaded — call inside a test`);
      return Object.values(set);
    };
    result[table] = accessor;
  }
  return result;
}

/**
 * Vitest helper that inserts fixture rows in a `beforeEach` and cleans them up in `afterEach`.
 *
 * **Internal implementation — test files must call {@link fixtures}
 * instead.** This lower-level entry point
 * takes an explicit `getAdapter` thunk and runs a per-test delete/reseed. It
 * was once a documented escape hatch for suites that could not use the
 * handler-resolved path (non-transactional suites committing across
 * connections, multi-database suites seeding through model-specific
 * connections, adapter-owning suites). Every one of those call sites has since
 * converged: non-transactional and caller-supplied-connection needs are now
 * expressed through the `useTransactionalTests` / `connection` options on
 * {@link fixtures}, which forwards the resolved thunk
 * here. It is no longer exported: the only caller is {@link fixtures}
 * (below, same module), so no test file can reach the raw engine directly.
 *
 * Returns an object of typed accessor functions — one per fixture set. Each accessor is callable
 * by label (`topics("first")`) and has an `.all()` method.
 *
 * ```ts
 * const { topics, posts } = useFixtures(
 *   { topics: [Topic, topicData], posts: [Post, postData] },
 *   () => adapter,
 * );
 * ```
 *
 * Or by Rails-style fixture-set name, resolved through `fixtures-registry.ts`:
 *
 * ```ts
 * const { authors, posts } = useFixtures(["authors", "posts"], () => adapter);
 * authors("david"); // → Author instance
 * ```
 *
 * Subdirectory fixture sets use slash-keyed names; access via bracket notation.
 * Once the set is registered in `fixtures-registry.ts` (Phase 2+), the names
 * overload works too. Until then, use the object-map overload:
 *
 * ```ts
 * const fixtures = useFixtures(
 *   { "admin/accounts": [AdminAccount, adminAccountFixtureData] },
 *   () => adapter,
 * );
 * fixtures["admin/accounts"]("signals37"); // → Admin::Account instance
 * ```
 *
 * No `schema` is needed: globalSetup lays the full `TEST_SCHEMA` into every
 * worker DB and clones it to each per-worker slot, so the canonical tables
 * already exist before any test runs — `useFixtures` only seeds and cleans rows.
 *
 * @internal
 */
function useFixtures<M extends FixtureMap>(
  fixtures: M,
  getAdapter: () => DatabaseAdapter,
): UseFixturesResult<M>;
function useFixtures<const N extends FixtureName>(
  names: readonly N[],
  getAdapter: () => DatabaseAdapter,
): UseFixturesByNameResult<N>;
function useFixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  getAdapter: () => DatabaseAdapter,
): UseTablelessFixturesResult<T>;
function useFixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  getAdapter: () => DatabaseAdapter,
): Record<string, unknown> {
  // Tableless array: every element is an object with { table, data }.
  // The `length > 0` guard is intentional: an empty array is vacuously correct for
  // both the by-name and tableless overloads (both seed zero fixtures and return `{}`),
  // so falling through to the by-name path is safe. Callers passing a non-empty
  // tableless array computed dynamically must ensure at least one element is present;
  // the TypeScript overload resolution enforces the correct return type at the call site.
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 0 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "object" &&
    (fixturesOrNames as readonly unknown[])[0] !== null &&
    "table" in ((fixturesOrNames as readonly TablelessFixtureEntry[])[0] as object)
  ) {
    // Validate that all elements are uniformly tableless to catch mixed arrays early
    // rather than surfacing a confusing downstream error in resolveFixtureNames or
    // defineJoinTableFixtures.
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el !== "object" || el === null || !("table" in el)) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} (${JSON.stringify(el)}) is not a tableless { table, data } entry.`,
        );
      }
    }
    return useTablelessFixtures(fixturesOrNames as readonly TablelessFixtureEntry[], getAdapter);
  }
  // Symmetric guard: if the first element is a by-name string, scan remaining elements
  // for any tableless { table, data } object. A mixed array here would reach
  // resolveFixtureNames with an object, producing a confusing "no registry entry" error.
  if (
    Array.isArray(fixturesOrNames) &&
    fixturesOrNames.length > 1 &&
    typeof (fixturesOrNames as readonly unknown[])[0] === "string"
  ) {
    for (let i = 1; i < (fixturesOrNames as readonly unknown[]).length; i++) {
      const el = (fixturesOrNames as readonly unknown[])[i];
      if (typeof el === "object" && el !== null && "table" in el) {
        throw new Error(
          `useFixtures: mixed tableless and by-name entries are not supported. ` +
            `Element at index ${i} is a tableless { table, data } entry but the array started with a by-name string.`,
        );
      }
    }
  }
  const isNameArray = Array.isArray(fixturesOrNames);
  // Keys are known synchronously (the names, or the map's own keys) so accessors
  // can be wired up before the (possibly async) model resolution in beforeEach.
  const keys: string[] = isNameArray
    ? (fixturesOrNames as readonly string[]).slice()
    : Object.keys(fixturesOrNames as FixtureMap);

  // The resolved set map. For the object-map overload it's known up front (each
  // `[Model, data]` tuple maps to a model-backed set); for the name-array overload
  // it's filled in beforeEach once the model thunks resolve (dynamic imports must
  // stay lazy — see fixtures-registry).
  let fixtures: ResolvedFixtureMap | undefined = isNameArray
    ? undefined
    : Object.fromEntries(
        Object.entries(fixturesOrNames as FixtureMap).map(([key, [model, data]]) => [
          key,
          { table: model.tableName, model, data },
        ]),
      );

  // Per-test mutable state: populated in beforeEach, cleared in afterEach.
  const store: Record<string, Record<string, unknown>> = {};
  // Whether the most recent seed ran inside an open transaction (the fixture
  // pin). Read in afterEach — see shouldDeleteFixtureRows.
  let seededInTransaction = false;

  // TODO(fixtures-adoption Spike S1): seed once per worker in a global beforeAll
  // (before the pinned transaction opens) when transactional fixtures are
  // active, falling back to this per-test seed otherwise. Deferred to a follow-up
  // PR to keep this one under the LOC ceiling (fixtures-adoption follow-up).
  beforeEach(async () => {
    // Resolve from the `keys` snapshot, not `fixturesOrNames`: a caller can mutate
    // the (mutable-assignable) array after this call, which would otherwise seed a
    // different set than the accessors built below from `keys`.
    if (!fixtures) fixtures = await resolveFixtureNames(keys as readonly FixtureName[]);
    const adapter = getAdapter();
    // Prepare every set (in declaration order, so a later set's ref() resolves
    // ids a prior set registered), then insert them all through ONE
    // insertFixturesSet — one referential-integrity toggle per load, mirroring
    // Rails' fixtures.rb `insert` merging table_rows into one insert_fixtures_set.
    const prepared: PreparedFixtureSet[] = [];
    const preparedKeys: string[] = [];
    for (const [key, { table, model, data }] of Object.entries(fixtures)) {
      // Auto-register the (object-map) model, mirroring the by-name path's
      // `resolveFixtureNames` (fixtures-register-model-on-resolution, #4348):
      // declaring the set is the opt-in, so no test needs a manual
      // `registerModel` call for a fixture-backed model. Idempotent. Guarded to
      // real AR model classes (they inherit Base's static `_modelsByName`), so
      // the lightweight `{ tableName, ... }` stubs some infra tests pass through
      // the object-map form are left untouched.
      if (model !== null && "_modelsByName" in model) {
        registerModel(model);
      }
      prepared.push(
        model === null
          ? await prepareJoinTableFixtures(adapter, table, data)
          : await prepareModelFixtures(adapter, model, data),
      );
      preparedKeys.push(key);
    }
    const results = await insertPreparedFixtureSets(adapter, prepared);
    seededInTransaction = adapter.openTransactions > 0;
    results.forEach((result, i) => {
      store[preparedKeys[i]] = result;
    });
  });

  afterEach(async () => {
    if (!fixtures) return;
    const adapter = getAdapter();
    if (shouldDeleteFixtureRows(adapter, seededInTransaction)) {
      // Delete in reverse insertion order to respect FK constraints.
      for (const { table } of Object.values(fixtures).reverse()) {
        try {
          await adapter.executeMutation(`DELETE FROM ${adapter.quoteTableName(table)}`);
        } catch (e) {
          if (!isTableMissingError(e)) throw e;
        }
      }
    }
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const accessor = (name: string) => {
      const set = store[key];
      if (!set)
        throw new Error(`useFixtures: fixture set "${key}" not loaded — call inside a test`);
      const instance = set[name];
      if (!instance) throw new Error(`useFixtures: no fixture named "${name}" in set "${key}"`);
      return instance;
    };
    accessor.all = () => {
      const set = store[key];
      if (!set)
        throw new Error(`useFixtures: fixture set "${key}" not loaded — call inside a test`);
      return Object.values(set);
    };
    result[key] = accessor;
  }
  return result;
}

type FixturesOptions = WithTransactionalFixturesOptions & FixturesConnectionOpts;

/**
 * Rails-faithful public surface for declaring fixtures in a test file — the sole
 * fixture entry point.
 *
 * One-call wiring that combines {@link setupHandlerSuite} +
 * {@link withTransactionalFixtures} + the module-private `useFixtures` engine,
 * eliminating the three-line boilerplate every fixture-backed describe block
 * previously required. The engine lives here (unexported) so no test file can
 * reach it directly — `fixtures()` is the only fixture surface. Mirrors Rails'
 * `fixtures :authors, :posts` declaration and the `ActiveRecord::TestCase`
 * contract where including `TestFixtures`, declaring `fixtures :name`, and
 * enabling `use_transactional_tests` are a single class-level opt-in.
 *
 * Calling `fixtures()` IS the opt-in to the canonical schema: the full
 * `TEST_SCHEMA` is laid into every worker DB once by globalSetup (trails'
 * `db:test:prepare`) and cloned to each per-worker slot, so the canonical
 * tables already exist before any test runs — `fixtures()` only seeds and
 * cleans rows, never issues DDL.
 *
 * @example  // primary documented form
 *   const { authors, posts } = fixtures({
 *     authors: [Author, { david: { name: "David" } }],
 *     posts: [Post, { welcome: { title: "Welcome" } }],
 *   });
 *
 * @example  // by registry name
 *   const { authors, posts } = fixtures(["authors", "posts"]);
 *
 * @example  // non-transactional (Rails `use_transactional_tests = false`)
 *   const { books } = fixtures(["books", "authors"], { useTransactionalTests: false });
 *
 * @example  // seed through a caller-supplied connection/adapter
 *   const { colleges } = fixtures(["colleges"], {
 *     connection: () => College.connection,
 *     useTransactionalTests: false,
 *   });
 *
 * @internal
 */
export function fixtures<M extends FixtureMap>(
  fixtures: M,
  options?: FixturesOptions,
): UseFixturesResult<M>;
export function fixtures<const N extends FixtureName>(
  names: readonly N[],
  options?: FixturesOptions,
): UseFixturesByNameResult<N>;
export function fixtures<const T extends readonly TablelessFixtureEntry[]>(
  tablelessEntries: T,
  options?: FixturesOptions,
): UseTablelessFixturesResult<T>;
export function fixtures(
  fixturesOrNames: FixtureMap | readonly FixtureName[] | readonly TablelessFixtureEntry[],
  options: FixturesOptions | undefined = undefined,
): Record<string, unknown> {
  const { usesTransaction, invalidateSchemaCache, useTransactionalTests, connection } =
    options ?? {};

  // Caller-supplied connection/adapter thunk wins over the default handler
  // connection: multi-database suites seed through a model-specific
  // `*.connection`, and adapter-owning suites seed through their own adapter.
  const getConnection = connection ?? leaseFixtureConnection;

  setupHandlerSuite();
  // Rails' `use_transactional_tests = false` (default is true): skip the
  // savepoint-pinned wrapper so the engine's per-test delete/reseed commits
  // real DML, visible across pooled connections. Mirrors the direct-adapter
  // escape hatch the view/signed-id suites used before converging here.
  if (useTransactionalTests !== false) {
    withTransactionalFixtures(getConnection, {
      usesTransaction,
      invalidateSchemaCache,
    });
  }

  return useFixtures(fixturesOrNames as FixtureMap, getConnection);
}
