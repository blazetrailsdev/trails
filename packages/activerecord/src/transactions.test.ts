/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Ports vendor/rails/activerecord/test/cases/transactions_test.rb onto the
 * canonical schema: the Rails `TransactionTest` drives `Topic`/`Reply`/`Movie`/
 * `Cpk::Book`/`Author` against `fixtures :topics, :developers, :authors,
 * :author_addresses, :posts`. We mirror that with `useHandlerFixtures` on the
 * canonical models. Deliberate-error / connection-eviction / query-counting
 * tests opt out of the per-test fixture transaction via `usesTransaction` so a
 * raised StatementInvalid (or a connection thrown away from the pool) cannot
 * poison transactional-fixtures teardown, exactly as Rails runs these with
 * `use_transactional_tests = false`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { throwAbort } from "@blazetrails/activesupport";
import {
  transaction,
  Rollback,
  afterAllTransactionsCommit,
  registerModel,
  RecordInvalid,
} from "./index.js";

import { adapterType } from "./test-adapter.js";
import { itIfSupports } from "./test-helpers/supports.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Reply, SillyReply, UniqueReply, SillyUniqueReply } from "./test-helpers/models/reply.js";
import { Movie } from "./test-helpers/models/movie.js";
import { CpkBook, CpkOrder, CpkAuthor, CpkChapter } from "./test-helpers/models/cpk.js";
import { Author } from "./test-helpers/models/author.js";
import { Book } from "./test-helpers/models/book.js";
import { Base } from "./base.js";
import { assertQueriesMatch, assertNoQueries } from "./testing/query-assertions.js";
import { captureSql } from "./testing/sql-capture.js";
import { StatementInvalid, RecordNotUnique } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";

const Topic = CanonicalTopic;
// Register the Topic/Reply STI subtree and the Cpk::Book association graph so
// association class resolution (Topic#replies/uniqueReplies/sillyUniqueReplies,
// CpkBook#order/author/chapters) finds them.
for (const klass of [
  Topic,
  Reply,
  SillyReply,
  UniqueReply,
  SillyUniqueReply,
  CpkBook,
  CpkOrder,
  CpkAuthor,
  CpkChapter,
]) {
  registerModel(klass as any);
}

