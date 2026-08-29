import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { StrictValidationFailed } from "@blazetrails/activemodel";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-fixtures.js";
import { Subscriber } from "../test-helpers/models/subscriber.js";
import { Topic } from "../test-helpers/models/topic.js";
import { checkoutRawTestAdapter } from "../test-adapter.js";
import type { TestDatabaseAdapter } from "../test-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { assertQueriesCount, assertNoQueries } from "../testing/query-assertions.js";

describe("UniquenessValidationContextTest", () => {
  fixtures(["topics"]);

  beforeAll(() => {
    registerModel("Topic", Topic);
  });

  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("uniqueness honors on: :create context", async () => {
    Topic.validatesUniquenessOf("title", { on: "create" });

    await Topic.createBang({ title: "ctx-unique" });

    const dup = new Topic({ title: "ctx-unique" });
    expect(await dup.isValid()).toBe(false);
    expect(dup.errors.messagesFor("title")).toEqual(["has already been taken"]);

    const other = await Topic.createBang({ title: "ctx-other" });
    other.writeAttribute("title", "ctx-unique");
    expect(await other.isValid("update")).toBe(true);
  });

  it("uniqueness honors on: :update context", async () => {
    Topic.validatesUniquenessOf("title", { on: "update" });

    await Topic.createBang({ title: "upd-unique" });

    const created = new Topic({ title: "upd-unique" });
    expect(await created.isValid("create")).toBe(true);

    const persisted = await Topic.createBang({ title: "upd-other" });
    persisted.writeAttribute("title", "upd-unique");
    expect(await persisted.isValid("update")).toBe(false);
    expect(persisted.errors.messagesFor("title")).toEqual(["has already been taken"]);
  });

  it("strict: true raises StrictValidationFailed on a uniqueness collision", async () => {
    Topic.validatesUniquenessOf("title", { strict: true });

    await Topic.createBang({ title: "strict-dup" });

    const dup = new Topic({ title: "strict-dup" });
    await expect(dup.isValid()).rejects.toThrow(StrictValidationFailed);

    const unique = new Topic({ title: "strict-unique" });
    expect(await unique.isValid()).toBe(true);
  });
});

describe("UniquenessCoveredByUniqueIndexAdapterResolutionTest", () => {
  let adapter: TestDatabaseAdapter;
  let pool: ConnectionPool;

  class DirectSubscriber extends Subscriber {
    static _tableName = "direct_subscribers";
  }

  beforeAll(async () => {
    ({ adapter, pool } = await checkoutRawTestAdapter());
    await adapter.dropTable("direct_subscribers", { ifExists: true });
    await adapter.createTable("direct_subscribers", { id: false }, (t) => {
      t.string("nick", { null: false });
      t.string("name");
      t.integer("id");
      t.integer("books_count", { null: false, default: 0 });
      t.integer("update_count", { null: false, default: 0 });
      t.index("nick", { unique: true });
    });
    (DirectSubscriber as unknown as { _adapter: TestDatabaseAdapter })._adapter = adapter;
  });

  afterAll(async () => {
    await adapter.dropTable("direct_subscribers", { ifExists: true });
    pool.releaseConnection();
    await pool.disconnectBang();
  });

  it("skips the existence check for a directly assigned adapter", async () => {
    DirectSubscriber.clearValidatorsBang();
    DirectSubscriber.validatesUniquenessOf("nick");

    const s = await DirectSubscriber.createBang({ nick: "direct-abc" });
    s.writeAttribute("name", "John");

    await assertNoQueries(false, async () => {
      await s.isValid();
    });

    s.writeAttribute("nick", "direct-abc v2");
    await assertQueriesCount(1, false, async () => {
      await s.isValid();
    });
  });
});
