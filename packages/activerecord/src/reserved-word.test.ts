import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { File as FixtureFile } from "./fixture-set/file.js";
import { FIXTURES_ROOT as TS_FIXTURES_ROOT } from "./test-helpers/fixtures-registry.js";
import { Base, RecordNotFound, registerModel } from "./index.js";
import "./relation.js";
import { Associations } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { assertNothingRaised } from "@blazetrails/activesupport";
import { assertNoQueries } from "./testing/query-assertions.js";
import { FixtureSet } from "./fixtures.js";
import { reservedWordsGroupFixtureData } from "./test-helpers/fixtures/reserved-words/group.js";
import { reservedWordsSelectFixtureData } from "./test-helpers/fixtures/reserved-words/select.js";
import { reservedWordsValuesFixtureData } from "./test-helpers/fixtures/reserved-words/values.js";
import { reservedWordsDistinctFixtureData } from "./test-helpers/fixtures/reserved-words/distinct.js";
import { reservedWordsDistinctSelectFixtureData } from "./test-helpers/fixtures/reserved-words/distinct-select.js";

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
Associations.belongsTo.call(Group, "select");
Associations.hasOne.call(Group, "values");
Associations.hasMany.call(Select, "groups");
Associations.hasAndBelongsToMany.call(Distinct, "selects");
Associations.hasMany.call(Distinct, "values", { through: "groups" });

fixtures({}, { useTransactionalTests: false });

let connection: SchemaStatements;

const RESERVED_TABLES = ["values", "group", "distinct_select", "distinct", "select", "order"];

beforeEach(async () => {
  connection = (await Base.leaseConnection()) as unknown as SchemaStatements;
  for (const t of RESERVED_TABLES) await connection.dropTable(t, { ifExists: true });
  await connection.createTable("select", { force: true }, () => {});
  await connection.createTable("distinct", { force: true }, () => {});
  await connection.createTable("distinct_select", { id: false, force: true }, (t) => {
    t.references("distinct");
    t.references("select");
  });
  await connection.createTable("group", { force: true }, (t) => {
    t.string("order");
    t.references("select");
  });
  await connection.createTable("values", { primaryKey: "as", force: true }, (t) => {
    t.references("group");
  });
  await Promise.all([
    Group.loadSchema(),
    Select.loadSchema(),
    Values.loadSchema(),
    Distinct.loadSchema(),
  ]);
});

afterAll(async () => {
  const conn = (await Base.leaseConnection()) as unknown as SchemaStatements;
  await conn.dropTable("values", "group", "distinct_select", "distinct", "select", "order", {
    ifExists: true,
  });
});

const fixturesDirectory = {
  select: reservedWordsSelectFixtureData,
  group: reservedWordsGroupFixtureData,
  values: reservedWordsValuesFixtureData,
  distinct: reservedWordsDistinctFixtureData,
  distinct_select: reservedWordsDistinctSelectFixtureData,
};
for (const [name, rows] of Object.entries(fixturesDirectory)) {
  FixtureFile.registerModule(`${TS_FIXTURES_ROOT}/reserved_words/${name}.ts`, rows);
}
const fixtureClassNames = { select: Select, group: Group, values: Values, distinct: Distinct };
async function createTestFixtures(...names: (keyof typeof fixturesDirectory)[]): Promise<void> {
  FixtureSet.resetCache();
  await FixtureSet.createFixtures(`${TS_FIXTURES_ROOT}/reserved_words`, names, fixtureClassNames);
}

describe("ReservedWordTest", () => {
  it("create tables", async () => {
    expect(await connection.tableExists("order")).toBeFalsy();
    await connection.createTable("order", { force: true }, (t) => {
      t.string("group");
    });
    expect(await connection.tableExists("order")).toBeTruthy();
  });

  it("rename tables", async () => {
    await assertNothingRaised(async () => connection.renameTable("group", "order"));
  });

  it("change columns", async () => {
    const conn = connection as unknown as {
      changeColumnDefault(t: string, c: string, d: unknown): Promise<void>;
      changeColumn(t: string, c: string, ty: string, o?: Record<string, unknown>): Promise<void>;
      renameColumn(t: string, c: string, n: string): Promise<void>;
    };
    await assertNothingRaised(() => conn.changeColumnDefault("group", "order", "whatever"));
    await assertNothingRaised(() => conn.changeColumn("group", "order", "text", { default: null }));
    await assertNothingRaised(() => conn.renameColumn("group", "order", "values"));
  });

  it("introspect", async () => {
    const cols = (await connection.columns("group")).map((c) => c.name).sort();
    expect(cols).toEqual(["id", "order", "select_id"]);
    const idx = (await connection.indexes("group")).map((i) => i.name).sort();
    expect(idx).toEqual(["index_group_on_select_id"]);
  });

  it("activerecord model", async () => {
    const x = new Group();
    x.writeAttribute("order", "x");
    await x.save();
    x.writeAttribute("order", "y");
    await x.save();
    expect(
      (await (Group as unknown as { findByOrder(o: string): Promise<Group> }).findByOrder("y")).id,
    ).toBe(x.id);
    expect((await Group.find(x.id)).id).toBe(x.id);
  });

  it("delete all with subselect", async () => {
    await createTestFixtures("values");
    expect(await Values.order(":as").limit(1).offset(1).deleteAll()).toBe(1);
    await expect(Values.find(2)).rejects.toThrow(RecordNotFound);
    expect(await Values.find(1)).toBeTruthy();
  });

  it("has one associations", async () => {
    await createTestFixtures("group", "values");
    const g = await Group.find(1);
    const v = (await g.association("values").loadTarget()) as Values;
    expect(Number(v.id)).toBe(2);
  });

  it("belongs to associations", async () => {
    await createTestFixtures("select", "group");
    const s = await Select.find(2);
    const gs = await (s as unknown as { groups: { toArray(): Promise<Group[]> } }).groups.toArray();
    expect(gs.length).toBe(2);
    expect(gs.map((g) => Number(g.id)).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it("has and belongs to many", async () => {
    await createTestFixtures("select", "distinct", "distinct_select");
    const d = await Distinct.find(1);
    const selects = await (
      d as unknown as { selects: { toArray(): Promise<Select[]> } }
    ).selects.toArray();
    expect(selects.length).toBe(2);
    expect(selects.map((s) => Number(s.id)).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it("activerecord introspection", async () => {
    expect(await Group.tableExists()).toBeTruthy();
    const cols = Group.columns()
      .map((c: { name: string }) => c.name)
      .sort();
    expect(cols).toEqual(["id", "order", "select_id"]);
  });

  it("calculations work with reserved words", async () => {
    await createTestFixtures("group");
    expect(await Group.count()).toBe(3);
  });

  it("associations work with reserved words", async () => {
    await createTestFixtures("select", "group");
    const selects = await Select.all().includes(":groups");
    await assertNoQueries(false, async () => {
      for (const s of selects) {
        await (s as unknown as { groups: { toArray(): Promise<Group[]> } }).groups.toArray();
      }
    });
  });
});
