/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/update_all_test.rb
 */
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { instant } from "@blazetrails/activesupport/testing/temporal-helpers";
import { ArgumentError } from "@blazetrails/activemodel";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Person } from "../test-helpers/models/person.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Post } from "../test-helpers/models/post.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Toy } from "../test-helpers/models/toy.js";
import { WarehouseThing } from "../test-helpers/models/warehouse-thing.js";
import { CpkOrder, CpkOrderAgreement } from "../test-helpers/models/cpk.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { StaleObjectError } from "../errors.js";
import { initializeAssociations, registerModel } from "../associations.js";

beforeAll(async () => {
  await initializeAssociations();
});

for (const klass of [
  Author,
  Post,
  Pet,
  Toy,
  Tag,
  Tagging,
  Comment,
  Developer,
  Person,
  Topic,
  Category,
  Categorization,
  CpkOrder,
  CpkOrderAgreement,
]) {
  registerModel(klass as any);
}

function epochMs(v: unknown): number {
  if (v instanceof Temporal.Instant) return v.epochMilliseconds;
  if (v instanceof Temporal.PlainDateTime)
    return v.toZonedDateTime("UTC").toInstant().epochMilliseconds;
  throw new TypeError(`epochMs: unsupported type ${(v as object)?.constructor?.name}`);
}

