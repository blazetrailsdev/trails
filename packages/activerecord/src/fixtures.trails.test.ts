import { describe, it, expect, vi } from "vitest";
import { ref, isFixtureRef, defineFixtures, resolveModelForTable, FixtureSet } from "./fixtures.js";
import { OID_NAMESPACE, onLoad, uuidV5 } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
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
    executeMutation: vi.fn(async () => 0),
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

describe("ref", () => {
  it("returns a FixtureRef detected by isFixtureRef", () => {
    const r = ref("users", "david");
    expect(isFixtureRef(r)).toBe(true);
    expect(r.tableName).toBe("users");
    expect(r.fixtureName).toBe("david");
  });

  it("non-ref objects are not detected as refs", () => {
    expect(isFixtureRef({ tableName: "users", fixtureName: "david" })).toBe(false);
    expect(isFixtureRef(null)).toBe(false);
  });
});

describe("defineFixtures", () => {
  it("inserts fixtures and returns keyed accessor", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [FixtureSet.identify("david"), { id: FixtureSet.identify("david"), name: "David" }],
      [FixtureSet.identify("mary"), { id: FixtureSet.identify("mary"), name: "Mary" }],
    ]);
    const User = makeModel("users", rows);

    const users = await defineFixtures(adapter, User, {
      david: { name: "David" },
      mary: { name: "Mary" },
    });

    expect(users.david).toEqual({ id: FixtureSet.identify("david"), name: "David" });
    expect(users.mary).toEqual({ id: FixtureSet.identify("mary"), name: "Mary" });
    const deleteSql = executedStatements(adapter).find((s) => s.includes("DELETE FROM"));
    expect(deleteSql).toContain('"users"');
  });

  it("ref() resolves to the referenced fixture's deterministic ID", async () => {
    const adapter = makeAdapter();
    const welcomeRow = {
      id: FixtureSet.identify("welcome"),
      title: "Welcome",
      author_id: FixtureSet.identify("david"),
    };
    const rows = new Map([[FixtureSet.identify("welcome"), welcomeRow]]);
    const Post = makeModel("posts", rows);

    await defineFixtures(adapter, Post, {
      welcome: { title: "Welcome", author_id: ref("users", "david") },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(String(FixtureSet.identify("david")));
  });

  it("direct model instance is resolved to its PK value", async () => {
    const adapter = makeAdapter();
    const welcomeRow = { id: FixtureSet.identify("welcome"), title: "Welcome" };
    const rows = new Map([[FixtureSet.identify("welcome"), welcomeRow]]);
    const Post = makeModel("posts", rows);

    const davidInstance = { id: FixtureSet.identify("david"), name: "David" };
    await defineFixtures(adapter, Post, {
      welcome: { title: "Welcome", author: davidInstance },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(String(FixtureSet.identify("david")));
  });

  it("deterministic IDs are stable across multiple defineFixtures calls", async () => {
    const davidId = FixtureSet.identify("david");
    const rows = new Map([[davidId, { id: davidId }]]);
    const User = makeModel("users", rows);
    const adapter = makeAdapter();

    const first = await defineFixtures(adapter, User, { david: {} });
    const second = await defineFixtures(adapter, User, { david: {} });

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
    await defineFixtures(adapter, Model, { order1: { status: "paid" } });
    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    const base = FixtureSet.identify("order1");
    expect(insertSql).toContain(String(base));
    expect(insertSql).toContain(String((base * 2) % (2 ** 30 - 1)));
  });

  function makePlainThroughAuthor() {
    const Categorization = makeModel("categorizations", new Map());
    Categorization._allTimestampAttributesInModel = [];
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

    await defineFixtures(adapter, Author, {
      david: { name: "David", categorizedPosts: ["welcome"] },
    });

    const joinInsert = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("categorizations"),
    );
    expect(joinInsert).toBeDefined();
    expect(joinInsert).toContain(String(FixtureSet.identify("david")));
    expect(joinInsert).toContain(String(FixtureSet.identify("welcome")));
  });

  it("tableName registry: resolveModelForTable returns the model after defineFixtures", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[FixtureSet.identify("david"), { id: FixtureSet.identify("david") }]]);
    const User = makeModel("users", rows);

    expect(resolveModelForTable(adapter, "users")).toBeUndefined();
    await defineFixtures(adapter, User, { david: {} });
    expect(resolveModelForTable(adapter, "users")).toBe(User);
  });

  it("tableName registry: each adapter has its own isolated registry", async () => {
    const adapter1 = makeAdapter();
    const adapter2 = makeAdapter();
    const rows = new Map([[FixtureSet.identify("david"), { id: FixtureSet.identify("david") }]]);
    const User = makeModel("users", rows);

    await defineFixtures(adapter1, User, { david: {} });
    expect(resolveModelForTable(adapter1, "users")).toBe(User);
    expect(resolveModelForTable(adapter2, "users")).toBeUndefined();
  });

  it("polymorphic ref: { taggable: instance } expands to taggable_type + taggable_id", async () => {
    const adapter = makeAdapter();

    const postId = FixtureSet.identify("welcome");
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("id", "integer");
      }
    }
    const postInstance = new Post();
    (postInstance as any).id = postId;

    const taggingId = FixtureSet.identify("welcome_tag");
    const taggingRow = {
      id: taggingId,
      taggable_type: "Post",
      taggable_id: postId,
    };
    const rows = new Map([[taggingId, taggingRow]]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: {
        macro: "belongsTo",
        isPolymorphic: () => true,
      },
    };

    await defineFixtures(adapter, Tagging, {
      welcome_tag: { taggable: postInstance as any },
    });

    const insertSql = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("taggings"),
    );
    expect(insertSql).toContain("taggable_type");
    expect(insertSql).toContain("Post");
    expect(insertSql).toContain(String(postId));
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

    await defineFixtures(adapter, Tagging, {
      welcome_tag: { taggable_type: "CustomPost", taggable_id: 999 },
    });

    const insertSql = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("taggings"),
    );
    expect(insertSql).toContain("CustomPost");
    expect(insertSql).toContain("999");
  });

  it("polymorphic ref: ref() on a poly key throws instead of inserting spurious column", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[FixtureSet.identify("bad"), { id: FixtureSet.identify("bad") }]]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await expect(
      defineFixtures(adapter, Tagging, { bad: { taggable: ref("posts", "welcome") as any } }),
    ).rejects.toThrow(/polymorphic association.*model instance/);
  });

  it("uses a string declared primary key verbatim", async () => {
    const adapter = makeAdapter();
    const rows = new Map([["abc", { id: "abc", name: "x" }]]);
    const Model = makeModel("widgets", rows);

    const result = await defineFixtures(adapter, Model, { thing: { id: "abc", name: "x" } });
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

    await defineFixtures(adapter, User, {
      admin_user: { name: "Admin", type: "AdminUser" },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain("type");
    expect(insertSql).toContain("AdminUser");
  });
});

describe("HABTM fixture reflection walking (trails)", () => {
  it("throughJoinTableNames pulls in the anonymous HABTM join tables", async () => {
    const { throughJoinTableNames } = await import("./fixtures.js");
    const { Developer } = await import("./test-helpers/models/developer.js");

    const names = throughJoinTableNames(Developer as never);
    expect(names).toContain("developers_projects");
    expect(names).toContain("computers_developers");
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
