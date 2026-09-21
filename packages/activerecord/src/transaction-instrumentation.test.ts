import { describe, it, expect, afterEach, vi } from "vitest";
import { Base, Transaction } from "./index.js";
import type { DatabaseStatementsHost } from "./connection-adapters/abstract/database-statements.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Rollback } from "./errors.js";
import { Notifications } from "@blazetrails/activesupport";
import type { NotificationEvent } from "@blazetrails/activesupport";
import { assertEmpty, assertNot, assertSame } from "@blazetrails/activesupport";
import type { NotificationSubscriber } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { topicFixtureData } from "./test-helpers/fixtures/topics.js";
import { inMemoryDb } from "./support/adapter-helper.js";

describe("TransactionInstrumentationTest", () => {
  const { topics } = fixtures(
    { topics: [Topic, topicFixtureData] },
    { useTransactionalTests: false },
  );
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("start transaction is triggered when the transaction is materialized", async () => {
    const transactions: unknown[] = [];
    const subscriber = Notifications.subscribe(
      "start_transaction.active_record",
      (event: NotificationEvent) => {
        expect(event.payload.connection).toBeTruthy();
        transactions.push(event.payload.transaction);
      },
    );

    try {
      await Topic.transaction(async (transaction) => {
        assertEmpty(transactions);
        await topics("first").touch();
        expect(transactions).toEqual([transaction]);
      });
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });

  it("start transaction is not triggered for ordinary nested calls", async () => {
    const transactions: unknown[] = [];
    const subscriber = Notifications.subscribe(
      "start_transaction.active_record",
      (event: NotificationEvent) => {
        expect(event.payload.connection).toBeTruthy();
        transactions.push(event.payload.transaction);
      },
    );

    try {
      await Topic.transaction(async (t1) => {
        await topics("first").touch();
        expect(transactions).toEqual([t1]);

        await Topic.transaction(async (_t2) => {
          await topics("first").touch();
          expect(transactions).toEqual([t1]);
        });
      });
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });

  it("start transaction is triggered for requires new", async () => {
    const transactions: unknown[] = [];
    const subscriber = Notifications.subscribe(
      "start_transaction.active_record",
      (event: NotificationEvent) => {
        expect(event.payload.connection).toBeTruthy();
        transactions.push(event.payload.transaction);
      },
    );

    try {
      await Topic.transaction(async (t1) => {
        await topics("first").touch();
        expect(transactions).toEqual([t1]);

        await Topic.transaction(
          async (t2) => {
            await topics("first").touch();
            expect(transactions).toEqual([t1, t2]);
          },
          { requiresNew: true },
        );
      });
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation on commit", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      let notified = false;
      let expectedTransaction: Transaction | null = null;

      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          expect(event.payload.connection).toBeTruthy();
          assertSame(expectedTransaction, event.payload.transaction);
          expect(event.payload.outcome).toBe("commit");
          notified = true;
        },
      );

      await Base.transaction(async (transaction) => {
        expectedTransaction = transaction;
        await topic.update({ title: "Ruby on Rails" });
      });

      expect(notified).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation on rollback", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      let notified = false;
      let expectedTransaction: Transaction | null = null;

      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          expect(event.payload.connection).toBeTruthy();
          assertSame(expectedTransaction, event.payload.transaction);
          expect(event.payload.outcome).toBe("rollback");
          notified = true;
        },
      );

      await Base.transaction(async (transaction) => {
        expectedTransaction = transaction;
        await topic.update({ title: "Ruby on Rails" });
        throw new Rollback();
      });

      expect(notified).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with savepoints", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      let realTransaction: Transaction | null = null;
      let savepointTransaction: Transaction | null = null;
      await Base.transaction(async (transaction) => {
        realTransaction = transaction;
        await topic.update({ title: "Sinatra" });
        await Base.transaction(
          async (transaction) => {
            savepointTransaction = transaction;
            await topic.update({ title: "Ruby on Rails" });
          },
          { requiresNew: true },
        );
      });

      expect(events.length).toBe(2);
      const [savepointEvent, realEvent] = events;

      assertSame(savepointTransaction, savepointEvent.payload.transaction);
      expect(savepointEvent.payload.outcome).toBe("commit");

      assertSame(realTransaction, realEvent.payload.transaction);
      expect(realEvent.payload.outcome).toBe("commit");
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with restart parent transaction on commit", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await Base.transaction(
          async () => {
            await topic.update({ title: "Ruby on Rails" });
          },
          { requiresNew: true },
        );
      });

      expect(events.length).toBe(1);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with restart parent transaction on rollback", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await Base.transaction(
          async () => {
            await topic.update({ title: "Ruby on Rails" });
            throw new Rollback();
          },
          { requiresNew: true },
        );
        throw new Rollback();
      });

      expect(events.length).toBe(2);
      const [restart, real] = events;
      expect(restart.payload.outcome).toBe("restart");
      expect(real.payload.outcome).toBe("rollback");
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with unmaterialized restart parent transactions", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await Base.transaction(
          async () => {
            throw new Rollback();
          },
          { requiresNew: true },
        );
      });

      expect(events.length).toBe(0);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with materialized restart parent transactions", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");
      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await topic.update({ title: "Sinatra" });
        await Base.transaction(
          async () => {
            throw new Rollback();
          },
          { requiresNew: true },
        );
      });

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.payload.outcome).toBe("commit");
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with restart savepoint parent transactions", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await topic.update({ title: "Sinatry" });
        await Base.transaction(
          async () => {
            await Base.transaction(
              async () => {
                await topic.update({ title: "Ruby on Rails" });
                throw new Rollback();
              },
              { requiresNew: true },
            );
          },
          { requiresNew: true },
        );
      });

      expect(events.length).toBe(3);
      const [restart, savepoint, real] = events;
      expect(restart.payload.outcome).toBe("restart");
      expect(savepoint.payload.outcome).toBe("commit");
      expect(real.payload.outcome).toBe("commit");
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation with restart savepoint parent transactions on commit", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );

      await Base.transaction(async () => {
        await topic.update({ title: "Sinatra" });
        await Base.transaction(async () => {}, { requiresNew: true });
      });

      expect(events.length).toBe(1);
      const event = events[0];
      expect(event.payload.outcome).toBe("commit");
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation only fires if materialized", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      let notified = false;
      subscriber = Notifications.subscribe("transaction.active_record", () => {
        notified = true;
      });

      await Base.transaction(async () => {});

      assertNot(notified);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation only fires on rollback if materialized", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      let notified = false;
      subscriber = Notifications.subscribe("transaction.active_record", () => {
        notified = true;
      });

      await Base.transaction(async () => {
        throw new Rollback();
      });

      assertNot(notified);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("reconnecting after materialized transaction starts new event", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const events: NotificationEvent[] = [];
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          events.push(event);
        },
      );
      await Topic.transaction(async () => {
        await Base.connection.materializeTransactions();
        await Base.connection.reconnectBang({ restoreTransactions: true });
      });

      expect(events.length).toBe(2);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation fires before after commit callbacks", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      let notified = false;
      let afterCommitTriggered = false;

      class TopicModel extends Base {
        static _tableName = "topics";
        static {
          this.attribute("id", "integer");
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
        }
      }
      TopicModel.afterCommit(function () {
        afterCommitTriggered = true;
      });

      subscriber = Notifications.subscribe("transaction.active_record", () => {
        assertNot(
          afterCommitTriggered,
          "Transaction notification fired after the after_commit callback",
        );
        notified = true;
      });

      await TopicModel.createBang();

      expect(notified).toBeTruthy();
      expect(afterCommitTriggered).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation fires before after rollback callbacks", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      let notified = false;
      let afterRollbackTriggered = false;

      class TopicModel extends Base {
        static _tableName = "topics";
        static {
          this.attribute("id", "integer");
          this.attribute("title", "string");
          this.attribute("created_at", "datetime");
          this.attribute("updated_at", "datetime");
        }
      }
      TopicModel.afterRollback(function () {
        afterRollbackTriggered = true;
      });

      subscriber = Notifications.subscribe("transaction.active_record", () => {
        assertNot(
          afterRollbackTriggered,
          "Transaction notification fired after the after_rollback callback",
        );
        notified = true;
      });

      await TopicModel.transaction(async () => {
        await TopicModel.createBang();
        throw new Rollback();
      });

      expect(notified).toBeTruthy();
      expect(afterRollbackTriggered).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it("transaction instrumentation on failed commit", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      let notified = false;
      subscriber = Notifications.subscribe("transaction.active_record", () => {
        notified = true;
      });

      const error = class extends Error {};
      vi.spyOn(
        Base.connection as unknown as Required<Pick<DatabaseStatementsHost, "commitDbTransaction">>,
        "commitDbTransaction",
      ).mockImplementationOnce(async () => {
        throw new error();
      });
      await expect(
        Base.transaction(async () => {
          await topic.update({ title: "Ruby on Rails" });
        }),
      ).rejects.toThrow(error);

      expect(notified).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it.skipIf(inMemoryDb())("transaction instrumentation on failed rollback", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      let notified = false;
      subscriber = Notifications.subscribe(
        "transaction.active_record",
        (event: NotificationEvent) => {
          expect(event.payload.outcome).toBe("incomplete");
          notified = true;
        },
      );

      const error = class extends Error {};
      vi.spyOn(Base.connection, "rollbackDbTransaction").mockImplementationOnce(async () => {
        throw new error();
      });
      await expect(
        Base.transaction(async () => {
          await topic.update({ title: "Ruby on Rails" });
          throw new Rollback();
        }),
      ).rejects.toThrow(error);

      expect(notified).toBeTruthy();
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });

  it.skipIf(inMemoryDb())(
    "transaction instrumentation on failed rollback when unmaterialized",
    async () => {
      let subscriber: NotificationSubscriber | undefined;
      try {
        let notified = false;
        subscriber = Notifications.subscribe("transaction.active_record", () => {
          notified = true;
        });

        const error = class extends Error {};
        vi.spyOn(Base.connection.transactionManager, "rollbackTransaction").mockImplementationOnce(
          async () => {
            throw new error();
          },
        );
        await expect(
          Topic.transaction(async () => {
            throw new Rollback();
          }),
        ).rejects.toThrow(error);
        assertNot(notified);
      } finally {
        if (subscriber) Notifications.unsubscribe(subscriber);
      }
    },
  );

  it("transaction instrumentation on broken subscription", async () => {
    let subscriber: NotificationSubscriber | undefined;
    try {
      const topic = topics("fifth");

      const error = class extends Error {};
      subscriber = Notifications.subscribe("transaction.active_record", () => {
        throw new error();
      });

      await expect(
        Base.transaction(async () => {
          await topic.update({ title: "Ruby on Rails" });
        }),
      ).rejects.toThrow(error);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
});
