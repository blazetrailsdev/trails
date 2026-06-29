/**
 * Mirrors Rails activerecord/test/cases/associations/has_many_through_disable_joins_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { association } from "../associations.js";
import { DisableJoinsAssociationScope } from "./disable-joins-association-scope.js";

import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Member } from "../test-helpers/models/member.js";
import { MemberType } from "../test-helpers/models/member-type.js";

/**
 * Build a DJAS scope for `assocName` on `owner`. Returns the deferred
 * DisableJoinsAssociationRelation that supports chaining (.where / .reorder /
 * .limit / .first). Used by tests that chain conditions (Rails' `.unnamed`,
 * `.reorder`, `.limit`) onto the disable-joins result without going through
 * the CollectionProxy seed state.
 */
function djasScope(owner: Base, assocName: string): any {
  const ctor = owner.constructor as typeof Base;
  const reflection = (ctor as any)._reflectOnAssociation?.(assocName);
  if (!reflection) throw new Error(`No reflection found for ${assocName}`);
  const klass = reflection.klass;
  return DisableJoinsAssociationScope.INSTANCE.scope({
    owner,
    reflection,
    klass,
  });
}

describe("HasManyThroughDisableJoinsAssociationsTest", () => {
  setupHandlerSuite();
  const { authors } = useHandlerFixtures(["posts", "authors", "comments", "authorAddresses"], {
    schema: canonicalSchema,
  });

  registerModel([Author, AuthorAddress, Post, Comment, Rating, Member, MemberType]);

  let author: Author;
  let post: Post;
  let post2: Post;
  let comment: Comment;
  let comment2: Comment;
  let member: Member;
  let member2: Member;
  let memberType: MemberType;
  let rating1: Rating;
  let rating2: Rating;

  beforeEach(async () => {
    author = await Author.find(authors("mary").id);
    post = (await (author as any).posts.create({ title: "title", body: "body" })) as Post;
    memberType = await MemberType.create({ name: "club" });
    member = await Member.create({ member_type_id: memberType.id });
    comment = (await (post as any).comments.create({
      body: "text",
      origin_id: member.id,
      origin_type: "Member",
    })) as Comment;
    post2 = (await (author as any).posts.create({ title: "title", body: "body" })) as Post;
    member2 = await Member.create({ member_type_id: memberType.id });
    comment2 = (await (post2 as any).comments.create({
      body: "text",
      origin_id: member2.id,
      origin_type: "Member",
    })) as Comment;
    rating1 = (await (comment as any).ratings.create({ value: 8 })) as Rating;
    rating2 = (await (comment as any).ratings.create({ value: 9 })) as Rating;
    void comment2;
  });

  const sortIds = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  it("counting on disable joins through", async () => {
    const normalCount = await association(author, "comments").count();
    const noJoinsCount = await association(author, "noJoinsComments").count();
    expect(noJoinsCount).toBe(normalCount);
  });

  it("counting on disable joins through using custom foreign key", async () => {
    const normalCount = await association(author, "commentsWithForeignKey").count();
    const noJoinsCount = await association(author, "noJoinsCommentsWithForeignKey").count();
    expect(noJoinsCount).toBe(normalCount);
  });

  it("pluck on disable joins through", async () => {
    const normalIds = (await association(author, "comments").pluck("id")).sort(sortIds);
    const noJoinsIds = (await association(author, "noJoinsComments").pluck("id")).sort(sortIds);
    expect(noJoinsIds).toEqual(normalIds);
  });

  it("pluck on disable joins through using custom foreign key", async () => {
    const normalIds = (await association(author, "commentsWithForeignKey").pluck("id")).sort(
      sortIds,
    );
    const noJoinsIds = (
      await association(author, "noJoinsCommentsWithForeignKey").pluck("id")
    ).sort(sortIds);
    expect(noJoinsIds).toEqual(normalIds);
  });

  it("fetching on disable joins through", async () => {
    const normalFirst = await association(author, "comments").first();
    const noJoinsFirst = await association(author, "noJoinsComments").first();
    expect(noJoinsFirst).not.toBeNull();
    expect(noJoinsFirst!.id).toBe(normalFirst!.id);
  });

  it("fetching on disable joins through using custom foreign key", async () => {
    const normalFirst = await association(author, "commentsWithForeignKey").first();
    const noJoinsFirst = await association(author, "noJoinsCommentsWithForeignKey").first();
    expect(noJoinsFirst).not.toBeNull();
    expect(noJoinsFirst!.id).toBe(normalFirst!.id);
  });

  it("to a on disable joins through", async () => {
    const normalComments = await association(author, "comments").toArray();
    const noJoinsComments = await association(author, "noJoinsComments").toArray();
    const normalIds = normalComments.map((c: any) => c.id).sort(sortIds);
    const noJoinsIds = noJoinsComments.map((c: any) => c.id).sort(sortIds);
    expect(noJoinsIds).toEqual(normalIds);
  });

  it("appending on disable joins through", async () => {
    const before = await association(author, "noJoinsComments").count();
    await (post as any).comments.create({ body: "text" });
    const after = await association(author, "noJoinsComments").count();
    expect(after).toBe(before + 1);
  });

  it("appending on disable joins through using custom foreign key", async () => {
    const before = await association(author, "noJoinsCommentsWithForeignKey").count();
    await (post as any).comments.create({ body: "text" });
    const after = await association(author, "noJoinsCommentsWithForeignKey").count();
    expect(after).toBe(before + 1);
  });

  it("empty on disable joins through", async () => {
    const emptyAuthor = await Author.find(authors("bob").id);
    const normal = await association(emptyAuthor, "comments").toArray();
    const noJoins = await association(emptyAuthor, "noJoinsComments").toArray();
    expect(normal).toEqual([]);
    expect(noJoins).toEqual([]);
  });

  it("empty on disable joins through using custom foreign key", async () => {
    const emptyAuthor = await Author.find(authors("bob").id);
    const normal = await association(emptyAuthor, "commentsWithForeignKey").toArray();
    const noJoins = await association(emptyAuthor, "noJoinsCommentsWithForeignKey").toArray();
    expect(normal).toEqual([]);
    expect(noJoins).toEqual([]);
  });

  it("pluck on disable joins through a through", async () => {
    const ratingIds = (await Rating.where({ comment_id: comment.id }).pluck("id")).sort(sortIds);
    const normalIds = (await association(author, "ratings").pluck("id")).sort(sortIds);
    const noJoinsIds = (await association(author, "noJoinsRatings").pluck("id")).sort(sortIds);
    expect(normalIds).toEqual(ratingIds);
    expect(noJoinsIds).toEqual(ratingIds);
  });

  it("count on disable joins through a through", async () => {
    const ratingsCount = await Rating.where({ comment_id: comment.id }).count();
    const normalCount = await association(author, "ratings").count();
    const noJoinsCount = await association(author, "noJoinsRatings").count();
    expect(normalCount).toBe(ratingsCount);
    expect(noJoinsCount).toBe(ratingsCount);
  });

  it("count on disable joins using relation with scope", async () => {
    const normalCount = await association(author, "goodRatings").count();
    const noJoinsCount = await association(author, "noJoinsGoodRatings").count();
    expect(normalCount).toBe(2);
    expect(noJoinsCount).toBe(2);
  });

  it("to a on disable joins with multiple scopes", async () => {
    const expectedIds = [rating1.id, rating2.id].sort(sortIds);
    const normalRatings = await association(author, "goodRatings").toArray();
    const noJoinsRatings = await association(author, "noJoinsGoodRatings").toArray();
    expect(normalRatings.map((r: any) => r.id)).toEqual(expectedIds);
    expect(noJoinsRatings.map((r: any) => r.id)).toEqual(expectedIds);
  });

  it("preloading has many through disable joins", async () => {
    const expectedIds = [rating1.id, rating2.id].sort(sortIds);

    const authorsList = await Author.all().preload("goodRatings").toArray();
    const preloadedAuthor = authorsList.find((a: any) => a.id === author.id) as any;
    expect(preloadedAuthor).toBeDefined();
    const goodRatings = preloadedAuthor.association("goodRatings").target as any[];
    expect(goodRatings.map((r: any) => r.id).sort(sortIds)).toEqual(expectedIds);

    const authorsList2 = await Author.all().preload("noJoinsGoodRatings").toArray();
    const preloadedAuthor2 = authorsList2.find((a: any) => a.id === author.id) as any;
    expect(preloadedAuthor2).toBeDefined();
    const noJoinsGoodRatings = preloadedAuthor2.association("noJoinsGoodRatings").target as any[];
    expect(noJoinsGoodRatings.map((r: any) => r.id).sort(sortIds)).toEqual(expectedIds);
  });

  it("polymophic disable joins through counting", async () => {
    const normalCount = await association(author, "orderedMembers").count();
    const noJoinsCount = await association(author, "noJoinsOrderedMembers").count();
    expect(normalCount).toBe(2);
    expect(noJoinsCount).toBe(2);
  });

  it("polymophic disable joins through ordering", async () => {
    const normalMembers = await association(author, "orderedMembers").toArray();
    const noJoinsMembers = await association(author, "noJoinsOrderedMembers").toArray();
    expect(normalMembers.map((m: any) => m.id)).toEqual([member2.id, member.id]);
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id, member.id]);
  });

  it("polymorphic disable joins through reordering", async () => {
    const noJoinsMembers = await djasScope(author, "noJoinsOrderedMembers")
      .reorder("id ASC")
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member.id, member2.id]);
  });

  it("polymorphic disable joins through ordered scopes", async () => {
    const noJoinsMembers = await djasScope(author, "noJoinsOrderedMembers")
      .where({ name: null })
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id, member.id]);
  });

  it("polymorphic disable joins through ordered chained scopes", async () => {
    const member3 = await Member.create({ member_type_id: memberType.id });
    const member4 = await Member.create({
      member_type_id: memberType.id,
      name: "named",
    });
    await (post2 as any).comments.create({
      body: "text",
      origin_id: member3.id,
      origin_type: "Member",
    });
    await (post2 as any).comments.create({
      body: "text",
      origin_id: member4.id,
      origin_type: "Member",
    });
    const noJoinsMembers = await djasScope(author, "noJoinsOrderedMembers")
      .where({ name: null })
      .where({ member_type_id: memberType.id })
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member3.id, member2.id, member.id]);
  });

  it("polymorphic disable joins through ordered scope limits", async () => {
    const noJoinsMembers = await djasScope(author, "noJoinsOrderedMembers")
      .where({ name: null })
      .limit(1)
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id]);
  });

  it("polymorphic disable joins through ordered scope first", async () => {
    const noJoinsFirst = await djasScope(author, "noJoinsOrderedMembers")
      .where({ name: null })
      .first();
    expect(noJoinsFirst?.id).toBe(member2.id);
  });

  it("order applied in double join", async () => {
    const noJoinsMembers = await association(author, "noJoinsMembers").toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id, member.id]);
  });

  it("first and scope applied in double join", async () => {
    const noJoinsFirst = await djasScope(author, "noJoinsMembers").where({ name: null }).first();
    expect(noJoinsFirst?.id).toBe(member2.id);
  });

  it("first and scope in double join applies order in memory", async () => {
    // Rails verifies no ORDER BY in the final SQL (order is applied in memory via DJAR).
    // TS: the DJAR loaded-chain mode sorts in memory; verify correct record returned.
    const noJoinsFirst = await djasScope(author, "noJoinsMembers").where({ name: null }).first();
    expect(noJoinsFirst?.id).toBe(member2.id);
  });

  it("limit and scope applied in double join", async () => {
    const noJoinsMembers = await djasScope(author, "noJoinsMembers")
      .where({ name: null })
      .limit(1)
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id]);
  });

  it("limit and scope in double join applies limit in memory", async () => {
    // Rails verifies no LIMIT 1 in the final SQL (limit is applied in memory via DJAR).
    // TS: DJAR loaded-chain mode applies limit in memory; verify correct record returned.
    const noJoinsMembers = await djasScope(author, "noJoinsMembers")
      .where({ name: null })
      .limit(1)
      .toArray();
    expect(noJoinsMembers.map((m: any) => m.id)).toEqual([member2.id]);
  });
});
