import { Base } from "../base.js";
import { registerModel } from "../associations.js";
import { ensureCanonicalTables, rebuildCanonicalTables } from "./canonical-schema.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { Course } from "../test-helpers/models/course.js";
import { College } from "../test-helpers/models/college.js";
import { Entrant } from "../test-helpers/models/entrant.js";
import { Professor } from "../test-helpers/models/professor.js";
import { activeLane } from "./connection.js";

/**
 * The canonical tables `schema.rb:1444-1460` creates through the second
 * connection (`Course`/`College`/`Professor.lease_connection`) rather than
 * inside the `ActiveRecord::Schema.define` block — the ones that live in
 * `arunit2`, not `arunit`. `entrants` deliberately stays in the primary
 * database (`schema.rb:590`), which is what makes `MultipleDbTest` cross-pool.
 *
 * @internal
 */
export const ARUNIT2_TABLES = ["colleges", "courses", "professors", "courses_professors"] as const;

/**
 * Create the `arunit2` database and lay its tables, so the `ARUnit2Model` pool
 * `connect` opens for the whole worker (`connection.rb:33`) resolves against a
 * database that actually carries colleges/courses/professors.
 *
 * Rails gets this from `db:create` plus `schema.rb`'s
 * `Course.lease_connection.create_table` calls. trails has no `db:create` step
 * in front of the suite, so the worker bootstrap (`test-setup-dy.ts`) does both
 * here, once, before any suite runs.
 *
 * On sqlite the `arunit2` config is its own database (a sibling file, or
 * `:memory:`) that the pool materializes on the spot, so only the tables are
 * needed. On Postgres/MySQL it names a second database on the same server; the
 * `CREATE DATABASE` is issued through the *primary* connection, the way
 * `adapter.test.ts`'s cross-database-select probe does, rather than through
 * `DatabaseTasks.create`, which re-points `Base`'s own pool at the database it
 * creates.
 *
 * @internal
 */
export async function provisionSecondDatabase(): Promise<void> {
  if (activeLane() !== "sqlite") {
    const database = String(ARUnit2Model.connectionDbConfig().database);
    const primary = (await Base.leaseConnection()) as unknown as {
      createDatabase(name: string): Promise<void>;
    };
    try {
      await primary.createDatabase(database);
    } catch {
      // Already there: a worker slot's databases outlive the run that created
      // them, and neither adapter's `create_database` takes `IF NOT EXISTS`. A
      // database that is genuinely absent still fails loudly on the next line.
    }
  }
  await ensureCanonicalTables(await ARUnit2Model.leaseConnection(), ARUNIT2_TABLES);
}

/**
 * Prepares the two-database split `MultipleDbTest` asserts over.
 *
 * Rails runs the suite against two databases (`arunit` / `arunit2`):
 * `ActiveRecord::Base` connects to `arunit`, `ARUnit2Model` to `arunit2`, and
 * the `colleges`/`courses` tables live only in `arunit2`. `entrants` stay in
 * the primary database. Both pools are open before any suite runs, so this
 * readies only the tables: it rebuilds the arunit2 ones, so rows a sibling
 * suite left behind (the habtm cross-pool test creates a `Professor` and a
 * `Course`) can't reach `College.count`, and it undoes trails' one structural
 * difference from Rails on the primary side.
 *
 * That difference: trails loads one canonical schema into the primary database,
 * so the primary carries `colleges`/`courses`/`professors` as well — Rails'
 * `arunit` never does. Dropping them for the duration of the suite is what lets
 * `MultipleDbTest` assert that a `SELECT` issued on the wrong pool raises.
 * `teardownSecondPool` puts them back, because unlike Rails' second database
 * ours is shared with every sibling suite in the worker.
 *
 * Fixture data is seeded separately via `useFixtures` in the test file.
 *
 * @internal
 */
export async function setupSecondPool(): Promise<void> {
  registerModel(College);
  registerModel(Course);
  registerModel(Entrant);
  registerModel(Professor);
  const arunit2 = await ARUnit2Model.leaseConnection();
  const primary = await Base.leaseConnection();

  // The primary database owns only `entrants`; remove the canonical schema's
  // `arunit2`-only tables so the two pools stay disjoint.
  const ss = primary.schemaStatements();
  await ss.dropTable("courses_professors", { ifExists: true });
  await ss.dropTable("courses", { ifExists: true });
  await ss.dropTable("colleges", { ifExists: true });
  await ss.dropTable("professors", { ifExists: true });

  await rebuildCanonicalTables(arunit2, ARUNIT2_TABLES);
  await rebuildCanonicalTables(primary, ["entrants"]);
}

/**
 * Undoes `setupSecondPool`'s primary-database surgery: Rails' two-database
 * split dies with the process, but ours shares one primary database with every
 * sibling suite in the worker, so the dropped tables must be put back.
 *
 * @internal
 */
export async function teardownSecondPool(): Promise<void> {
  await rebuildCanonicalTables(await Base.leaseConnection(), [...ARUNIT2_TABLES, "entrants"]);
}