// ==========================================================================
// TransactionCallbacksTests (Ruby module included into TransactionTest)
// + TransactionTest — targets transactions_test.rb
// ==========================================================================
describe("TransactionTest", () => {
  const { topics } = useHandlerFixtures(
    ["topics", "developers", "authors", "authorAddresses", "posts"],
    {
      schema: canonicalSchema,
      usesTransaction: [
        "successful with return outside inner transaction",
        "number of transactions in commit",
        "rollback when commit raises",
        "transactions state from rollback",
        "transactions state from commit",
        "mark transaction state as committed",
        "mark transaction state as rolledback",
        "mark transaction state as nil",
        "rollback on composite key model",
        "restore composite id after rollback",
      ],
    },
  );

  let first: any;
  let second: any;
  beforeEach(async () => {
    first = await Topic.find(1);
    second = await Topic.find(2);
  });

  // ---- TransactionCallbacksTests module ----

  it("transaction open?", async () => {
    expect(Topic.currentTransaction().isClosed()).toBe(true);

    let committedTransaction: any = null;
    await Topic.transaction(async () => {
      expect(Topic.currentTransaction().isOpen()).toBe(true);
      committedTransaction = Topic.currentTransaction();
    });
    expect(committedTransaction.isClosed()).toBe(true);

    let rolledbackTransaction: any = null;
    await expect(
      Topic.transaction(async () => {
        expect(Topic.currentTransaction().isOpen()).toBe(true);
        rolledbackTransaction = Topic.currentTransaction();
        throw new Error("SomeError");
      }),
    ).rejects.toThrow("SomeError");
    expect(rolledbackTransaction.isClosed()).toBe(true);
  });

  it("after all transactions commit", async () => {
    let called = 0;
    afterAllTransactionsCommit(() => {
      called += 1;
    });
    expect(called).toBe(1);

    afterAllTransactionsCommit(() => {
      called += 1;
    });
    expect(called).toBe(2);

    called = 0;
    await Topic.transaction(async () => {
      afterAllTransactionsCommit(() => {
        called += 1;
      });
      expect(called).toBe(0);
    });
    expect(called).toBe(1);

    called = 0;
    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          afterAllTransactionsCommit(() => {
            called += 1;
          });
          expect(called).toBe(0);
        },
        { requiresNew: true },
      );
      expect(called).toBe(0);
    });
    expect(called).toBe(1);

    called = 0;
    await Topic.transaction(async () => {
      afterAllTransactionsCommit(() => {
        called += 1;
      });
      expect(called).toBe(0);
      throw new Rollback();
    });
    expect(called).toBe(0);

    // Invalidating the internal transaction removes it from
    // `all_open_transactions`, so after_all_transactions_commit yields
    // immediately (transactions_test.rb:71).
    called = 0;
    await Topic.transaction(async (tx) => {
      tx._internalTransaction.invalidateBang();
      afterAllTransactionsCommit(() => {
        called += 1;
      });
      expect(called).toBe(1);
    });
    expect(called).toBe(1);
  });

  it.skip("after current transaction commit multidb nested transactions", () => {
    // PERMANENT-SKIP: requires ARUnit2Model secondary DB connection
    // (multi-database setup) — not available in single-database test env.
  });

  it("transaction after commit callback", async () => {
    // Rails' multidb (ARUnit2Model) sub-case is omitted: there is no secondary
    // DB in the single-database test env.
    let called = 0;
    Topic.currentTransaction().afterCommit(() => {
      called += 1;
    });
    expect(called).toBe(1);

    Topic.currentTransaction().afterCommit(() => {
      called += 1;
    });
    expect(called).toBe(2);

    called = 0;
    await Topic.transaction(async () => {
      Topic.currentTransaction().afterCommit(() => {
        called += 1;
      });
      expect(called).toBe(0);
    });
    expect(called).toBe(1);

    called = 0;
    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          Topic.currentTransaction().afterCommit(() => {
            called += 1;
          });
          expect(called).toBe(0);
        },
        { requiresNew: true },
      );
      expect(called).toBe(0);
    });
    expect(called).toBe(1);

    called = 0;
    await Topic.transaction(async () => {
      Topic.currentTransaction().afterCommit(() => {
        called += 1;
      });
      expect(called).toBe(0);
      throw new Rollback();
    });
    expect(called).toBe(0);

    let committedTransaction: any = null;
    await Topic.transaction(async () => {
      committedTransaction = Topic.currentTransaction();
    });
    expect(() => committedTransaction.afterCommit(() => {})).toThrow(
      /Cannot register callbacks on a finalized transaction/,
    );
  });

  it("transaction after rollback callback", async () => {
    let called = 0;
    Topic.currentTransaction().afterRollback(() => {
      called += 1;
    });
    expect(called).toBe(0);

    called = 0;
    await Topic.transaction(async () => {
      Topic.currentTransaction().afterRollback(() => {
        called += 1;
      });
      expect(called).toBe(0);
    });
    expect(called).toBe(0);

    called = 0;
    await Topic.transaction(async () => {
      Topic.currentTransaction().afterRollback(() => {
        called += 1;
      });
      expect(called).toBe(0);
      throw new Rollback();
    });
    expect(called).toBe(1);

    called = 0;
    await Topic.transaction(async () => {
      Topic.currentTransaction().afterRollback(() => {
        called += 1;
      });
      await Topic.transaction(
        async () => {
          throw new Rollback();
        },
        { requiresNew: true },
      );
    });
    expect(called).toBe(0);

    called = 0;
    await Topic.transaction(async () => {
      await Topic.transaction(
        async () => {
          Topic.currentTransaction().afterRollback(() => {
            called += 1;
          });
          throw new Rollback();
        },
        { requiresNew: true },
      );
      expect(called).toBe(1);
    });
    expect(called).toBe(1);

    let committedTransaction: any = null;
    await Topic.transaction(async () => {
      committedTransaction = Topic.currentTransaction();
    });
    expect(() => committedTransaction.afterRollback(() => {})).toThrow(
      /Cannot register callbacks on a finalized transaction/,
    );
  });

  // ---- TransactionTest ----

  it("blank?", async () => {
    expect(Topic.currentTransaction().isBlank()).toBe(true);
    await Topic.transaction(async () => {
      expect(Topic.currentTransaction().isBlank()).toBe(false);
    });
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("rollback dirty changes", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    await transaction(Base, async () => {
      await topic.update({ title: "Ruby on Rails" });
      throw new Rollback();
    });

    expect(topic.changes.title).toEqual(["The Fifth Topic of the day", "Ruby on Rails"]);
  });

  // CONVERGENCE-PENDING (relation-level Relation#transaction): Rails opens the
  // transaction directly on a scoped relation (`Topic.where.not(id:).transaction`)
  // to prove the scope is NOT applied to finds inside. trails' relation
  // delegation guard (`guardBaseMethodDelegation`) throws NotImplementedError for
  // `transaction` on a Relation, so the faithful body can't run yet. Retained
  // verbatim for the un-skip; tracked alongside [[transactions-test-rollback-restores-record-state]].
  it.skip("transaction does not apply default scope", async () => {
    // Regression test for https://github.com/rails/rails/issues/50368
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;
    await (Topic.whereNot({ id: topic.id }) as any).transaction(async () => {
      expect(await Topic.find(topic.id)).not.toBeNull();
    });
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("rollback dirty changes multiple saves", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    await transaction(Base, async () => {
      await topic.update({ title: "Ruby on Rails" });
      await topic.update({ title: "Another Title" });
      throw new Rollback();
    });

    expect(topic.changes.title).toEqual(["The Fifth Topic of the day", "Another Title"]);
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("rollback dirty changes then retry save", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    await transaction(Base, async () => {
      await topic.update({ title: "Ruby on Rails" });
      throw new Rollback();
    });

    const titleChange = ["The Fifth Topic of the day", "Ruby on Rails"];
    expect(topic.changes.title).toEqual(titleChange);

    expect(await topic.save()).toBeTruthy();

    expect(topic.savedChanges.title).toEqual(titleChange);
    expect((await topic.reload()).title).toBe(topic.title);
  });

  it("rollback dirty changes then retry save on new record", async () => {
    const topic = Topic.new({ title: "Ruby on Rails" }) as any;

    await transaction(Base, async () => {
      await topic.save();
      throw new Rollback();
    });

    const titleChange = [null, "Ruby on Rails"];
    expect(topic.changes.title).toEqual(titleChange);

    expect(await topic.save()).toBeTruthy();

    expect(topic.savedChanges.title).toEqual(titleChange);
    expect((await topic.reload()).title).toBe(topic.title);
  });

  it.skip("rollback dirty changes then retry save on new record with autosave association", () => {
    // Autosave collection associations (`author.books << book`) not yet ported.
  });

  it("persisted in a model with custom primary key after failed save", async () => {
    const movie = (await Movie.create({})) as any;
    expect(movie.isPersisted()).toBe(false);
  });

  it("raise after destroy", async () => {
    expect(first.isFrozen()).toBe(false);

    await expect(
      Topic.transaction(async () => {
        await first.destroy();
        expect(first.isFrozen()).toBe(true);
        throw new Error("boom");
      }),
    ).rejects.toThrow();

    expect(first.isFrozen()).toBe(false);
  });

  it("successful", async () => {
    await Topic.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.save();
      await second.save();
    });

    expect(((await Topic.find(1)) as any).approved).toBe(true);
    expect(((await Topic.find(2)) as any).approved).toBe(false);
  });

  it("add to null transaction", async () => {
    const topic = Topic.new() as any;
    await expect(topic.addToTransaction()).resolves.not.toThrow();
  });

  it("successful with return outside inner transaction", async () => {
    let committed = false;
    const connection = (Topic as any).leaseConnection();
    const original = connection.commitDbTransaction.bind(connection);
    const spy = vi.spyOn(connection, "commitDbTransaction").mockImplementation(async () => {
      committed = true;
      return original();
    });

    try {
      // transaction_with_shallow_return: early return from the outer block after
      // an inner requires_new transaction commits.
      await Topic.transaction(async () => {
        await Topic.transaction(
          async () => {
            first.approved = true;
            second.approved = false;
            await first.save();
            await second.save();
          },
          { requiresNew: true },
        );
        return;
      });
      expect(committed).toBe(true);

      expect(((await Topic.find(1)) as any).approved).toBe(true);
      expect(((await Topic.find(2)) as any).approved).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it.skip("deprecation on ruby timeout outside inner transaction", () => {
    // PERMANENT-SKIP: Ruby catch/throw semantics — `catch`/`throw timeout` is
    // non-exceptional control flow; JS has no equivalent, and Timeout is
    // Ruby-stdlib with no Node.js counterpart.
  });

  it("break from transaction commits", async () => {
    await first.transaction(async () => {
      expect(first.approved).toBeFalsy();
      await first.updateBang({ approved: true });
      // early return = Ruby `break` (commit)
      return;
    });

    expect(((await Topic.find(1)) as any).approved).toBe(true);
  });

  it.skip("throw from transaction commits", () => {
    // PERMANENT-SKIP: Ruby-only — catch/throw is non-exceptional control flow
    // that commits the transaction. JS throw is always exceptional and always
    // rolls back. `break from transaction commits` covers the JS equivalent.
  });

  it("return from transaction commits", async () => {
    await first.transaction(async () => {
      expect(first.approved).toBeFalsy();
      await first.updateBang({ approved: true });
      return;
    });

    expect(((await Topic.find(1)) as any).approved).toBe(true);
  });

  it("number of transactions in commit", async () => {
    let num: number | undefined;
    const connection = (Topic as any).leaseConnection();
    const original = connection.commitDbTransaction.bind(connection);
    const spy = vi.spyOn(connection, "commitDbTransaction").mockImplementation(async () => {
      num = connection.transactionManager.openTransactions;
      return original();
    });

    try {
      await Topic.transaction(async () => {
        first.approved = true;
        await first.saveBang();
      });
      expect(num).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });

  it("successful with instance method", async () => {
    await first.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.save();
      await second.save();
    });

    expect(((await Topic.find(1)) as any).approved).toBe(true);
    expect(((await Topic.find(2)) as any).approved).toBe(false);
  });

  it("failing on exception", async () => {
    try {
      await Topic.transaction(async () => {
        first.approved = true;
        second.approved = false;
        await first.save();
        await second.save();
        throw new Error("Bad things!");
      });
    } catch {
      // caught it
    }

    expect(first.approved).toBe(true);
    expect(second.approved).toBe(false);

    expect(((await Topic.find(1)) as any).approved).toBe(false);
    expect(((await Topic.find(2)) as any).approved).toBe(true);
  });

  it("raising exception in callback rollbacks in save", async () => {
    // Rails defines a singleton `after_save_for_transaction` that raises; the
    // canonical Topic afterSave hook dispatches to `afterSaveForTransaction`, so
    // an instance-level override reproduces it.
    first.afterSaveForTransaction = () => {
      throw new Error("Make the transaction rollback");
    };

    first.approved = true;
    await expect(first.save()).rejects.toThrow("Make the transaction rollback");
    expect(((await Topic.find(1)) as any).approved).toBe(false);
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("rolling back in a callback rollbacks before save", async () => {
    first.beforeSaveForTransaction = () => {
      throw new Rollback();
    };
    expect(first.approved).toBeFalsy();

    await Topic.transaction(async () => {
      first.approved = true;
      await first.saveBang();
    });

    expect(((await Topic.find(first.id)) as any).approved).toBeFalsy();
  });

  it("raising exception in nested transaction restore state in save", async () => {
    const topic = Topic.new() as any;
    topic.afterSaveForTransaction = () => {
      throw new Error("Make the transaction rollback");
    };

    await expect(
      Topic.transaction(async () => {
        await topic.save();
      }),
    ).rejects.toThrow("Make the transaction rollback");

    expect(topic.isNewRecord()).toBe(true);
  });

  it("transaction state is cleared when record is persisted", async () => {
    const author = (await Author.createBang({ name: "foo" })) as any;
    author.name = null;
    expect(await author.save()).toBeFalsy();
    expect(author.isNewRecord()).toBe(false);
  });

  it.skip("update should rollback on failure", () => {
    // Autosave collection assignment (`author.update(post_ids: [])`) not yet
    // ported — relies on has_many collection replacement + autosave rollback.
  });

  it.skip("update should rollback on failure!", () => {
    // See "update should rollback on failure" — same autosave collection gap.
  });

  it("cancellation from before destroy rollbacks in destroy", async () => {
    // Rails adds a singleton before_destroy that throws :abort; the canonical
    // Topic beforeDestroy hook dispatches to `beforeDestroyForTransaction`.
    first.beforeDestroyForTransaction = () => {
      throwAbort();
    };
    const status = await first.destroy();
    expect(status).toBeFalsy();
    await first.reload();
    expect(await Topic.find(first.id)).toBeDefined();
  });

  // Rails dynamically defines four cancellation tests for the `validation` and
  // `save` filters (transactions_test.rb:714). Each installs a singleton
  // `before_<filter>_for_transaction` that runs `Book.create` then `throw(:abort)`
  // and asserts BOTH that the dirtied `author_name` reverts AND that the
  // `Book.count` DB side effect is rolled back.
  //
  // CONVERGENCE-PENDING: the DB side effect needs async work (`Book.create`)
  // inside the cancelling before-filter, but trails' `before_validation` runs on
  // the strict-sync validation chain (no awaiting) and the canonical Topic's
  // `before_save_for_transaction` / `before_validation_for_transaction` hook
  // dispatch is invoked synchronously without `await`, so a `Book.create` there
  // cannot be awaited or transactionally rolled back. Faithful Rails bodies are
  // retained for the un-skip; tracked alongside
  // [[transactions-test-rollback-restores-record-state]].
  for (const filter of ["validation", "save"] as const) {
    const hook =
      filter === "validation" ? "beforeValidationForTransaction" : "beforeSaveForTransaction";

    it.skip(`cancellation from before filters rollbacks in ${filter}`, async () => {
      first[hook] = async () => {
        await Book.create({});
        throwAbort();
      };
      const nbooksBeforeSave = await Book.count();
      const originalAuthorName = first.author_name;
      first.author_name += "_this_should_not_end_up_in_the_db";
      const status = await first.save();
      expect(status).toBeFalsy();
      expect((await first.reload()).author_name).toBe(originalAuthorName);
      expect(await Book.count()).toBe(nbooksBeforeSave);
    });

    it.skip(`cancellation from before filters rollbacks in ${filter}!`, async () => {
      first[hook] = async () => {
        await Book.create({});
        throwAbort();
      };
      const nbooksBeforeSave = await Book.count();
      const originalAuthorName = first.author_name;
      first.author_name += "_this_should_not_end_up_in_the_db";

      try {
        await first.saveBang();
      } catch {
        // ActiveRecord::RecordInvalid / RecordNotSaved
      }

      expect((await first.reload()).author_name).toBe(originalAuthorName);
      expect(await Book.count()).toBe(nbooksBeforeSave);
    });
  }

  it("callback rollback in create", async () => {
    class CallbackRollbackTopic extends Topic {}
    (CallbackRollbackTopic.prototype as any).afterCreateForTransaction = function () {
      throw new Error("Make the transaction rollback");
    };
    registerModel(CallbackRollbackTopic as any);

    const newTopic = CallbackRollbackTopic.new({
      title: "A new topic",
      author_name: "Ben",
      author_email_address: "ben@example.com",
      content: "Have a nice day",
      approved: false,
    }) as any;

    const newRecordSnapshot = !newTopic.isPersisted();
    const idSnapshot = newTopic.id;

    // Make sure the second save gets the after_create callback called.
    for (let i = 0; i < 2; i++) {
      newTopic.approved = true;
      await expect(newTopic.save()).rejects.toThrow("Make the transaction rollback");
      expect(!newTopic.isPersisted()).toBe(newRecordSnapshot);
      expect(newTopic.id).toBe(idSnapshot);
    }
  });

  it("callback rollback in create with record invalid exception", async () => {
    class RecordInvalidTopic extends Topic {}
    (RecordInvalidTopic.prototype as any).afterCreateForTransaction = function () {
      throw new RecordInvalid(Author.new() as any);
    };
    registerModel(RecordInvalidTopic as any);

    const newTopic = (await RecordInvalidTopic.create({ title: "A new topic" })) as any;
    expect(newTopic.isPersisted()).toBe(false);
    expect(newTopic.id).toBeNull();
  });

  it("callback rollback in create with rollback exception", async () => {
    class RollbackTopic extends Topic {}
    (RollbackTopic.prototype as any).afterCreateForTransaction = function () {
      throw new Rollback();
    };
    registerModel(RollbackTopic as any);

    const newTopic = (await RollbackTopic.create({ title: "A new topic" })) as any;
    expect(newTopic.isPersisted()).toBe(false);
    expect(newTopic.id).toBeNull();
  });

  it("nested explicit transactions", async () => {
    await Topic.transaction(async () => {
      await Topic.transaction(async () => {
        first.approved = true;
        second.approved = false;
        await first.save();
        await second.save();
      });
    });

    expect(((await Topic.find(1)) as any).approved).toBe(true);
    expect(((await Topic.find(2)) as any).approved).toBe(false);
  });

  it("nested transaction with new transaction applies parent state on rollback", async () => {
    const topicOne = Topic.new({ title: "A new topic" }) as any;
    const topicTwo = Topic.new({ title: "Another new topic" }) as any;

    await Topic.transaction(async () => {
      await topicOne.save();
      await Topic.transaction(
        async () => {
          await topicTwo.save();
          expect(topicOne.isPersisted()).toBe(true);
          expect(topicTwo.isPersisted()).toBe(true);
        },
        { requiresNew: true },
      );
      throw new Rollback();
    });

    expect(topicOne.isPersisted()).toBe(false);
    expect(topicTwo.isPersisted()).toBe(false);
  });

  it("nested transaction without new transaction applies parent state on rollback", async () => {
    const topicOne = Topic.new({ title: "A new topic" }) as any;
    const topicTwo = Topic.new({ title: "Another new topic" }) as any;

    await Topic.transaction(async () => {
      await topicOne.save();
      await Topic.transaction(async () => {
        await topicTwo.save();
        expect(topicOne.isPersisted()).toBe(true);
        expect(topicTwo.isPersisted()).toBe(true);
      });
      throw new Rollback();
    });

    expect(topicOne.isPersisted()).toBe(false);
    expect(topicTwo.isPersisted()).toBe(false);
  });

  it("double nested transaction applies parent state on rollback", async () => {
    const topicOne = Topic.new({ title: "A new topic" }) as any;
    const topicTwo = Topic.new({ title: "Another new topic" }) as any;
    const topicThree = Topic.new({ title: "Another new topic of course" }) as any;

    await Topic.transaction(async () => {
      await topicOne.save();
      await Topic.transaction(async () => {
        await topicTwo.save();
        await Topic.transaction(async () => {
          await topicThree.save();
        });
      });
      expect(topicOne.isPersisted()).toBe(true);
      expect(topicTwo.isPersisted()).toBe(true);
      expect(topicThree.isPersisted()).toBe(true);
      throw new Rollback();
    });

    expect(topicOne.isPersisted()).toBe(false);
    expect(topicTwo.isPersisted()).toBe(false);
    expect(topicThree.isPersisted()).toBe(false);
  });

  it("manually rolling back a transaction", async () => {
    await Topic.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.save();
      await second.save();
      throw new Rollback();
    });

    expect(first.approved).toBe(true);
    expect(second.approved).toBe(false);

    expect(((await Topic.find(1)) as any).approved).toBe(false);
    expect(((await Topic.find(2)) as any).approved).toBe(true);
  });

  it("invalid keys for transaction", async () => {
    await expect(Topic.transaction(async () => {}, { nested: true } as any)).rejects.toThrow(
      ArgumentError,
    );
  });

  itIfSupports("savepoints", "force savepoint in nested transaction", async () => {
    await Topic.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.saveBang();
      await second.saveBang();

      try {
        await Topic.transaction(
          async () => {
            first.approved = false;
            await first.saveBang();
            throw new Error("rollback savepoint");
          },
          { requiresNew: true },
        );
      } catch {
        /* expected */
      }
    });

    expect((await first.reload()).approved).toBe(true);
    expect((await second.reload()).approved).toBe(false);
  });

  itIfSupports("savepoints", "force savepoint on instance", async () => {
    await first.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.saveBang();
      await second.saveBang();

      try {
        await second.transaction(
          async () => {
            first.approved = false;
            await first.saveBang();
            throw new Error("rollback savepoint");
          },
          { requiresNew: true },
        );
      } catch {
        /* expected */
      }
    });

    expect((await first.reload()).approved).toBe(true);
    expect((await second.reload()).approved).toBe(false);
  });

  itIfSupports("savepoints", "no savepoint in nested transaction without force", async () => {
    await Topic.transaction(async () => {
      first.approved = true;
      second.approved = false;
      await first.saveBang();
      await second.saveBang();

      try {
        await Topic.transaction(async () => {
          first.approved = false;
          await first.saveBang();
          throw new Error("rollback inner");
        });
      } catch {
        /* expected */
      }
    });

    expect((await first.reload()).approved).toBe(false);
    expect((await second.reload()).approved).toBe(false);
  });

  itIfSupports("savepoints", "many savepoints", async () => {
    let one: string, two: string, three: string;

    await Topic.transaction(async () => {
      first.content = "One";
      await first.saveBang();

      try {
        await Topic.transaction(
          async () => {
            first.content = "Two";
            await first.saveBang();

            try {
              await Topic.transaction(
                async () => {
                  first.content = "Three";
                  await first.saveBang();

                  try {
                    await Topic.transaction(
                      async () => {
                        first.content = "Four";
                        await first.saveBang();
                        throw new Error("roll back to Three");
                      },
                      { requiresNew: true },
                    );
                  } catch {
                    /* expected */
                  }

                  three = (await first.reload()).content;
                  throw new Error("roll back to Two");
                },
                { requiresNew: true },
              );
            } catch {
              /* expected */
            }

            two = (await first.reload()).content;
            throw new Error("roll back to One");
          },
          { requiresNew: true },
        );
      } catch {
        /* expected */
      }

      one = (await first.reload()).content;
    });

    expect(one!).toBe("One");
    expect(two!).toBe("Two");
    expect(three!).toBe("Three");
  });

  itIfSupports("savepoints", "using named savepoints", async () => {
    const connection = (Topic as any).leaseConnection();
    await Topic.transaction(async () => {
      first.approved = true;
      await first.saveBang();
      await connection.createSavepoint("first");

      first.approved = false;
      await first.saveBang();
      await connection.rollbackToSavepoint("first");
      expect((await first.reload()).approved).toBe(true);

      first.approved = false;
      await first.saveBang();
      await connection.releaseSavepoint("first");
      expect((await first.reload()).approved).toBe(false);
    });
  });

  it("rollback when commit raises", async () => {
    const connection = (Topic as any).leaseConnection();
    const spy = vi.spyOn(connection, "commitDbTransaction").mockImplementation(async () => {
      throw new Error("OH NOES");
    });

    try {
      await expect(
        Topic.transaction(async () => {
          await connection.materializeTransactions();
        }),
      ).rejects.toThrow("OH NOES");
    } finally {
      spy.mockRestore();
    }
  });

  it("rollback when saving a frozen record", async () => {
    const topic = Topic.new({ title: "test" }) as any;
    topic.freeze();
    await expect(topic.save()).rejects.toThrow(/frozen/i);
    expect(topic.isPersisted()).toBe(false);
    expect(topic.id).toBeNull();
    expect(topic.isFrozen()).toBe(true);
  });

  it.skip("rollback when thread killed", () => {
    // PERMANENT-SKIP: Ruby Thread semantics — Thread.kill aborts a thread
    // mid-transaction; JS is single-threaded with no equivalent kill primitive.
  });

  it("restore active record state for all records in a transaction", async () => {
    const topic1 = Topic.new({ title: "test_1" }) as any;
    const topic2 = Topic.new({ title: "test_2" }) as any;

    await Topic.transaction(async () => {
      expect(await topic1.save()).toBeTruthy();
      expect(await topic2.save()).toBeTruthy();
      await first.save();
      await second.destroy();
      expect(topic1.isPersisted()).toBe(true);
      expect(topic1.id).not.toBeNull();
      expect(topic2.isPersisted()).toBe(true);
      expect(topic2.id).not.toBeNull();
      expect(first.isPersisted()).toBe(true);
      expect(first.id).not.toBeNull();
      expect(second.isDestroyed()).toBe(true);
      throw new Rollback();
    });

    expect(topic1.isPersisted()).toBe(false);
    expect(topic1.id).toBeNull();
    expect(topic2.isPersisted()).toBe(false);
    expect(topic2.id).toBeNull();
    expect(first.isPersisted()).toBe(true);
    expect(first.id).not.toBeNull();
    expect(second.isDestroyed()).toBe(false);
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("restore frozen state after double destroy", async () => {
    const topic = (await Topic.create({})) as any;
    const reply = await topic.replies.create({});

    await Topic.transaction(async () => {
      await topic.destroy(); // calls destroy on reply (dependent: destroy)
      await reply.destroy();
      throw new Rollback();
    });

    expect(reply.isFrozen()).toBe(false);
    expect(topic.isFrozen()).toBe(false);
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("restore new record after double save", async () => {
    const topic = Topic.new() as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      await topic.saveBang();
      throw new Rollback();
    });

    expect(topic.id).toBeNull();
    expect(topic.isNewRecord()).toBe(true);
  });

  it("dont restore new record in subsequent transaction", async () => {
    const topic = Topic.new() as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      await topic.saveBang();
    });

    await Topic.transaction(async () => {
      await topic.saveBang();
      throw new Rollback();
    });

    expect(topic.isPersisted()).toBe(true);
    expect(topic.isNewRecord()).toBe(false);
  });

  // CONVERGENCE-PENDING (transactions-test-rollback-restores-record-state): saving a
  // record inside an already-open transaction prematurely finalizes its
  // per-record transaction state, so an outer rollback no longer restores the
  // pre-save dirty changes / new-record / frozen / id snapshot (and a Rollback
  // raised in before_save is swallowed by the save's own transaction). Faithful
  // Rails body retained for the un-skip once the gap is converged.
  it.skip("restore previously new record after double save", async () => {
    const topic = (await Topic.createBang({})) as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      await topic.saveBang();
      throw new Rollback();
    });

    expect(topic.isPreviouslyNewRecord()).toBe(true);
  });

  it("restore composite id after rollback", async () => {
    const book = (await CpkBook.createBang({ id: [1, 2] })) as any;
    expect(book.id).toEqual([1, 2]);

    try {
      await CpkBook.transaction(async () => {
        await book.updateBang({ id: [42, 42] });
        throw new Rollback();
      });

      expect(book.id).toEqual([1, 2]);
    } finally {
      await CpkBook.deleteAll();
    }
  });

  it("rollback on composite key model", async () => {
    try {
      await CpkBook.createBang({ id: [1, 3], title: "Charlotte's Web" });
      const bookTwoUnpersisted = CpkBook.new({ id: [1, 3] }) as any;

      await expect(
        CpkBook.transaction(async () => {
          await bookTwoUnpersisted.saveBang();
        }),
      ).rejects.toThrow(RecordNotUnique);
    } finally {
      await CpkBook.deleteAll();
    }
  });

  it("restore id after rollback", async () => {
    const topic = Topic.new() as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      throw new Rollback();
    });

    expect(topic.id).toBeNull();
  });

  it("restore custom primary key after rollback", async () => {
    const movie = Movie.new({ name: "foo" }) as any;

    await Movie.transaction(async () => {
      await movie.saveBang();
      throw new Rollback();
    });

    expect(movie.movieid).toBeNull();
  });

  it("assign id after rollback", async () => {
    const topic = (await Topic.createBang({})) as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      throw new Rollback();
    });

    topic.id = null;
    expect(topic.id).toBeNull();
  });

  it("assign custom primary key after rollback", async () => {
    const movie = (await Movie.createBang({ name: "foo" })) as any;

    await Movie.transaction(async () => {
      await movie.saveBang();
      throw new Rollback();
    });

    movie.movieid = null;
    expect(movie.movieid).toBeNull();
  });

  it("read attribute after rollback", async () => {
    const topic = Topic.new() as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      throw new Rollback();
    });

    expect(topic.readAttribute("id")).toBeNull();
  });

  it("read attribute with custom primary key after rollback", async () => {
    const movie = Movie.new({ name: "foo" }) as any;

    await Movie.transaction(async () => {
      await movie.saveBang();
      throw new Rollback();
    });

    expect(movie.readAttribute("movieid")).toBeNull();
  });

  it("write attribute after rollback", async () => {
    const topic = (await Topic.createBang({})) as any;

    await Topic.transaction(async () => {
      await topic.saveBang();
      throw new Rollback();
    });

    topic.writeAttribute("id", null);
    expect(topic.id).toBeNull();
  });

  it("write attribute with custom primary key after rollback", async () => {
    const movie = (await Movie.createBang({ name: "foo" })) as any;

    await Movie.transaction(async () => {
      await movie.saveBang();
      throw new Rollback();
    });

    movie.writeAttribute("movieid", null);
    expect(movie.movieid).toBeNull();
  });

  it("rollback of frozen records", async () => {
    const topic = (await Topic.create({})) as any;
    topic.freeze();

    await Topic.transaction(async () => {
      await topic.destroy();
      throw new Rollback();
    });

    expect(topic.isFrozen()).toBe(true);
  });

  it("rollback for freshly persisted records", async () => {
    const topic = (await Topic.create({})) as any;

    await Topic.transaction(async () => {
      await topic.destroy();
      throw new Rollback();
    });

    expect(topic.isPersisted()).toBe(true);
  });

  it("transactions state from rollback", async () => {
    const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
    const connection = (Topic as any).leaseConnection();
    const txn = await new TransactionManager(connection).beginTransaction();

    expect(txn.open).toBe(true);
    expect(txn.state.rolledBack).toBe(false);
    expect(txn.state.committed).toBe(false);

    await txn.rollback();

    expect(txn.state.rolledBack).toBe(true);
    expect(txn.state.committed).toBe(false);
  });

  it("transactions state from commit", async () => {
    const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
    const connection = (Topic as any).leaseConnection();
    const txn = await new TransactionManager(connection).beginTransaction();

    expect(txn.open).toBe(true);
    expect(txn.state.rolledBack).toBe(false);
    expect(txn.state.committed).toBe(false);

    await txn.commit();

    expect(txn.state.rolledBack).toBe(false);
    expect(txn.state.committed).toBe(true);
  });

  it("mark transaction state as committed", async () => {
    const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
    const connection = (Topic as any).leaseConnection();
    const txn = await new TransactionManager(connection).beginTransaction();

    await txn.rollback();

    txn.state.commitBang();
    expect(txn.state.committed).toBe(true);
  });

  it("mark transaction state as rolledback", async () => {
    const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
    const connection = (Topic as any).leaseConnection();
    const txn = await new TransactionManager(connection).beginTransaction();

    await txn.commit();

    txn.state.rollbackBang();
    expect(txn.state.rolledBack).toBe(true);
  });

  it("mark transaction state as nil", async () => {
    const { TransactionManager } = await import("./connection-adapters/abstract/transaction.js");
    const connection = (Topic as any).leaseConnection();
    const txn = await new TransactionManager(connection).beginTransaction();

    await txn.commit();

    // Rails asserts `transaction.state.nullify!` returns nil; nullifyBang()
    // returns void — the TS equivalent of nil.
    expect(txn.state.nullifyBang()).toBeUndefined();
  });
});

