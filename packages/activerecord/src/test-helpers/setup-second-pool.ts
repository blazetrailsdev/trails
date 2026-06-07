import { Base } from "../base.js";
import { registerModel } from "../associations.js";
import { defineSchema, type Schema } from "./define-schema.js";
import { ARUnit2Model } from "./models/arunit2-model.js";
import { Course } from "./models/course.js";
import { College } from "./models/college.js";
import { Entrant } from "./models/entrant.js";

/**
 * Wires up Rails' `ARUnit2Model` second connection pool for `MultipleDbTest`.
 *
 * Rails runs the suite against two databases (`arunit` / `arunit2`):
 * `ActiveRecord::Base` connects to `arunit`, `ARUnit2Model` to `arunit2`, and
 * the `colleges`/`courses` tables live only in `arunit2`. `entrants` stay in
 * the primary database. We mirror that split by opening a second independent
 * in-memory SQLite pool on `ARUnit2Model`.
 *
 * The primary database's clone of the canonical schema already carries
 * `courses`/`colleges`; we drop them so the primary pool faithfully lacks the
 * `arunit2`-only tables (mirroring Rails, and letting `MultipleDbTest` assert
 * that a cross-pool `SELECT` raises).
 *
 * Fixture data is seeded separately via `useFixtures` in the test file.
 *
 * @internal
 */
const ARUNIT2_SCHEMA: Schema = {
  colleges: { name: { type: "string", null: false } },
  courses: { name: { type: "string", null: false }, college_id: "integer" },
};

const PRIMARY_SCHEMA: Schema = {
  entrants: { name: { type: "string", null: false }, course_id: { type: "integer", null: false } },
};

/** @internal */
export async function setupSecondPool(): Promise<void> {
  if (!ARUnit2Model.connectionClassQ()) {
    await ARUnit2Model.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
  }
  registerModel(College);
  registerModel(Course);
  registerModel(Entrant);
  const arunit2 = ARUnit2Model.connection;
  const primary = Base.connection;

  // The primary database owns only `entrants`; remove the canonical schema's
  // `arunit2`-only tables so the two pools stay disjoint.
  const ss = primary.schemaStatements!();
  await ss.dropTable("courses", { ifExists: true });
  await ss.dropTable("colleges", { ifExists: true });

  await defineSchema(arunit2, ARUNIT2_SCHEMA, { dropExisting: true });
  await defineSchema(primary, PRIMARY_SCHEMA, { dropExisting: true });
}
