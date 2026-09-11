import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import {
  ref,
  isFixtureRef,
  defineFixtures,
  effectiveFixtureKey,
  resolveModelForTable,
  FixtureSetPrimaryKeyError,
  FixtureSet,
  FixtureError,
} from "./fixtures.js";
import { Time } from "@blazetrails/date";
import {
  assertNotEmpty,
  Duration,
  Logger,
  OID_NAMESPACE,
  onLoad,
  uuidV5,
} from "@blazetrails/activesupport";
import { primaryKeyErrorFixtureData } from "./test-helpers/fixtures/primary-key-error/primary-key-error.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { Base } from "./base.js";
import { defineJoinTableFixtures } from "./fixtures.js";
import { fkObjectToPointToFixtureData } from "./test-helpers/fixtures/fk-object-to-point-to.js";
import { currentAdapter } from "./support/adapter-helper.js";
import { doubleColumnsHash } from "./test-helpers/double-columns.js";
import { fixtures, TestFixtures } from "./test-fixtures.js";
import { Organization } from "./test-helpers/models/organization.js";
import { ClassNameThatDoesNotFollowCONVENTIONS } from "./test-helpers/models/randomly-named-c1.js";
import {
  AdminClassNameThatDoesNotFollowCONVENTIONS1,
  AdminClassNameThatDoesNotFollowCONVENTIONS2,
} from "./test-helpers/models/admin/randomly-named-c1.js";
import { Bulb } from "./test-helpers/models/bulb.js";
import { CpkOrder } from "./test-helpers/models/cpk.js";
import { withTransactionalFixtures } from "./test-fixtures/with-transactional-fixtures.js";
import { leaseFixtureConnection } from "./test-fixtures/fixture-connection.js";
import { Task } from "./test-helpers/models/task.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Tree } from "./test-helpers/models/tree.js";
import { nakedYmlParrotsFixtureData } from "./test-helpers/fixtures/naked/yml/parrots.js";
import { nakedYmlTreesFixtureData } from "./test-helpers/fixtures/naked/yml/trees.js";
import { Aircraft } from "./test-helpers/models/aircraft.js";
import { Parrot } from "./test-helpers/models/parrot.js";
import { Reply } from "./test-helpers/models/reply.js";
import { registerModel } from "./associations.js";
import { topicFixtureData } from "./test-helpers/fixtures/topics.js";
import { taskFixtureData } from "./test-helpers/fixtures/tasks.js";
import { aircraftFixtureData } from "./test-helpers/fixtures/aircrafts.js";
import { Post } from "./test-helpers/models/post.js";
import { Joke } from "./test-helpers/models/joke.js";
import { Book } from "./test-helpers/models/book.js";
import { Course } from "./test-helpers/models/course.js";
import { Matey } from "./test-helpers/models/matey.js";
import { DeadParrot, LiveParrot } from "./test-helpers/models/parrot.js";
import {
  badPostFixtureData,
  courseFixtureData,
  funnyJokeFixtureData,
  itemFixtureData,
} from "./test-helpers/fixtures/index.js";
import "./relation.js";

