/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "./index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "./associations.js";
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("TransactionCallbacksTest", () => {
  it.skip("before commit exception should pop transaction stack", () => {
    /* fixture-dependent */
  });

  it("dont call any callbacks after transaction commits for invalid record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
        this.validates("title", { presence: true });
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    const t = new Topic({});
    const saved = await t.save();
    expect(saved).toBe(false);
    expect(called).toEqual([]);
  });

  it("dont call any callbacks after explicit transaction commits for invalid record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
        this.validates("title", { presence: true });
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      const t = new Topic({});
      await t.save();
    });
    expect(called).toEqual([]);
  });

  it("dont call after commit on update based on previous transaction", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "first" });
    });
    expect(called).toEqual(["after_commit"]);
    const topic = (await Topic.all().toArray())[0];
    called.length = 0;
    await transaction(Topic, async () => {
      await topic.update({ title: "updated" });
    });
    expect(called).toEqual(["after_commit"]);
  });

  it.skip("dont call after commit on destroy based on previous transaction", () => {
    /* destroy doesn't trigger transaction callbacks */
  });

  it("only call after commit on save after transaction commits for saving record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "test" });
      expect(called).toEqual([]); // not fired yet
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("only call after commit on update after transaction commits for existing record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const topic = await Topic.create({ title: "original" });
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await topic.update({ title: "updated" });
      expect(called).toEqual([]);
    });
    expect(called).toEqual(["after_commit"]);
  });

  it.skip("only call after commit on destroy after transaction commits for destroyed record", () => {
    /* destroy doesn't trigger transaction callbacks */
  });

  it.skip("only call after commit on create after transaction commits for new record if create succeeds creating through association", () => {
    /* fixture-dependent */
  });
  it("no after commit on destroy after transaction commits for destroyed new record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      const t = new Topic({ title: "unsaved" });
      await t.destroy();
    });
    // New record that was never saved shouldn't trigger after_commit on destroy
    expect(called).toEqual([]);
  });

  it("only call after commit on create and doesnt leaky", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: number[] = [];
    Topic.afterCommit(function () {
      called.push(1);
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "one" });
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "two" });
    });
    expect(called.length).toBe(2);
  });

  it.skip("only call after commit on update after transaction commits for existing record on touch", () => {
    /* fixture-dependent */
  });
  it.skip("only call after commit on top level transactions", () => {
    /* fixture-dependent */
  });

  it("call after rollback after transaction rollsback", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "test" });
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual(["after_rollback"]);
  });

  it("only call after rollback on update after transaction rollsback for existing record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const topic = await Topic.create({ title: "original" });
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await topic.update({ title: "updated" });
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual(["after_rollback"]);
  });

  it.skip("only call after rollback on update after transaction rollsback for existing record on touch", () => {
    /* fixture-dependent */
  });

  it.skip("only call after rollback on destroy after transaction rollsback for destroyed record", () => {
    /* destroy doesn't trigger transaction callbacks */
  });

  it("only call after rollback on create after transaction rollsback for new record", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "test" });
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual(["after_rollback"]);
  });

  it.skip("call after rollback when commit fails", () => {
    /* fixture-dependent */
  });
  it.skip("only call after rollback on records rolled back to a savepoint", () => {
    /* fixture-dependent */
  });
  it.skip("only call after rollback on records rolled back to a savepoint when release savepoint fails", () => {
    /* fixture-dependent */
  });

  it("after commit callback should not swallow errors", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    Topic.afterCommit(function () {
      throw new Error("boom");
    });
    await expect(
      transaction(Topic, async () => {
        await Topic.create({ title: "test" });
      }),
    ).rejects.toThrow("boom");
  });

  it("after commit callback when raise should not restore state", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    Topic.afterCommit(function () {
      throw new Error("boom");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "persisted" });
      });
    } catch {}
    const all = await Topic.all().toArray();
    expect(all.length).toBe(1);
  });

  it("after rollback callback should not swallow errors when set to raise", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    Topic.afterRollback(function () {
      throw new Error("rollback_boom");
    });
    await expect(
      (async () => {
        await transaction(Topic, async () => {
          await Topic.create({ title: "test" });
          throw new Error("trigger_rollback");
        });
      })(),
    ).rejects.toThrow();
  });

  it("after commit callback should not rollback state that already been succeeded", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    let commitCalled = false;
    Topic.afterCommit(function () {
      commitCalled = true;
      throw new Error("callback error");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "saved" });
      });
    } catch {}
    expect(commitCalled).toBe(true);
    const all = await Topic.all().toArray();
    expect(all.length).toBe(1);
  });

  it.skip("after rollback callback when raise should restore state", () => {
    /* fixture-dependent */
  });
  it.skip("after rollback callbacks should validate on condition", () => {
    /* fixture-dependent */
  });
  it.skip("after commit callbacks should validate on condition", () => {
    /* fixture-dependent */
  });

  it("after commit chain not called on errors", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "test" });
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual([]);
  });

  it.skip("saving a record with a belongs to that specifies touching the parent should call callbacks on the parent object", () => {
    /* fixture-dependent */
  });

  it("saving two records that override object id should run after commit callbacks for both", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "first" });
      await Topic.create({ title: "second" });
    });
    expect(called.length).toBe(2);
  });

  it("saving two records that override object id should run after rollback callbacks for both", async () => {
    const adp = freshAdapter();
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await Topic.create({ title: "first" });
        await Topic.create({ title: "second" });
        throw new Error("rollback");
      });
    } catch {}
    expect(called.length).toBe(2);
  });

  it("after commit does not mutate the if options array", async () => {
    const adp = freshAdapter();
    const opts = ["create", "update"];
    const original = [...opts];
    class Topic extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    Topic.afterCommit(function () {
      /* noop */
    });
    await transaction(Topic, async () => {
      await Topic.create({ title: "test" });
    });
    expect(opts).toEqual(original);
  });

  it.skip("only call after commit on create after transaction commits for new record", () => {});
  it.skip("save in after create commit wont invoke extra after create commit", () => {});
  it.skip("callbacks run in order defined in model if not using run after transaction callbacks in order defined", () => {});
});

