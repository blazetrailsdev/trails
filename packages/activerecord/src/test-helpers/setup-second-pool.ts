import { Base } from "../base.js";
import { SchemaStatements } from "../connection-adapters/abstract/schema-statements.js";
import { registerModel } from "../associations.js";
import { defineSchema, type Schema } from "./define-schema.js";
import { defineFixtures, isFixtureRef } from "./define-fixtures.js";
import { ARUnit2Model } from "./models/arunit2-model.js";
import { Course } from "./models/course.js";
import { College } from "./models/college.js";
import { Entrant } from "./models/entrant.js";
import { courseFixtureData } from "./fixtures/courses.js";
import { collegeFixtureData } from "./fixtures/colleges.js";
import { entrantFixtureData } from "./fixtures/entrants.js";

/**
 * Wires up Rails' `ARUnit2Model` second connection pool for `MultipleDbTest`.
 *
 * Rails runs the suite against two databases (`arunit` / `arunit2`):
 * `ActiveRecord::Base` connects to `arunit`, `ARUnit2Model` to `arunit2`, and
 * the `colleges`/`courses` tables live only in `arunit2` (see
 * `test/schema/schema.rb`, which creates them via `Course.lease_connection`).
 * `entrants` stay in the primary database. We mirror that split by opening a
 * second independent in-memory SQLite pool on `ARUnit2Model` and seeding each
 * database with only the tables it owns.
 *
 * The primary database's clone of the canonical schema already carries
 * `courses`/`colleges`; we drop them so the primary pool faithfully lacks the
 * `arunit2`-only tables (mirroring Rails, and letting `MultipleDbTest` assert
 * that a cross-pool `SELECT` raises).
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
  const ss = primary.schemaStatements ? primary.schemaStatements() : new SchemaStatements(primary);
  await ss.dropTable("courses", { ifExists: true });
  await ss.dropTable("colleges", { ifExists: true });

  await defineSchema(arunit2, ARUNIT2_SCHEMA, { dropExisting: true });
  await defineSchema(primary, PRIMARY_SCHEMA, { dropExisting: true });

  // `colleges` before `courses` so the `college_id` ref resolves.
  await defineFixtures(arunit2, College, collegeFixtureData);
  const courses = await defineFixtures(arunit2, Course, courseFixtureData);

  // `entrants` live in the primary pool, so their `course_id` refs can't resolve
  // through the (adapter-scoped) fixture registry that holds the `arunit2`
  // courses. Resolve each ref against the courses we just inserted instead.
  const entrants = Object.fromEntries(
    Object.entries(entrantFixtureData).map(([label, row]) => {
      const courseId = isFixtureRef(row.course_id)
        ? (courses as Record<string, { id: number }>)[row.course_id.fixtureName].id
        : row.course_id;
      return [label, { ...row, course_id: courseId }];
    }),
  );
  await defineFixtures(primary, Entrant, entrants);
}