// ==========================================================================
// TransactionTest (connection eviction) — Rails removes a connection from the
// pool (`throw_away!`) whenever the outer `within_new_transaction` ensure sees a
// still-incomplete transaction. These run OUTSIDE the shared fixture
// transaction (`usesTransaction`) because evicting the connection mid-test would
// poison transactional-fixtures teardown.
// ==========================================================================
describe("TransactionTest", () => {
  const { topics } = useHandlerFixtures(["topics"], {
    schema: canonicalSchema,
    usesTransaction: [
      "rollback dirty changes even with raise during rollback removes from pool",
      "rollback dirty changes even with raise during rollback doesnt commit transaction",
      "connection removed from pool when commit raises and rollback raises",
      "connection removed from pool when begin raises after successfully beginning a transaction",
    ],
  });

  it("rollback dirty changes even with raise during rollback removes from pool", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    const connection = (Topic as any).leaseConnection();
    const pool = (Topic as any).connectionPool();
    connection.rollbackDbTransaction = async () => {
      throw new Rollback();
    };

    await Topic.transaction(async () => {
      topic.title = "Rails is broken";
      await topic.save();
      throw new Rollback();
    });

    expect(connection.active).toBe(false);
    expect(pool.connections.includes(connection)).toBe(false);
  });

  it("rollback dirty changes even with raise during rollback doesnt commit transaction", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    const connection = (Topic as any).leaseConnection();
    connection.rollbackDbTransaction = async () => {
      throw new Rollback();
    };

    await Topic.transaction(async () => {
      topic.title = "Rails is broken";
      await topic.save();
      throw new Rollback();
    });

    await topic.reload();

    await Topic.transaction(async () => {
      topic.content = "Ruby on Rails - modified";
      await topic.save();
    });

    expect((await topic.reload()).title).toBe("The Fifth Topic of the day");
  });

  it("connection removed from pool when commit raises and rollback raises", async () => {
    const topic = (await Topic.find((topics("fifth") as any).id)) as any;

    const connection = (Topic as any).leaseConnection();
    const pool = (Topic as any).connectionPool();
    connection.transactionManager.commitTransaction = async () => {
      throw new Error("commit failed");
    };
    connection.transactionManager.rollbackTransaction = async () => {
      throw new Error("rollback failed");
    };

    await expect(
      Topic.transaction(async () => {
        topic.title = "Updated title";
        await topic.save();
      }),
    ).rejects.toThrow("rollback failed");

    expect(connection.active).toBe(false);
    expect(pool.connections.includes(connection)).toBe(false);
    expect((await topic.reload()).title).toBe("The Fifth Topic of the day");
  });

  it("connection removed from pool when begin raises after successfully beginning a transaction", async () => {
    const connection = (Topic as any).leaseConnection();
    const pool = (Topic as any).connectionPool();
    await connection.disableLazyTransactionsBang();
    connection.beginDbTransaction = async () => {
      throw new Error("begin failed");
    };

    await expect(Topic.transaction(async () => {})).rejects.toThrow("begin failed");

    expect(connection.active).toBe(false);
    expect(pool.connections.includes(connection)).toBe(false);
  });

  it.skip("connection removed from pool when thread killed in begin after successfully beginning a transaction", () => {
    // PERMANENT-SKIP: Ruby Thread semantics — Thread.kill mid-transaction; JS
    // is single-threaded with no equivalent kill primitive.
  });
});

