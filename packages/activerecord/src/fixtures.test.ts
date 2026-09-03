import { describe, it, expect, vi } from "vitest";
import {
  ref,
  isFixtureRef,
  defineFixtures,
  effectiveFixtureKey,
  resolveModelForTable,
  FixtureSetPrimaryKeyError,
  FixtureSet,
} from "./fixtures.js";
import { OID_NAMESPACE, onLoad, uuidV5 } from "@blazetrails/activesupport";
import { primaryKeyErrorFixtureData } from "./test-helpers/fixtures/primary-key-error/primary-key-error.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { ActiveRecord } from "./ar-config.js";
import { defineJoinTableFixtures } from "./fixtures.js";
import { fkObjectToPointToFixtureData } from "./test-helpers/fixtures/fk-object-to-point-to.js";
import { currentAdapter } from "./support/adapter-helper.js";
import "./relation.js";

function makeAdapter(): DatabaseAdapter {
  return {
    typeRegistryKey: "sqlite3" as const,
    execute: vi.fn(async () => []),
    executeMutation: vi.fn(async () => 0),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    executeBatch: vi.fn(async () => {}),
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

describe("effectiveFixtureKey", () => {
  it("keys an unpinned row on its label-derived id", () => {
    const model = makeModel("users", new Map());
    expect(effectiveFixtureKey(model, "grace", {})).toBe("s:" + FixtureSet.identify("grace"));
  });

  it("puts an explicit pin and a colliding derived id in the same keyspace", () => {
    const model = makeModel("users", new Map());
    const pinned = effectiveFixtureKey(model, "other", { id: FixtureSet.identify("grace") });
    const derived = effectiveFixtureKey(model, "grace", {});
    expect(pinned).toBe(derived);
  });

  it("keys on the model's real primary-key column, not a hardcoded id", () => {
    const model = makeModel("subscribers", new Map(), "nick");
    expect(effectiveFixtureKey(model, "first", { nick: "alex" })).toBe("s:alex");
    expect(effectiveFixtureKey(model, "second", { nick: "bo", id: 1 })).toBe("s:bo");
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

  it("ref() resolves a declared string primary key from a previously loaded target", async () => {
    const adapter = makeAdapter();

    const subscriberRows = new Map([["webster132", { nick: "webster132", name: "DHH" }]]);
    const Subscriber = makeModel("subscribers", subscriberRows, "nick");
    await defineFixtures(adapter, Subscriber, {
      second: { nick: "webster132", name: "DHH" },
    });

    const subId = FixtureSet.identify("sub1");
    const Subscription = makeModel("subscriptions", new Map([[subId, { id: subId }]]));
    await defineFixtures(adapter, Subscription, {
      sub1: { subscriber_id: ref("subscribers", "second") },
    });

    const insertSql = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("subscriptions"),
    );
    expect(insertSql).toMatch(/webster132/);
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
      findBy: vi.fn(async () => ({ shop_id: 1, id: 1 })),
    } as any;
    await defineFixtures(adapter, Model, { order1: { status: "paid" } });
    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    const base = FixtureSet.identify("order1");
    expect(insertSql).toContain(String(base));
    expect(insertSql).toContain(String((base * 2) % (2 ** 30 - 1)));
  });

  it("HABTM join-table: two ref()s in one row both resolve", async () => {
    const adapter = makeAdapter();
    const joinRow = {
      post_id: FixtureSet.identify("welcome"),
      tag_id: FixtureSet.identify("rails"),
    };
    const rows = new Map([[FixtureSet.identify("welcome_rails"), joinRow]]);
    const PostTag = makeModel("posts_tags", rows);

    await defineFixtures(adapter, PostTag, {
      welcome_rails: { post_id: ref("posts", "welcome"), tag_id: ref("tags", "rails") },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toMatch(/, 1, /);
    expect(insertSql).not.toContain(String(FixtureSet.identify("welcome")));
    expect(insertSql).toContain(String(FixtureSet.identify("rails")));
  });

  it("ref() to an unloaded set resolves to the target's pinned explicit id", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [
        FixtureSet.identify("david"),
        { id: FixtureSet.identify("david"), author_address_extra_id: 2 },
      ],
    ]);
    const Author = makeModel("authors", rows);

    await defineFixtures(adapter, Author, {
      david: { author_address_extra_id: ref("author_addresses", "david_address_extra") },
    });

    const insertSql = executedStatements(adapter).find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(", 2)");
    expect(insertSql).not.toContain(String(FixtureSet.identify("david_address_extra")));
  });

  it("HABTM: string values for FK columns auto-resolve to fixtureId when table matches a_b pattern", async () => {
    const adapter = makeAdapter();

    const developerRows = new Map([
      [FixtureSet.identify("david"), { id: FixtureSet.identify("david") }],
    ]);
    const Developer = makeModel("developers", developerRows);
    const projectRows = new Map([
      [FixtureSet.identify("trails"), { id: FixtureSet.identify("trails") }],
    ]);
    const Project = makeModel("projects", projectRows);
    await defineFixtures(adapter, Developer, { david: {} });
    await defineFixtures(adapter, Project, { trails: {} });

    const joinRow = {
      developer_id: FixtureSet.identify("david"),
      project_id: FixtureSet.identify("trails"),
    };
    const joinRows = new Map([[FixtureSet.identify("david_trails"), joinRow]]);
    const DevelopersProject = makeModel("developers_projects", joinRows);

    await defineFixtures(adapter, DevelopersProject, {
      david_trails: { developer_id: "david", project_id: "trails" },
    });

    const insertCalls = executedStatements(adapter).filter(
      (s) => s.includes("INSERT INTO") && s.includes("developers_projects"),
    );
    expect(insertCalls.length).toBeGreaterThan(0);
    expect(insertCalls[0]).toContain(String(FixtureSet.identify("david")));
    expect(insertCalls[0]).toContain(String(FixtureSet.identify("trails")));
  });

  function makePlainThroughAuthor() {
    const Categorization = makeModel("categorizations", new Map());
    const Author = makeModel(
      "authors",
      new Map([
        [FixtureSet.identify("david"), { id: FixtureSet.identify("david"), name: "David" }],
      ]),
    );
    Author._reflections = {
      categorizedPosts: {
        macro: "hasMany",
        isThroughReflection: () => true,
        foreignKey: "post_id",
        klass: { tableName: "posts" },
        throughReflection: {
          foreignKey: "author_id",
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
    expect(joinInsert).toMatch(/, 1\)/);
    expect((adapter as any).tableExists).toHaveBeenCalledWith("categorizations");
  });

  it("plain has_many :through label: unloaded through table surfaces a precise error, not 'no such table'", async () => {
    const adapter = makeAdapter();
    (adapter as any).tableExists = vi.fn(async () => false);
    const Author = makePlainThroughAuthor();

    await expect(
      defineFixtures(adapter, Author, {
        david: { name: "David", categorizedPosts: ["welcome"] },
      }),
    ).rejects.toThrow(/join table "categorizations" is not loaded/);
    const joinInsert = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("categorizations"),
    );
    expect(joinInsert).toBeUndefined();
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

  it("polymorphic ref: null value sets both type and id columns to null", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [FixtureSet.identify("untagged"), { id: FixtureSet.identify("untagged") }],
    ]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await defineFixtures(adapter, Tagging, {
      untagged: { taggable: null },
    });

    const insertSql = executedStatements(adapter).find(
      (s) => s.includes("INSERT INTO") && s.includes("taggings"),
    );
    expect(insertSql).toContain("taggable_type");
    expect(insertSql).toContain("taggable_id");
    const nullCount = (insertSql!.match(/\bnull\b/g) ?? []).length;
    expect(nullCount).toBeGreaterThanOrEqual(2);
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

  it("polymorphic ref: non-Base class instance is rejected (no duck typing)", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[FixtureSet.identify("bad"), { id: FixtureSet.identify("bad") }]]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };
    class NotBase {
      id = 42;
    }
    await expect(
      defineFixtures(adapter, Tagging, { bad: { taggable: new NotBase() as any } }),
    ).rejects.toThrow(/polymorphic association.*model instance/);
  });

  it("polymorphic ref: non-instance non-null value throws a clear error", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[FixtureSet.identify("bad"), { id: FixtureSet.identify("bad") }]]);
    const Tagging = makeModel("taggings", rows);
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await expect(
      defineFixtures(adapter, Tagging, { bad: { taggable: 42 as any } }),
    ).rejects.toThrow("polymorphic association");
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

  it("rejects a fractional or boolean declared primary key with a clear error", async () => {
    const adapter = makeAdapter();
    const Model = makeModel("widgets", new Map());

    await expect(defineFixtures(adapter, Model, { thing: { id: 1.5, name: "x" } })).rejects.toThrow(
      /widgets\.thing declares an invalid primary key/,
    );

    await expect(
      defineFixtures(adapter, Model, { thing: { id: true as unknown as number, name: "x" } }),
    ).rejects.toThrow(/invalid primary key/);
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

describe("PrimaryKeyError", () => {
  it("generates the correct value", async () => {
    const adapter = {
      typeRegistryKey: "sqlite3" as const,
      execute: vi.fn(async () => []),
      executeMutation: vi.fn(async () => 0),
      beginTransaction: vi.fn(async () => {}),
      commit: vi.fn(async () => {}),
      rollback: vi.fn(async () => {}),
      createSavepoint: vi.fn(async () => {}),
      releaseSavepoint: vi.fn(async () => {}),
      rollbackToSavepoint: vi.fn(async () => {}),
      quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
      quoteTableName: (n: string) => `"${n}"`,
      quoteColumnName: (n: string) => `"${n}"`,
    } as unknown as DatabaseAdapter;

    const AuthorModel = {
      tableName: "authors",
      primaryKey: "id",
      _reflections: {
        ownedEssay: {
          macro: "belongsTo",
          isPolymorphic: () => false,
          joinPrimaryKey: () => "name",
          klass: { primaryKey: "id", name: "Essay" },
          foreignKey: "owned_essay_id",
        },
      },
      findBy: vi.fn(async () => null),
    } as any;

    await expect(defineFixtures(adapter, AuthorModel, primaryKeyErrorFixtureData)).rejects.toThrow(
      FixtureSetPrimaryKeyError,
    );

    try {
      await defineFixtures(adapter, AuthorModel, primaryKeyErrorFixtureData);
    } catch (e: unknown) {
      expect((e as Error).message).toContain("Unable to set");
      expect((e as Error).message).toContain("name");
      expect((e as Error).message).toContain("Essay");
    }
  });
});

describe("FixturesWithForeignKeyViolationsTest", () => {
  async function withVerifyForeignKeysForFixtures(block: () => Promise<void>): Promise<void> {
    const settingWas = ActiveRecord.verifyForeignKeysForFixtures;
    ActiveRecord.verifyForeignKeysForFixtures = true;
    try {
      await block();
    } finally {
      ActiveRecord.verifyForeignKeysForFixtures = settingWas;
    }
  }

  it("test_raises_fk_violations", async () => {
    await withVerifyForeignKeysForFixtures(async () => {
      const load = (): Promise<unknown> =>
        defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
          first: { fk_object_to_point_to_id: 4242 },
        });
      if (currentAdapter("SQLite3Adapter", "PostgreSQLAdapter")) {
        await expect(load()).rejects.toThrow(
          "Foreign key violations found in your fixture data. Ensure you aren't referring to labels that don't exist on associations.",
        );
      } else {
        await expect(load()).resolves.toBeDefined();
      }
    });
  });

  it("test_does_not_raise_if_no_fk_violations", async () => {
    await defineJoinTableFixtures(
      Base.connection,
      "fk_object_to_point_tos",
      fkObjectToPointToFixtureData,
    );
    await withVerifyForeignKeysForFixtures(async () => {
      await expect(
        defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
          first: { fk_object_to_point_to_id: 1 },
        }),
      ).resolves.toBeDefined();
    });
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

  it("throughLabelAssociations marks HABTM associations isHabtm", async () => {
    await import("./index.js");
    await import("./support/canonical-model-index.js");
    const { throughLabelAssociations } = await import("./fixtures.js");
    const { Developer } = await import("./test-helpers/models/developer.js");

    const assocs = throughLabelAssociations(Developer as never);
    expect(assocs.get("projects")?.isHabtm).toBe(true);
    expect(assocs.get("projects")?.joinTable).toBe("developers_projects");
    expect(assocs.get("ratings")?.isHabtm).toBe(false);
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
