import { describe, it, expect, vi } from "vitest";
import { File as FixtureFile } from "./fixture-set/file.js";
import { FixtureSet } from "./fixtures.js";
import { OID_NAMESPACE, onLoad, uuidV5 } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { doubleColumnsHash } from "./test-helpers/double-columns.js";
import "./relation.js";

const DOUBLE_ONLY_COLUMNS: Record<string, string[]> = {
  accounts: ["name"],
  developers_projects: ["id"],
  orders: ["status", "shop_id"],
  posts: ["author"],
  posts_tags: ["id", "post_id", "tag_id"],
  users: ["name", "type"],
  widgets: ["name"],
};

function makeAdapter(): DatabaseAdapter {
  return {
    execute: vi.fn(async () => []),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    executeBatch: vi.fn(async () => {}),
    schemaCache: {
      columnsHash: async (table: string) => doubleColumnsHash(table, DOUBLE_ONLY_COLUMNS),
    },
    lookupCastTypeFromColumn: () => ({ serialize: (v: unknown) => v }),
    quoteString: (v: string) => v.replace(/'/g, "''"),
    disableReferentialIntegrity: async (fn: () => Promise<void>) => {
      await fn();
    },
    transaction: async <T>(fn: () => Promise<T> | T) => fn(),
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
  } as unknown as DatabaseAdapter;
}

function executedStatements(adapter: DatabaseAdapter): string[] {
  return (
    (adapter as unknown as { executeBatch: ReturnType<typeof vi.fn> }).executeBatch.mock
      .calls as unknown[][]
  ).flatMap((c) => c[0] as string[]);
}

async function createFixtures(
  adapter: DatabaseAdapter,
  modelClass: any,
  data: Record<string, Record<string, unknown>>,
): Promise<Record<string, any>> {
  const pool = { withConnection: async (block: (c: unknown) => unknown) => block(adapter) };
  modelClass.connectionPool = () => pool;
  FixtureSet.resetCache();
  FixtureFile.registerModule(`fixtures-trails/${modelClass.tableName}.ts`, data);
  const [fixtureSet] = await FixtureSet.createFixtures(
    "fixtures-trails",
    [modelClass.tableName],
    { [modelClass.tableName]: modelClass },
    modelClass,
  );
  const rows: Record<string, any> = {};
  for (const [label, fixture] of Object.entries(fixtureSet.fixtures))
    rows[label] = fixture.toHash();
  return rows;
}

function makeModel(tableName: string, rows: Map<unknown, Record<string, unknown>>, pk = "id") {
  return {
    tableName,
    primaryKey: pk,
    loadSchema: async () => {},
    columns: () => Object.values(doubleColumnsHash(tableName, { [tableName]: [pk] })),
    typeForAttribute: () => ({ type: () => "integer" }),
    findBy: vi.fn(async (attrs: Record<string, unknown>) => rows.get(attrs[pk]) ?? null),
  } as any;
}

describe("fixtureId", () => {
  it("returns a non-negative integer below 2^30 - 1", () => {
    const id = FixtureSet.identify("david");
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThan(2 ** 30 - 1);
  });

  it("is deterministic and stable: same label always yields the same known value", () => {
    expect(FixtureSet.identify("david")).toBe(127326141);
    expect(FixtureSet.identify("david")).toBe(FixtureSet.identify("david"));
    expect(FixtureSet.identify("david")).not.toBe(FixtureSet.identify("mary"));
  });
});

describe("createFixtures", () => {
  it("inserts fixtures and returns keyed accessor", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [FixtureSet.identify("david"), { id: FixtureSet.identify("david"), name: "David" }],
      [FixtureSet.identify("mary"), { id: FixtureSet.identify("mary"), name: "Mary" }],
    ]);
    const User = makeModel("users", rows);

    const users = await createFixtures(adapter, User, {
      david: { name: "David" },
      mary: { name: "Mary" },
    });

    expect(users.david).toEqual({ id: FixtureSet.identify("david"), name: "David" });
    expect(users.mary).toEqual({ id: FixtureSet.identify("mary"), name: "Mary" });
    const deleteSql = executedStatements(adapter).find((s) => s.includes("DELETE FROM"));
    expect(deleteSql).toContain('"users"');
  });

  it("deterministic IDs are stable across multiple createFixtures calls", async () => {
    const davidId = FixtureSet.identify("david");
    const rows = new Map([[davidId, { id: davidId }]]);
    const User = makeModel("users", rows);
    const adapter = makeAdapter();

    const first = await createFixtures(adapter, User, { david: {} });
    const second = await createFixtures(adapter, User, { david: {} });

    expect(first.david.id).toBe(davidId);
    expect(second.david.id).toBe(davidId);
  });

  it("auto-generates absent composite primary-key columns from the label", async () => {
    const adapter = makeAdapter();
    const Model = {
      tableName: "orders",
      primaryKey: ["shop_id", "id"],
      compositePrimaryKey: true,
      loadSchema: async () => {},
      columns: () => Object.values(doubleColumnsHash("orders", { orders: ["shop_id"] })),
      typeForAttribute: () => ({ type: () => "integer" }),
      findBy: vi.fn(async () => ({ shop_id: 1, id: 1 })),
    } as any;
    await createFixtures(adapter, Model, { order1: { status: "paid" } });
    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    const base = FixtureSet.identify("order1");
    expect(insertSql).toContain(String(base));
    expect(insertSql).toContain(String((base * 2) % (2 ** 30 - 1)));
  });

  function makePlainThroughAuthor() {
    const Categorization = makeModel("categorizations", new Map());
    Categorization.allTimestampAttributesInModel = () => [];
    const Author = makeModel(
      "authors",
      new Map([
        [FixtureSet.identify("david"), { id: FixtureSet.identify("david"), name: "David" }],
      ]),
    );
    Author._reflections = {
      categorizedPosts: {
        name: "categorizedPosts",
        macro: "hasMany",
        options: { through: "categorizations" },
        isThroughReflection: () => true,
        foreignKey: () => "post_id",
        klass: {
          tableName: "posts",
          primaryKey: "id",
          typeForAttribute: () => ({ type: () => "integer" }),
        },
        throughReflection: {
          foreignKey: () => "author_id",
          klass: Categorization,
          tableName: "categorizations",
        },
      },
    };
    return Author;
  }

  it("plain has_many :through label: materializes join rows into the through table when it is loaded", async () => {
    const adapter = makeAdapter();
    (adapter as any).tableExists = vi.fn(async () => true);
    const Author = makePlainThroughAuthor();

    await createFixtures(adapter, Author, {
      david: { name: "David", categorizedPosts: ["welcome"] },
    });

    const joinInsert = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("categorizations"),
    );
    expect(joinInsert).toBeDefined();
    expect(joinInsert).toContain(String(FixtureSet.identify("david")));
    expect(joinInsert).toContain(String(FixtureSet.identify("welcome")));
  });

  it("polymorphic ref: explicit taggable_type/taggable_id pass through without expansion", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [FixtureSet.identify("welcome_tag"), { id: FixtureSet.identify("welcome_tag") }],
    ]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await createFixtures(adapter, Tagging, {
      welcome_tag: { taggable_type: "CustomPost", taggable_id: 999 },
    });

    const insertSql = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("taggings"),
    );
    expect(insertSql).toContain("CustomPost");
    expect(insertSql).toContain("999");
  });

  it("uses a string declared primary key verbatim", async () => {
    const adapter = makeAdapter();
    const rows = new Map([["abc", { id: "abc", name: "x" }]]);
    const Model = makeModel("widgets", rows);

    const result = await createFixtures(adapter, Model, { thing: { id: "abc", name: "x" } });
    expect((result.thing as { id: string }).id).toBe("abc");

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain("abc");
  });

  it("STI: type column passed explicitly is preserved in INSERT", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [
        FixtureSet.identify("admin_user"),
        { id: FixtureSet.identify("admin_user"), type: "AdminUser" },
      ],
    ]);
    const User = makeModel("users", rows);

    await createFixtures(adapter, User, {
      admin_user: { name: "Admin", type: "AdminUser" },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain("type");
    expect(insertSql).toContain("AdminUser");
  });
});

describe("FixtureSet (trails)", () => {
  it("identify returns the crc32 identifier for a label", () => {
    expect(FixtureSet.identify("dhh")).toBe(FixtureSet.identify("dhh"));
  });

  it("identify returns a UUID v5 for a uuid column type", () => {
    expect(FixtureSet.identify("dhh", ":uuid")).toBe(uuidV5(OID_NAMESPACE, "dhh"));
  });

  it("default_fixture_model_name singularizes and camelizes when table names are pluralized", () => {
    expect(FixtureSet.defaultFixtureModelName("users")).toBe("User");
  });

  it("runs the active_record_fixture_set load hook with FixtureSet", () => {
    const seen: unknown[] = [];
    onLoad("active_record_fixture_set", (base: unknown) => seen.push(base));
    expect(seen).toEqual([FixtureSet]);
  });
});

describe("FixtureSet.compositeIdentify", () => {
  it("matches Ruby's shift for a five-column key", () => {
    expect(FixtureSet.compositeIdentify("label", ["a", "b", "c", "d", "e"])).toEqual({
      a: 245846248,
      b: 491692496,
      c: 983384992,
      d: 893028161,
      e: 712314499,
    });
  });
});
