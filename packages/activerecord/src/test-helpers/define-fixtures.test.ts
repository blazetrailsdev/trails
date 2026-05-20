import { describe, it, expect, vi } from "vitest";
import {
  fixtureId,
  ref,
  isFixtureRef,
  defineFixtures,
  resolveModelForTable,
} from "./define-fixtures.js";
import type { DatabaseAdapter } from "../adapter.js";
import { Base } from "../base.js";

function makeAdapter(): DatabaseAdapter {
  return {
    adapterName: "sqlite" as const,
    execute: vi.fn(async () => []),
    executeMutation: vi.fn(async () => 0),
    beginTransaction: vi.fn(async () => {}),
    commit: vi.fn(async () => {}),
    rollback: vi.fn(async () => {}),
    createSavepoint: vi.fn(async () => {}),
    releaseSavepoint: vi.fn(async () => {}),
    rollbackToSavepoint: vi.fn(async () => {}),
    isNoDatabaseError: () => false,
    quote: (v: unknown) => (typeof v === "string" ? `'${v}'` : String(v)),
    quoteTableName: (n: string) => `"${n}"`,
    quoteColumnName: (n: string) => `"${n}"`,
  } as unknown as DatabaseAdapter;
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
    const id = fixtureId("david");
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThan(2 ** 30 - 1);
  });

  it("is deterministic and stable: same label always yields the same known value", () => {
    // For ASCII labels this matches Ruby's Zlib.crc32(label) % (2**30 - 1) exactly.
    expect(fixtureId("david")).toBe(127326141);
    expect(fixtureId("david")).toBe(fixtureId("david"));
    expect(fixtureId("david")).not.toBe(fixtureId("mary"));
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
      [fixtureId("david"), { id: fixtureId("david"), name: "David" }],
      [fixtureId("mary"), { id: fixtureId("mary"), name: "Mary" }],
    ]);
    const User = makeModel("users", rows);

    const users = await defineFixtures(adapter, User, {
      david: { name: "David" },
      mary: { name: "Mary" },
    });

    expect(users.david).toEqual({ id: fixtureId("david"), name: "David" });
    expect(users.mary).toEqual({ id: fixtureId("mary"), name: "Mary" });
    // Mirrors Rails: table is cleared before insert so repeated calls replace rows
    const deleteSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("DELETE FROM"));
    expect(deleteSql).toContain('"users"');
  });

  it("ref() resolves to the referenced fixture's deterministic ID", async () => {
    const adapter = makeAdapter();
    const welcomeRow = {
      id: fixtureId("welcome"),
      title: "Welcome",
      author_id: fixtureId("david"),
    };
    const rows = new Map([[fixtureId("welcome"), welcomeRow]]);
    const Post = makeModel("posts", rows);

    await defineFixtures(adapter, Post, {
      welcome: { title: "Welcome", author_id: ref("users", "david") },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(String(fixtureId("david")));
  });

  it("direct model instance is resolved to its PK value", async () => {
    const adapter = makeAdapter();
    const welcomeRow = { id: fixtureId("welcome"), title: "Welcome" };
    const rows = new Map([[fixtureId("welcome"), welcomeRow]]);
    const Post = makeModel("posts", rows);

    const davidInstance = { id: fixtureId("david"), name: "David" };
    await defineFixtures(adapter, Post, {
      welcome: { title: "Welcome", author: davidInstance },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(String(fixtureId("david")));
  });

  it("deterministic IDs are stable across multiple defineFixtures calls", async () => {
    const davidId = fixtureId("david");
    const rows = new Map([[davidId, { id: davidId }]]);
    const User = makeModel("users", rows);
    const adapter = makeAdapter();

    const first = await defineFixtures(adapter, User, { david: {} });
    const second = await defineFixtures(adapter, User, { david: {} });

    expect(first.david.id).toBe(davidId);
    expect(second.david.id).toBe(davidId);
  });

  it("throws for composite primary keys", async () => {
    const Model = { tableName: "orders", primaryKey: ["shop_id", "id"], findBy: vi.fn() } as any;
    await expect(defineFixtures(makeAdapter(), Model, { order1: {} })).rejects.toThrow(
      "composite primary keys are not supported",
    );
  });

  it("HABTM join-table: two ref()s in one row both resolve", async () => {
    const adapter = makeAdapter();
    const joinRow = { post_id: fixtureId("welcome"), tag_id: fixtureId("rails") };
    const rows = new Map([[fixtureId("welcome_rails"), joinRow]]);
    const PostTag = makeModel("posts_tags", rows);

    await defineFixtures(adapter, PostTag, {
      welcome_rails: { post_id: ref("posts", "welcome"), tag_id: ref("tags", "rails") },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain(String(fixtureId("welcome")));
    expect(insertSql).toContain(String(fixtureId("rails")));
  });

  it("HABTM: string values for FK columns auto-resolve to fixtureId when table matches a_b pattern", async () => {
    const adapter = makeAdapter();

    // Register developers and projects first
    const developerRows = new Map([[fixtureId("david"), { id: fixtureId("david") }]]);
    const Developer = makeModel("developers", developerRows);
    const projectRows = new Map([[fixtureId("trails"), { id: fixtureId("trails") }]]);
    const Project = makeModel("projects", projectRows);
    await defineFixtures(adapter, Developer, { david: {} });
    await defineFixtures(adapter, Project, { trails: {} });

    // Join-table: developers_projects auto-detects "developers" and "projects" in registry
    const joinRow = {
      developer_id: fixtureId("david"),
      project_id: fixtureId("trails"),
    };
    const joinRows = new Map([[fixtureId("david_trails"), joinRow]]);
    const DevelopersProject = makeModel("developers_projects", joinRows);

    await defineFixtures(adapter, DevelopersProject, {
      david_trails: { developer_id: "david", project_id: "trails" },
    });

    const insertCalls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("developers_projects"));
    expect(insertCalls.length).toBeGreaterThan(0);
    expect(insertCalls[0]).toContain(String(fixtureId("david")));
    expect(insertCalls[0]).toContain(String(fixtureId("trails")));
  });

  it("tableName registry: resolveModelForTable returns the model after defineFixtures", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[fixtureId("david"), { id: fixtureId("david") }]]);
    const User = makeModel("users", rows);

    expect(resolveModelForTable(adapter, "users")).toBeUndefined();
    await defineFixtures(adapter, User, { david: {} });
    expect(resolveModelForTable(adapter, "users")).toBe(User);
  });

  it("tableName registry: each adapter has its own isolated registry", async () => {
    const adapter1 = makeAdapter();
    const adapter2 = makeAdapter();
    const rows = new Map([[fixtureId("david"), { id: fixtureId("david") }]]);
    const User = makeModel("users", rows);

    await defineFixtures(adapter1, User, { david: {} });
    expect(resolveModelForTable(adapter1, "users")).toBe(User);
    expect(resolveModelForTable(adapter2, "users")).toBeUndefined();
  });

  it("polymorphic ref: { taggable: instance } expands to taggable_type + taggable_id", async () => {
    const adapter = makeAdapter();

    // Post instance with a known ID
    const postId = fixtureId("welcome");
    class Post extends Base {
      static {
        this._tableName = "posts";
      }
    }
    const postInstance = new Post();
    (postInstance as any).id = postId;

    // Tagging model with a polymorphic belongs_to :taggable reflection
    const taggingId = fixtureId("welcome_tag");
    const taggingRow = {
      id: taggingId,
      taggable_type: "Post",
      taggable_id: postId,
    };
    const rows = new Map([[taggingId, taggingRow]]);
    const Tagging = makeModel("taggings", rows) as any;
    Tagging._reflections = {
      taggable: {
        macro: "belongsTo",
        isPolymorphic: () => true,
      },
    };

    await defineFixtures(adapter, Tagging, {
      welcome_tag: { taggable: postInstance as any },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO") && s.includes("taggings"));
    expect(insertSql).toContain("taggable_type");
    expect(insertSql).toContain("Post");
    expect(insertSql).toContain(String(postId));
  });

  it("polymorphic ref: explicit taggable_type/taggable_id pass through without expansion", async () => {
    // When the caller already provides the concrete type/id columns directly (no association key),
    // they should pass through unchanged — no expansion is triggered.
    const adapter = makeAdapter();
    const rows = new Map([[fixtureId("welcome_tag"), { id: fixtureId("welcome_tag") }]]);
    const Tagging = makeModel("taggings", rows) as any;
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await defineFixtures(adapter, Tagging, {
      welcome_tag: { taggable_type: "CustomPost", taggable_id: 999 },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO") && s.includes("taggings"));
    expect(insertSql).toContain("CustomPost");
    expect(insertSql).toContain("999");
  });

  it("polymorphic ref: null value sets both type and id columns to null", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[fixtureId("untagged"), { id: fixtureId("untagged") }]]);
    const Tagging = makeModel("taggings", rows) as any;
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await defineFixtures(adapter, Tagging, {
      untagged: { taggable: null },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO") && s.includes("taggings"));
    expect(insertSql).toContain("taggable_type");
    expect(insertSql).toContain("taggable_id");
    // Both FK columns appear with null values (test adapter serialises null as "null")
    const nullCount = (insertSql!.match(/\bnull\b/g) ?? []).length;
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });

  it("polymorphic ref: ref() on a poly key throws instead of inserting spurious column", async () => {
    const adapter = makeAdapter();
    const rows = new Map([[fixtureId("bad"), { id: fixtureId("bad") }]]);
    const Tagging = makeModel("taggings", rows) as any;
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await expect(
      defineFixtures(adapter, Tagging, { bad: { taggable: ref("posts", "welcome") as any } }),
    ).rejects.toThrow(/polymorphic association.*model instance/);
  });

  it("polymorphic ref: non-Base class instance is rejected (no duck typing)", async () => {
    // Guards the narrowing from regressing to the old constructor !== Object
    // duck-typed check, which would have happily accepted any class instance.
    const adapter = makeAdapter();
    const rows = new Map([[fixtureId("bad"), { id: fixtureId("bad") }]]);
    const Tagging = makeModel("taggings", rows) as any;
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
    const rows = new Map([[fixtureId("bad"), { id: fixtureId("bad") }]]);
    const Tagging = makeModel("taggings", rows) as any;
    Tagging._reflections = {
      taggable: { macro: "belongsTo", isPolymorphic: () => true },
    };

    await expect(
      defineFixtures(adapter, Tagging, { bad: { taggable: 42 as any } }),
    ).rejects.toThrow("polymorphic association");
  });

  it("rejects non-integer declared primary keys with a clear error", async () => {
    const adapter = makeAdapter();
    const Model = makeModel("widgets", new Map());

    await expect(
      defineFixtures(adapter, Model, { thing: { id: "1" as unknown as number, name: "x" } }),
    ).rejects.toThrow(/widgets\.thing declares a non-integer primary key/);

    await expect(defineFixtures(adapter, Model, { thing: { id: 1.5, name: "x" } })).rejects.toThrow(
      /non-integer primary key/,
    );
  });

  it("STI: type column passed explicitly is preserved in INSERT", async () => {
    const adapter = makeAdapter();
    const rows = new Map([
      [fixtureId("admin_user"), { id: fixtureId("admin_user"), type: "AdminUser" }],
    ]);
    const User = makeModel("users", rows);

    await defineFixtures(adapter, User, {
      admin_user: { name: "Admin", type: "AdminUser" },
    });

    const insertSql = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .find((s) => s.includes("INSERT INTO"));
    expect(insertSql).toContain("type");
    expect(insertSql).toContain("AdminUser");
  });
});
