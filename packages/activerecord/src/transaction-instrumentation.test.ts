import { describe, it, expect, afterEach, vi } from "vitest";
import { Base } from "./index.js";
import { Rollback } from "./errors.js";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationSubscriber } from "@blazetrails/activesupport";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";

const openAdapters: SQLite3Adapter[] = [];

function makeTopic() {
  const adapter = new SQLite3Adapter(":memory:");
  openAdapters.push(adapter);
  adapter.exec(
    "CREATE TABLE topics (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, updated_at DATETIME)",
  );
  class Topic extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("updated_at", "datetime");
      this.adapter = adapter;
    }
  }
  return { Topic, adapter };
}

describe("TransactionInstrumentationTest", () => {
  afterEach(() => {
    Notifications.unsubscribeAll();
    vi.restoreAllMocks();
    for (const adapter of openAdapters.splice(0)) {
      adapter.close();
    }
  });

  it("start transaction is triggered when the transaction is materialized", async () => {
    const { Topic } = makeTopic();
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      expect(startEvents).toHaveLength(0);
      await Topic.create({ title: "test" });
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].payload.connection).toBeTruthy();
    });
  });

  it("start transaction is not triggered for ordinary nested calls", async () => {
    const { Topic } = makeTopic();
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "first" });
      expect(startEvents).toHaveLength(1);

      await Topic.transaction(async () => {
        await Topic.create({ title: "second" });
        expect(startEvents).toHaveLength(1);
      });
    });
  });

  it("start transaction is triggered for requires new", async () => {
    const { Topic } = makeTopic();
    const startEvents: any[] = [];
    Notifications.subscribe("start_transaction.active_record", (event: any) => {
      startEvents.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "outer" });
      expect(startEvents).toHaveLength(1);

      await Topic.transaction(
        async () => {
          await Topic.create({ title: "inner" });
          expect(startEvents).toHaveLength(2);
        },
        { requiresNew: true },
      );
    });
  });

  it("transaction instrumentation on commit", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "test" });
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.connection).toBeTruthy();
    expect(events[0].payload.transaction).toBeTruthy();
    expect(events[0].payload.outcome).toBe("commit");
  });

  it("transaction instrumentation on rollback", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "test" });
      throw new Rollback();
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.connection).toBeTruthy();
    expect(events[0].payload.transaction).toBeTruthy();
    expect(events[0].payload.outcome).toBe("rollback");
  });

  it("transaction instrumentation with savepoints", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "outer" });
      await Topic.transaction(
        async () => {
          await Topic.create({ title: "inner" });
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
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          await Topic.create({ title: "inner" });
        },
        { requiresNew: true },
      );
    });

    expect(events).toHaveLength(1);
  });

  it("transaction instrumentation with restart parent transaction on rollback", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          await Topic.create({ title: "inner" });
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
    const { Topic } = makeTopic();
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
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "outer" });
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
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "outer" });
      await Topic.transaction(
        async () => {
          await Topic.transaction(
            async () => {
              await Topic.create({ title: "innermost" });
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
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "outer" });
      await Topic.transaction(async () => {}, { requiresNew: true });
    });

    expect(events).toHaveLength(1);
    expect(events[0].payload.outcome).toBe("commit");
  });

  it("transaction instrumentation only fires if materialized", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {});

    expect(events).toHaveLength(0);
  });

  it("transaction instrumentation only fires on rollback if materialized", async () => {
    const { Topic } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    await Topic.transaction(async () => {
      throw new Rollback();
    });

    expect(events).toHaveLength(0);
  });

  it.skip("reconnecting after materialized transaction starts new event", () => {
    // Requires reconnect!(restore_transactions: true) — not yet supported.
  });

  it("transaction instrumentation fires before after commit callbacks", async () => {
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
    const { Topic, adapter } = makeTopic();
    const order: string[] = [];

    Notifications.subscribe("transaction.active_record", () => {
      order.push("notification");
    });

    await Topic.transaction(async () => {
      await Topic.create({ title: "test" });
      // Register directly on the transaction to avoid the save-path
      // ordering issue between state-restore and rolledbackBang callbacks.
      const txn = adapter.transactionManager.currentTransaction as any;
      txn?.afterRollback?.(() => {
        order.push("after_rollback");
      });
      throw new Rollback();
    });

    expect(order).toEqual(["notification", "after_rollback"]);
  });

  it("transaction instrumentation on failed commit", async () => {
    const { Topic, adapter } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    const MyError = class extends Error {};
    vi.spyOn(adapter, "commitDbTransaction").mockImplementationOnce(async () => {
      throw new MyError("commit failed");
    });

    await expect(
      Topic.transaction(async () => {
        await Topic.create({ title: "test" });
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(1);
  });

  it.skip("transaction instrumentation on failed rollback", () => {
    // Rails guards this with `unless in_memory_db?`. Our test adapter
    // uses an in-memory SQLite database so this scenario does not apply.
  });

  it("transaction instrumentation on failed rollback when unmaterialized", async () => {
    const { Topic, adapter } = makeTopic();
    const events: any[] = [];
    Notifications.subscribe("transaction.active_record", (event: any) => {
      events.push(event);
    });

    const MyError = class extends Error {};
    const tm = adapter.transactionManager;
    vi.spyOn(tm, "rollbackTransaction").mockImplementationOnce(async () => {
      throw new MyError("rollback failed");
    });

    await expect(
      Topic.transaction(async () => {
        throw new Rollback();
      }),
    ).rejects.toThrow(MyError);

    expect(events).toHaveLength(0);
  });

  it("transaction instrumentation on broken subscription", async () => {
    const { Topic } = makeTopic();
    const MyError = class extends Error {};
    const sub: NotificationSubscriber = Notifications.subscribe("transaction.active_record", () => {
      throw new MyError("broken subscriber");
    });

    await expect(
      Topic.transaction(async () => {
        await Topic.create({ title: "test" });
      }),
    ).rejects.toThrow(MyError);

    Notifications.unsubscribe(sub);
  });
});
