import type { AssociationProxy } from "./associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/date";
import { describe, it, expect, vi } from "vitest";
import { Base, transaction, currentTransaction, Rollback, registerModel } from "./index.js";
import { Owner } from "./test-helpers/models/owner.js";
import { Pet } from "./test-helpers/models/pet.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { ArgumentError, assertEmpty, assertRaise } from "@blazetrails/activesupport";

import { kernelThrow } from "@blazetrails/ruby-compat";
import { fixtures } from "./test-fixtures.js";
import { setRunAfterTransactionCallbacksInOrderDefined } from "./active-record.js";

function defineBehaviourTopic() {
  return class extends Base {
    history: any[] = [];
    static {
      this._tableName = "topics";
      this.attribute("title", "string");
      this.afterCommit((r: any) => r.history.push(3));
      this.afterCommit((r: any) => r.history.push(4));
      this.afterSaveCommit((r: any) => r.history.push("save"));
      this.afterCreateCommit((r: any) => r.history.push("create"));
      this.afterUpdateCommit((r: any) => r.history.push("update"));
      this.afterDestroyCommit((r: any) => r.history.push("destroy"));
      this.afterRollback((r: any) => r.history.push("rollback1"));
      this.afterRollback((r: any) => r.history.push("rollback2"));
      this.beforeCommit((r: any) => r.history.push(1));
      this.beforeCommit((r: any) => r.history.push(2));
    }
  };
}

type CommitBlock = (record: any) => unknown;

class TopicWithCallbacks extends Base {
  history: any[] = [];
  abortBeforeUpdate?: boolean;
  abortBeforeDestroy?: boolean;
  _beforeCommit: Record<string, CommitBlock[]> = {};
  _afterCommit: Record<string, CommitBlock[]> = {};
  _afterRollback: Record<string, CommitBlock[]> = {};

  static {
    this._tableName = "topics";
    this.hasMany("replies", { className: "ReplyWithCallbacks", foreignKey: "parent_id" });
    this.beforeUpdate((r: any) => {
      if (r.abortBeforeUpdate) kernelThrow(":abort");
    });
    this.beforeDestroy((r: any) => {
      if (r.abortBeforeDestroy) kernelThrow(":abort");
    });
    this.beforeDestroy(async (r: any) => {
      if (r.isPersisted()) await (await TopicWithCallbacks.find(r.id)).touch();
    });
    this.beforeCommit((r: any) => r.doBeforeCommit(null));
    this.afterCommit((r: any) => r.doAfterCommit(null));
    this.afterSaveCommit((r: any) => r.doAfterCommit("save"));
    this.afterCreateCommit((r: any) => r.doAfterCommit("create"));
    this.afterUpdateCommit((r: any) => r.doAfterCommit("update"));
    this.afterDestroyCommit((r: any) => r.doAfterCommit("destroy"));
    this.afterRollback((r: any) => r.doAfterRollback(null));
    this.afterRollback((r: any) => r.doAfterRollback("create"), { on: "create" });
    this.afterRollback((r: any) => r.doAfterRollback("update"), { on: "update" });
    this.afterRollback((r: any) => r.doAfterRollback("destroy"), { on: "destroy" });
  }

  beforeCommitBlock(on: string | null, block: CommitBlock) {
    (this._beforeCommit[String(on)] ??= []).push(block);
  }

  afterCommitBlock(on: string | null, block: CommitBlock) {
    (this._afterCommit[String(on)] ??= []).push(block);
  }

  afterRollbackBlock(on: string | null, block: CommitBlock) {
    (this._afterRollback[String(on)] ??= []).push(block);
  }

  async doBeforeCommit(on: string | null) {
    for (const b of this._beforeCommit[String(on)] ?? []) await b(this);
  }

  async doAfterCommit(on: string | null) {
    for (const b of this._afterCommit[String(on)] ?? []) await b(this);
  }

  async doAfterRollback(on: string | null) {
    for (const b of this._afterRollback[String(on)] ?? []) await b(this);
  }
}
registerModel(TopicWithCallbacks);

fixtures(["topics", "owners", "pets"], {
  usesTransaction: [
    "trigger once on multiple deletion within transaction",
    "trigger once on multiple deletions",
    "trigger once on multiple deletions in a transaction",
    "rollback on multiple deletions",
    "trigger on update where row was deleted",
    "callback on action with condition",
    "set callback with on",
  ],
});

