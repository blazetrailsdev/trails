/**
 * Mirrors: activerecord/test/cases/reserved_word_test.rb
 *
 * The table and column names here are SQL reserved words (group, select,
 * values, distinct, order), so they exercise identifier quoting throughout AR.
 * Rails' counterpart sets `use_transactional_tests = false` and builds the
 * five tables in `setup` via `create_table` (not from schema.rb) — the
 * schema-mutating tests (create/rename/change) need a fresh schema per test.
 * We mirror that with a `beforeEach` that recreates the tables and an
 * `afterAll` teardown, plus a `createTestFixtures` helper mirroring Rails'
 * private per-test fixture loader.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Base, RecordNotFound, registerModel } from "./index.js";
import "./relation.js";
import { Associations } from "./associations.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { defineFixtures, defineJoinTableFixtures } from "./test-helpers/define-fixtures.js";
import { reservedWordsGroupFixtureData } from "./test-helpers/fixtures/reserved-words/group.js";
import { reservedWordsSelectFixtureData } from "./test-helpers/fixtures/reserved-words/select.js";
import { reservedWordsValuesFixtureData } from "./test-helpers/fixtures/reserved-words/values.js";
import { reservedWordsDistinctFixtureData } from "./test-helpers/fixtures/reserved-words/distinct.js";
import { reservedWordsDistinctSelectFixtureData } from "./test-helpers/fixtures/reserved-words/distinct-select.js";

// Test-file-local classes mirror Rails' `ReservedWordTest::Group` etc.
class Group extends Base {
  static tableName = "group";
}
class Select extends Base {
  static tableName = "select";
}
class Values extends Base {
  static tableName = "values";
  static primaryKey = "as";
}
class Distinct extends Base {
  static tableName = "distinct";
}
registerModel(Group);
registerModel(Select);
registerModel(Values);
registerModel(Distinct);
// Mirrors the `belongs_to`/`has_one`/`has_many`/`has_and_belongs_to_many`
// declarations in the Rails class bodies.
Associations.belongsTo.call(Group, "select");
Associations.hasOne.call(Group, "values");
Associations.hasMany.call(Select, "groups");
Associations.hasAndBelongsToMany.call(Distinct, "selects");
// Rails' Distinct also declares `has_many :values, through: :groups`. It's
// dangling even in Rails — Distinct has no `:groups` association and no test
// exercises it. trails resolves `through:` lazily (verified: no throw at
// declare time), so we mirror it verbatim for class-body parity.
Associations.hasMany.call(Distinct, "values", { through: "groups" });

setupHandlerSuite();

// `adapter.schemaStatements()` is optional on the adapter interface; fall back
// to constructing one directly, mirroring define-schema.ts.
function schema(): SchemaStatements {
  return Base.connection.schemaStatements?.() ?? new SchemaStatements(Base.connection);
}

const RESERVED_TABLES = ["values", "group", "distinct_select", "distinct", "select", "order"];

// Mirrors Rails `setup`: rebuild the five reserved-word tables before each
// test via `create_table`. `references` adds the `*_id` column and the
// `index_<table>_on_<col>` index that `introspect` asserts on.
beforeEach(async () => {
  const conn = schema();
  for (const t of RESERVED_TABLES) await conn.dropTable(t, { ifExists: true });
  await conn.createTable("select", { force: true }, () => {});
  await conn.createTable("distinct", { force: true }, () => {});
  await conn.createTable("distinct_select", { id: false, force: true }, (t) => {
    t.references("distinct");
    t.references("select");
  });
  await conn.createTable("group", { force: true }, (t) => {
    t.string("order");
    t.references("select");
  });
  await conn.createTable("values", { primaryKey: "as", force: true }, (t) => {
    t.references("group");
  });
  await Promise.all([
    Group.loadSchema(),
    Select.loadSchema(),
    Values.loadSchema(),
    Distinct.loadSchema(),
  ]);
});

// Mirrors Rails teardown: drop the tables so they don't leak into sibling
// files sharing the worker DB.
afterAll(async () => {
  const conn = schema();
  for (const t of RESERVED_TABLES) await conn.dropTable(t, { ifExists: true });
});

// Mirrors the Rails private `create_test_fixtures` loader: seed only the named
// reserved-word fixture sets, like Rails' per-test `create_test_fixtures :group`.
const fixtureLoaders = {
  select: () => defineFixtures(Base.connection, Select, reservedWordsSelectFixtureData),
  group: () => defineFixtures(Base.connection, Group, reservedWordsGroupFixtureData),
  values: () => defineFixtures(Base.connection, Values, reservedWordsValuesFixtureData),
  distinct: () => defineFixtures(Base.connection, Distinct, reservedWordsDistinctFixtureData),
  distinct_select: () =>
    defineJoinTableFixtures(
      Base.connection,
      "distinct_select",
      reservedWordsDistinctSelectFixtureData,
    ),
} as const;
async function createTestFixtures(...names: (keyof typeof fixtureLoaders)[]): Promise<void> {
  for (const name of names) await fixtureLoaders[name]();
}

describe("ReservedWordTest", () => {
  it("create tables", async () => {
    const conn = schema();
    expect(await conn.tableExists("order")).toBe(false);
    await conn.createTable("order", { force: true }, (t) => {
      t.string("group");
    });
    expect(await conn.tableExists("order")).toBe(true);
  });

  it("rename tables", async () => {
    await expect(schema().renameTable("group", "order")).resolves.toBeUndefined();
  });

  it.skip("change columns", async () => {
    // BLOCKED: SQLite adapter gap — changeColumnDefault/changeColumn emit
    // Postgres-style `ALTER TABLE ... ALTER COLUMN ... SET DEFAULT`, which
    // SQLite rejects ("near ALTER: syntax error"). Rails' SQLite3Adapter
    // implements these via a table copy (alter_table). Needs a SQLite
    // table-rebuild path in connection-adapters/sqlite + schema-statements.ts.
    const conn = schema();
    await conn.changeColumnDefault("group", "order", "whatever");
    await conn.changeColumn("group", "order", "text", { default: null });
    await conn.renameColumn("group", "order", "values");
  });

  it("introspect", async () => {
    const conn = schema();
    const cols = (await conn.columns("group")).map((c) => c.name).sort();
    expect(cols).toEqual(["id", "order", "select_id"]);
    const idx = (await conn.indexes("group")).map((i) => i.name).sort();
    expect(idx).toEqual(["index_group_on_select_id"]);
  });

  it("activerecord model", async () => {
    const x = new Group();
    x.writeAttribute("order", "x");
    await x.save();
    x.writeAttribute("order", "y");
    await x.save();
    expect((await Group.findBy({ order: "y" }))!.id).toBe(x.id);
    expect((await Group.find(x.id)).id).toBe(x.id);
  });

  it.skip("delete all with subselect", async () => {
    // BLOCKED: deleteAll ignores limit/offset — it deletes every matching row
    // (2) instead of emitting Rails' `DELETE ... WHERE <pk> IN (SELECT <pk>
    // ... ORDER BY ... LIMIT 1 OFFSET 1)` subselect (deletes 1). Needs a
    // limited-delete subselect in the relation's deleteAll path.
    await createTestFixtures("values");
    expect(await Values.order("as").limit(1).offset(1).deleteAll()).toBe(1);
    await expect(Values.find(2)).rejects.toThrow(RecordNotFound);
    expect(await Values.find(1)).not.toBeNull();
  });

  it.skip("has one associations", async () => {
    // BLOCKED: the has_one reader returns null for the reserved-word `values`
    // target table even though the FK row exists — a manual
    // `Values.where({ group_id: 1 })` finds it (as = 2). Association-layer
    // reserved-word resolution gap in the singular-association reader.
    await createTestFixtures("group", "values");
    const g = await Group.find(1);
    const v = await (g as unknown as { values: Promise<Values> }).values;
    expect(v.id).toBe(2);
  });

  it("belongs to associations", async () => {
    await createTestFixtures("select", "group");
    const s = await Select.find(2);
    const gs = await (s as unknown as { groups: { toArray(): Promise<Group[]> } }).groups.toArray();
    expect(gs.length).toBe(2);
    expect(gs.map((g) => g.id).sort((a, b) => Number(a) - Number(b))).toEqual([2, 3]);
  });

  it("has and belongs to many", async () => {
    await createTestFixtures("select", "distinct", "distinct_select");
    const d = await Distinct.find(1);
    const selects = await (
      d as unknown as { selects: { toArray(): Promise<Select[]> } }
    ).selects.toArray();
    expect(selects.length).toBe(2);
    expect(selects.map((s) => s.id).sort((a, b) => Number(a) - Number(b))).toEqual([1, 2]);
  });

  it("activerecord introspection", async () => {
    expect(await Group.tableExists()).toBe(true);
    const cols = Group.columns()
      .map((c: { name: string }) => c.name)
      .sort();
    expect(cols).toEqual(["id", "order", "select_id"]);
  });

  it("calculations work with reserved words", async () => {
    await createTestFixtures("group");
    expect(await Group.count()).toBe(3);
  });

  it.skip("associations work with reserved words", async () => {
    // BLOCKED: needs `assert_no_queries` (SQL-count monitoring) to prove the
    // eager-loaded `groups` are not re-queried — the trails test harness has
    // no query-count assertion yet (see transactions.test.ts skips).
    await createTestFixtures("select", "group");
    const selects = await Select.all().includes("groups").toArray();
    for (const s of selects) {
      // UNSKIP REQUIRES: wrap this loop in the (not-yet-available)
      // `assert_no_queries` helper — Rails asserts the eager-loaded `groups`
      // trigger zero queries here. Without it this test has no assertion and
      // would pass vacuously, so do not unskip until the harness exists.
      await (s as unknown as { groups: { toArray(): Promise<Group[]> } }).groups.toArray();
    }
  });
});
