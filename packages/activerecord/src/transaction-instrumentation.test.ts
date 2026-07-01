import { describe, it, expect, afterEach, afterAll, beforeEach, vi } from "vitest";
import { Base } from "./index.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Rollback } from "./errors.js";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationSubscriber } from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { topicFixtureData } from "./test-helpers/fixtures/topics.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { AbstractSQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "./connection-adapters/better-sqlite3-adapter.js";

// Use an isolated in-memory SQLite3 adapter per test. The transaction
// instrumentation assertions exercise the TransactionManager directly
// (spies on commitDbTransaction / rollbackTransaction, savepoint flows,
// after_commit dispatch). Routing through the shared inner adapter
// behind `createTestAdapter()` carries residual TM state across tests
// in this file — on MariaDB that surfaces as a stray ROLLBACK TO
// SAVEPOINT `active_record_1` after a prior test's spy abandoned the
// stack. A dedicated adapter keeps assertions deterministic and
// adapter-agnostic; the instrumentation paths under test live in
// `connection-adapters/abstract/transaction.ts`, not in the driver.
//
// Fixtures load NON-transactionally into the per-test adapter via
// `useFixtures` (no pinned outer transaction), mirroring the Rails
// counterpart's `self.use_transactional_tests = false` — an outer
// transactional-fixtures wrapper would itself materialize and skew the
// materialization/restart event counts these tests assert on. The
// canonical `Topic` model + `topics(...)` lookups + `.touch`/`.update(title:)`
// writes match the Rails counterpart verbatim (fixture names `first`, `fifth`);
// callback-leak tests keep a throwaway subclass, exactly as Rails uses
// `Class.new`.
async function freshIsolatedAdapter(): Promise<AbstractSQLite3Adapter> {
  const adapter = new BetterSQLite3Adapter(":memory:");
  await defineSchema(adapter, { topics: canonicalSchema.topics });
  return adapter;
}

const freshAdapter = freshIsolatedAdapter;

// Throwaway subclass for the callback-leak tests (Rails' `Class.new`). An
// explicit table name is required: with the canonical `Topic` imported, a
// class literally named `Topic` collides in the model-name registry and gets
// uniquified to `Topic2` (→ table `topic2s`), so we pin the table to `topics`.
function makeTopic(adp: DatabaseAdapter) {
  class TransactionTopic extends Base {
    static _tableName = "topics";
    static {
      // Declare the PK so it is a known name under strict writeFromUser (raw
      // adapter, schema cache not warmed).
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
      this.adapter = adp;
    }
  }
  return { Topic: TransactionTopic, adapter: adp };
}

describe("TransactionInstrumentationTest", () => {
  let sharedAdapter: AbstractSQLite3Adapter;
  beforeEach(async () => {
    // Close the prior test's adapter here (not in afterEach) so the
    // useFixtures afterEach DELETE always runs against an open connection.
    sharedAdapter?.close();
    sharedAdapter = await freshAdapter();
    Topic.adapter = sharedAdapter;
    await Topic.loadSchema();
  });
  // Seed the per-test `sharedAdapter` through `fixtures()`' caller-supplied
  // `connection` knob, non-transactionally (Rails `use_transactional_tests =
  // false`): an outer transactional-fixtures wrapper would itself materialize
  // and skew the event counts these tests assert on. `schema: undefined`
  // suppresses the canonical-schema default — `freshIsolatedAdapter` already
  // creates `topics` per test, and a `{ schema }`-driven `beforeAll` would run
  // before `sharedAdapter` exists (it's built per-test in `beforeEach` for TM
  // isolation). The object-map form keeps the throwaway `Topic` off the
  // registry, matching Rails' `Class.new`.
  //
  // Routing through `fixtures()` also runs `setupHandlerSuite()`, which pushes
  // a global-reset skip for this describe (so `resetTestAdapterState()` is not
  // called between this file's tests). That is inert here: every test drives a
  // dedicated per-test `sharedAdapter` / `Topic.adapter` override and never
  // touches the shared canonical pool, `Base.connection`, or `createTestAdapter`
  // (see the block comment above) — nothing in this file depends on the
  // shared-pool reset. The skip is refcounted and popped in `setupHandlerSuite`'s
  // `afterAll`, so it cannot leak into worker-scheduled neighbors.
  const { topics } = fixtures(
    { topics: [Topic, topicFixtureData] },
    { connection: () => sharedAdapter, useTransactionalTests: false, schema: undefined },
  );
  afterEach(() => {
    Notifications.unsubscribeAll();
    vi.restoreAllMocks();
  });
  afterAll(() => {
    sharedAdapter?.close();
  });

  it("start transaction is triggered when the transaction is materialized", async () => {
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      expect(startEvents).toHaveLength(0);
      await topics("first").touch();
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].payload.connection).toBeTruthy();
    });
  });

  it("start transaction is not triggered for ordinary nested calls", async () => {
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      await topics("first").touch();
      expect(startEvents).toHaveLength(1);

      await Topic.transaction(async () => {
        await topics("first").touch();
        expect(startEvents).toHaveLength(1);
      });
    });
  });

  it("start transaction is triggered for requires new", async () => {
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      await topics("first").touch();
      expect(startEvents).toHaveLength(1);

      await Topic.transaction(
        async () => {
          await topics("first").touch();
          expect(startEvents).toHaveLength(2);
        },
        { requiresNew: true },
      );
    });
  });

  it("transaction instrumentation on commit", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Ruby on Rails" });
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.connection).toBeTruthy();
    expect(events[0].payload.transaction).toBeTruthy();
    expect(events[0].payload.outcome).toBe("commit");
  });

  it("transaction instrumentation on rollback", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Ruby on Rails" });
      throw new Rollback();
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.connection).toBeTruthy();
    expect(events[0].payload.transaction).toBeTruthy();
    expect(events[0].payload.outcome).toBe("rollback");
  });

  it("transaction instrumentation with savepoints", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Sinatra" });
      await Topic.transaction(
        async () => {
          await topics("fifth").update({ title: "Ruby on Rails" });
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(2);
    const [savepointEvent, realEvent] = events;
    expect(savepointEvent.payload.outcome).toBe("commit");
    expect(realEvent.payload.outcome).toBe("commit");
    expect(savepointEvent.payload.transaction).not.toBe(realEvent.payload.transaction);
  });

  it("transaction instrumentation with restart parent transaction on commit", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          await topics("fifth").update({ title: "Ruby on Rails" });
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(1);
  });

  it("transaction instrumentation with restart parent transaction on rollback", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          await topics("fifth").update({ title: "Ruby on Rails" });
          throw new Rollback();
        },
        { requiresNew: true },
      );
      throw new Rollback();
    });

    expect(events).toHaveLength(2);
    const [restart, real] = events;
    expect(restart.payload.outcome).toBe("restart");
    expect(real.payload.outcome).toBe("rollback");
  });

  it("transaction instrumentation with unmaterialized restart parent transactions", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          throw new Rollback();
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(0);
  });

  it("transaction instrumentation with materialized restart parent transactions", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Sinatra" });
      await Topic.transaction(
        async () => {
          throw new Rollback();
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.outcome).toBe("commit");
  });

  it("transaction instrumentation with restart savepoint parent transactions", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Sinatry" });
      await Topic.transaction(
        async () => {
          await Topic.transaction(
            async () => {
              await topics("fifth").update({ title: "Ruby on Rails" });
              throw new Rollback();
            },
            { requiresNew: true },
          );
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(3);
    const [restart, savepoint, real] = events;
    expect(restart.payload.outcome).toBe("restart");
    expect(savepoint.payload.outcome).toBe("commit");
    expect(real.payload.outcome).toBe("commit");
  });

  it("transaction instrumentation with restart savepoint parent transactions on commit", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await topics("fifth").update({ title: "Sinatra" });
      await Topic.transaction(async () => {}, { requiresNew: true });
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.outcome).toBe("commit");
  });

  it("transaction instrumentation only fires if materialized", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {});

    expect(events).toHaveLength(0);
  });

  it("transaction instrumentation only fires on rollback if materialized", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      throw new Rollback();
    });

    expect(events).toHaveLength(0);
  });

  it("reconnecting after materialized transaction starts new event", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await (sharedAdapter as any).materializeTransactions();
      await (sharedAdapter as any).reconnectBang({ restoreTransactions: true });
    });

    expect(events).toHaveLength(2);
  });

  it("transaction instrumentation fires before after commit callbacks", async () => {
    // Rails uses an anonymous `Class.new(ActiveRecord::Base)` here so the
    // after_commit callback doesn't leak onto the shared Topic class across
    // tests; the throwaway subclass is the TS equivalent.
    const { Topic } = makeTopic(sharedAdapter);
    const order: string[] = [];

    let afterCommitTriggered = false;
    Topic.afterCommit(function () {
      afterCommitTriggered = true;
      order.push("after_commit");
    });

    Notifications.subscribe("transaction.active_record", () => {
      expect(afterCommitTriggered).toBe(false);
      order.push("notification");
    });

    await Topic.create({ title: "test" });

    expect(order).toEqual(["notification", "after_commit"]);
  });

  it("transaction instrumentation fires before after rollback callbacks", async () => {
    const { Topic } = makeTopic(sharedAdapter);
    const order: string[] = [];

    Topic.afterRollback(function () {
      order.push("after_rollback");
    });

    Notifications.subscribe("transaction.active_record", () => {
      order.push("notification");
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "test" });
      throw new Rollback();
    });

    expect(order).toEqual(["notification", "after_rollback"]);
  });

  it("transaction instrumentation on failed commit", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    const MyError = class extends Error {};
    vi.spyOn(sharedAdapter as any, "commitDbTransaction").mockImplementationOnce(async () => {
      throw new MyError("commit failed");
    });

    await expect(
      Topic.transaction(async () => {
        await topics("fifth").update({ title: "Ruby on Rails" });
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(1);
  });

  // PERMANENT-SKIP (both cases): Rails wraps `test_transaction_instrumentation_on_failed_rollback`
  // and `..._when_unmaterialized` in a single `unless in_memory_db?` block
  // (transaction_instrumentation_test.rb:390-417), so neither runs against an
  // in-memory database. A failed DB rollback drives `@connection.throw_away!`,
  // discarding the connection — for the in-memory SQLite database the canonical
  // adapter uses, that destroys the schema and breaks per-test teardown, exactly
  // as Rails skips it. See UNPORTED_FILES.
  it.skip("transaction instrumentation on failed rollback", () => {});

  it.skip("transaction instrumentation on failed rollback when unmaterialized", () => {});

  it("transaction instrumentation on broken subscription", async () => {
    const MyError = class extends Error {};
    const sub: NotificationSubscriber = Notifications.subscribe("transaction.active_record", () => {
      throw new MyError("broken subscriber");
    });

    await expect(
      Topic.transaction(async () => {
        await topics("fifth").update({ title: "Ruby on Rails" });
      }),
    ).rejects.toThrow(MyError);

    Notifications.unsubscribe(sub);
  });
});
