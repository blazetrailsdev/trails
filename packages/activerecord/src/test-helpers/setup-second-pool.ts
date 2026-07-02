import { Base } from "../base.js";
import { registerModel } from "../associations.js";
import { defineSchema, type Schema } from "./define-schema.js";
import { ARUnit2Model } from "./models/arunit2-model.js";
import { Course } from "./models/course.js";
import { College } from "./models/college.js";
import { Entrant } from "./models/entrant.js";
import { Professor } from "./models/professor.js";
import { resolveSecondDatabaseConfig } from "./arunit2-config.js";

/**
 * Wires up Rails' `ARUnit2Model` second connection pool for `MultipleDbTest`.
 *
 * Rails runs the suite against two databases (`arunit` / `arunit2`):
 * `ActiveRecord::Base` connects to `arunit`, `ARUnit2Model` to `arunit2`, and
 * the `colleges`/`courses` tables live only in `arunit2`. `entrants` stay in
 * the primary database. We mirror that split by opening a second independent
 * pool on `ARUnit2Model` from the ARTest-style `arunit2` config
 * (`resolveSecondDatabaseConfig`): a separate in-memory SQLite pool on the
 * sqlite run, or the derived `arunit2` database on the Postgres/MySQL server.
 *
 * The primary database's clone of the canonical schema already carries
 * `courses`/`colleges`; we drop them so the primary pool faithfully lacks the
 * `arunit2`-only tables (mirroring Rails, and letting `MultipleDbTest` assert
 * that a cross-pool `SELECT` raises).
 *
 * Fixture data is seeded separately via `useFixtures` in the test file.
 *
 * Provisioning note: on sqlite the `arunit2` config is an in-memory pool that
 * `establishConnection` materializes on the spot, so no caller setup is needed
 * — which is why `MultipleDbTest` is currently sqlite-gated and this is the
 * only lane that runs. On Postgres/MySQL the resolved config points at a
 * derived `arunit2` *named database* that must already exist; like Rails'
 * `ARTest.connect` (which assumes `db:create` ran against `config.yml`), this
 * helper does NOT issue `CREATE DATABASE`. Un-gating `MultipleDbTest` for
 * PG/MySQL therefore requires a caller-side `CREATE DATABASE arunit2` step
 * (as `adapter.test.ts` does for the cross-database-select probe); that work
 * is tracked as a separate story.
 *
 * @internal
 */
const ARUNIT2_SCHEMA: Schema = {
  colleges: { name: { type: "string", null: false } },
  courses: { name: { type: "string", null: false }, college_id: "integer" },
  professors: { name: { type: "string", null: false } },
  courses_professors: {
    columns: { course_id: "integer", professor_id: "integer" },
    primaryKey: false,
  },
};

const PRIMARY_SCHEMA: Schema = {
  entrants: { name: { type: "string", null: false }, course_id: { type: "integer", null: false } },
};

/** @internal */
export async function setupSecondPool(): Promise<void> {
  if (!ARUnit2Model.connectionClassQ()) {
    await ARUnit2Model.establishConnection(resolveSecondDatabaseConfig().config);
  }
  registerModel(College);
  registerModel(Course);
  registerModel(Entrant);
  registerModel(Professor);
  const arunit2 = ARUnit2Model.connection;
  const primary = Base.connection;

  // The primary database owns only `entrants`; remove the canonical schema's
  // `arunit2`-only tables so the two pools stay disjoint.
  const ss = primary.schemaStatements();
  await ss.dropTable("courses_professors", { ifExists: true });
  await ss.dropTable("courses", { ifExists: true });
  await ss.dropTable("colleges", { ifExists: true });
  await ss.dropTable("professors", { ifExists: true });

  // `force: true` on the arunit2 pool ONLY: the one-schema boot lays the
  // canonical tables into the MAIN per-worker pool, so the `arunit2` second pool
  // never sees them and its (canonical) `colleges`/`courses`/`professors`/
  // `courses_professors` must be created here with real DDL. The primary pool is
  // left to the no-op branch: `entrants` is already canonical and present, so no
  // DROP/CREATE on the main pool — preserving the one-schema no-drop invariant.
  // The canonical tables dropped from the primary pool above are restored by
  // `repairWorkerSchema` at the next file's boot.
  //
  // `force` bypasses one-schema's `assertCanonicalSchema`; `ARUNIT2_SCHEMA` is a
  // verbatim subset of canonical `colleges`/`courses`/`professors`/
  // `courses_professors` (test-schema.ts), so it stays canonical by construction
  // — keep it in lockstep with TEST_SCHEMA if either side changes.
  await defineSchema(arunit2, ARUNIT2_SCHEMA, { dropExisting: true, force: true });
  await defineSchema(primary, PRIMARY_SCHEMA, { dropExisting: true });
}