for (const model of [Topic, Reply, Task, Aircraft, Tree, Parrot]) {
  registerModel(model);
}

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
    expect(joinInsert).toMatch(/\(1, /);
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

describe("PrimaryKeyErrorTest", () => {
  it("generates the correct value", async () => {
    const adapter = {
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

    const e = await defineFixtures(adapter, AuthorModel, primaryKeyErrorFixtureData).catch(
      (err: Error) => err,
    );
    expect(() => {
      throw e;
    }).toThrow(FixtureSetPrimaryKeyError);
    expect((e as Error).message).toContain("Unable to set");
  });
});

describe("FixturesWithForeignKeyViolationsTest", () => {
  async function withVerifyForeignKeysForFixtures(block: () => Promise<void>): Promise<void> {
    const settingWas = Base.verifyForeignKeysForFixtures;
    Base.verifyForeignKeysForFixtures = true;
    try {
      await block();
    } finally {
      Base.verifyForeignKeysForFixtures = settingWas;
    }
  }

  it("raises fk violations", async () => {
    await withVerifyForeignKeysForFixtures(async () => {
      const load = (): Promise<unknown> =>
        defineJoinTableFixtures(Base.connection, "fk_pointing_to_non_existent_objects", {
          first: { fk_object_to_point_to_id: 4242 },
        });
      if (currentAdapter("SQLite3Adapter", "PostgreSQLAdapter")) {
        const error = await load().catch((e: Error) => e);
        expect(() => {
          throw error;
        }).toThrow();
        expect((error as Error).message).toContain(
          "Foreign key violations found in your fixture data. Ensure you aren't referring to labels that don't exist on associations.",
        );
        expect((error as Error).message).toContain("fk_pointing_to_non_existent_objects");
      } else {
        await expect(load()).resolves.not.toThrow();
      }
    });
  });

  it("does not raise if no fk violations", async () => {
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
      ).resolves.not.toThrow();
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

describe("FixturesTest", () => {
  const { topics, developers, binaries, trafficLights } = fixtures(
    [
      "topics",
      "developers",
      "accounts",
      "tasks",
      "categories",
      "funnyJokes",
      "binaries",
      "trafficLights",
      "trees",
    ],
    { useTransactionalTests: false },
  );

  it("auto value on primary key", async () => {
    const fixtures = [
      { name: "first", wheels_count: 2 },
      { name: "second", wheels_count: 3 },
    ];
    const conn = await Base.leaseConnection();
    await expect(
      conn.insertFixturesSet({ aircraft: fixtures }, ["aircraft"]),
    ).resolves.not.toThrow();
    const result = await conn.selectAll("SELECT name, wheels_count FROM aircraft ORDER BY id");
    expect(result.toArray()).toEqual(fixtures);
  });

  it("attributes", async () => {
    const connection = leaseFixtureConnection();
    const topics = await FixtureSet.createFixtures(connection, Topic, topicFixtureData);
    expect(topics["first"].title).toBe("The First Topic");
    expect(topics["second"].author_email_address).toBeNull();
  });

  it("no args returns all", () => {
    const allTopics = topics.all();
    expect(allTopics.length).toBe(5);
    expect(allTopics[0].title).toBe("The First Topic");
    expect(allTopics[allTopics.length - 1].id).toBe(5);
  });

  it("no args record returns all without array", () => {
    const allBinaries = binaries.all();
    expect(allBinaries).toBeInstanceOf(Array);
    expect(binaries.all().length).toBe(2);
  });

  it("nil raises", () => {
    expect(() => topics(null as never)).toThrow();
    expect(() => topics([null] as never)).toThrow();
  });

  it("inserts", async () => {
    await FixtureSet.createFixtures(leaseFixtureConnection(), Topic, topicFixtureData);
    const firstRow = await (
      await Base.leaseConnection()
    ).selectOne("SELECT * FROM topics WHERE author_name = 'David'");
    expect(firstRow?.["title"]).toBe("The First Topic");

    const secondRow = await (
      await Base.leaseConnection()
    ).selectOne("SELECT * FROM topics WHERE author_name = 'Mary'");
    expect(secondRow?.["author_email_address"]).toBeNull();
  });

  it("insert with datetime", async () => {
    const connection = leaseFixtureConnection();
    await FixtureSet.createFixtures(connection, Task, taskFixtureData);
    const first = await Task.find(1);
    expect(first).toBeTruthy();
  });

  it("insert with default function", async () => {
    const connection = leaseFixtureConnection();
    await FixtureSet.createFixtures(connection, Aircraft, aircraftFixtureData);
    const aircraft = await Aircraft.findBy({ name: "boeing-with-no-manufactured-at" });
    expect(
      Math.abs(Time.now().toF() - (aircraft!.manufactured_at as Time).toF()),
    ).toBeLessThanOrEqual(1.1);
  });

  it("insert with default value", async () => {
    const connection = leaseFixtureConnection();
    await FixtureSet.createFixtures(connection, Aircraft, aircraftFixtureData);
    const aircraft = await Aircraft.findBy({ name: "boeing-with-no-wheels" });
    expect(aircraft?.wheels_count).toBe(0);
  });

  it("logger level invariant", async () => {
    const previousLogger = Base.logger;
    try {
      Base.logger = new Logger(null);

      const level = (Base.logger as Logger).level;
      await FixtureSet.createFixtures(leaseFixtureConnection(), Topic, topicFixtureData);
      expect((Base.logger as Logger).level).toBe(level);
    } finally {
      Base.logger = previousLogger;
    }
  });

  it("instantiation", async () => {
    const connection = leaseFixtureConnection();
    const topics = await FixtureSet.createFixtures(connection, Topic, topicFixtureData);
    expect(topics["first"]).toBeInstanceOf(Topic);
  });

  it("yaml file with invalid column", async () => {
    const connection = leaseFixtureConnection();
    const e = await FixtureSet.createFixtures(connection, Parrot, nakedYmlParrotsFixtureData).catch(
      (err: Error) => err,
    );
    expect(() => {
      throw e;
    }).toThrow(FixtureError);
    expect((e as Error).message).toBe('table "parrots" has no columns named "arrr", "foobar".');
  });

  it("yaml file with symbol columns", async () => {
    const connection = leaseFixtureConnection();
    await FixtureSet.createFixtures(connection, Tree, nakedYmlTreesFixtureData);
    const root = await Tree.find(1);
    expect(root).toBeTruthy();
  });

  it("erb in fixtures", () => {
    expect(developers("dev_5").name).toBe("fixture_5");
  });

  it("serialized fixtures", () => {
    expect(trafficLights("uk").state).toEqual(["Green", "Red", "Orange"]);
  });
});

describe("FixturesWithoutInstantiationTest", () => {
  const { topics, developers, accounts } = fixtures(["topics", "developers", "accounts"]);

  it("accessor methods", () => {
    expect(topics("first").title).toBe("The First Topic");
    expect(developers("jamis").name).toBe("Jamis");
    expect(accounts("signals37").credit_limit).toBe(50);
  });
});

describe("TransactionalFixturesTest", () => {
  withTransactionalFixtures(leaseFixtureConnection);

  let first: Topic;

  beforeAll(async () => {
    await FixtureSet.createFixtures(leaseFixtureConnection(), Topic, topicFixtureData);
  });

  beforeEach(async () => {
    first = await Topic.find(1);
  });

  it("destroy", async () => {
    expect(first).not.toBeNull();
    await first.destroy();
  });

  it("destroy just kidding", () => {
    expect(first).not.toBeNull();
  });
});

interface SetupTestState {
  first?: boolean;
  second?: boolean;
}

describe("MultipleFixturesTest", () => {
  fixtures(["topics"]);
  const test = fixtures(["developers", "accounts"]);

  it("fixture table names", () => {
    expect(test.fixtureTableNames).toEqual(["accounts", "developers", "topics"]);
  });
});

function setupTest(): SetupTestState {
  const state: SetupTestState = {};

  beforeEach(() => {
    state.first = true;
  });

  return state;
}

describe("SetupTest", () => {
  setupTest();

  it("nothing", () => {});
});

describe("SetupSubclassTest", () => {
  const state = setupTest();

  beforeEach(() => {
    state.second = true;
  });

  it("subclassing should preserve setups", () => {
    expect(state.first).toBeTruthy();
    expect(state.second).toBeTruthy();
  });
});

describe("OverlappingFixturesTest", () => {
  fixtures(["topics", "developers"]);
  const test = fixtures(["developers", "accounts"]);

  it("fixture table names", () => {
    expect(test.fixtureTableNames).toEqual(["accounts", "developers", "topics"]);
  });
});

describe("ForeignKeyFixturesTest", () => {
  fixtures(["fkTestHasPk", "fkTestHasFk"]);

  it("number1", () => {
    expect(true).toBeTruthy();
  });

  it("number2", () => {
    expect(true).toBeTruthy();
  });
});

describe("OverRideFixtureMethodTest", () => {
  const { topics: superTopics } = fixtures(["topics"]);

  function topics(name: "first") {
    const topic = superTopics(name);
    topic.title = "omg";
    return topic;
  }

  it("fixture methods can be overridden", () => {
    const x = topics("first");
    expect(x.title).toBe("omg");
  });
});

describe("FixtureWithSetModelClassTest", () => {
  const { otherPosts, otherComments } = fixtures(["otherPosts", "otherComments"], {
    useTransactionalTests: false,
  });

  it("uses fixture class defined in yaml", () => {
    expect(otherPosts("second_welcome")).toBeInstanceOf(Post);
  });

  it("loads the associations to fixtures with set model class", async () => {
    const post = otherPosts("second_welcome");
    const comment = otherComments("second_greetings");
    expect((await post.comments).map((c) => c.id)).toEqual([comment.id]);
    expect((await comment.post)?.id).toBe(post.id);
  });
});

describe("SetFixtureClassPrevailsTest", () => {
  const { badPosts } = fixtures(
    { badPosts: [Post, badPostFixtureData] },
    { useTransactionalTests: false },
  );

  it("uses set fixture class", () => {
    expect(badPosts("bad_welcome")).toBeInstanceOf(Post);
  });
});

describe("CheckSetTableNameFixturesTest", () => {
  const { funnyJokes } = fixtures(
    { funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("table method", () => {
    expect(funnyJokes("a_joke")).toBeInstanceOf(Joke);
  });
});

describe("FixtureNameIsNotTableNameFixturesTest", () => {
  const { items } = fixtures({ items: [Book, itemFixtureData] }, { useTransactionalTests: false });

  it("named accessor", () => {
    expect(items("dvd")).toBeInstanceOf(Book);
  });
});

describe("FixtureNameIsNotTableNameMultipleFixturesTest", () => {
  const { items, funnyJokes } = fixtures(
    { items: [Book, itemFixtureData], funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("named accessor of differently named fixture", () => {
    expect(items("dvd")).toBeInstanceOf(Book);
  });

  it("named accessor of same named fixture", () => {
    expect(funnyJokes("a_joke")).toBeInstanceOf(Joke);
  });
});

describe("CustomConnectionFixturesTest", () => {
  const { courses } = fixtures(
    { courses: [Course, courseFixtureData] },
    { useTransactionalTests: false },
  );

  it("leaky destroy", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });

  it("it twice in whatever order to check for fixture leakage", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });
});

describe("TransactionalFixturesOnCustomConnectionTest", () => {
  const { courses } = fixtures({ courses: [Course, courseFixtureData] });

  it("leaky destroy", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });

  it("it twice in whatever order to check for fixture leakage", async () => {
    expect(() => courses("ruby")).not.toThrow();
    await courses("ruby").destroy();
  });
});

describe("CheckEscapedYamlFixturesTest", () => {
  const { funnyJokes } = fixtures(
    { funnyJokes: [Joke, funnyJokeFixtureData] },
    { useTransactionalTests: false },
  );

  it("proper escaped fixture", () => {
    expect(funnyJokes("another_joke").name).toBe("The \\n Aristocrats\nAte the candy\n");
  });
});

class DevelopersProject {}
describe("ManyToManyFixturesWithClassDefined", () => {
  fixtures(["developersProjects"]);

  it("this should run cleanly", () => {
    expect(true).toBeTruthy();
  });
});

const TIMESTAMP_COLUMNS = ["created_at", "created_on", "updated_at", "updated_on"] as const;

describe("FoxyFixturesTest", () => {
  const {
    parrots,
    pirates,
    treasures,
    ships,
    computers,
    developers,
    "admin/accounts": adminAccounts,
    "admin/users": adminUsers,
    liveParrots,
    deadParrots,
    books,
  } = fixtures(
    [
      "parrots",
      "parrotsPirates",
      "pirates",
      "treasures",
      "mateys",
      "ships",
      "computers",
      "developers",
      "admin/accounts",
      "admin/users",
      "liveParrots",
      "deadParrots",
      "books",
    ],
    { useTransactionalTests: false },
  );

  it("identifies strings", () => {
    expect(FixtureSet.identify("foo")).toBe(FixtureSet.identify("foo"));
    expect(FixtureSet.identify("foo")).not.toBe(FixtureSet.identify("FOO"));
  });

  it("identifies symbols", () => {
    expect(FixtureSet.identify("foo")).toBe(FixtureSet.identify("foo"));
  });

  it("identifies consistently", () => {
    expect(FixtureSet.identify("ruby")).toBe(207281424);
    expect(FixtureSet.identify("sapphire_2")).toBe(1066363776);

    expect(FixtureSet.identify("daddy", ":uuid")).toBe("f92b6bda-0d0d-5fe1-9124-502b18badded");
    expect(FixtureSet.identify("sonny", ":uuid")).toBe("b4b10018-ad47-595d-b42f-d8bdaa6d01bf");
  });

  it("populates timestamp columns", () => {
    for (const property of TIMESTAMP_COLUMNS) {
      expect(parrots("george").readAttribute(property), `should set ${property}`).not.toBeNull();
    }
  });

  it("does not populate timestamp columns if model has set record timestamps to false", () => {
    for (const property of TIMESTAMP_COLUMNS) {
      expect(ships("black_pearl").readAttribute(property), `should not set ${property}`).toBeNull();
    }
  });

  it("populates all columns with the same time", () => {
    let last: unknown = null;

    for (const property of TIMESTAMP_COLUMNS) {
      const current = parrots("george").readAttribute(property);
      last ??= current;

      expect(current).toEqual(last);
      last = current;
    }
  });

  it("only populates columns that exist", () => {
    expect(pirates("blackbeard").created_on).not.toBeNull();
    expect(pirates("blackbeard").updated_on).not.toBeNull();
  });

  it("preserves existing fixture data", () => {
    expect(String((pirates("redbeard").created_on as Time).toDate())).toBe(
      String(Duration.weeks(2).ago(Time.now()).toDate()),
    );
    expect(String((pirates("redbeard").updated_on as Time).toDate())).toBe(
      String(Duration.weeks(2).ago(Time.now()).toDate()),
    );
  });

  it("generates unique ids", () => {
    expect(parrots("george").id).not.toBeNull();
    expect(parrots("george").id).not.toBe(parrots("louis").id);
  });

  it("automatically sets primary key", () => {
    expect(ships("black_pearl")).not.toBeNull();
  });

  it("preserves existing primary key", () => {
    expect(ships("interceptor").id).toBe(2);
  });

  it("resolves belongs to symbols", async () => {
    expect((await pirates("blackbeard").parrot)?.id).toBe(parrots("george").id);
  });

  it("ignores belongs to symbols if association and foreign key are named the same", async () => {
    expect((await computers("workstation").developer)?.id).toBe(developers("david").id);
  });

  it("supports join tables", async () => {
    expect(await pirates("blackbeard").parrots.isInclude(parrots("george"))).toBeTruthy();
    expect(await pirates("blackbeard").parrots.isInclude(parrots("louis"))).toBeTruthy();
    expect(await parrots("george").pirates.isInclude(pirates("blackbeard"))).toBeTruthy();
  });

  it("supports timestamps in join tables", async () => {
    expect(developers("david").created_at).not.toBeNull();
    expect(computers("laptop").created_at).not.toBeNull();

    const klass = class extends Base {
      static {
        this.tableName = "computers_developers";
      }
    };

    const computersDevelopers = await klass.findBy({
      developer_id: developers("david").id,
      computer_id: computers("laptop").id,
    });
    expect(computersDevelopers?.readAttribute("created_at")).not.toBeNull();
  });

  it("supports inline habtm", async () => {
    expect(await parrots("george").treasures.isInclude(treasures("diamond"))).toBeTruthy();
    expect(await parrots("george").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
    expect(await parrots("george").treasures.isInclude(treasures("ruby"))).toBeFalsy();
  });

  it("supports inline habtm with specified id", async () => {
    expect(await parrots("polly").treasures.isInclude(treasures("ruby"))).toBeTruthy();
    expect(await parrots("polly").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
    expect(await parrots("polly").treasures.isInclude(treasures("diamond"))).toBeFalsy();
  });

  it("supports yaml arrays", async () => {
    expect(await parrots("louis").treasures.isInclude(treasures("diamond"))).toBeTruthy();
    expect(await parrots("louis").treasures.isInclude(treasures("sapphire"))).toBeTruthy();
  });

  it("strips DEFAULTS key", async () => {
    expect(() => parrots("DEFAULTS" as never)).toThrow();

    for (const t of ["sapphire", "ruby"] as const) {
      expect(await parrots("davey").treasures.isInclude(treasures(t))).toBeTruthy();
    }
  });

  it("supports label interpolation", () => {
    expect(parrots("frederick").name).toBe("frederick");
  });

  it("supports label string interpolation", () => {
    expect(pirates("mark").catchphrase).toBe("X marks the spot!");
  });

  it("supports label interpolation for integer label", () => {
    expect(pirates("1").catchphrase).toBe("#1 pirate!");
  });

  it("supports polymorphic belongs to", async () => {
    expect((await treasures("sapphire").looter)?.id).toBe(pirates("redbeard").id);
    expect((await treasures("ruby").looter)?.id).toBe(parrots("louis").id);
  });

  it("only generates a pk if necessary", async () => {
    const m = (await Matey.first())!;
    expect(() => {
      m.pirate = pirates("blackbeard");
      m.target = pirates("redbeard");
    }).not.toThrow();
  });

  it("supports sti", async () => {
    expect(parrots("polly")).toBeInstanceOf(DeadParrot);
    expect((await (parrots("polly") as DeadParrot).killer)?.id).toBe(pirates("blackbeard").id);
  });

  it("supports sti with respective files", async () => {
    expect(liveParrots("dusty")).toBeInstanceOf(LiveParrot);
    expect(deadParrots("deadbird")).toBeInstanceOf(DeadParrot);
    expect((await deadParrots("deadbird").killer)?.id).toBe(pirates("blackbeard").id);
  });

  it("resolves enums in sti subclasses", () => {
    expect((parrots("george") as LiveParrot).isAustralian()).toBeTruthy();
    expect((parrots("louis") as LiveParrot).isAfrican()).toBeTruthy();
    expect((parrots("frederick") as LiveParrot).isAfrican()).toBeTruthy();
  });

  it("namespaced models", async () => {
    expect((await adminAccounts("signals37").users).map((u) => u.id)).toContain(
      adminUsers("david").id,
    );
    expect(await adminAccounts("signals37").users.size()).toBe(2);
  });

  it("resolves enums", () => {
    expect(books("awdr").isPublished()).toBeTruthy();
    expect(books("awdr").isRead()).toBeTruthy();
    expect(books("rfr").isProposed()).toBeTruthy();
    expect(books("ddd").isPublished()).toBeTruthy();
  });
});

describe("ActiveSupportSubclassWithFixturesTest", () => {
  const { organizations } = fixtures(["organizations"]);

  it("foo", async () => {
    expect((await Organization.findBy({ name: "No Such Agency" }))?.id).toBe(
      organizations("nsa").id,
    );
  });
});

describe("CustomNameForFixtureOrModelTest", () => {
  const {
    randomlyNamedA9,
    "admin/randomlyNamedA9": adminRandomlyNamedA9,
    "admin/randomlyNamedB0": adminRandomlyNamedB0,
  } = fixtures(["randomlyNamedA9", "admin/randomlyNamedA9", "admin/randomlyNamedB0"]);

  it("named accessor for randomly named fixture and class", () => {
    expect(randomlyNamedA9("first_instance")).toBeInstanceOf(ClassNameThatDoesNotFollowCONVENTIONS);
  });

  it("named accessor for randomly named namespaced fixture and class", () => {
    expect(adminRandomlyNamedA9("first_instance")).toBeInstanceOf(
      AdminClassNameThatDoesNotFollowCONVENTIONS1,
    );
    expect(adminRandomlyNamedB0("second_instance")).toBeInstanceOf(
      AdminClassNameThatDoesNotFollowCONVENTIONS2,
    );
  });
});

describe("IgnoreFixturesTest", () => {
  const { otherBooks, parrots } = fixtures(
    ["otherBooks", "parrots", "parrotsPirates", "pirates", "treasures"],
    { useTransactionalTests: false },
  );

  it("ignores books fixtures", async () => {
    expect(() => otherBooks("published" as never)).toThrow();
    expect(() => otherBooks("published_paperback" as never)).toThrow();
    expect(() => otherBooks("published_ebook" as never)).toThrow();

    expect(await Book.count()).toBe(2);
    expect(otherBooks("awdr").name).toBe("Agile Web Development with Rails");
    expect(otherBooks("awdr").status).toBe("published");
    expect(otherBooks("awdr").format).toBe("paperback");
    expect(otherBooks("awdr").language).toBe("english");

    expect(otherBooks("rfr").name).toBe("Ruby for Rails");
    expect(otherBooks("rfr").format).toBe("ebook");
    expect(otherBooks("rfr").status).toBe("published");
  });

  it("ignores parrots fixtures", () => {
    expect(() => parrots("DEFAULT" as never)).toThrow();
    expect(() => parrots("DEAD_PARROT" as never)).toThrow();

    expect(parrots("polly").parrot_sti_class).toBe("DeadParrot");
  });
});

describe("FixturesWithDefaultScopeTest", () => {
  const { bulbs } = fixtures(["bulbs"]);

  it("inserts fixtures excluded by a default scope", async () => {
    expect(await Bulb.count()).toBe(1);
    expect(await Bulb.unscoped().count()).toBe(2);
  });

  it("allows access to fixtures excluded by a default scope", () => {
    expect(bulbs("special").name).toBe("special");
  });
});

describe("FixturesWithAbstractBelongsTo", () => {
  const { pirates, doubloons } = fixtures(["pirates", "doubloons"]);

  it("creates fixtures with belongs_to associations defined in abstract base classes", async () => {
    expect(doubloons("blackbeards_doubloon")).not.toBeNull();
    expect((await doubloons("blackbeards_doubloon").pirate)?.id).toBe(pirates("blackbeard").id);
  });
});

describe("FixtureClassNamesTest", () => {
  let klass: (new () => object) & { fixtureClassNames: Record<string, unknown> };
  let savedCache: Record<string, unknown>;

  beforeEach(() => {
    klass = class {} as typeof klass;
    include(klass, TestFixtures);
    savedCache = { ...klass.fixtureClassNames };
  });

  afterEach(() => {
    klass.fixtureClassNames = savedCache;
  });

  it("fixture_class_names returns nil for unregistered identifier", () => {
    expect(klass.fixtureClassNames["unregistered_identifier"]).toBeUndefined();
  });
});

describe("MultipleFixtureConnectionsTest", () => {
  describe("CompositePkFixturesTest", () => {
    const { cpkOrders, cpkBooks, cpkAuthors, cpkReviews, cpkOrderAgreements } = fixtures([
      "cpkOrders",
      "cpkBooks",
      "cpkAuthors",
      "cpkReviews",
      "cpkOrderAgreements",
    ]);

    it("generates composite primary key for partially filled fixtures", () => {
      const alice = cpkAuthors("cpk_great_author");
      const aliceCpkBook = cpkBooks("cpk_great_author_first_book");
      const aliceCpkBookId = aliceCpkBook.id as unknown[];

      assertNotEmpty(aliceCpkBookId.filter((v) => v != null));
      expect(aliceCpkBookId[0]).toBe(alice.id);
      expect(aliceCpkBookId[aliceCpkBookId.length - 1]).not.toBeNull();
    });

    it("generates composite primary key ids", () => {
      assertNotEmpty((cpkOrders("cpk_groceries_order_1").id as unknown[]).filter((v) => v != null));

      for (const idColumn of cpkBooks("cpk_great_author_first_book").id as unknown[]) {
        expect(idColumn).not.toBeNull();
      }
    });

    it("generates composite primary key with unique components", () => {
      expect(new Set(cpkOrders("cpk_groceries_order_1").id as unknown[]).size).toBe(2);
    });

    it("resolves associations using composite primary keys", async () => {
      const review = cpkReviews("first_book_review");
      const generatedBook = cpkBooks("cpk_book_with_generated_pk");

      expect([review.author_id, review.number]).toEqual(generatedBook.id);
      expect(await review.book).toEqual(generatedBook);
    });

    it("resolves associations using composite primary keys with partially filled values", async () => {
      const review = cpkReviews("second_book_review_for_book_with_partial_pk_defined");
      const bookWithPartiallyFilledCpk = cpkBooks("cpk_great_author_first_book");

      expect([review.author_id, review.number]).toEqual(bookWithPartiallyFilledCpk.id);
      expect(await review.book).toEqual(bookWithPartiallyFilledCpk);
    });

    it("association with custom primary key", async () => {
      const order = cpkOrders("cpk_groceries_order_2");
      const orderAgreement = cpkOrderAgreements("order_agreement_three");

      const [, orderId] = order.id as unknown[];

      expect(orderAgreement.order_id).toBe(orderId);
      expect((await orderAgreement.order)?.id).toEqual(order.id);
    });

    it("composite identify resolves to same values", () => {
      const identifyOne = FixtureSet.compositeIdentify("label", ["a", "b", "c"]);
      const identifyTwo = FixtureSet.compositeIdentify("label", ["a", "b", "c"]);

      expect(identifyOne).toEqual(identifyTwo);
    });

    it("composite identify returns hash with key names", () => {
      const id = FixtureSet.compositeIdentify("order", CpkOrder.primaryKey as string[]);

      expect(Object.keys(id)).toEqual(["shop_id", "id"]);
    });

    it("composite identify uses same hashing algorithm as identify for first attribute", () => {
      const idHash = FixtureSet.compositeIdentify("order", ["first_attribute", "second_attribute"]);
      const id = FixtureSet.identify("order");

      expect(idHash["first_attribute"]).toBe(id);
      expect(idHash["second_attribute"]).not.toBe(id);
    });

    it("composite identify hashes one label to same values irrespective of column names", () => {
      const idHashOne = FixtureSet.compositeIdentify("order", [
        "first_attribute",
        "second_attribute",
      ]);
      const idHashTwo = FixtureSet.compositeIdentify("order", ["shop_id", "id"]);

      expect(Object.values(idHashOne)).toEqual(Object.values(idHashTwo));
      expect(Object.keys(idHashOne)).not.toEqual(Object.keys(idHashTwo));
    });

    it("composite identify hashes to same values based on position in key", () => {
      const id = FixtureSet.identify("order");
      const idHashTwo = FixtureSet.compositeIdentify("order", ["one", "two"]);
      const idHashThree = FixtureSet.compositeIdentify("order", ["one", "two", "three"]);

      expect(Object.values(idHashTwo)[0]).toBe(id);
      expect(Object.values(idHashThree)[0]).toBe(id);
      expect(Object.values(idHashThree).slice(0, 2)).toEqual(Object.values(idHashTwo));
    });
  });
});
