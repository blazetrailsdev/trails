/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import type { AssociationProxy } from "./associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import { describe, it, expect, vi } from "vitest";
import {
  Base,
  transaction,
  beforeCommit,
  afterCommit,
  afterSaveCommit,
  afterCreateCommit,
  afterUpdateCommit,
  afterDestroyCommit,
  afterRollback,
  setRunAfterTransactionCallbacksInOrderDefined,
  currentTransaction,
  Rollback,
  registerModel,
} from "./index.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";

function defineBehaviourTopic() {
  return class extends Base {
    history: any[] = [];
    static {
      this._tableName = "topics";
      this.attribute("title", "string");
      afterCommit(this, (r: any) => r.history.push(3));
      afterCommit(this, (r: any) => r.history.push(4));
      afterSaveCommit(this, (r: any) => r.history.push("save"));
      afterCreateCommit(this, (r: any) => r.history.push("create"));
      afterUpdateCommit(this, (r: any) => r.history.push("update"));
      afterDestroyCommit(this, (r: any) => r.history.push("destroy"));
      afterRollback(this, (r: any) => r.history.push("rollback1"));
      afterRollback(this, (r: any) => r.history.push("rollback2"));
      beforeCommit(this, (r: any) => r.history.push(1));
      beforeCommit(this, (r: any) => r.history.push(2));
    }
  };
}

// Rails `fixtures :topics, :owners, :pets`. `{ schema }` recreates the canonical
// tables so sibling-file contamination on the shared worker DB can't leak rows.
fixtures(["topics", "owners", "pets"], {
  schema: canonicalSchema,
});