function addTransactionExecutionBlocks(record: TopicWithCallbacks) {
  record.afterCommitBlock("create", (r) => r.history.push("commit_on_create"));
  record.afterCommitBlock("update", (r) => r.history.push("commit_on_update"));
  record.afterCommitBlock("destroy", (r) => r.history.push("commit_on_destroy"));
  record.afterRollbackBlock("create", (r) => r.history.push("rollback_on_create"));
  record.afterRollbackBlock("update", (r) => r.history.push("rollback_on_update"));
  record.afterRollbackBlock("destroy", (r) => r.history.push("rollback_on_destroy"));
}

describe("TransactionCallbacksTest", () => {
  it("before commit exception should pop transaction stack", async () => {
    const first = await TopicWithCallbacks.find(1);
    first.beforeCommitBlock(null, () => {
      throw new Error("better pop this txn from the stack!");
    });

    const originalTxn = currentTransaction();

    try {
      await first.saveBang();
      throw new Error("fail");
    } catch {
      expect(currentTransaction()).toBe(originalTxn);
    }
  });

  it("call after commit after transaction commits", async () => {
    class Topic extends Base {
      declare title: string;

      static {
        this.attribute("title", "string");
      }
    }
    const history: string[] = [];
    Topic.afterCommit(function () {
      history.push("after_commit");
    });
    Topic.afterRollback(function () {
      history.push("after_rollback");
    });
    const first = (await Topic.find(1)) as any;
    await first.saveBang();
    expect(history).toEqual(["after_commit"]);
  });

  it("dont call any callbacks after transaction commits for invalid record", async () => {
    const first = await TopicWithCallbacks.find(1);
    first.afterCommitBlock(null, (r) => r.history.push("after_commit"));
    first.afterRollbackBlock(null, (r) => r.history.push("after_rollback"));

    first.isValid = async () => false;

    expect(await first.save()).toBeFalsy();
    expect(first.history).toEqual([]);
  });

  it("dont call any callbacks after explicit transaction commits for invalid record", async () => {
    const first = await TopicWithCallbacks.find(1);
    first.afterCommitBlock(null, (r) => r.history.push("after_commit"));
    first.afterRollbackBlock(null, (r) => r.history.push("after_rollback"));

    first.isValid = async () => false;

    await transaction(TopicWithCallbacks, async () => {
      expect(await first.save()).toBeFalsy();
    });
    expect(first.history).toEqual([]);
  });

  it("dont call after commit on update based on previous transaction", async () => {
    const first = await TopicWithCallbacks.find(1);
    await first.saveBang();
    addTransactionExecutionBlocks(first);

    first.abortBeforeUpdate = true;
    await transaction(TopicWithCallbacks, async () => {
      await first.save();
    });

    assertEmpty(first.history);
  });

  it("dont call after commit on destroy based on previous transaction", async () => {
    const first = await TopicWithCallbacks.find(1);
    await first.destroyBang();
    addTransactionExecutionBlocks(first);

    first.abortBeforeDestroy = true;
    await transaction(TopicWithCallbacks, async () => {
      await first.destroy();
    });

    assertEmpty(first.history);
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
      expect(called).toEqual([]);
    });
    expect(called).toEqual(["after_commit"]);
  });

  it("only call after commit on update after transaction commits for existing record", async () => {
    const first = await TopicWithCallbacks.find(1);
    addTransactionExecutionBlocks(first);

    await first.saveBang();
    expect(first.history).toEqual(["commit_on_update"]);
  });

  it("only call after commit on destroy after transaction commits for destroyed record", async () => {
    const first = await TopicWithCallbacks.find(1);
    addTransactionExecutionBlocks(first);

    await first.destroy();
    expect(first.history).toEqual(["commit_on_destroy"]);
  });

  it("only call after commit on create after transaction commits for new record if create succeeds creating through association", async () => {
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
    const first = await TopicWithCallbacks.find(1);
    addTransactionExecutionBlocks(first);

    await first.touch();
    expect(first.history).toEqual(["commit_on_update"]);
  });

  it("only call after commit on top level transactions", async () => {
    const first = await TopicWithCallbacks.find(1);
    first.afterCommitBlock(null, (r) => r.history.push("after_commit"));
    assertEmpty(first.history);

    await transaction(TopicWithCallbacks, async () => {
      await transaction(
        TopicWithCallbacks,
        async () => {
          await first.touch();
        },
        { requiresNew: true },
      );
      assertEmpty(first.history);
    });
    expect(first.history).toEqual(["after_commit"]);
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
    const first = new TopicWithCallbacks();
    const second = new TopicWithCallbacks();
    first.afterCommitBlock(null, () => {
      throw new Error("boom");
    });
    second.afterCommitBlock(null, () => {
      throw new Error("boom");
    });

    try {
      await transaction(CanonicalTopic, async () => {
        await first.saveBang();
        expect(first.id).not.toBeNull();
        await second.saveBang();
        expect(second.id).not.toBeNull();
      });
    } catch {}
    expect(first.id).not.toBeNull();
    expect(second.id).not.toBeNull();
    expect(await first.reload()).toBeTruthy();
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
    class Klass extends TopicWithCallbacks {
      static {
        this.inheritanceColumn = null;
        this.validates("title", { presence: true });
      }
    }

    const first = new Klass({ title: "foo" });
    try {
      first.afterCommitBlock(null, async (r) => {
        if (r.isPersisted()) await r.update({ title: null });
      });
      await first.saveBang();

      expect(first.isPersisted()).toBeTruthy();
      expect(first.id).not.toBeNull();
    } finally {
      await first.destroyBang();
    }
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
      if (!(e instanceof ErrorClass)) throw e;
    }
    expect(first.id).toBeNull();
    expect(second.id).toBeNull();
  });
  it("after rollback callbacks should validate on condition", async () => {
    await assertRaise([ArgumentError], {}, () =>
      CanonicalTopic.afterRollback(() => {}, { on: "save" }),
    );
    const e = await assertRaise([ArgumentError], {}, () =>
      CanonicalTopic.afterRollback(() => {}, { on: "destroy_all" }),
    );
    expect(e.message).toMatch(
      /:on conditions for after_commit and after_rollback callbacks have to be one of \[:create, :destroy, :update\]/,
    );
  });

  it("after commit callbacks should validate on condition", async () => {
    await assertRaise([ArgumentError], {}, () =>
      CanonicalTopic.afterCommit(() => {}, { on: "save" }),
    );
    const e = await assertRaise([ArgumentError], {}, () =>
      CanonicalTopic.afterCommit(() => {}, { on: "destroy_all" }),
    );
    expect(e.message).toMatch(
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
    registerModel(Owner);
    registerModel(Pet);
    const pet = (await Pet.first()) as Pet;
    const owner = (await pet.owner) as Owner;
    let flag = false;

    owner.onAfterCommit(() => {
      flag = true;
    });

    pet.writeAttribute("name", "Fluffy the Third");
    await pet.save();

    expect(flag).toBeTruthy();
  });

  it("saving two records that override object id should run after commit callbacks for both", async () => {
    class Klass extends TopicWithCallbacks {}

    const records = [new Klass(), new Klass()];

    await transaction(Klass, async () => {
      for (const record of records) {
        record.afterCommitBlock(null, (r) => r.history.push("after_commit"));
        await record.saveBang();
      }
    });

    expect(records[0].history).toEqual(["after_commit"]);
    expect(records[1].history).toEqual(["after_commit"]);
  });

  it("saving two records that override object id should run after rollback callbacks for both", async () => {
    class Klass extends TopicWithCallbacks {}

    const records = [new Klass(), new Klass()];

    await transaction(Klass, async () => {
      for (const record of records) {
        record.afterRollbackBlock(null, (r) => r.history.push("after_rollback"));
        await record.saveBang();
      }
      throw new Rollback();
    });

    expect(records[0].history).toEqual(["after_rollback"]);
    expect(records[1].history).toEqual(["after_rollback"]);
  });

  it("after commit does not mutate the if options array", async () => {
    const opts: unknown[] = [];

    class Klass extends Base {
      static {
        this._tableName = "topics";
        this.afterCommit(() => {}, { if: opts, on: "create" });
      }
    }
    void Klass;

    assertEmpty(opts);
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
  describe("TransactionAfterCommitCallbacksWithOptimisticLockingTest", () => {
    it("after commit callbacks with optimistic locking", async () => {
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
  });

  describe("CallbacksOnMultipleActionsTest", () => {
    it("after commit on multiple actions", async () => {
      class TopicWithCallbacksOnMultipleActions extends Base {
        history: string[] = [];
        static {
          this._tableName = "topics";
          this.afterCommit((record: any) => record.history.push("create_and_destroy"), {
            on: ["create", "destroy"],
          });
          this.afterCommit((record: any) => record.history.push("create_and_update"), {
            on: ["create", "update"],
          });
          this.afterCommit((record: any) => record.history.push("update_and_destroy"), {
            on: ["update", "destroy"],
          });
        }

        clearHistory() {
          this.history = [];
        }
      }

      const topic = new TopicWithCallbacksOnMultipleActions() as any;
      await topic.save();
      expect(topic.history).toEqual(["create_and_update", "create_and_destroy"]);

      topic.clearHistory();
      topic.approved = true;
      await topic.save();
      expect(topic.history).toEqual(["update_and_destroy", "create_and_update"]);

      topic.clearHistory();
      await topic.destroy();
      expect(topic.history).toEqual(["update_and_destroy", "create_and_destroy"]);
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
          this.beforeCommit((record: any) => record.history.push("before_commit"), {
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
      TopicBC.beforeCommit(async function (record: any) {
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
  });

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
  });

  describe("CallbacksOnDestroyUpdateActionRaceTest", () => {
    const makeTopicWithCallbacksOnDestroy = (history: string[]) =>
      class TopicWithCallbacksOnDestroy extends Base {
        declare title: string;
        declare author_name: string;

        beforeDestroyForTransaction(): void | Promise<void> {}

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.attribute("author_name", "string");
          this.afterCommit(() => history.push("commit_on_destroy"), { on: "destroy" });
          this.afterRollback(() => history.push("rollback_on_destroy"), { on: "destroy" });
          this.beforeDestroy((record: any) => record.beforeDestroyForTransaction());
        }
      };

    const makeTopicWithCallbacksOnUpdate = (history: string[]) =>
      class TopicWithCallbacksOnUpdate extends Base {
        declare title: string;
        declare author_name: string;

        beforeSaveForTransaction(): void | Promise<void> {}

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.attribute("author_name", "string");
          this.afterCommit(() => history.push("commit_on_update"), { on: "update" });
          this.beforeSave((record: any) => record.beforeSaveForTransaction());
        }
      };

    it("trigger once on multiple deletion within transaction", async () => {
      const history: string[] = [];
      const TopicWithCallbacksOnDestroy = makeTopicWithCallbacksOnDestroy(history);
      const topic = new TopicWithCallbacksOnDestroy() as any;
      await topic.save();
      const topicClone = (await TopicWithCallbacksOnDestroy.find(topic.id)) as any;

      topic.beforeDestroyForTransaction = async () => {
        await topicClone.destroy();
      };

      await topic.destroy();

      expect(history).toEqual(["commit_on_destroy"]);
    });

    it("trigger once on multiple deletions", async () => {
      const history: string[] = [];
      const TopicWithCallbacksOnDestroy = makeTopicWithCallbacksOnDestroy(history);
      const topic = new TopicWithCallbacksOnDestroy() as any;
      await topic.save();
      const topicClone = (await TopicWithCallbacksOnDestroy.find(topic.id)) as any;

      await topic.destroy();
      await topic.destroy();
      await topicClone.destroy();

      expect(history).toEqual(["commit_on_destroy"]);
    });

    it("trigger once on multiple deletions in a transaction", async () => {
      const history: string[] = [];
      const TopicWithCallbacksOnDestroy = makeTopicWithCallbacksOnDestroy(history);
      const topic = new TopicWithCallbacksOnDestroy() as any;
      await topic.save();

      await transaction(TopicWithCallbacksOnDestroy, async () => {
        await topic.destroy();
        await topic.destroy();
      });

      expect(history).toEqual(["commit_on_destroy"]);
    });

    it("rollback on multiple deletions", async () => {
      const history: string[] = [];
      const TopicWithCallbacksOnDestroy = makeTopicWithCallbacksOnDestroy(history);
      const topic = new TopicWithCallbacksOnDestroy() as any;
      await topic.save();
      const topicClone = (await TopicWithCallbacksOnDestroy.find(topic.id)) as any;

      topic.beforeDestroyForTransaction = async () => {
        await topicClone.updateBang({ author_name: "Test Author Clone" });
        await topicClone.destroy();
      };

      await transaction(TopicWithCallbacksOnDestroy, async () => {
        await topic.updateBang({ author_name: "Test Author" });
        await topic.destroy();
        throw new Rollback();
      });

      expect(topic.isDestroyed()).toBeFalsy();
      expect(topicClone.isDestroyed()).toBeFalsy();
      expect(topic.attributeChangeToBeSaved("author_name")).toEqual([null, "Test Author"]);
      expect(topicClone.attributeChangeToBeSaved("author_name")).toEqual([
        null,
        "Test Author Clone",
      ]);

      expect(history).toEqual(["rollback_on_destroy"]);
    });

    it("trigger on update where row was deleted", async () => {
      const history: string[] = [];
      const TopicWithCallbacksOnUpdate = makeTopicWithCallbacksOnUpdate(history);
      const topic = new TopicWithCallbacksOnUpdate() as any;
      await topic.save();
      const topicClone = (await TopicWithCallbacksOnUpdate.find(topic.id)) as any;

      topicClone.beforeSaveForTransaction = async () => {
        await topic.destroy();
      };

      topicClone.author_name = "Test Author";
      await topicClone.save();

      expect(history).toEqual([]);
    });
  });

  describe("CallbacksOnActionAndConditionTest", () => {
    it("callback on action with condition", async () => {
      class TopicWithCallbacksOnActionAndCondition extends Base {
        declare title: string;
        declare approved: boolean;
        history: any[] = [];

        runCallback(): boolean {
          this.history.push("run_callback?");
          return true;
        }

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.attribute("approved", "boolean", { default: true });
          this.afterCommit((record: any) => record.history.push("create_or_update"), {
            on: ["create", "update"],
            if: (record: any) => record.runCallback(),
          });
        }
      }

      const topic = new TopicWithCallbacksOnActionAndCondition() as any;
      await topic.save();
      expect(topic.history).toEqual(["run_callback?", "create_or_update"]);

      topic.history = [];
      topic.approved = true;
      await topic.save();
      expect(topic.history).toEqual(["run_callback?", "create_or_update"]);

      topic.history = [];
      await topic.destroy();
      expect(topic.history).toEqual([]);
    });
  });

  describe("CallbacksOnMultipleInstancesInATransactionTest", () => {
    const makeTopicWithTitleHistory = (history: string[], firstSaved: boolean) =>
      class TopicWithTitleHistory extends Base {
        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          (this as any).runCommitCallbacksOnFirstSavedInstancesInTransaction = firstSaved;
          this.afterCreateCommit((record: any) =>
            history.push(`Created (title = ${JSON.stringify(record.title)})`),
          );
          this.afterUpdateCommit((record: any) =>
            history.push(`Updated (title = ${JSON.stringify(record.title)})`),
          );
          this.afterDestroyCommit((record: any) =>
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
  });

  describe("SetCallbackTest", () => {
    it("set callback with on", async () => {
      const history: string[] = [];
      const afterCommitOnUpdate1 = () => history.push("after_commit_on_update_1");
      const afterCommitOnUpdate2 = () => history.push("after_commit_on_update_2");
      class TopicWithCallbacksOnUpdate extends Base {
        declare title: string;

        static {
          this._tableName = "topics";
          this.attribute("title", "string");
          this.afterCommit(afterCommitOnUpdate1, { on: "update" });
          this.afterUpdateCommit(afterCommitOnUpdate2);
        }
      }
      let topic = await TopicWithCallbacksOnUpdate.create({ title: "New topic" });
      assertEmpty(history);

      await topic.update({ title: "Updated topic 1" });
      const expectedHistory = ["after_commit_on_update_2", "after_commit_on_update_1"];
      expect(history).toEqual(expectedHistory);

      TopicWithCallbacksOnUpdate.skipCallback("commit", "after", afterCommitOnUpdate2);
      await topic.update({ title: "Updated topic 2" });
      expectedHistory.push("after_commit_on_update_1");
      expect(history).toEqual(expectedHistory);

      TopicWithCallbacksOnUpdate.setCallback("commit", "after", afterCommitOnUpdate2, {
        on: "update",
      });
      topic = await TopicWithCallbacksOnUpdate.create({ title: "New topic" });
      await topic.update({ title: "Updated topic 3" });
      expectedHistory.push("after_commit_on_update_2");
      expectedHistory.push("after_commit_on_update_1");
      expect(history).toEqual(expectedHistory);
    });
  });
});

describe("hasTransactionalCallbacks regression", () => {
  it("returns true for a model with only beforeCommit callbacks", () => {
    class Widget extends Base {
      declare title: string;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
      }
    }
    Widget.beforeCommit(() => {});
    const w = new Widget({});
    expect(w.hasTransactionalCallbacks()).toBe(true);
  });
});