// ==========================================================================
// TransactionTest (materialization + savepoint-name determinism) — Rails runs
// these against a fresh, empty connection. They count exact query sequences and
// assert savepoint names, so they opt out of the fixture transaction
// (`usesTransaction`) to begin from a clean connection state, and the canonical
// `topics` table is recreated for this describe via `{ schema }`.
// ==========================================================================
describe("TransactionTest", () => {
  useHandlerFixtures(["topics"], {
    schema: canonicalSchema,
    usesTransaction: [
      "savepoints name",
      "releasing named savepoints",
      "empty transaction is not materialized",
      "unprepared statement materializes transaction",
      "nested transactions skip excess savepoints",
      "nested transactions after disable lazy transactions",
      "savepoint does not materialize transaction",
      "raising does not materialize transaction",
      "accessing raw connection materializes transaction",
      "accessing raw connection disables lazy transactions",
      "checking in connection reenables lazy transactions",
      "transactions can be manually materialized",
      "transaction rollback with primarykeyless tables",
      "sqlite add column in transaction",
      "sqlite default transaction mode is immediate",
    ],
  });

  // Several tests below disable lazy transactions on the shared connection;
  // re-enable afterward so later tests in this describe start from the default.
  afterEach(() => {
    (Topic as any).leaseConnection().enableLazyTransactionsBang();
  });

  it("savepoints name", async () => {
    const connection = (Topic as any).leaseConnection();
    await Topic.transaction(async () => {
      await Topic.deleteAll(); // Dirty the transaction to force a savepoint below

      expect(connection.currentSavepointName()).toBeNull();
      expect(connection.currentTransaction().savepointName).toBeNull();

      await Topic.transaction(
        async () => {
          await Topic.deleteAll();

          expect(connection.currentSavepointName()).toBe("active_record_1");
          expect(connection.currentTransaction().savepointName).toBe("active_record_1");

          await Topic.transaction(
            async () => {
              expect(connection.currentSavepointName()).toBe("active_record_2");
              expect(connection.currentTransaction().savepointName).toBe("active_record_2");
            },
            { requiresNew: true },
          );

          expect(connection.currentSavepointName()).toBe("active_record_1");
          expect(connection.currentTransaction().savepointName).toBe("active_record_1");
        },
        { requiresNew: true },
      );
    });
  });

  it("releasing named savepoints", async () => {
    const connection = (Topic as any).leaseConnection();
    await Topic.transaction(async () => {
      await connection.materializeTransactions();

      await connection.createSavepoint("another");
      await connection.releaseSavepoint("another");

      await expect(connection.releaseSavepoint("another")).rejects.toThrow(StatementInvalid);
    });
  });

  it("empty transaction is not materialized", async () => {
    await assertNoQueries(false, async () => {
      await Topic.transaction(async () => {});
    });
  });

  it("unprepared statement materializes transaction", async () => {
    await assertQueriesMatch(/BEGIN|COMMIT/i, undefined, true, async () => {
      await Topic.transaction(async () => {
        await Topic.where("1=1").first();
      });
    });
  });

  it("nested transactions skip excess savepoints", async () => {
    const actualQueries = await captureSql(
      async () => {
        await Topic.transaction(
          async () => {
            await Topic.transaction(
              async () => {
                await Topic.deleteAll();
                await Topic.transaction(
                  async () =>
                    Topic.transaction(async () => Topic.deleteAll(), { requiresNew: true }),
                  { requiresNew: true },
                );
              },
              { requiresNew: true },
            );
            await Topic.deleteAll();
          },
          { requiresNew: true },
        );
      },
      { includeSchema: true },
    );

    const expectedQueries = [
      /BEGIN/i,
      /DELETE/i,
      /^SAVEPOINT/i,
      /DELETE/i,
      /^RELEASE/i,
      /DELETE/i,
      /COMMIT/i,
    ];
    expect(actualQueries).toHaveLength(expectedQueries.length);
    expectedQueries.forEach((expected, i) => expect(actualQueries[i]).toMatch(expected));
  });

  it("nested transactions after disable lazy transactions", async () => {
    const connection = (Topic as any).leaseConnection();
    await connection.disableLazyTransactionsBang();

    const actualQueries = await captureSql(
      async () => {
        await Topic.transaction(
          async () => {
            await Topic.transaction(
              async () => {
                await Topic.deleteAll();
                await Topic.transaction(
                  async () => Topic.transaction(async () => {}, { requiresNew: true }),
                  { requiresNew: true },
                );
              },
              { requiresNew: true },
            );
            await Topic.deleteAll();
          },
          { requiresNew: true },
        );
      },
      { includeSchema: true },
    );

    const expectedQueries = [/BEGIN/i, /DELETE/i, /^SAVEPOINT/i, /^RELEASE/i, /DELETE/i, /COMMIT/i];
    expect(actualQueries).toHaveLength(expectedQueries.length);
    expectedQueries.forEach((expected, i) => expect(actualQueries[i]).toMatch(expected));
  });

  it.skip("prepared statement materializes transaction", () => {
    // Requires prepared_statements-gated query monitoring not modeled here.
  });

  it("savepoint does not materialize transaction", async () => {
    await assertNoQueries(false, async () => {
      await Topic.transaction(async () => {
        await Topic.transaction(async () => {}, { requiresNew: true });
      });
    });
  });

  it("raising does not materialize transaction", async () => {
    await assertNoQueries(false, async () => {
      await expect(
        Topic.transaction(async () => {
          throw new Error("Expected");
        }),
      ).rejects.toThrow("Expected");
    });
  });

  it("accessing raw connection materializes transaction", async () => {
    const connection = (Topic as any).leaseConnection();
    await assertQueriesMatch(/BEGIN|COMMIT/i, undefined, true, async () => {
      await Topic.transaction(async () => {
        await connection.rawConnection();
      });
    });
  });

  it("accessing raw connection disables lazy transactions", async () => {
    const connection = (Topic as any).leaseConnection();
    await connection.rawConnection();
    await assertQueriesMatch(/BEGIN|COMMIT/i, undefined, true, async () => {
      await Topic.transaction(async () => {});
    });
  });

  it("checking in connection reenables lazy transactions", async () => {
    const connection = (Topic as any).leaseConnection();
    await connection.rawConnection();
    // Mirrors `Topic.connection_pool.checkin`: run the `:checkin` callbacks
    // (one of which is enable_lazy_transactions!) around `expire`.
    connection._runCheckinCallbacks(() => {});
    await assertNoQueries(false, async () => {
      await Topic.transaction(async () => {});
    });
  });

  it("transactions can be manually materialized", async () => {
    const connection = (Topic as any).leaseConnection();
    await assertQueriesMatch(/BEGIN|COMMIT/i, undefined, true, async () => {
      await Topic.transaction(async () => {
        await connection.materializeTransactions();
      });
    });
  });

  it("transaction rollback with primarykeyless tables", async () => {
    const connection = Base.connection as any;
    await connection.createTable(
      "transaction_without_primary_keys",
      { force: true, id: false },
      (t: any) => {
        t.integer("thing_id");
      },
    );

    try {
      class K extends Base {
        static {
          this._tableName = "transaction_without_primary_keys";
          this._primaryKey = null as any;
          this.attribute("thing_id", "integer");
          // necessary to trigger the has_transactional_callbacks branch
          this.afterCommit(() => {});
        }
      }
      const before = await K.count();
      await K.transaction(async () => {
        await K.createBang({});
        throw new Rollback();
      });
      expect(await K.count()).toBe(before);
    } finally {
      await connection.dropTable("transaction_without_primary_keys", { ifExists: true });
    }
  });

  it.skipIf(adapterType !== "sqlite")("sqlite add column in transaction", async () => {
    const connection = (Topic as any).leaseConnection();
    try {
      (Topic as any).resetColumnInformation();
      await connection.addColumn("topics", "stuff", "string");
      expect((await connection.columns("topics")).map((c: any) => c.name)).toContain("stuff");

      (Topic as any).resetColumnInformation();
      await connection.removeColumn("topics", "stuff");
      expect((await connection.columns("topics")).map((c: any) => c.name)).not.toContain("stuff");

      // SQLite supports DDL transactions, so add_column inside a transaction
      // must not raise.
      await Topic.transaction(async () => {
        await connection.addColumn("topics", "stuff", "string");
      });
      expect((await connection.columns("topics")).map((c: any) => c.name)).toContain("stuff");
    } finally {
      try {
        await connection.removeColumn("topics", "stuff");
      } catch {
        /* already removed */
      }
      (Topic as any).resetColumnInformation();
    }
  });

  it.skipIf(adapterType !== "sqlite")("sqlite default transaction mode is immediate", async () => {
    const connection = (Topic as any).leaseConnection();
    await assertQueriesMatch(/BEGIN IMMEDIATE TRANSACTION/i, undefined, false, async () => {
      await Topic.transaction(async () => {
        await connection.materializeTransactions();
      });
    });
  });
});

