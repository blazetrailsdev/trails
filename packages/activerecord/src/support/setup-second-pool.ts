import { beforeAll } from "vitest";
import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { registerModel } from "../associations.js";
import { loadCanonicalArunit2Schema } from "./canonical-schema.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { Course } from "../test-helpers/models/course.js";
import { College } from "../test-helpers/models/college.js";
import { Entrant } from "../test-helpers/models/entrant.js";
import { Professor } from "../test-helpers/models/professor.js";
import { activeLane } from "./connection.js";
import { canonicalSchemaUpToDate, stampCanonicalSchema } from "./canonical-schema-stamp.js";

/**
 * The tables `schema.rb:1444-1460` creates through the second connection
 * (`Course`/`College`/`Professor.lease_connection`), i.e. the ones that live in
 * `arunit2`. `entrants` stays in the primary database (`schema.rb:590`).
 *
 * @internal
 */
export const ARUNIT2_TABLES = ["colleges", "courses", "professors", "courses_professors"] as const;

/**
 * `schema.rb:1462` — `OtherDog.lease_connection.create_table :dogs, force: true`.
 * Unlike {@link ARUNIT2_TABLES}, `dogs` exists in *both* databases: the primary
 * one carries the canonical shape (`schema.rb:559`), arunit2 a bare id-only
 * table, so it is laid down here rather than from the canonical registry.
 * `force: true` as Rails spells it: a reused arunit2 database can be carrying
 * the canonical shape from an earlier run.
 */
async function createOtherDogsTable(adapter: DatabaseAdapter): Promise<void> {
  await adapter.createTable("dogs", { force: true }, () => {});
}

/**
 * Creates the `arunit2` database and lays {@link ARUNIT2_TABLES} in it, so the
 * pool `connect` opens on `ARUnit2Model` (`connection.rb:33`) resolves against a
 * database that carries them. Rails gets this from `db:create` plus `schema.rb`'s
 * `Course.lease_connection.create_table` calls; trails has no `db:create` step in
 * front of the suite, so the worker bootstrap (`test-setup-dy.ts`) does both.
 *
 * The `CREATE DATABASE` goes through the *primary* connection rather than
 * `DatabaseTasks.create`, which re-points `Base`'s own pool at the database it
 * creates. A database left over from an earlier run makes it fail; a genuinely
 * absent one still fails loudly on the rebuild below. That rebuild is
 * drop-and-recreate, not create-if-missing, because `schema.rb:1444-1462`
 * creates every one of these tables `force: true` — a reused database can be
 * carrying stale shapes and rows.
 *
 * That rebuild is memoised per slot database per run. Rails lays these tables
 * exactly once per process, inside `schema.rb` itself; trails' bootstrap runs
 * once per *test file*, so without a memo every file pays 10 DROP/CREATE TABLE
 * statements for tables it never touches. The marker is the same run-token
 * stamp the primary database carries, written onto the arunit2 database —
 * per-slot and per-run by name (`arunit2-config.ts`), so "stamped" means "this
 * run already laid these tables in this slot".
 *
 * The rows still go, on both paths: the DDL is what is memoised, not the reset,
 * so a suite that wrote to `colleges` cannot hand its rows to the next file's
 * `College.count`. Suites that mutate these tables mid-run re-prepare them
 * through `withSecondPool` regardless, and a table missing outright puts this
 * boot back on the full rebuild.
 */
export async function provisionSecondDatabase(): Promise<void> {
  if (activeLane() !== "sqlite") {
    const database = String(ARUnit2Model.connectionDbConfig().database);
    const primary = (await Base.leaseConnection()) as unknown as {
      createDatabase(name: string): Promise<void>;
    };
    await primary.createDatabase(database).catch(() => undefined);
  }
  const arunit2 = await ARUnit2Model.leaseConnection();
  const wanted = [...ARUNIT2_TABLES, "dogs"];
  const present = new Set(await arunit2.tables());
  if ((await canonicalSchemaUpToDate(arunit2)) && wanted.every((name) => present.has(name))) {
    await arunit2.truncateTables(...wanted);
    return;
  }
  await loadCanonicalArunit2Schema(arunit2);
  await createOtherDogsTable(arunit2);
  await stampCanonicalSchema(arunit2);
}

/**
 * Prepares the two-database split `MultipleDbTest` asserts over. Both pools are
 * already open, and `provisionSecondDatabase` has already laid the arunit2
 * tables in their canonical shape, so this readies only the rows: they are
 * truncated so a sibling suite's leftovers cannot reach `College.count`.
 *
 * The primary database never carries the arunit2 tables — the canonical schema
 * skips them (`schema.rb:1444-1460` creates them through the second connection)
 * — so there is nothing to drop here, and `MultipleDbTest`'s assertion that a
 * `SELECT` on the wrong pool raises holds without any surgery.
 *
 * Fixture data is seeded separately via `useFixtures` in the test file.
 */
async function setupSecondPool(): Promise<void> {
  registerModel(College);
  registerModel(Course);
  registerModel(Entrant);
  registerModel(Professor);
  const arunit2 = await ARUnit2Model.leaseConnection();

  await arunit2.truncateTables(...ARUNIT2_TABLES);
}

export function withSecondPool(): void {
  beforeAll(setupSecondPool);
}
