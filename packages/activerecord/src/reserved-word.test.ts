import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { Base, RecordNotFound, registerModel } from "./index.js";
import "./relation.js";
import { Associations } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { SchemaStatements } from "./connection-adapters/abstract/schema-statements.js";
import { assertNoQueries } from "./testing/query-assertions.js";
import { defineFixtures, defineJoinTableFixtures } from "./fixtures.js";
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

function schema(): SchemaStatements {
  return Base.connection as unknown as SchemaStatements;
}

const RESERVED_TABLES = ["values", "group", "distinct_select", "distinct", "select", "order"];

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

afterAll(async () => {
  const conn = schema();
  await conn.dropTable("values", "group", "distinct_select", "distinct", "select", "order", {
    ifExists: true,
  });
});

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

  it("change columns", async () => {
    const conn = Base.connection as unknown as {
      changeColumnDefault(t: string, c: string, d: unknown): Promise<void>;
      changeColumn(t: string, c: string, ty: string, o?: Record<string, unknown>): Promise<void>;
      renameColumn(t: string, c: string, n: string): Promise<void>;
    };
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

  it("delete all with subselect", async () => {
    await createTestFixtures("values");
    expect(await Values.order(":as").limit(1).offset(1).deleteAll()).toBe(1);
    await expect(Values.find(2)).rejects.toThrow(RecordNotFound);
    expect(await Values.find(1)).not.toBeNull();
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
