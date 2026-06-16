/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Mirrors associations/left_outer_join_association_test.rb — the canonical
 * Author/Post/Comment/Rating/Essay/Categorization/Person/Friendship
 * left_outer_joins suite. Rails declares one fixtures set for the whole class;
 * we mirror that with a single `useHandlerFixtures` call seeding the canonical
 * association tables.
 */
import { describe, it, expect } from "vitest";
import { registerModel, registerSubclass } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Table } from "@blazetrails/arel";
import { captureSql } from "../testing/sql-capture.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import {
  Comment,
  SpecialComment,
  SubSpecialComment,
  VerySpecialComment,
} from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Categorization, SpecialCategorization } from "../test-helpers/models/categorization.js";
import { Category } from "../test-helpers/models/category.js";
import { Person } from "../test-helpers/models/person.js";
import { Friendship } from "../test-helpers/models/friendship.js";
import { Reference } from "../test-helpers/models/reference.js";
import { Job } from "../test-helpers/models/job.js";

describe("LeftOuterJoinAssociationTest", () => {
  const { authors, posts } = useHandlerFixtures(
    [
      "authors",
      "authorAddresses",
      "essays",
      "posts",
      "comments",
      "ratings",
      "categorizations",
      "people",
    ],
    { schema: canonicalSchema },
  );

  registerModel(Author);
  registerModel(Post);
  registerModel(Comment);
  registerModel(SpecialComment);
  registerModel(SubSpecialComment);
  registerModel(VerySpecialComment);
  registerSubclass(SpecialComment);
  registerSubclass(SubSpecialComment);
  registerSubclass(VerySpecialComment);
  registerModel(Rating);
  registerModel(Essay);
  registerModel(Categorization);
  registerModel(SpecialCategorization);
  registerModel(Category);
  registerModel(Person);
  registerModel(Friendship);
  registerModel(Reference);
  registerModel(Job);

  it.skip("merging multiple left joins from different associations", () => {
    // BLOCKED: cross-model merge gap (relation/merger.ts). Rails:
    //   Author.joins(:posts).merge(Post.left_joins(:comments).merge(Comment.left_joins(:ratings)))
    // raises `ambiguous column name: posts.author_id` because the merged
    // left-joins from sibling model relations are not re-aliased across model
    // classes the way merger.rb does. Tracked: RFC 0030 story
    // left-joins-cross-model-merge.
  });

  it("construct finder sql applies aliases tables on association conditions", async () => {
    const result = await Author.leftOuterJoins(["thinkingPosts", "welcomePosts"]).first();
    expect((result as any)?.id).toBe((authors("david") as any).id);
  });

  it("construct finder sql does not table name collide on duplicate associations", async () => {
    const queries = await captureSql(async () => {
      await Person.leftOuterJoins({ agents: { agents: "agents" } })
        .leftOuterJoins({ agents: { agents: { primaryContact: "agents" } } })
        .toArray();
    });
    expect(queries.some((sql) => /agents_people_4/i.test(sql))).toBe(true);
  });

  it("left outer joins count is same as size of loaded results", async () => {
    expect((await Post.leftOuterJoins("comments").toArray()).length).toBe(18);
    expect(await Post.leftOuterJoins("comments").count()).toBe(18);
  });

  it.skip("merging left joins should be left joins", () => {
    // BLOCKED: cross-model merge gap. Rails:
    //   Author.left_joins(:posts).merge(Post.no_comments).count == 5
    // The cross-model merge path in relation/merger.ts does not carry the merged
    // WHERE/left-join across model classes the way merger.rb does (returns 15).
    // Tracked: RFC 0030 story left-joins-cross-model-merge.
  });

  it("left joins aliases left outer joins", () => {
    expect(Post.leftOuterJoins("comments").toSql()).toBe(Post.leftJoins("comments").toSql());
  });

  it("left outer joins return has value for every comment", async () => {
    const allPostIds = (await Post.pluck("id")) as number[];
    const joined = (await Post.leftOuterJoins("comments").pluck("id")) as number[];
    const intersection = allPostIds.filter((id) => joined.includes(id));
    expect(intersection).toEqual(allPostIds);
  });

  it("left outer joins actually does a left outer join", async () => {
    const queries = await captureSql(async () => {
      await Author.leftOuterJoins("posts").toArray();
    });
    expect(queries.some((sql) => /LEFT OUTER JOIN/i.test(sql))).toBe(true);
  });

  it.skip("left outer joins is deduped when same association is joined", () => {
    // BLOCKED: join dedup gap. Rails:
    //   Author.joins(:posts).left_outer_joins(:posts)
    // dedupes the duplicated association to a single INNER JOIN; trails emits
    // BOTH an INNER JOIN and a LEFT OUTER JOIN for `posts`. Tracked: RFC 0030
    // story left-outer-joins-inner-dedup.
  });

  it("construct finder sql ignores empty left outer joins hash", async () => {
    const queries = await captureSql(async () => {
      await Author.leftOuterJoins({}).toArray();
    });
    expect(queries.some((sql) => /LEFT OUTER JOIN/i.test(sql))).toBe(false);
  });

  it("construct finder sql ignores empty left outer joins array", async () => {
    const queries = await captureSql(async () => {
      await Author.leftOuterJoins([]).toArray();
    });
    expect(queries.some((sql) => /LEFT OUTER JOIN/i.test(sql))).toBe(false);
  });

  it("left outer joins forbids to use string as argument", () => {
    expect(() =>
      Author.leftOuterJoins('LEFT OUTER JOIN "posts" ON "posts"."user_id" = "users"."id"'),
    ).toThrow();
  });

  it("left outer joins with string join", async () => {
    expect(
      await Author.leftOuterJoins("posts")
        .joins("LEFT OUTER JOIN comments ON comments.post_id = posts.id")
        .count(),
    ).toBe(17);
  });

  it("left outer joins with arel join", async () => {
    const comments = new Table("comments");
    const postsTable = new Table("posts");
    const constraint = comments.get("post_id").eq(postsTable.get("id"));
    const arelJoin = comments.outerJoin(comments).on(constraint).joinSources[0];

    expect(await Author.leftOuterJoins("posts").joins(arelJoin).count()).toBe(17);
  });

  it("join conditions added to join clause", async () => {
    const queries = await captureSql(async () => {
      await Author.leftOuterJoins("essays").toArray();
    });
    expect(queries.some((sql) => /writer_type.*?=.*?(Author|\?|\$1|:a1)/i.test(sql))).toBe(true);
    expect(queries.some((sql) => /WHERE/i.test(sql))).toBe(false);
  });

  it("find with sti join", async () => {
    const scope = Post.leftOuterJoins("specialComments").where({
      id: (posts("sti_comments") as any).id,
    });

    expect(await scope.where({ "comments.type": "Comment" }).toArray()).toHaveLength(0);
    expect(
      (await scope.where({ "comments.type": "SpecialComment" }).toArray()).length,
    ).toBeGreaterThan(0);
    expect(
      (await scope.where({ "comments.type": "SubSpecialComment" }).toArray()).length,
    ).toBeGreaterThan(0);
  });

  it("does not override select", async () => {
    const selected = Author.select(
      "authors.name, (authors.author_address_id || ' ' || authors.author_address_extra_id) as addr_id",
    ).leftOuterJoins("posts");
    expect(await selected.exists()).toBe(true);
    const first = await selected.first();
    expect((first as any).attributes).toHaveProperty("addr_id");
  });

  it("the default scope of the target is applied when joining associations", async () => {
    const author = await Author.create({ name: "Jon" });
    await (author as any).association("categorizations").create({});
    await (author as any).association("categorizations").create({ special: true });

    const result = await Author.where({ id: author.id })
      .leftOuterJoins("specialCategorizations")
      .toArray();
    expect(result.map((a) => a.id)).toEqual([author.id]);
  });

  it("left outer joins includes all nested associations", async () => {
    const queries = await captureSql(async () => {
      await Friendship.leftOuterJoins([
        "friendFavoriteReferenceJob",
        "followerFavoriteReferenceJob",
      ]).toArray();
    });
    const sql = queries.join("\n");
    // Mirrors Rails' quote_table_name("friendships.friend_id"): identifier
    // quoting is adapter-specific — double-quotes on SQLite/PG, backticks on
    // MySQL/MariaDB — so match either quote char.
    expect(/["`]friendships["`]\.["`]friend_id["`]/i.test(sql)).toBe(true);
    expect(/["`]friendships["`]\.["`]follower_id["`]/i.test(sql)).toBe(true);
  });
});
