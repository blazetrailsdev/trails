import { describe, it, expect, vi } from "vitest";
import { FixtureSet } from "./use-fixtures.js";
import { fixtureId } from "./define-fixtures.js";
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

describe("FixtureSet.createFixtures", () => {
  it("returns keyed instances by label", async () => {
    const adapter = makeAdapter();
    const topicId = fixtureId("rails");
    const rows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
    const Topic = makeModel("topics", rows);

    const result = await FixtureSet.createFixtures(adapter, Topic, {
      rails: { title: "Rails" },
    });

    expect(result.rails).toMatchObject({ id: topicId });
  });

  it("all keys in fixture data are returned", async () => {
    const adapter = makeAdapter();
    const id1 = fixtureId("first");
    const id2 = fixtureId("second");
    const rows = new Map([
      [id1, { id: id1, title: "First" }],
      [id2, { id: id2, title: "Second" }],
    ]);
    const Topic = makeModel("topics", rows);

    const result = await FixtureSet.createFixtures(adapter, Topic, {
      first: { title: "First" },
      second: { title: "Second" },
    });

    expect(result.first).toMatchObject({ id: id1 });
    expect(result.second).toMatchObject({ id: id2 });
  });

  it("multi-set: independent calls for different models each return correct instances", async () => {
    const adapter = makeAdapter();
    const topicId = fixtureId("rails");
    const postId = fixtureId("hello");

    const topicRows = new Map([[topicId, { id: topicId, title: "Rails" }]]);
    const postRows = new Map([[postId, { id: postId, title: "Hello" }]]);

    const Topic = makeModel("topics", topicRows);
    const Post = makeModel("posts", postRows);

    const topics = await FixtureSet.createFixtures(adapter, Topic, { rails: { title: "Rails" } });
    const posts = await FixtureSet.createFixtures(adapter, Post, { hello: { title: "Hello" } });

    expect(topics.rails).toMatchObject({ id: topicId });
    expect(posts.hello).toMatchObject({ id: postId });
  });

  it("emits a DELETE before INSERT so rows are replaced (cross-test isolation)", async () => {
    const adapter = makeAdapter();
    const id = fixtureId("rails");
    const rows = new Map([[id, { id, title: "Rails" }]]);
    const Topic = makeModel("topics", rows);

    await FixtureSet.createFixtures(adapter, Topic, { rails: { title: "Rails" } });

    const sqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(sqls.some((s) => s.includes("DELETE FROM"))).toBe(true);
    expect(sqls.some((s) => s.includes("INSERT INTO"))).toBe(true);
  });
});
