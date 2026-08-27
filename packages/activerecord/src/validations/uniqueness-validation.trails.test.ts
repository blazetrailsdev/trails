/**
 * TS-only coverage for uniqueness validation that has no direct Rails test
 * counterpart: since RFC 0063 made the validation chain async, uniqueness runs
 * inside the context-threaded validate callback chain, so `on:` context options
 * gate it exactly like any other validator (the sibling deviation
 * `async-validations-honor-validation-context`).
 */
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

    // A brand-new record validates in the :create context, so the collision
    // is caught.
    const dup = new Topic({ title: "ctx-unique" });
    expect(await dup.isValid()).toBe(false);
    expect(dup.errors.messagesFor("title")).toEqual(["has already been taken"]);

    // A persisted record validates in the :update context, where an `on: :create`
    // validator does not fire — even though its changed title now collides.
    const other = await Topic.createBang({ title: "ctx-other" });
    other.writeAttribute("title", "ctx-unique");
    expect(await other.isValid("update")).toBe(true);
  });

  it("uniqueness honors on: :update context", async () => {
    Topic.validatesUniquenessOf("title", { on: "update" });

    await Topic.createBang({ title: "upd-unique" });

    // New record in :create context — the `on: :update` validator is skipped.
    const created = new Topic({ title: "upd-unique" });
    expect(await created.isValid("create")).toBe(true);

    // Persisted record in :update context — the validator fires and catches the
    // collision.
    const persisted = await Topic.createBang({ title: "upd-other" });
    persisted.writeAttribute("title", "upd-unique");
    expect(await persisted.isValid("update")).toBe(false);
    expect(persisted.errors.messagesFor("title")).toEqual(["has already been taken"]);
  });

  it("strict: true raises StrictValidationFailed on a uniqueness collision", async () => {
    // Rails leaves :strict in the validator options and forwards it to
    // errors.add, which raises. In trails, validatesWith's (async-aware) strict
    // wrapper awaits this DB-backed validator and raises StrictValidationFailed
    // when it flags a collision.
    Topic.validatesUniquenessOf("title", { strict: true });

    await Topic.createBang({ title: "strict-dup" });

    const dup = new Topic({ title: "strict-dup" });
    await expect(dup.isValid()).rejects.toThrow(StrictValidationFailed);

    const unique = new Topic({ title: "strict-unique" });
    expect(await unique.isValid()).toBe(true);
  });
});

describe("UniquenessCoveredByUniqueIndexAdapterResolutionTest", () => {
  // A model whose adapter is assigned directly (rather than leased from a pool)
  // carries a NullPool. `covered_by_unique_index?` must still see the table's
  // indexes: resolving the schema-cache target as `pool ?? adapter` hands the
  // raw cache the NullPool, which exposes neither `withConnection` nor
  // `indexes`, so the lookup quietly yields `[]` and the optimization silently
  // stays off for every directly-assigned model. Rails has no counterpart —
  // its `klass.schema_cache` is always pool-resolved.
  let adapter: TestDatabaseAdapter;
  let pool: ConnectionPool;

  class DirectSubscriber extends Subscriber {
    static _tableName = "subscribers";
  }

  beforeAll(async () => {
    ({ adapter, pool } = await checkoutRawTestAdapter());
    (DirectSubscriber as unknown as { _adapter: TestDatabaseAdapter })._adapter = adapter;
  });

  afterAll(async () => {
    // Written through the raw pool, outside any fixtures transaction, so it
    // outlives the file unless deleted here.
    await DirectSubscriber.where({ nick: "direct-abc" }).deleteAll();
    pool.releaseConnection();
    await pool.disconnectBang();
  });

  it("skips the existence check for a directly assigned adapter", async () => {
    DirectSubscriber.clearValidatorsBang();
    DirectSubscriber.validatesUniquenessOf("nick");

    const s = await DirectSubscriber.createBang({ nick: "direct-abc" });
    s.writeAttribute("name", "John");

    // nick is unchanged and covered by a unique index, so no SELECT is issued.
    await assertNoQueries(false, async () => {
      await s.isValid();
    });

    // A changed nick still consults the database.
    s.writeAttribute("nick", "direct-abc v2");
    await assertQueriesCount(1, false, async () => {
      await s.isValid();
    });
  });
});
