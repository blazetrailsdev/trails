import { describe, it, expect, vi } from "vitest";
import type { DatabaseAdapter } from "../../adapter.js";
import { defineFixtures, fixtureId, isFixtureRef } from "../define-fixtures.js";
import { topicFixtureData } from "./topics.js";
import { postFixtureData } from "./posts.js";
import { commentFixtureData } from "./comments.js";

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

function makeModel(tableName: string, pk = "id") {
  const rows = new Map<unknown, Record<string, unknown>>();
  const Model = {
    tableName,
    primaryKey: pk,
    findBy: vi.fn(async (attrs: Record<string, unknown>) => {
      const val = attrs[pk];
      return rows.get(val) ?? null;
    }),
    _rows: rows,
  } as any;
  return Model;
}

function seedRows(
  Model: ReturnType<typeof makeModel>,
  label: string,
  extra: Record<string, unknown> = {},
) {
  const id = fixtureId(label);
  Model._rows.set(id, { id, ...extra });
}

describe("topicFixtureData", () => {
  it("exports five fixtures with correct keys", () => {
    const keys = Object.keys(topicFixtureData);
    expect(keys).toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  it("first fixture has expected data", () => {
    expect(topicFixtureData.first).toMatchObject({
      title: "The First Topic",
      author_name: "David",
      approved: false,
      type: "Topic",
    });
  });

  it("second fixture has Mary as author and a cross-ref to first", () => {
    expect(topicFixtureData.second.author_name).toBe("Mary");
    expect(isFixtureRef(topicFixtureData.second.parent_id)).toBe(true);
    const parentRef = topicFixtureData.second.parent_id as ReturnType<
      typeof import("../define-fixtures.js").ref
    >;
    expect((parentRef as any).fixtureName).toBe("first");
    expect((parentRef as any).tableName).toBe("topics");
  });

  it("defineFixtures resolves cross-refs: second.parent_id equals fixtureId(first)", async () => {
    const adapter = makeAdapter();
    const Topic = makeModel("topics");
    for (const k of Object.keys(topicFixtureData) as Array<keyof typeof topicFixtureData>) {
      seedRows(Topic, k, { title: topicFixtureData[k].title });
    }

    const topics = await defineFixtures(adapter, Topic, topicFixtureData);
    expect(topics.first).toBeTruthy();
    expect(topics.second).toBeTruthy();

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("topics"));
    const secondInsert = insertSqls.find((s) => s.includes(String(fixtureId("second"))));
    expect(secondInsert).toBeTruthy();
    expect(secondInsert).toContain(String(fixtureId("first")));
  });
});

describe("postFixtureData", () => {
  it("exports welcome and thinking posts", () => {
    expect(postFixtureData.welcome.title).toBe("Welcome to the weblog");
    expect(postFixtureData.thinking.title).toBe("So I was thinking");
  });

  it("posts reference authors table via ref()", () => {
    expect(isFixtureRef(postFixtureData.welcome.author_id)).toBe(true);
    expect((postFixtureData.welcome.author_id as any).tableName).toBe("authors");
  });
});

describe("commentFixtureData", () => {
  it("greetings comment references welcome post via ref()", () => {
    expect(commentFixtureData.greetings.body).toBe("Thank you for the welcome");
    expect(isFixtureRef(commentFixtureData.greetings.post_id)).toBe(true);
    expect((commentFixtureData.greetings.post_id as any).fixtureName).toBe("welcome");
    expect((commentFixtureData.greetings.post_id as any).tableName).toBe("posts");
  });

  it("defineFixtures resolves comment→post cross-ref correctly", async () => {
    const adapter = makeAdapter();
    const Comment = makeModel("comments");
    for (const k of Object.keys(commentFixtureData) as Array<keyof typeof commentFixtureData>) {
      seedRows(Comment, k);
    }

    await defineFixtures(adapter, Comment, commentFixtureData);

    const insertSqls = (adapter.execute as ReturnType<typeof vi.fn>).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((s) => s.includes("INSERT INTO") && s.includes("comments"));
    const greetingsInsert = insertSqls.find((s) => s.includes(String(fixtureId("greetings"))));
    expect(greetingsInsert).toBeTruthy();
    expect(greetingsInsert).toContain(String(fixtureId("welcome")));
  });
});