// ==========================================================================
// TransactionsWithTransactionalFixturesTest — from transactions_test.rb
// ==========================================================================
describe("TransactionsWithTransactionalFixturesTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  itIfSupports("savepoints", "automatic savepoint in outer transaction", async () => {
    const first = (await Topic.find(1)) as any;

    try {
      await Topic.transaction(async () => {
        first.approved = true;
        await first.saveBang();
        throw new Error("boom");
      });
    } catch {
      expect((await first.reload()).approved).toBeFalsy();
    }
  });

  itIfSupports("savepoints", "no automatic savepoint for inner transaction", async () => {
    const first = (await Topic.find(1)) as any;

    await Topic.transaction(async () => {
      first.approved = true;
      await first.saveBang();

      try {
        await Topic.transaction(async () => {
          first.approved = false;
          await first.saveBang();
          throw new Error("boom");
        });
      } catch {
        /* expected */
      }
    });

    expect((await first.reload()).approved).toBeFalsy();
  });
});

// ==========================================================================
// TransactionUUIDTest — from transactions_test.rb
// ==========================================================================
describe("TransactionUUIDTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("the uuid is lazily computed", async () => {
    await Topic.transaction(async () => {
      const txn = Topic.currentTransaction();
      expect((txn as any)._uuid).toBeNull();
    });
  });

  it("the uuid for regular transactions is generated and memoized", async () => {
    await Topic.transaction(async () => {
      const txn = Topic.currentTransaction();
      const uuid = txn.uuid();
      expect(uuid).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
      expect(txn.uuid()).toBe(uuid);
    });
  });

  it("the uuid for null transactions is nil", async () => {
    const { Transaction } = await import("./transaction.js");
    expect(Transaction.NULL_TRANSACTION.uuid()).toBeNull();
  });
});

// ==========================================================================
// ConcurrentTransactionTest — from transactions_test.rb
// ==========================================================================
describe("ConcurrentTransactionTest", () => {
  it.skip("transaction per thread", () => {
    // PERMANENT-SKIP: Ruby Thread semantics — spawns threads asserting
    // per-thread transaction isolation; JS is single-threaded.
  });
  it.skip("transaction isolation  read committed", () => {
    // PERMANENT-SKIP: Ruby Thread semantics — uses Thread.new to assert
    // READ COMMITTED isolation across concurrent threads; JS is single-threaded.
  });
});

// ==========================================================================
// trails-extra: a block-arg `tx.afterCommit(...)` registered inside an explicit
// transaction fires once the transaction commits (no direct Rails counterpart;
// guards the standalone `transaction(Model, (tx) => ...)` callback wiring).
// ==========================================================================
describe("TransactionTest", () => {
  useHandlerFixtures(["topics"], { schema: canonicalSchema });

  it("call after commit after transaction commits", async () => {
    const log: string[] = [];

    await transaction(Topic, async (tx) => {
      tx.afterCommit(() => {
        log.push("committed");
      });
      await Topic.create({ title: "Alice" });
    });

    expect(log).toEqual(["committed"]);
  });
});
