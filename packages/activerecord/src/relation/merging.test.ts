/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/merging_test.rb
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import { sql as arelSql } from "@blazetrails/arel";

import { registerModel, Range } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { assertQueriesCount, assertQueriesMatch } from "../testing/query-assertions.js";
import { quoteTableName, escapeRegExp } from "../test-helpers/quote-regex.js";
import { Author } from "../test-helpers/models/author.js";
import { Developer } from "../test-helpers/models/developer.js";
import { Comment, CommentThatAutomaticallyAltersPostBody } from "../test-helpers/models/comment.js";
import { Post, PostThatLoadsCommentsInAnAfterSaveHook } from "../test-helpers/models/post.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Computer } from "../test-helpers/models/computer.js";
import { Project } from "../test-helpers/models/project.js";

registerModel([
  Author,
  Developer,
  Comment,
  CommentThatAutomaticallyAltersPostBody,
  Post,
  PostThatLoadsCommentsInAnAfterSaveHook,
  Rating,
  Computer,
  Project,
]);

const ids = async (rel: any): Promise<unknown[]> => (await rel.toArray()).map((r: any) => r.id);

describe("RelationMergingTest", () => {
  const { authors, developers } = fixtures(
    ["developers", "comments", "authors", "authorAddresses", "posts", "ratings"],
    { schema: canonicalSchema },
  );

  const mergeClauseAssertions = async (
    davidAndMary: any,
    maryAndBob: any,
    david: any,
    mary: any,
    bob: any,
    authorList: unknown[],
  ): Promise<void> => {
    expect(await ids(davidAndMary)).toEqual([david.id, mary.id]);
    expect(await ids(maryAndBob)).toEqual([mary.id, bob.id]);

    expect(await ids(davidAndMary.merge(Author.where({ id: mary })))).toEqual([mary.id]);
    expect(await ids(davidAndMary.merge(Author.rewhere({ id: mary })))).toEqual([mary.id]);

    expect(await ids(davidAndMary.merge(Author.where({ id: bob })))).toEqual([bob.id]);
    expect(await ids(davidAndMary.merge(Author.rewhere({ id: bob })))).toEqual([bob.id]);

    expect(await ids(maryAndBob.merge(Author.where({ id: [david, bob] })))).toEqual([
      david.id,
      bob.id,
    ]);

    expect(await ids(davidAndMary.merge(maryAndBob))).toEqual([mary.id, bob.id]);
    expect(await ids(davidAndMary.and(maryAndBob))).toEqual([mary.id]);
    expect(await ids(davidAndMary.or(maryAndBob))).toEqual(authorList);

    expect(await ids(maryAndBob.merge(davidAndMary))).toEqual([david.id, mary.id]);
    expect(await ids(davidAndMary.and(maryAndBob))).toEqual([mary.id]);
    expect(await ids(davidAndMary.or(maryAndBob))).toEqual(authorList);

    const davidAndBob = Author.where({ id: david }).or(Author.where({ name: "Bob" }));

    expect(await ids(davidAndMary.merge(davidAndBob))).toEqual([david.id]);
    expect(await ids(davidAndMary.and(davidAndBob))).toEqual([david.id]);
    expect(await ids(davidAndMary.or(davidAndBob))).toEqual(authorList);
  };

  it("merge in clause", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");
    const authorList = [david.id, mary.id, bob.id];

    const davidAndMary = Author.where({ id: [david, mary] }).order("id");
    const maryAndBob = Author.where({ id: [mary, bob] }).order("id");

    await mergeClauseAssertions(davidAndMary, maryAndBob, david, mary, bob, authorList);
  });

  it("merge between clause", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");
    const authorList = [david.id, mary.id, bob.id];

    const davidAndMary = Author.where({ id: new Range(david.id, mary.id) }).order("id");
    const maryAndBob = Author.where({ id: new Range(mary.id, bob.id) }).order("id");

    await mergeClauseAssertions(davidAndMary, maryAndBob, david, mary, bob, authorList);
  });

  it("merge or clause", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");
    const authorList = [david.id, mary.id, bob.id];

    const davidAndMary = Author.where({ id: david })
      .or(Author.where({ id: mary }))
      .order("id");
    const maryAndBob = Author.where({ id: mary })
      .or(Author.where({ id: bob }))
      .order("id");

    await mergeClauseAssertions(davidAndMary, maryAndBob, david, mary, bob, authorList);
  });

  it("merge not in clause", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");

    const nonMaryAndBob = Author.whereNot({ id: [mary, bob] });

    expect(await ids(nonMaryAndBob)).toEqual([david.id]);

    expect(await ids(Author.where({ id: david }).merge(nonMaryAndBob))).toEqual([david.id]);

    expect(await ids(Author.where({ id: mary }).merge(nonMaryAndBob))).toEqual([david.id]);
  });

  it("merge not range clause", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");

    const lessThanBob = Author.whereNot({ id: new Range(bob.id, Infinity) }).order("id");

    expect(await ids(lessThanBob)).toEqual([david.id, mary.id]);

    expect(await ids(Author.where({ id: david }).merge(lessThanBob))).toEqual([david.id, mary.id]);

    expect(await ids(Author.where({ id: mary }).merge(lessThanBob))).toEqual([david.id, mary.id]);
  });

  it("merge doesnt duplicate same clauses", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const bob = authors("bob");

    const nonMaryAndBob = Author.whereNot({ id: [mary, bob] });

    const authorId = quoteTableName("authors.id");
    await assertQueriesMatch(
      // Rails uses `\g<1>` (subexpression call — re-match group 1's pattern);
      // JS `\1` is a backreference, so repeat the alternation instead.
      new RegExp(
        `WHERE ${escapeRegExp(authorId)} NOT IN \\((?:\\?|\\W?\\w?\\d), (?:\\?|\\W?\\w?\\d)\\)$`,
      ),
      undefined,
      false,
      async () => {
        expect(await ids(nonMaryAndBob.merge(nonMaryAndBob))).toEqual([david.id]);
      },
    );
  });

  it("relation merging", async () => {
    const devs = Developer.where("salary >= 80000")
      .merge(Developer.limit(2))
      .merge(Developer.order("id ASC").where("id < 3"));
    expect(await ids(devs)).toEqual([developers("david").id, developers("jamis").id]);

    const devWithCount = Developer.limit(1)
      .merge(Developer.order("id DESC"))
      .merge(Developer.select("developers.*"));
    expect(await ids(devWithCount)).toEqual([developers("poor_jamis").id]);
  });

  it("relation to sql", async () => {
    const post = await Post.first();
    const sql = (post as any).comments.toSql();
    expect(sql).toMatch(new RegExp(`.?post_id.? = ${post!.id}$`, "i"));
  });

  it("relation merging with arel equalities keeps last equality", async () => {
    const salaryAttr = Developer.arelTable.get("salary");

    let devs = Developer.where(salaryAttr.eq(80000) as any).merge(
      Developer.where(salaryAttr.eq(9000) as any),
    );
    expect(await ids(devs)).toEqual([developers("poor_jamis").id]);

    devs = Developer.where(salaryAttr.eq(80000) as any).rewhere(salaryAttr.eq(9000) as any);
    expect(await ids(devs)).toEqual([developers("poor_jamis").id]);
  });

  it("relation merging with arel equalities keeps last equality with non attribute left hand", async () => {
    const salaryAttr = Developer.arelTable.get("salary");
    const absSalary = new Nodes.NamedFunction("abs", [salaryAttr]);

    let devs = Developer.where(absSalary.eq(80000) as any).merge(
      Developer.where(absSalary.eq(9000) as any),
    );
    expect(await ids(devs)).toEqual([developers("poor_jamis").id]);

    devs = Developer.where(absSalary.eq(80000) as any).rewhere(absSalary.eq(9000) as any);
    expect(await ids(devs)).toEqual([developers("poor_jamis").id]);
  });

  it("relation merging with eager load", async () => {
    const relations = [
      Post.order("comments.id DESC").merge(Post.eagerLoad("lastComment")).merge(Post.all()),
      Post.eagerLoad("lastComment").merge(Post.order("comments.id DESC")).merge(Post.all()),
    ];

    // `lastComment` is a lazy hasOne: on a freshly-found record it returns a
    // Promise, while on an eager-loaded row it's already materialized — await
    // both so the comparison is between records, mirroring Rails' sync read.
    const expected = await (await Post.find(1)).lastComment;
    for (const rel of relations) {
      const posts = await rel.toArray();
      const post = posts.find((p: any) => Number(p.id) === 1);
      expect((await (post as any).lastComment)?.id).toEqual((expected as any)?.id);
    }
  });

  it("relation merging with locks", () => {
    const devs = Developer.lock(true)
      .where("salary >= 80000")
      .order("id DESC")
      .merge(Developer.limit(2));
    expect(devs.isLocked).toBe(true);
  });

  it("relation merging with preload", async () => {
    const relations = [
      Post.all().merge(Post.preload("author")),
      Post.preload("author").merge(Post.all()),
    ];
    for (const posts of relations) {
      await assertQueriesCount(2, false, async () => {
        const first = await posts.first();
        expect((first as any).author).toBeTruthy();
      });
    }
  });

  it("relation merging with joins", async () => {
    const comments = Comment.joins("post")
      .where({ body: "Thank you for the welcome" })
      .merge(Post.where({ body: "Such a lovely day" }));
    expect(await comments.count()).toBe(1);
  });

  it("relation merging with left outer joins", async () => {
    const comments = Comment.joins("post")
      .where({ body: "Thank you for the welcome" })
      .merge(Post.leftOuterJoins("author").where({ body: "Such a lovely day" }));
    expect(await comments.count()).toBe(1);
  });

  it("relation merging with skip query cache", () => {
    expect(Post.all().merge(Post.all().skipQueryCacheBang()).skipQueryCacheValue).toBe(true);
  });

  it("relation merging with association", async () => {
    await assertQueriesCount(2, false, async () => {
      const post = await Post.where({ body: "Such a lovely day" }).first();
      const comments = Comment.where({ body: "Thank you for the welcome" }).merge(
        (post as any).comments,
      );
      expect(await comments.count()).toBe(1);
    });
  });

  it("merge collapses wheres from the LHS only", () => {
    const left = Post.where({ title: "omg" }).where({ commentsCount: 1 });
    const right = Post.where({ title: "wtf" }).where({ title: "bbq" });

    const merged = left.merge(right);

    expect(merged.toSql()).not.toContain("omg");
    expect(merged.toSql()).toContain("wtf");
    expect(merged.toSql()).toContain("bbq");
  });

  it("merging reorders bind params", async () => {
    const post = await Post.first();
    const right = Post.where({ id: 1 });
    const left = Post.where({ title: post!.title });

    const merged = left.merge(right);
    expect((await merged.first())!.id).toBe(post!.id);
  });

  it("merging compares symbols and strings as equal", async () => {
    const post = await PostThatLoadsCommentsInAnAfterSaveHook.create({
      title: "First Post",
      body: "Blah blah blah.",
    });
    const comment = await (post as any).comments.where({ body: "First comment!" }).firstOrCreate();
    expect(comment.body).toBe("First comment!");
  });

  it("merging with from clause", () => {
    let relation = Post.all();
    expect(relation.fromClause.isEmpty()).toBe(true);
    relation = relation.merge(Post.from("posts"));
    expect(relation.fromClause.isEmpty()).toBe(false);
  });

  it("merging with from clause on different class", async () => {
    expect(await Comment.joins("post").merge(Post.from("posts")).first()).toBeTruthy();
  });

  it("merging with order with binds", () => {
    const relation = Post.all().merge(Post.order([arelSql("title LIKE ?"), "%suffix"] as any));
    expect(relation.orderValues.map((v: any) => v.value ?? String(v))).toEqual([
      "title LIKE '%suffix'",
    ]);
  });

  it("merging with order without binds", () => {
    const relation = Post.all().merge(Post.order(arelSql("title LIKE '%?'")));
    expect(relation.orderValues.map((v: any) => v.value ?? String(v))).toEqual(["title LIKE '%?'"]);
  });

  it("merging annotations respects merge order", async () => {
    await assertQueriesMatch(/\/\* foo \*\/ \/\* bar \*\//, undefined, false, async () => {
      await Post.annotate("foo").merge(Post.annotate("bar")).first();
    });
    await assertQueriesMatch(/\/\* bar \*\/ \/\* foo \*\//, undefined, false, async () => {
      await Post.annotate("bar").merge(Post.annotate("foo")).first();
    });
    await assertQueriesMatch(
      /\/\* foo \*\/ \/\* bar \*\/ \/\* baz \*\/ \/\* qux \*\//,
      undefined,
      false,
      async () => {
        await Post.annotate("foo")
          .annotate("bar")
          .merge(Post.annotate("baz").annotate("qux"))
          .first();
      },
    );
  });

  it("merging duplicated annotations", async () => {
    const posts = Post.annotate("foo");
    const quotedTable = escapeRegExp(Post.quotedTableName());
    await assertQueriesMatch(
      new RegExp(`FROM ${quotedTable} \\/\\* foo \\*\\/$`),
      undefined,
      false,
      async () => {
        await posts.merge(posts).uniqBang("annotate").toArray();
      },
    );

    await assertQueriesMatch(
      new RegExp(`FROM ${quotedTable} \\/\\* foo \\*\\/$`),
      undefined,
      false,
      async () => {
        await posts.merge(posts);
      },
    );
    await assertQueriesMatch(
      new RegExp(`FROM ${quotedTable} \\/\\* foo \\*\\/ \\/\\* bar \\*\\/$`),
      undefined,
      false,
      async () => {
        await Post.annotate("foo").merge(Post.annotate("bar")).merge(posts);
      },
    );
    await assertQueriesMatch(
      new RegExp(`FROM ${quotedTable} \\/\\* bar \\*\\/ \\/\\* foo \\*\\/$`),
      undefined,
      false,
      async () => {
        await Post.annotate("bar").merge(Post.annotate("foo")).merge(posts);
      },
    );
  });
});

