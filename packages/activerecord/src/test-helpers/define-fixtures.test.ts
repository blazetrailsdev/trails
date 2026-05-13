import { describe, it, expect, vi } from "vitest";
import { fixtureId, ref, isFixtureRef, defineFixtures } from "./define-fixtures.js";
import type { DatabaseAdapter } from "../adapter.js";

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
  it("returns a positive integer below 2^30 - 1", () => {
    const id = fixtureId("david");
    expect(id).toBeGreaterThan(0);
    expect(id).toBeLessThan(2 ** 30 - 1);
  });

  it("is deterministic: same label always yields same ID", () => {
    expect(fixtureId("david")).toBe(fixtureId("david"));
    expect(fixtureId("mary")).toBe(fixtureId("mary"));
  });

  it("different labels produce different IDs", () => {
    expect(fixtureId("david")).not.toBe(fixtureId("mary"));
  });

  it("produces a stable known value for 'david' (CRC32 polynomial 0xedb88320)", () => {
    // For ASCII labels this matches Ruby's Zlib.crc32(label) % (2**30 - 1) exactly.
    expect(fixtureId("david")).toBe(127326141);
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
