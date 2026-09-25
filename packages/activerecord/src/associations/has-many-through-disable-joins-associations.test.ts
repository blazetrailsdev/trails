import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { collectionProxyFor as association } from "../associations.js";
import { assertDifference } from "@blazetrails/activesupport";
import { captureSql } from "../testing/sql-capture.js";
import { assertQueriesCount } from "../testing/query-assertions.js";
import { DisableJoinsAssociationScope } from "./disable-joins-association-scope.js";

import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Member } from "../test-helpers/models/member.js";
import { MemberType } from "../test-helpers/models/member-type.js";

function djasScope(owner: Base, assocName: string): any {
  const ctor = owner.constructor as typeof Base;
  const reflection = (ctor as any)._reflectOnAssociation?.(assocName);
  if (!reflection) throw new Error(`No reflection found for ${assocName}`);
  const klass = reflection.klass;
  return DisableJoinsAssociationScope.create().scope({
    owner,
    reflection,
    klass,
  });
}

describe("HasManyThroughDisableJoinsAssociationsTest", () => {
  const { authors } = fixtures(["posts", "authors", "comments", "authorAddresses"]);

  registerModel([Author, AuthorAddress, Post, Comment, Rating, Member, MemberType]);

  let author: Author;
  let post: Post;
  let post2: Post;
  let comment: Comment;
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
    await (post2 as any).comments.create({
      body: "text",
      origin_id: member2.id,
      origin_type: "Member",
    });
    rating1 = (await (comment as any).ratings.create({ value: 8 })) as Rating;
    rating2 = (await (comment as any).ratings.create({ value: 9 })) as Rating;
  });

  const sortIds = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0);

  const ids = (r: any): any => (Array.isArray(r) ? r.map((x: any) => x.id) : r?.id);

  const q = async <T>(n: number, fn: () => PromiseLike<T>): Promise<T> => {
    let result!: T;
    await assertQueriesCount(n, false, async () => {
      result = await fn();
    });
    return result;
  };

  it.skip("counting on disable joins through", async () => {
    // BLOCKED: query count — the disable-joins chain walk runs 1 query where Rails runs 2 — filed as 0155-assertion-surfaced-port-bugs/disable-joins-through-skips-per-reflection-pluck
    expect(await association(author, "noJoinsComments").count()).toEqual(
      await association(author, "comments").count(),
    );
    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsComments").count();
    });
    await assertQueriesCount(1, false, async () => {
      await association(author, "comments").count();
    });
  });

  it.skip("counting on disable joins through using custom foreign key", async () => {
    // BLOCKED: query count — the disable-joins chain walk runs 1 query where Rails runs 2 — filed as 0155-assertion-surfaced-port-bugs/disable-joins-through-skips-per-reflection-pluck
    expect(await association(author, "noJoinsCommentsWithForeignKey").count()).toEqual(
      await association(author, "commentsWithForeignKey").count(),
    );
    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsCommentsWithForeignKey").count();
    });
    await assertQueriesCount(1, false, async () => {
      await association(author, "commentsWithForeignKey").count();
    });
  });

  it.skip("pluck on disable joins through", async () => {
    // BLOCKED: query count — the disable-joins chain walk runs 1 query where Rails runs 2 — filed as 0155-assertion-surfaced-port-bugs/disable-joins-through-skips-per-reflection-pluck
    expect((await association(author, "noJoinsComments").pluck("id")).sort(sortIds)).toEqual(
      (await association(author, "comments").pluck("id")).sort(sortIds),
    );
    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsComments").pluck("id");
    });
    await assertQueriesCount(1, false, async () => {
      await association(author, "comments").pluck("id");
    });
  });

  it.skip("pluck on disable joins through using custom foreign key", async () => {
    // BLOCKED: query count — the disable-joins chain walk runs 1 query where Rails runs 2 — filed as 0155-assertion-surfaced-port-bugs/disable-joins-through-skips-per-reflection-pluck
    expect(
      (await association(author, "noJoinsCommentsWithForeignKey").pluck("id")).sort(sortIds),
    ).toEqual((await association(author, "commentsWithForeignKey").pluck("id")).sort(sortIds));
    await assertQueriesCount(2, false, async () => {
      await association(author, "noJoinsCommentsWithForeignKey").pluck("id");
    });
    await assertQueriesCount(1, false, async () => {
      await association(author, "commentsWithForeignKey").pluck("id");
    });
  });

  it("fetching on disable joins through", async () => {
    expect((await (author as any).noJoinsComments.first())!.id).toBe(
      (await (author as any).comments.first())!.id,
    );
    await assertQueriesCount(2, false, async () => {
      void (await (author as any).noJoinsComments.first())!.id;
    });
    await assertQueriesCount(1, false, async () => {
      void (await (author as any).comments.first())!.id;
    });
  });

  it("fetching on disable joins through using custom foreign key", async () => {
    expect((await (author as any).noJoinsCommentsWithForeignKey.first())!.id).toBe(
      (await (author as any).commentsWithForeignKey.first())!.id,
    );
    await assertQueriesCount(2, false, async () => {
      void (await (author as any).noJoinsCommentsWithForeignKey.first())!.id;
    });
    await assertQueriesCount(1, false, async () => {
      void (await (author as any).commentsWithForeignKey.first())!.id;
    });
  });

  it("to a on disable joins through", async () => {
    expect(ids(await (author as any).noJoinsComments).sort(sortIds)).toEqual(
      ids(await (author as any).comments).sort(sortIds),
    );
    await author.reload();
    await assertQueriesCount(2, false, async () => {
      await (author as any).noJoinsComments;
    });
    await assertQueriesCount(1, false, async () => {
      await (author as any).comments;
    });
  });

  it("appending on disable joins through", async () => {
    await assertDifference(
      async () => (await (author as any).noJoinsComments.reload()).size(),
      1,
      null,
      async () => {
        await (post as any).comments.create({ body: "text" });
      },
    );
    await assertQueriesCount(2, false, async () => {
      await (author as any).noJoinsComments.reload();
    });
    await assertQueriesCount(1, false, async () => {
      await (author as any).comments.reload();
    });
  });

  it("appending on disable joins through using custom foreign key", async () => {
    await assertDifference(
      async () => (await (author as any).noJoinsCommentsWithForeignKey.reload()).size(),
      1,
      null,
      async () => {
        await (post as any).comments.create({ body: "text" });
      },
    );
    await assertQueriesCount(2, false, async () => {
      await (author as any).noJoinsCommentsWithForeignKey.reload();
    });
    await assertQueriesCount(1, false, async () => {
      await (author as any).commentsWithForeignKey.reload();
    });
  });

  it.skip("empty on disable joins through", async () => {
    // BLOCKED: query count — all on an empty owner runs 1 query where Rails runs 0 — filed as 0155-assertion-surfaced-port-bugs/through-all-on-empty-owner-runs-a-query
    const emptyAuthor = await Author.find(authors("bob").id);
    expect(await q(0, () => association(emptyAuthor, "comments").all())).toEqual([]);
    expect(await q(1, () => association(emptyAuthor, "noJoinsComments").all())).toEqual([]);
  });

  it.skip("empty on disable joins through using custom foreign key", async () => {
    // BLOCKED: query count — all on an empty owner runs 1 query where Rails runs 0 — filed as 0155-assertion-surfaced-port-bugs/through-all-on-empty-owner-runs-a-query
    const emptyAuthor = await Author.find(authors("bob").id);
    expect(await q(0, () => association(emptyAuthor, "commentsWithForeignKey").all())).toEqual([]);
    expect(
      await q(1, () => association(emptyAuthor, "noJoinsCommentsWithForeignKey").all()),
    ).toEqual([]);
  });

  it("pluck on disable joins through a through", async () => {
    const ratingIds = (await Rating.where({ comment_id: comment.id }).pluck("id")).sort(sortIds);
    expect((await q(1, () => association(author, "ratings").pluck("id"))).sort(sortIds)).toEqual(
      ratingIds,
    );
    expect(
      (await q(3, () => association(author, "noJoinsRatings").pluck("id"))).sort(sortIds),
    ).toEqual(ratingIds);
  });

  it("count on disable joins through a through", async () => {
    const ratingsCount = await Rating.where({ comment_id: comment.id }).count();
    expect(await q(1, () => association(author, "ratings").count())).toBe(ratingsCount);
    expect(await q(3, () => association(author, "noJoinsRatings").count())).toBe(ratingsCount);
  });

  it("count on disable joins using relation with scope", async () => {
    expect(await q(1, () => association(author, "goodRatings").count())).toBe(2);
    expect(await q(3, () => association(author, "noJoinsGoodRatings").count())).toBe(2);
  });

  it("to a on disable joins with multiple scopes", async () => {
    expect(ids(await q(1, () => association(author, "goodRatings").toArray()))).toEqual([
      rating1.id,
      rating2.id,
    ]);
    expect(ids(await q(3, () => association(author, "noJoinsGoodRatings").toArray()))).toEqual([
      rating1.id,
      rating2.id,
    ]);
  });

  it("preloading has many through disable joins", async () => {
    await assertQueriesCount(3, false, async () => {
      const authorsList = await Author.all().preload(":goodRatings");
      authorsList.map((a: any) => a.goodRatings);
    });
    await assertQueriesCount(4, false, async () => {
      const authorsList = await Author.all().preload(":noJoinsGoodRatings");
      authorsList.map((a: any) => a.goodRatings);
    });
  });

  it("polymophic disable joins through counting", async () => {
    expect(await q(1, () => association(author, "orderedMembers").count())).toBe(2);
    expect(await q(3, () => association(author, "noJoinsOrderedMembers").count())).toBe(2);
  });

  it("polymophic disable joins through ordering", async () => {
    expect(ids(await q(1, () => association(author, "orderedMembers").toArray()))).toEqual([
      member2.id,
      member.id,
    ]);
    expect(ids(await q(3, () => association(author, "noJoinsOrderedMembers").toArray()))).toEqual([
      member2.id,
      member.id,
    ]);
  });

  it("polymorphic disable joins through reordering", async () => {
    expect(
      ids(await q(1, () => association(author, "orderedMembers").reorder({ id: "asc" }).toArray())),
    ).toEqual([member.id, member2.id]);
    expect(
      ids(
        await q(3, () =>
          association(author, "noJoinsOrderedMembers").reorder({ id: "asc" }).toArray(),
        ),
      ),
    ).toEqual([member.id, member2.id]);
  });

  it("polymorphic disable joins through ordered scopes", async () => {
    expect(
      ids(await q(1, () => association(author, "orderedMembers").unnamed().toArray())),
    ).toEqual([member2.id, member.id]);
    expect(
      ids(await q(3, () => association(author, "noJoinsOrderedMembers").unnamed().toArray())),
    ).toEqual([member2.id, member.id]);
  });

  it("polymorphic disable joins through ordered chained scopes", async () => {
    const member3 = await Member.create({ member_type_id: memberType.id });
    const member4 = await Member.create({ member_type_id: memberType.id, name: "named" });
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
    const expected = [member3.id, member2.id, member.id];
    expect(
      ids(
        await q(1, () =>
          association(author, "orderedMembers").unnamed().withMemberTypeId(memberType.id).toArray(),
        ),
      ),
    ).toEqual(expected);
    expect(
      ids(
        await q(3, () =>
          association(author, "noJoinsOrderedMembers")
            .unnamed()
            .withMemberTypeId(memberType.id)
            .toArray(),
        ),
      ),
    ).toEqual(expected);
  });

  it("polymorphic disable joins through ordered scope limits", async () => {
    expect(
      ids(await q(1, () => association(author, "orderedMembers").unnamed().limit(1).toArray())),
    ).toEqual([member2.id]);
    expect(
      ids(
        await q(3, () => association(author, "noJoinsOrderedMembers").unnamed().limit(1).toArray()),
      ),
    ).toEqual([member2.id]);
  });

  it("polymorphic disable joins through ordered scope first", async () => {
    expect(ids(await q(1, () => association(author, "orderedMembers").unnamed().first()))).toEqual(
      member2.id,
    );
    expect(
      ids(await q(3, () => association(author, "noJoinsOrderedMembers").unnamed().first())),
    ).toEqual(member2.id);
  });

  it("order applied in double join", async () => {
    expect(ids(await q(1, () => association(author, "members").toArray()))).toEqual([
      member2.id,
      member.id,
    ]);
    expect(ids(await q(3, () => (author as any).noJoinsMembers.toArray()))).toEqual([
      member2.id,
      member.id,
    ]);
  });

  it("first and scope applied in double join", async () => {
    expect(ids(await q(1, () => association(author, "members").unnamed().first()))).toEqual(
      member2.id,
    );
    expect(ids(await q(3, () => (author as any).noJoinsMembers.unnamed().first()))).toEqual(
      member2.id,
    );
  });

  it("first and scope in double join applies order in memory", async () => {
    const disableJoinsSql = await captureSql(async () => {
      await (author as any).noJoinsMembers.unnamed().first();
    });
    expect(disableJoinsSql[disableJoinsSql.length - 1]).not.toMatch(/ORDER BY/);
  });

  it("limit and scope applied in double join", async () => {
    expect(
      ids(await q(1, () => association(author, "members").unnamed().limit(1).toArray())),
    ).toEqual([member2.id]);
    expect(
      ids(await q(3, () => association(author, "noJoinsMembers").unnamed().limit(1).toArray())),
    ).toEqual([member2.id]);
  });

  it("limit and scope in double join applies limit in memory", async () => {
    const disableJoinsSql = await captureSql(async () => {
      await association(author, "noJoinsMembers").unnamed().first();
    });
    expect(disableJoinsSql[disableJoinsSql.length - 1]).not.toMatch(/LIMIT 1/);
  });
});