describe("MergingDifferentRelationsTest", () => {
  const { posts } = fixtures(["posts", "authors", "authorAddresses", "developers", "comments"], {
    schema: canonicalSchema,
    // The same-alias CTE case deliberately triggers a StatementInvalid, which
    // aborts the PG transaction and would poison shared transactional
    // fixtures; run it outside the shared transaction.
    usesTransaction: [
      "relation merger leaves to database to decide what to do when multiple CTEs with same alias are passed",
    ],
  });

  it("merging where relations", async () => {
    const helloByBob = await Post.where({ body: "hello" })
      .joins("author")
      .merge(Author.where({ name: "Bob" }))
      .order("posts.id")
      .pluck("posts.id");

    expect(helloByBob).toEqual([posts("misc_by_bob").id, posts("other_by_bob").id]);
  });

  it("merging order relations", async () => {
    let postsByAuthorName = await Post.limit(3)
      .joins("author")
      .whereNot({ "authors.name": "David" })
      .merge(Author.order("name"))
      .pluck("authors.name");
    expect(postsByAuthorName).toEqual(["Bob", "Bob", "Mary"]);

    postsByAuthorName = await Post.limit(3)
      .joins("author")
      .whereNot({ "authors.name": "David" })
      .merge(Author.order("name"))
      .pluck("authors.name");
    expect(postsByAuthorName).toEqual(["Bob", "Bob", "Mary"]);
  });

  it("merging order relations (using a hash argument)", async () => {
    const postsByAuthorName = await Post.limit(4)
      .joins("author")
      .whereNot({ "authors.name": "David" })
      .merge(Author.order({ name: "desc" }))
      .pluck("authors.name");

    expect(postsByAuthorName).toEqual(["Mary", "Mary", "Mary", "Bob"]);
  });

  it("relation merging (using a proc argument)", async () => {
    const dev = await Developer.where({ name: "Jamis" }).first();

    const comment1 = await (dev as any).comments.create({
      body: "I'm Jamis",
      post: await Post.first(),
    });
    const rating1 = await comment1.ratings.create();

    const comment2 = await (dev as any).comments.create({
      body: "I'm John",
      post: await Post.first(),
    });
    await comment2.ratings.create();

    expect(await ids((dev as any).ratings)).toEqual([rating1.id]);
  });

  it("merging relation with common table expression", async () => {
    const postsWithTags = Post.with({
      posts_with_tags: Post.where("tags_count > 0"),
    }).from("posts_with_tags AS posts");
    const postsWithComments = Post.where("legacy_comments_count > 0");
    const relation = postsWithComments.merge(postsWithTags).order("posts.id");

    expect((await relation.pluck("id")).map(Number)).toEqual([1, 2, 7]);
  });

  it("merging multiple relations with common table expression", async () => {
    const postsWithTags = Post.with({ posts_with_tags: Post.where("tags_count > 0") });
    const postsWithComments = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    });
    const relation = postsWithComments
      .merge(postsWithTags)
      .joins(
        "JOIN posts_with_tags pwt ON pwt.id = posts.id JOIN posts_with_comments pwc ON pwc.id = posts.id",
      )
      .order("posts.id");

    expect((await relation.pluck("id")).map(Number)).toEqual([1, 2, 7]);
  });

  it("relation merger leaves to database to decide what to do when multiple CTEs with same alias are passed", async () => {
    const postsWithTags = Post.with({ popular_posts: Post.where("tags_count > 0") });
    const postsWithComments = Post.with({
      popular_posts: Post.where("legacy_comments_count > 0"),
    });
    const relation = postsWithTags
      .merge(postsWithComments)
      .joins("JOIN popular_posts pp ON pp.id = posts.id");

    await expect(relation.toArray()).rejects.toThrow();
  });
});
