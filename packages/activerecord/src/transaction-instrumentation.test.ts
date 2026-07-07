import { describe, it, expect, afterEach, vi } from "vitest";
import { Base } from "./index.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Rollback } from "./errors.js";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationSubscriber } from "@blazetrails/activesupport";
import { fixtures } from "./test-helpers/fixtures.js";
import { topicFixtureData } from "./test-helpers/fixtures/topics.js";
import { inMemoryDb } from "./test-adapter.js";

// Mirrors `transaction_instrumentation_test.rb`, which runs under
// `ActiveRecord::TestCase` with `self.use_transactional_tests = false` and
// drives `ActiveRecord::Base.connection` — it builds no private adapter. We
// ride the shared canonical pool the same way: `fixtures(..., {
// useTransactionalTests: false })` seeds `topics` non-transactionally through
// `Base.connection` (an outer transactional-fixtures wrapper would itself
// materialize and skew the materialization/restart event counts these tests
// assert on). The canonical `Topic` model + `topics(...)` lookups +
// `.touch`/`.update(title:)` writes match the Rails counterpart verbatim
// (fixture names `first`, `fifth`); the callback-leak tests keep a throwaway
// subclass, exactly as Rails uses `Class.new`.

// Throwaway subclass for the callback-leak tests (Rails' `Class.new`). An
// explicit table name is required: with the canonical `Topic` imported, a
// class literally named `Topic` collides in the model-name registry and gets
// uniquified to `Topic2` (→ table `topic2s`), so we pin the table to `topics`.
// It rides `Base.connection` (no adapter override) like the Rails anonymous
// subclass rides the base connection.
function makeTopic() {
  class TransactionTopic extends Base {
    static _tableName = "topics";
    static {
      this.attribute("id", "integer");
      this.attribute("title", "string");
      this.attribute("created_at", "datetime");
      this.attribute("updated_at", "datetime");
    }
  }
  return { Topic: TransactionTopic };
}

describe("TransactionInstrumentationTest", () => {
  const { topics } = fixtures(
    { topics: [Topic, topicFixtureData] },
    { useTransactionalTests: false },
  );
  afterEach(() => {
    Notifications.unsubscribeAll();
    vi.restoreAllMocks();
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
      await (Base.connection as any).materializeTransactions();
      await (Base.connection as any).reconnectBang({ restoreTransactions: true });
    });

    expect(events).toHaveLength(2);
  });

  it("transaction instrumentation fires before after commit callbacks", async () => {
    // Rails uses an anonymous `Class.new(ActiveRecord::Base)` here so the
    // after_commit callback doesn't leak onto the shared Topic class across
    // tests; the throwaway subclass is the TS equivalent.
    const { Topic } = makeTopic();
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
    const { Topic } = makeTopic();
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
    // Spy on the same pooled adapter instance the model's TransactionManager
    // dispatches against (`Base.connection`), mirroring Rails' spy on the base
    // connection's `commit_db_transaction`.
    const conn = Base.connection;
    vi.spyOn(conn as any, "commitDbTransaction").mockImplementationOnce(async () => {
      throw new MyError("commit failed");
    });

    await expect(
      Topic.transaction(async () => {
        await topics("fifth").update({ title: "Ruby on Rails" });
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(1);
  });

  // Rails wraps `test_transaction_instrumentation_on_failed_rollback` and
  // `..._when_unmaterialized` in a single `unless in_memory_db?` block
  // (transaction_instrumentation_test.rb:390-417), so neither runs against an
  // in-memory database: a failed DB rollback drives `@connection.throw_away!`,
  // discarding the connection — for a bare `:memory:` SQLite DB that destroys
  // the schema and breaks per-test teardown. We mirror the gate with
  // `it.skipIf(inMemoryDb())`, so these skip only on a genuinely in-memory
  // adapter and run on the PG/MySQL (and file-backed SQLite) lanes.
  const itNonInMemory = it.skipIf(inMemoryDb());

  itNonInMemory("transaction instrumentation on failed rollback", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    const MyError = class extends Error {};
    // Rails stubs the leased connection's `rollback_db_transaction` to raise;
    // the materialized transaction's ROLLBACK fails, so the manager throws the
    // connection away and finishes the transaction as `:incomplete`.
    const conn = Base.connection;
    vi.spyOn(conn as any, "rollbackDbTransaction").mockImplementationOnce(async () => {
      throw new MyError("rollback failed");
    });

    await expect(
      Topic.transaction(async () => {
        await topics("fifth").update({ title: "Ruby on Rails" });
        throw new Rollback();
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(1);
    expect(events[0].payload.outcome).toBe("incomplete");
  });

  itNonInMemory("transaction instrumentation on failed rollback when unmaterialized", async () => {
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    const MyError = class extends Error {};
    // Rails stubs `transaction_manager.rollback_transaction` to simulate an
    // error while the transaction is still unmaterialized — no BEGIN was ever
    // issued, so no `transaction.active_record` notification fires even though
    // the connection is discarded.
    const conn = Base.connection;
    vi.spyOn((conn as any).transactionManager, "rollbackTransaction").mockImplementationOnce(
      async () => {
        throw new MyError("rollback failed");
      },
    );

    await expect(
      Topic.transaction(async () => {
        throw new Rollback();
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(0);
  });

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