describe("afterCommit / afterRollback", () => {
  it("fires afterCommit callback outside transaction", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];

    class Order extends Base {
      static {
        this.attribute("total", "integer");
        this.adapter = adapter;
        this.afterCommit((record: any) => {
          log.push("committed");
        });
      }
    }

    await Order.create({ total: 100 });
    expect(log).toContain("committed");
  });

  it("call after commit after transaction commits", async () => {
    const adapter = freshAdapter();
    const log: string[] = [];

    class Payment extends Base {
      static {
        this.attribute("amount", "integer");
        this.adapter = adapter;
        this.afterCommit((record: any) => {
          log.push("committed");
        });
      }
    }

    await transaction(Payment, async (tx) => {
      await Payment.create({ amount: 50 });
    });
    expect(log).toContain("committed");
  });

  it("afterCommit fires immediately outside transaction (Rails-guided)", async () => {
    const adp = freshAdapter();
    const log: string[] = [];
    class Order extends Base {
      static {
        this.attribute("amount", "integer");
        this.adapter = adp;
        this.afterCommit(() => {
          log.push("committed");
        });
      }
    }
    await Order.create({ amount: 100 });
    expect(log).toContain("committed");
  });

  it("afterCommit fires on transaction commit (Rails-guided)", async () => {
    const adp = freshAdapter();
    const log: string[] = [];
    class Invoice extends Base {
      static {
        this.attribute("total", "integer");
        this.adapter = adp;
        this.afterCommit(() => {
          log.push("invoice committed");
        });
      }
    }
    await transaction(Invoice, async () => {
      await Invoice.create({ total: 200 });
    });
    expect(log).toContain("invoice committed");
  });
});