// ==========================================================================
// UpdateAllTest — targets relation/update_all_test.rb
// ==========================================================================
describe("UpdateAllTest", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const {
    authors,
    tags,
    posts,
    pets,
    developers,
    people,
    comments,
    warehouseThings,
    cpkOrderAgreements,
  } = useHandlerFixtures(
    [
      "authors",
      "authorAddresses",
      "comments",
      "developers",
      "posts",
      "people",
      "pets",
      "toys",
      "tags",
      "taggings",
      "warehouseThings",
      "cpkOrders",
      "cpkOrderAgreements",
    ],
    { schema: canonicalSchema },
  );

  it("update all with scope", async () => {
    const tag = tags("general");
    await Post.taggedWith(tag.id as number).updateAll({ title: "rofl" });
    const taggedPosts = await Post.taggedWith(tag.id as number).toArray();
    expect(taggedPosts.length).toBeGreaterThan(0);
    taggedPosts.forEach((post: any) => expect(post.title).toBe("rofl"));
  });

  it("update all with non standard table name", async () => {
    expect(await WarehouseThing.where({ id: 1 }).updateAll({ value: 0 })).toBe(1);
    expect(((await WarehouseThing.find(1)) as any).value).toBe(0);
  });

  it("update all with blank argument", async () => {
    const error = await Comment.updateAll({} as any).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArgumentError);
    expect((error as Error).message).toBe("Empty list of attributes to change");
  });

  it("update all with group by", async () => {
    const minimumCommentsCount = 2;
    await Post.mostCommented(minimumCommentsCount).updateAll({ title: "ig" });
    const updatedPosts = await Post.mostCommented(minimumCommentsCount).toArray();
    expect(updatedPosts.length).toBeGreaterThan(0);
    updatedPosts.forEach((post: any) => expect(post.title).toBe("ig"));

    const nonUpdated = await Post.joins("comments")
      .group("posts.id")
      .having(`count(comments.id) < ${minimumCommentsCount}`)
      .first();
    expect((nonUpdated as any)?.title).not.toBe("ig");
  });

  it("update all with joins", async () => {
    const petsScope = Pet.joins("toys").where({ toys: { name: "Bone" } });

    expect(await petsScope.exists()).toBe(true);
    const countBefore = await petsScope.count();
    expect(await petsScope.updateAll({ name: "Bob" })).toBe(countBefore);
  });

  it("update all with left joins", async () => {
    const petsScope = Pet.leftJoins("toys").where({ toys: { name: "Bone" } });

    expect(await petsScope.exists()).toBe(true);
    const countBefore = await petsScope.count();
    expect(await petsScope.updateAll({ name: "Bob" })).toBe(countBefore);
  });

  // TRACKED DEVIATION: includes + where referencing included table should switch to JOIN strategy.
  // Trails `includes` does a separate SELECT so toys.name is not available in the WHERE clause.
  it.skip("update all with includes", async () => {
    const petsScope = Pet.includes("toys").where({ toys: { name: "Bone" } });

    expect(await petsScope.exists()).toBe(true);
    const countBefore = await petsScope.count();
    expect(await petsScope.updateAll({ name: "Bob" })).toBe(countBefore);
  });

  it("update all with joins and limit and order", async () => {
    const welcomePost = posts("welcome");
    const thinkingPost = posts("thinking");
    const greetingsComment = comments("greetings");
    const moreGreetingsComment = comments("more_greetings");

    const commentsScope = Comment.joins("post")
      .where({ "posts.id": welcomePost.id })
      .order("comments.id")
      .limit(1);
    expect(await commentsScope.count()).toBe(1);
    expect(await commentsScope.updateAll({ post_id: thinkingPost.id })).toBe(1);

    await greetingsComment.reload();
    await moreGreetingsComment.reload();
    expect(greetingsComment.post_id).toBe(Number(thinkingPost.id));
    expect(moreGreetingsComment.post_id).toBe(Number(welcomePost.id));
  });

  it("update all with joins and offset and order", async () => {
    const welcomePost = posts("welcome");
    const thinkingPost = posts("thinking");
    const greetingsComment = comments("greetings");
    const moreGreetingsComment = comments("more_greetings");

    const commentsScope = Comment.joins("post")
      .where({ "posts.id": welcomePost.id })
      .order("comments.id")
      .offset(1);
    expect(await commentsScope.count()).toBe(1);
    expect(await commentsScope.updateAll({ post_id: thinkingPost.id })).toBe(1);

    await moreGreetingsComment.reload();
    await greetingsComment.reload();
    expect(moreGreetingsComment.post_id).toBe(Number(thinkingPost.id));
    expect(greetingsComment.post_id).toBe(Number(welcomePost.id));
  });

  it("update counters with joins", async () => {
    const parrot = pets("parrot");
    expect(parrot.integer).toBeFalsy();

    await Pet.joins("toys")
      .where({ toys: { name: "Bone" } })
      .updateCounters({ integer: 1 });

    await parrot.reload();
    expect(parrot.integer).toBe(1);
  });

  it("touch all updates records timestamps", async () => {
    const david = developers("david");
    const davidPreviouslyUpdatedAt = david.legacy_updated_at;
    const jamis = developers("jamis");
    const jamisPreviouslyUpdatedAt = jamis.legacy_updated_at;
    vi.useFakeTimers({ now: Date.now() + 5000 });
    await Developer.where({ name: "David" }).touchAll();
    vi.useRealTimers();

    await david.reload();
    await jamis.reload();
    expect(epochMs(david.legacy_updated_at)).not.toBe(epochMs(davidPreviouslyUpdatedAt));
    expect(epochMs(jamis.legacy_updated_at)).toBe(epochMs(jamisPreviouslyUpdatedAt));
  });

  it("touch all with custom timestamp", async () => {
    const developer = developers("david");
    const previouslyCreatedAt = developer.legacy_created_at;
    const previouslyUpdatedAt = developer.legacy_updated_at;
    vi.useFakeTimers({ now: Date.now() + 5000 });
    await Developer.where({ name: "David" }).touchAll("created_at");
    vi.useRealTimers();
    await developer.reload();

    expect(epochMs(developer.legacy_created_at)).not.toBe(epochMs(previouslyCreatedAt));
    expect(epochMs(developer.legacy_updated_at)).not.toBe(epochMs(previouslyUpdatedAt));
  });

  it("touch all with aliased for update timestamp", async () => {
    expect(Object.keys((Developer as any)._attributeAliases ?? {})).toContain("updated_at");

    const developer = developers("david");
    const previouslyCreatedAt = developer.legacy_created_at;
    const previouslyUpdatedAt = developer.legacy_updated_at;
    vi.useFakeTimers({ now: Date.now() + 5000 });
    await Developer.where({ name: "David" }).touchAll("updated_at");
    vi.useRealTimers();
    await developer.reload();

    expect(epochMs(developer.legacy_created_at)).toBe(epochMs(previouslyCreatedAt));
    expect(epochMs(developer.legacy_updated_at)).not.toBe(epochMs(previouslyUpdatedAt));
  });

  it("touch all with given time", async () => {
    const developer = developers("david");
    const previouslyCreatedAt = developer.legacy_created_at;
    const previouslyUpdatedAt = developer.legacy_updated_at;
    const newTime = instant("2015-02-16T04:54:00Z");
    vi.useFakeTimers({ now: newTime.epochMilliseconds });
    await Developer.where({ name: "David" }).touchAll("created_at");
    vi.useRealTimers();
    await developer.reload();

    expect(epochMs(developer.legacy_created_at)).not.toBe(epochMs(previouslyCreatedAt));
    expect(epochMs(developer.legacy_updated_at)).not.toBe(epochMs(previouslyUpdatedAt));
    expect(epochMs(developer.legacy_created_at)).toBe(newTime.epochMilliseconds);
    expect(epochMs(developer.legacy_updated_at)).toBe(newTime.epochMilliseconds);
  });

  it("update on relation", async () => {
    class TopicWithCallbacks extends Topic {
      static topicCount: number;

      static {
        this.beforeUpdate(function (this: TopicWithCallbacks) {
          if (!(this as any).author_name) (this as any).author_name = "David";
        });
        this.afterUpdate(async function () {
          TopicWithCallbacks.topicCount = (await TopicWithCallbacks.count()) as number;
        });
      }
    }
    registerModel(TopicWithCallbacks);

    const topic1 = await TopicWithCallbacks.createBang({ title: "arel", author_name: null });
    const topic2 = await TopicWithCallbacks.createBang({
      title: "activerecord",
      author_name: null,
    });
    const topicsScope = TopicWithCallbacks.where({ id: [topic1.id, topic2.id] });
    await topicsScope.update({ title: "adequaterecord" });

    expect(TopicWithCallbacks.topicCount).toBe(await TopicWithCallbacks.count());

    await topic1.reload();
    await topic2.reload();
    expect(topic1.title).toBe("adequaterecord");
    expect(topic2.title).toBe("adequaterecord");
    // before_update set author_name = "David" when blank
    expect(topic1.author_name).toBe("David");
    expect(topic2.author_name).toBe("David");
  });

  it("update with ids on relation", async () => {
    class TopicWithCallbacks extends Topic {
      static topicCount: number;

      static {
        this.beforeUpdate(function (this: TopicWithCallbacks) {
          if (!(this as any).author_name) (this as any).author_name = "David";
        });
        this.afterUpdate(async function () {
          TopicWithCallbacks.topicCount = (await TopicWithCallbacks.count()) as number;
        });
      }
    }
    registerModel(TopicWithCallbacks);

    const topic1 = await TopicWithCallbacks.createBang({ title: "arel", author_name: null });
    const topic2 = await TopicWithCallbacks.createBang({
      title: "activerecord",
      author_name: null,
    });
    // Rails: `topics = TopicWithCallbacks.none; topics.update([id1, id2], [attrs1, attrs2])`
    // Trails: use class-level update which also runs callbacks
    await TopicWithCallbacks.update(
      [topic1.id, topic2.id],
      [{ title: "adequaterecord" }, { title: "adequaterecord" }],
    );

    expect(TopicWithCallbacks.topicCount).toBe(await TopicWithCallbacks.count());

    await topic1.reload();
    await topic2.reload();
    expect(topic1.title).toBe("adequaterecord");
    expect(topic2.title).toBe("adequaterecord");
    expect(topic1.author_name).toBe("David");
    expect(topic2.author_name).toBe("David");
  });

  it("update on relation passing active record object is not permitted", async () => {
    const topic = await Topic.createBang({ title: "Foo", author_name: null });
    await expect(
      Topic.where({ id: topic.id }).update(topic as any, { title: "Bar" } as any),
    ).rejects.toThrow(ArgumentError);
  });

  it("update bang on relation", async () => {
    class TopicWithCallbacks extends Topic {
      static topicCount: number;

      static {
        this.beforeUpdate(function (this: TopicWithCallbacks) {
          if (!(this as any).author_name) (this as any).author_name = "David";
        });
        this.afterUpdate(async function () {
          TopicWithCallbacks.topicCount = (await TopicWithCallbacks.count()) as number;
        });
      }
    }
    registerModel(TopicWithCallbacks);

    const topic1 = await TopicWithCallbacks.createBang({ title: "arel", author_name: null });
    const topic2 = await TopicWithCallbacks.createBang({
      title: "activerecord",
      author_name: null,
    });
    const topic3 = await TopicWithCallbacks.createBang({ title: "ar", author_name: null });
    const topicsScope = TopicWithCallbacks.where({ id: [topic1.id, topic2.id] });
    await topicsScope.updateBang({ title: "adequaterecord" });

    expect(TopicWithCallbacks.topicCount).toBe(await TopicWithCallbacks.count());

    await topic1.reload();
    await topic2.reload();
    await topic3.reload();
    expect(topic1.title).toBe("adequaterecord");
    expect(topic2.title).toBe("adequaterecord");
    expect(topic3.title).toBe("ar");
    expect(topic1.author_name).toBe("David");
    expect(topic2.author_name).toBe("David");
    expect(topic3.author_name).toBeNull();
  });

  it("update all cares about optimistic locking", async () => {
    const david = people("david");

    const now = instant("2015-01-01T12:00:00Z");
    expect(epochMs(david.updated_at)).not.toBe(now.epochMilliseconds);

    const pplScope = Person.where({ id: [people("michael").id, david.id, people("susan").id] });
    const expected = ((await pplScope.pluck("lock_version")) as number[]).map((v) => v + 1);
    await pplScope.updateAll({ updated_at: now });

    const updatedAts = await pplScope.pluck("updated_at");
    updatedAts.forEach((ts) => expect(epochMs(ts as any)).toBe(now.epochMilliseconds));
    expect(await pplScope.pluck("lock_version")).toEqual(expected);

    await expect(david.touch({ time: now })).rejects.toThrow(StaleObjectError);
  });

  // TRACKED DEVIATION: updateCounters({ touch: { time: now } }) is the Rails API for
  // "touch all with a specific time and no counter updates". Trails updateCounters does not
  // support the `touch: { time: }` hash shorthand (only `touch: boolean | string | string[]`).
  it.skip("update counters cares about optimistic locking", async () => {
    const david = people("david");

    const now = instant("2015-01-01T12:00:00Z");
    expect(epochMs(david.updated_at)).not.toBe(now.epochMilliseconds);

    const pplScope = Person.where({ id: [people("michael").id, david.id, people("susan").id] });
    const expected = ((await pplScope.pluck("lock_version")) as number[]).map((v) => v + 1);
    await pplScope.updateCounters({ touch: { time: now } } as any);

    expect(await pplScope.pluck("lock_version")).toEqual(expected);

    await expect(david.touch({ time: now })).rejects.toThrow(StaleObjectError);
  });

  it("touch all cares about optimistic locking", async () => {
    const david = people("david");

    const now = instant("2015-01-01T12:00:00Z");
    expect(epochMs(david.updated_at)).not.toBe(now.epochMilliseconds);

    const pplScope = Person.where({ id: [people("michael").id, david.id, people("susan").id] });
    const expected = ((await pplScope.pluck("lock_version")) as number[]).map((v) => v + 1);

    vi.useFakeTimers({ now: now.epochMilliseconds });
    await pplScope.touchAll();
    vi.useRealTimers();

    const updatedAts = await pplScope.pluck("updated_at");
    updatedAts.forEach((ts) => expect(epochMs(ts as any)).toBe(now.epochMilliseconds));
    expect(await pplScope.pluck("lock_version")).toEqual(expected);

    await expect(david.touch({ time: now })).rejects.toThrow(StaleObjectError);
  });

  it("klass level update all", async () => {
    const now = instant("2015-01-01T12:00:00Z");

    for (const person of await Person.all().toArray()) {
      expect(epochMs((person as any).updated_at)).not.toBe(now.epochMilliseconds);
    }

    await Person.updateAll({ updated_at: now });

    for (const person of await Person.all().toArray()) {
      expect(epochMs((person as any).updated_at)).toBe(now.epochMilliseconds);
    }
  });

  it("klass level touch all", async () => {
    const now = instant("2015-01-01T12:00:00Z");

    for (const person of await Person.all().toArray()) {
      expect(epochMs((person as any).updated_at)).not.toBe(now.epochMilliseconds);
    }

    vi.useFakeTimers({ now: now.epochMilliseconds });
    await Person.touchAll();
    vi.useRealTimers();

    for (const person of await Person.all().toArray()) {
      expect(epochMs((person as any).updated_at)).toBe(now.epochMilliseconds);
    }
  });

  // TRACKED DEVIATION: JoinDependency cannot build a join for CpkOrder.hasMany("orderAgreements")
  // (composite primary key model + single-column FK association). Skipped pending CPK join support.
  it.skip("update all composite model with join subquery", async () => {
    const agreement = cpkOrderAgreements("order_agreement_three");
    const joinScope = CpkOrder.joins("orderAgreements").where({
      cpk_order_agreements: { signature: agreement.signature },
    });
    expect(await joinScope.updateAll({ status: "shipped" })).toBe(1);
  });

  // TRACKED DEVIATION: updateAll on an association scope that includes("comments", "categories")
  // generates malformed SQL (`no such column: 0`). Rails strips the ORDER clause and uses a
  // subselect strategy; the trails path fails when includes + order are combined with updateAll.
  it.skip("update all ignores order without limit from association", async () => {
    const david = await Author.find(1);
    const postsWithCats = await (david as any).postsWithCommentsAndCategories.toArray();
    expect(postsWithCats.length).toBeGreaterThan(0);
    const count = await (david as any).postsWithCommentsAndCategories.updateAll([
      "body = ?",
      "bulk update!",
    ]);
    expect(count).toBe(postsWithCats.length);
  });

  // TRACKED DEVIATION: Relation#updateAll only accepts Record<string, unknown>; Rails also
  // supports raw SQL strings ("id = id + 1") to trigger PK-collision tests for order semantics.
  it.skip("update all doesnt ignore order", async () => {
    const david = authors("david");
    const mary = authors("mary");
    expect(mary.id).toBe((david.id as number) + 1);

    try {
      await (Author.order("id DESC").updateAll as any)("id = id + 1");
    } catch {
      return;
    }
    await expect((Author.order("id ASC").updateAll as any)("id = id + 1")).rejects.toThrow();
  });
});