describe("TransactionCallbacksTest", () => {
  it("before commit exception should pop transaction stack", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    beforeCommit(Topic, function () {
      throw new Error("better pop this txn from the stack!");
    });
    const originalTxn = currentTransaction();
    const t = new Topic({ title: "x" });
    await expect(t.saveBang()).rejects.toThrow("better pop this txn from the stack!");
    expect(currentTransaction()).toBe(originalTxn);
  });

  it("dont call any callbacks after transaction commits for invalid record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    let topic: any;
    await transaction(Topic, async () => {
      topic = await Topic.create({ title: "first" });
    });
    expect(called).toEqual(["after_commit"]);
    called.length = 0;
    await transaction(Topic, async () => {
      await topic.update({ title: "updated" });
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("dont call after commit on destroy based on previous transaction", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    const t = await Topic.create({ title: "test" });
    // First transaction: update triggers after_commit
    await transaction(Topic, async () => {
      await t.update({ title: "updated" });
    });
    expect(called).toEqual(["after_commit", "after_commit"]);
    called.length = 0;
    // Second transaction: destroy should only fire its own callback, not leak from previous
    await transaction(Topic, async () => {
      await t.destroy();
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("only call after commit on save after transaction commits for saving record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("only call after commit on destroy after transaction commits for destroyed record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    const t = await Topic.create({ title: "test" });
    called.length = 0;
    await transaction(Topic, async () => {
      await t.destroy();
      expect(called).toEqual([]);
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("only call after commit on create after transaction commits for new record if create succeeds creating through association", async () => {
    // Mirrors Rails: TopicWithCallbacks.create! + topic.replies.create (no content)
    // → validates_presence_of :content fails → afterCreateCommit never fires.
    const commitHistory: string[] = [];
    class ReplyForAssoc extends Base {
      declare title: string;
      declare parent_id: number;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.attribute("parent_id", "integer");
        this.validates("title", { presence: true });
        this.afterCreateCommit(function () {
          commitHistory.push("commit_on_create");
        });
      }
    }
    class TopicForAssoc extends Base {
      declare title: string;
      declare parent_id: number;
      declare assocReplies: AssociationProxy<ReplyForAssoc>;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.attribute("parent_id", "integer");
        this.hasMany("assocReplies", {
          className: "ReplyForAssoc",
          foreignKey: "parent_id",
        });
      }
    }
    registerModel(ReplyForAssoc);
    registerModel(TopicForAssoc);

    const topic = (await TopicForAssoc.create({ title: "Parent" })) as any;
    // Create with no title → validation fails → afterCreateCommit does NOT fire
    await topic.assocReplies.create({});
    expect(commitHistory).toEqual([]);
  });
  it("no after commit on destroy after transaction commits for destroyed new record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("only call after commit on update after transaction commits for existing record on touch", async () => {
    class Topic extends Base {
      declare title: string;
      declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

      static {
        this.attribute("title", "string");
        this.attribute("updated_at", "datetime");
      }
    }
    const topic = await Topic.create({ title: "original" });
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await topic.touch();
      expect(called).toEqual([]);
    });
    expect(called).toEqual(["after_commit"]);
  });
  it("only call after commit on top level transactions", async () => {
    class Topic extends Base {
      declare title: string;
      declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

      static {
        this.attribute("title", "string");
        this.attribute("updated_at", "datetime");
      }
    }
    const topic = await Topic.create({ title: "original" });
    const called: string[] = [];
    Topic.afterCommit(function () {
      called.push("after_commit");
    });
    await transaction(Topic, async () => {
      await transaction(
        Topic,
        async () => {
          await topic.touch();
        },
        { requiresNew: true },
      );
      // The savepoint commit must NOT fire after_commit — only the outermost does.
      expect(called).toEqual([]);
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("call after rollback after transaction rollsback", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("only call after rollback on update after transaction rollsback for existing record on touch", async () => {
    class Topic extends Base {
      declare title: string;
      declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

      static {
        this.attribute("title", "string");
        this.attribute("updated_at", "datetime");
      }
    }
    const topic = await Topic.create({ title: "original" });
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await topic.touch();
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual(["after_rollback"]);
  });

  it("only call after rollback on destroy after transaction rollsback for destroyed record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const t = await Topic.create({ title: "test" });
    const called: string[] = [];
    Topic.afterRollback(function () {
      called.push("after_rollback");
    });
    try {
      await transaction(Topic, async () => {
        await t.destroy();
        throw new Error("rollback");
      });
    } catch {}
    expect(called).toEqual(["after_rollback"]);
  });

  it("only call after rollback on create after transaction rollsback for new record", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("call after rollback when commit fails", async () => {
    const afterHistory: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    Topic.afterCommit(function () {
      afterHistory.push("after_commit");
    });
    Topic.afterRollback(function () {
      afterHistory.push("after_rollback");
    });

    // The test suite wraps each test in a SAVEPOINT, so `Topic.transaction()`
    // creates a nested SavepointTransaction whose commit calls releaseSavepoint.
    // Throwing there exercises the rollback-on-failed-commit path.
    const adapter = Topic.connection as any;
    const spy = vi.spyOn(adapter, "releaseSavepoint").mockImplementationOnce(async () => {
      throw new Error("commit failed");
    });

    try {
      await expect(
        Topic.transaction(async () => {
          await Topic.create({ title: "test" });
        }),
      ).rejects.toThrow("commit failed");
    } finally {
      spy.mockRestore();
    }

    expect(afterHistory).toEqual(["after_rollback"]);
  });
  it("only call after rollback on records rolled back to a savepoint", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    // Pre-create the records before registering callbacks so their create
    // commits are not counted (mirrors Rails using fixture records + per-record
    // instance blocks registered after the records already exist).
    const first = (await Topic.create({ title: "first" })) as any;
    const second = (await Topic.create({ title: "second" })) as any;
    Topic.afterRollback(function (record: any) {
      record.rollbacks = (record.rollbacks ?? 0) + 1;
    });
    Topic.afterCommit(function (record: any) {
      record.commits = (record.commits ?? 0) + 1;
    });

    await transaction(Topic, async () => {
      first.title = "first-updated";
      await first.saveBang();
      await Topic.transaction(
        async () => {
          second.title = "second-updated";
          await second.saveBang();
          throw new Rollback();
        },
        { requiresNew: true },
      );
    });

    expect(first.commits).toBe(1);
    expect(first.rollbacks ?? 0).toBe(0);
    expect(second.commits ?? 0).toBe(0);
    expect(second.rollbacks).toBe(1);
  });
  it("only call after rollback on records rolled back to a savepoint when release savepoint fails", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const first = (await Topic.create({ title: "first" })) as any;
    Topic.afterRollback(function (record: any) {
      record.rollbacks = (record.rollbacks ?? 0) + 1;
    });
    Topic.afterCommit(function (record: any) {
      record.commits = (record.commits ?? 0) + 1;
    });

    await transaction(Topic, async () => {
      first.title = "outer";
      await first.save();
      await Topic.transaction(
        async () => {
          first.title = "sp1";
          await first.saveBang();
          throw new Rollback();
        },
        { requiresNew: true },
      );
      await Topic.transaction(
        async () => {
          first.title = "sp2";
          await first.saveBang();
          throw new Rollback();
        },
        { requiresNew: true },
      );
    });

    expect(first.commits).toBe(1);
    expect(first.rollbacks).toBe(2);
  });

  it("after commit callback should not swallow errors", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    Topic.afterCommit(function () {
      throw new Error("boom");
    });
    let record: any;
    try {
      await transaction(Topic, async () => {
        record = await Topic.create({ title: "persisted" });
      });
    } catch {}
    expect(record.id).not.toBeNull();
    expect(await Topic.find(record.id)).toBeTruthy();
  });

  it("after rollback callback should not swallow errors when set to raise", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    let commitCalled = false;
    let record: any;
    Topic.afterCommit(function () {
      commitCalled = true;
      throw new Error("callback error");
    });
    try {
      await transaction(Topic, async () => {
        record = await Topic.create({ title: "saved" });
      });
    } catch {}
    expect(commitCalled).toBe(true);
    expect(record.id).not.toBeNull();
    expect(await Topic.find(record.id)).toBeTruthy();
  });

  it("after rollback callback when raise should restore state", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const ErrorClass = class extends Error {};
    Topic.afterRollback(function () {
      throw new ErrorClass();
    });
    const first = new Topic({});
    const second = new Topic({});
    try {
      await transaction(Topic, async () => {
        await first.saveBang();
        expect(first.id).not.toBeNull();
        await second.saveBang();
        expect(second.id).not.toBeNull();
        throw new Rollback();
      });
    } catch (e) {
      // Mirror Rails' `rescue error_class`: only swallow the error the rollback
      // callback raised. Re-throw anything else so a failure in the state-restore
      // path can't hide behind a blanket catch.
      if (!(e instanceof ErrorClass)) throw e;
    }
    expect(first.id).toBeNull();
    expect(second.id).toBeNull();
  });
  it("after rollback callbacks should validate on condition", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    expect(() => Topic.afterRollback(() => {}, { on: "save" })).toThrow(
      /:on conditions for after_commit and after_rollback callbacks have to be one of \[:create, :destroy, :update\]/,
    );
  });

  it("after commit callbacks should validate on condition", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    expect(() => Topic.afterCommit(() => {}, { on: "save" })).toThrow(
      /:on conditions for after_commit and after_rollback callbacks have to be one of \[:create, :destroy, :update\]/,
    );
  });

  it("after commit chain not called on errors", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("saving a record with a belongs to that specifies touching the parent should call callbacks on the parent object", async () => {
    // Rails: pet = Pet.first; owner = pet.owner; owner.on_after_commit { flag = true }
    // pet.name = "Fluffy the Third"; pet.save → belongs_to(touch: true) touches the
    // owner, firing its after_commit blocks.
    registerModel(Owner);
    registerModel(Pet);
    const pet = (await Pet.first()) as Pet;
    const owner = (await pet.loadBelongsTo("owner")) as Owner;
    let flag = false;

    owner.onAfterCommit(() => {
      flag = true;
    });

    pet.writeAttribute("name", "Fluffy the Third");
    await pet.save();

    expect(flag).toBe(true);
  });

  it("saving two records that override object id should run after commit callbacks for both", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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
    const opts = ["create", "update"];
    const original = [...opts];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
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

  it("only call after commit on create after transaction commits for new record", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterCreateCommit(() => {
          history.push("commit_on_create");
        });
        this.afterUpdateCommit(() => {
          history.push("commit_on_update");
        });
        this.afterDestroyCommit(() => {
          history.push("commit_on_destroy");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual(["commit_on_create"]);
  });

  it("afterSaveCommit fires on create and update but not destroy", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterSaveCommit(() => {
          history.push("save_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual(["save_commit"]);
    history.length = 0;

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual(["save_commit"]);
    history.length = 0;

    await t.destroy();
    expect(history).toEqual([]);
  });

  it("afterUpdateCommit fires on update but not create", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterUpdateCommit(() => {
          history.push("update_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual([]);

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual(["update_commit"]);
  });

  it("afterDestroyCommit fires on destroy but not create or update", async () => {
    const history: string[] = [];
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterDestroyCommit(() => {
          history.push("destroy_commit");
        });
      }
    }
    const t = new Topic({ title: "New topic" });
    await t.save();
    expect(history).toEqual([]);

    t.title = "Updated topic";
    await t.save();
    expect(history).toEqual([]);

    await t.destroy();
    expect(history).toEqual(["destroy_commit"]);
  });

  it("save in after create commit wont invoke extra after create commit", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    // Full mirror of Rails' add_transaction_execution_blocks: all six
    // commit/rollback blocks. Only the create + update commit blocks fire in
    // this all-commit path; the destroy/rollback blocks are inert here.
    // Rails dispatches both create-commit blocks (commit_on_create, then the
    // re-save) inside a single after_create_commit via do_after_commit(:create),
    // so they run in registration order regardless of the global
    // after-transaction callback ordering. Mirror that with one callback.
    Topic.afterCreateCommit(async function (record: any) {
      (record.history ??= []).push("commit_on_create");
      await record.saveBang();
    });
    Topic.afterUpdateCommit(function (record: any) {
      (record.history ??= []).push("commit_on_update");
    });
    Topic.afterDestroyCommit(function (record: any) {
      (record.history ??= []).push("commit_on_destroy");
    });
    Topic.afterRollback(
      function (record: any) {
        (record.history ??= []).push("rollback_on_create");
      },
      { on: "create" },
    );
    Topic.afterRollback(
      function (record: any) {
        (record.history ??= []).push("rollback_on_update");
      },
      { on: "update" },
    );
    Topic.afterRollback(
      function (record: any) {
        (record.history ??= []).push("rollback_on_destroy");
      },
      { on: "destroy" },
    );
    const newRecord = new Topic({ title: "New topic" });
    await newRecord.saveBang();
    expect((newRecord as any).history).toEqual(["commit_on_create", "commit_on_update"]);
  });

  describe("CallbackOrderTest", () => {
    it("callbacks run in order defined in model if not using run after transaction callbacks in order defined", async () => {
      setRunAfterTransactionCallbacksInOrderDefined(false);
      const Topic = defineBehaviourTopic();

      const topic = new Topic() as any;
      await topic.save();
      expect(topic.history).toEqual([1, 2, "create", "save", 4, 3]);

      topic.history = [];
      topic.title = "updated";
      await topic.save();
      expect(topic.history).toEqual([1, 2, "update", "save", 4, 3]);

      topic.history = [];
      await transaction(Topic, async () => {
        topic.title = "again";
        await topic.save();
        throw new Rollback();
      });
      expect(topic.history).toEqual(["rollback2", "rollback1"]);

      topic.history = [];
      await topic.destroy();
      expect(topic.history).toEqual([1, 2, "destroy", 4, 3]);
    });
  });
});

describe("TransactionCallbacksTest", () => {
  it("call after commit after transaction commits", async () => {
    const log: string[] = [];

    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
        this.afterCommit(() => {
          log.push("committed");
        });
      }
    }

    await transaction(Topic, async () => {
      await Topic.create({ title: "New topic" });
    });
    expect(log).toContain("committed");
  });

  describe("TransactionAfterCommitCallbacksWithOptimisticLockingTest", () => {
    it("after commit callbacks with optimistic locking", async () => {
      // Rails: PersonWithCallbacks(self.table_name = :people) with
      // after_*_commit appending to history; people has lock_version.
      const history: string[] = [];
      class PersonWithCallbacks extends Base {
        declare first_name: string;

        static {
          this._tableName = "people";
          this.attribute("first_name", "string");
          this.afterCreateCommit(function () {
            history.push("commit_on_create");
          });
          this.afterUpdateCommit(function () {
            history.push("commit_on_update");
          });
          this.afterDestroyCommit(function () {
            history.push("commit_on_destroy");
          });
        }
      }
      const person = await PersonWithCallbacks.create({ first_name: "first name" });
      await person.update({ first_name: "another name" });
      await person.destroy();

      expect(history).toEqual(["commit_on_create", "commit_on_update", "commit_on_destroy"]);
    });
  }); // TransactionAfterCommitCallbacksWithOptimisticLockingTest

  describe("CallbacksOnMultipleActionsTest", () => {
    it("after commit on multiple actions", async () => {
      const log: string[] = [];
      class Post extends Base {
        declare title: string;

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.afterCreate(function () {
            log.push("created");
          });
          this.afterUpdate(function () {
            log.push("updated");
          });
          this.afterDestroy(function () {
            log.push("destroyed");
          });
        }
      }
      const p = await Post.create({ title: "a" });
      expect(log).toContain("created");
      p.title = "b";
      await p.save();
      expect(log).toContain("updated");
      await p.destroy();
      expect(log).toContain("destroyed");
    });

    it("before commit actions", async () => {
      class TopicWithCallbacksOnMultipleActions extends Base {
        declare title: string;

        declare saveBeforeCommitHistory: boolean;
        history: string[] = [];
        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.afterCommit((record: any) => record.history.push("create_and_destroy"), {
            on: ["create", "destroy"],
          });
          this.afterCommit((record: any) => record.history.push("create_and_update"), {
            on: ["create", "update"],
          });
          this.afterCommit((record: any) => record.history.push("update_and_destroy"), {
            on: ["update", "destroy"],
          });
          beforeCommit(this, (record: any) => record.history.push("before_commit"), {
            if: (record: any) => record.saveBeforeCommitHistory,
          });
        }
      }

      const topic = new TopicWithCallbacksOnMultipleActions() as any;
      topic.saveBeforeCommitHistory = true;
      await topic.save();

      expect(topic.history).toEqual(["before_commit", "create_and_update", "create_and_destroy"]);
    });

    it("before commit update in same transaction", async () => {
      class TopicBC extends Base {
        declare title: string;

        declare updateTitle: boolean;
        static {
          this._tableName = "topics";
          this.attribute("title", "string");
        }
      }
      beforeCommit(TopicBC, async function (record: any) {
        if (record.updateTitle) {
          await record.update({ title: "before commit title" });
        }
      });

      const topic = new TopicBC() as any;
      topic.title = "original";
      topic.updateTitle = true;
      await topic.save();

      expect(topic.title).toBe("before commit title");
      await topic.reload();
      expect(topic.title).toBe("before commit title");
    });
  }); // CallbacksOnMultipleActionsTest

  describe("CallbackOrderTest", () => {
    it("callbacks run in order defined in model if using run after transaction callbacks in order defined", async () => {
      let Topic: ReturnType<typeof defineBehaviourTopic>;
      setRunAfterTransactionCallbacksInOrderDefined(true);
      try {
        Topic = defineBehaviourTopic();
      } finally {
        setRunAfterTransactionCallbacksInOrderDefined(false);
      }

      const topic = new Topic() as any;
      await topic.save();
      expect(topic.history).toEqual([1, 2, 3, 4, "save", "create"]);

      topic.history = [];
      topic.title = "updated";
      await topic.save();
      expect(topic.history).toEqual([1, 2, 3, 4, "save", "update"]);

      topic.history = [];
      await transaction(Topic, async () => {
        topic.title = "again";
        await topic.save();
        throw new Rollback();
      });
      expect(topic.history).toEqual(["rollback1", "rollback2"]);

      topic.history = [];
      await topic.destroy();
      expect(topic.history).toEqual([1, 2, 3, 4, "destroy"]);
    });
  }); // CallbackOrderTest

  describe("CallbacksOnDestroyUpdateActionRaceTest", () => {
    it("trigger once on multiple deletion within transaction", async () => {
      const log: string[] = [];
      class Topic extends Base {
        declare title: string;

        static {
          this.attribute("title", "string");
          this.afterDestroy((record: any) => {
            log.push("destroyed:" + record.title);
          });
        }
      }
      const t1 = await Topic.create({ title: "a" });
      await transaction(Topic, async () => {
        await t1.destroy();
      });
      expect(log.filter((l) => l === "destroyed:a").length).toBe(1);
    });

    it("trigger once on multiple deletions", async () => {
      const log: string[] = [];
      class Topic extends Base {
        declare title: string;

        static {
          this.attribute("title", "string");
          this.afterDestroy((record: any) => {
            log.push("destroyed:" + record.title);
          });
        }
      }
      const t1 = await Topic.create({ title: "a" });
      const t2 = await Topic.create({ title: "b" });
      await t1.destroy();
      await t2.destroy();
      expect(log.length).toBe(2);
    });

    it("trigger once on multiple deletions in a transaction", async () => {
      const log: string[] = [];
      class Topic extends Base {
        declare title: string;

        static {
          this.attribute("title", "string");
          this.afterDestroy((record: any) => {
            log.push("destroyed:" + record.title);
          });
        }
      }
      const t1 = await Topic.create({ title: "a" });
      const t2 = await Topic.create({ title: "b" });
      await transaction(Topic, async () => {
        await t1.destroy();
        await t2.destroy();
      });
      expect(log.length).toBe(2);
      expect(log).toContain("destroyed:a");
      expect(log).toContain("destroyed:b");
    });

    it("rollback on multiple deletions", async () => {
      const log: string[] = [];
      class Topic extends Base {
        declare title: string;

        static {
          this.attribute("title", "string");
          this.afterDestroy((record: any) => {
            log.push("destroyed");
          });
        }
      }
      const t1 = await Topic.create({ title: "a" });
      const t2 = await Topic.create({ title: "b" });
      const rollbackLog: string[] = [];
      try {
        await transaction(Topic, async (tx) => {
          tx.afterRollback(() => {
            rollbackLog.push("rollback");
          });
          await t1.destroy();
          await t2.destroy();
          throw new Error("rollback");
        });
      } catch {}
      expect(rollbackLog.length).toBeGreaterThan(0);
    });

    it("trigger on update where row was deleted", async () => {
      const log: string[] = [];
      class Topic extends Base {
        declare title: string;

        static {
          this.attribute("title", "string");
          this.afterUpdate(function () {
            log.push("updated");
          });
          this.afterDestroy(function () {
            log.push("destroyed");
          });
        }
      }
      const t1 = await Topic.create({ title: "a" });
      await t1.destroy();
      expect(log).toContain("destroyed");
      // Attempting to modify a destroyed (frozen) record should throw, not trigger afterUpdate
      expect(() => (t1.title = "b")).toThrow();
      expect(log).not.toContain("updated");
    });
  }); // CallbacksOnDestroyUpdateActionRaceTest

  describe("CallbacksOnActionAndConditionTest", () => {
    it("callback on action with condition", async () => {
      const log: string[] = [];
      class Post extends Base {
        declare title: string;
        declare approved: boolean;

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.attribute("approved", "boolean", { default: false });
          this.beforeSave(function (record: any) {
            if (record.approved) {
              log.push("published_save");
            }
          });
        }
      }
      await Post.create({ title: "draft", approved: false });
      expect(log).not.toContain("published_save");
      await Post.create({ title: "live", approved: true });
      expect(log).toContain("published_save");
    });
  }); // CallbacksOnActionAndConditionTest

  describe("CallbacksOnMultipleInstancesInATransactionTest", () => {
    // Mirrors Rails' TopicWithTitleHistory: after_*_commit callbacks that append
    // to a per-class history array, used to assert which instance of a logical
    // row runs the transactional commit callbacks. The `firstSaved` flag mirrors
    // `run_commit_callbacks_on_first_saved_instances_in_transaction` — true keeps
    // the first saved instance (old configuration), false the last.
    const makeTopicWithTitleHistory = (history: string[], firstSaved: boolean) =>
      class TopicWithTitleHistory extends Base {
        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          (this as any).runCommitCallbacksOnFirstSavedInstancesInTransaction = firstSaved;
          afterCreateCommit(this, (record: any) =>
            history.push(`Created (title = ${JSON.stringify(record.title)})`),
          );
          afterUpdateCommit(this, (record: any) =>
            history.push(`Updated (title = ${JSON.stringify(record.title)})`),
          );
          afterDestroyCommit(this, (record: any) =>
            history.push(`Destroyed (title = ${JSON.stringify(record.title)})`),
          );
        }
      };

    it("created callback called on last to save of separate instances in a transaction", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, false);

      await transaction(TopicWithTitleHistory, async () => {
        const topic = await TopicWithTitleHistory.create({ title: "A" });
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "B" });
      });

      expect(history).toEqual(['Created (title = "B")']);
    });

    it("created callback called on first to save in transaction with old configuration", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, true);

      await transaction(TopicWithTitleHistory, async () => {
        const topic = await TopicWithTitleHistory.create({ title: "A" });
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "B" });
      });

      expect(history).toEqual(['Created (title = "A")']);
    });

    it("updated callback called on last to save of separate instances in a transaction", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, false);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "two" });
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "three" });
      });

      expect(history).toEqual(['Updated (title = "three")']);
    });

    it("updated callback called on first to save in transaction with old configuration", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, true);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "two" });
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "three" });
      });

      expect(history).toEqual(['Updated (title = "two")']);
    });

    it("destroyed callback called on destroyed instance when preceded in transaction by save from separate instance", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, false);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "two" });
        await (await TopicWithTitleHistory.find(topic.id)).destroy();
      });

      expect(history).toEqual(['Destroyed (title = "two")']);
    });

    it("updated callback called on first to save when followed in transaction by destroy from separate instance with old configuration", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, true);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).update({ title: "two" });
        await (await TopicWithTitleHistory.find(topic.id)).destroy();
      });

      expect(history).toEqual(['Updated (title = "two")']);
    });

    it("destroyed callbacks called on destroyed instance even when followed by update from separate instances in a transaction", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, false);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).destroy();
        await topic.update({ title: "two" });
      });

      expect(history).toEqual(['Destroyed (title = "one")']);
    });

    it("destroyed callbacks called on first saved instance in transaction with old configuration", async () => {
      const history: string[] = [];
      const TopicWithTitleHistory = makeTopicWithTitleHistory(history, true);
      const topic = await TopicWithTitleHistory.create({ title: "one" });
      history.length = 0;

      await transaction(TopicWithTitleHistory, async () => {
        await (await TopicWithTitleHistory.find(topic.id)).destroy();
        await topic.update({ title: "two" });
      });

      expect(history).toEqual(['Destroyed (title = "one")']);
    });
  }); // CallbacksOnMultipleInstancesInATransactionTest

  describe("SetCallbackTest", () => {
    it("set callback with on", async () => {
      const log: string[] = [];
      class Post extends Base {
        declare title: string;

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.beforeCreate(function () {
            log.push("before_create");
          });
          this.beforeSave(function () {
            log.push("before_save");
          });
        }
      }
      await Post.create({ title: "test" });
      expect(log).toContain("before_create");
      expect(log).toContain("before_save");
    });
  }); // SetCallbackTest
}); // TransactionCallbacksTest

describe("hasTransactionalCallbacks regression", () => {
  it("returns true for a model with only beforeCommit callbacks", () => {
    class Widget extends Base {
      declare title: string;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
      }
    }
    beforeCommit(Widget, () => {});
    const w = new Widget({});
    expect(w.hasTransactionalCallbacks()).toBe(true);
  });
});
