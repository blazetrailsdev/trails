/**
 * Trails-only coverage for the `dependent: :destroy_async` arm on the three
 * association bodies — `BelongsToAssociation#handle_dependency`
 * (belongs_to_association.rb:14-35), `HasManyAssociation#handle_dependency`
 * (has_many_association.rb:30-55) and `HasOneAssociation#delete`
 * (has_one_association.rb:34-51).
 *
 * Rails asserts the arm end-to-end through ActiveJob
 * (activejob/destroy_association_async_test.rb), which needs the ActiveJob test
 * helpers trails has not ported; these cases assert the same thing one layer
 * down — the payload `enqueue_destroy_association` parks on the owner's
 * `_after_commit_jobs` (association.rb:398-404).
 */
import { describe, it, expect } from "vitest";
import { registerConstant, unregisterConstant } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";

class DestroyAsyncTestJob {}
registerConstant("DestroyAsyncTestJob", DestroyAsyncTestJob);

class AsyncBook extends Base {
  static _tableName = "books";
  static {
    this.destroyAssociationAsyncJob("DestroyAsyncTestJob");
    this.hasMany("essays", {
      dependent: "destroyAsync",
      className: "AsyncEssay",
      foreignKey: "book_id",
    });
    this.hasOne("content", {
      dependent: "destroyAsync",
      className: "AsyncContent",
      foreignKey: "book_id",
    });
  }
}

class AsyncEssay extends Base {
  static _tableName = "essays";
  static {
    this.destroyAssociationAsyncJob("DestroyAsyncTestJob");
    this.belongsTo("book", { dependent: "destroyAsync", className: "AsyncBook" });
  }
}

class AsyncContent extends Base {
  static _tableName = "content";
}

function jobsFor(record: Base): Array<[unknown, Record<string, unknown>]> {
  return (
    (record as unknown as { _afterCommitJobs?: Array<[unknown, Record<string, unknown>]> })
      ._afterCommitJobs ?? []
  );
}

describe("destroy_async dependent arm", () => {
  fixtures([]);

  registerModel(AsyncBook);
  registerModel(AsyncEssay);
  registerModel(AsyncContent);

  it("belongs_to enqueues the owner's foreign key as the association id", async () => {
    const book = await AsyncBook.create({ name: "Der be treasure" });
    const essay = await AsyncEssay.create({ name: "essay", book_id: book.id });

    await essay.destroy();

    const jobs = jobsFor(essay);
    expect(jobs.length).toBe(1);
    expect(jobs[0][0]).toBe(DestroyAsyncTestJob);
    expect(jobs[0][1]).toEqual({
      ownerModelName: "AsyncEssay",
      ownerId: essay.id,
      associationClass: "AsyncBook",
      associationIds: [book.id],
      associationPrimaryKeyColumn: "id",
      ensuringOwnerWasMethod: null,
    });
  });

  it("has_many enqueues every target id in one batch", async () => {
    const book = await AsyncBook.create({ name: "Der be rum" });
    const one = await AsyncEssay.create({ name: "one", book_id: book.id });
    const two = await AsyncEssay.create({ name: "two", book_id: book.id });

    await book.destroy();

    const jobs = jobsFor(book).filter((j) => j[1].associationClass === "AsyncEssay");
    expect(jobs.length).toBe(1);
    expect(jobs[0][1].associationIds).toEqual([one.id, two.id]);
    expect(jobs[0][1].associationPrimaryKeyColumn).toBe("id");
  });

  it("has_one enqueues the target id", async () => {
    const book = await AsyncBook.create({ name: "Der be maps" });
    const content = await AsyncContent.create({ title: "c" });
    await (
      content as unknown as { updateColumns(a: Record<string, unknown>): Promise<void> }
    ).updateColumns({
      book_id: book.id,
    });

    await book.destroy();

    const jobs = jobsFor(book).filter((j) => j[1].associationClass === "AsyncContent");
    expect(jobs.length).toBe(1);
    expect(jobs[0][1].associationIds).toEqual([content.id]);
  });
});

unregisterConstant("DestroyAsyncTestJob", DestroyAsyncTestJob);
