import { describe, it, expect, beforeAll } from "vitest";
import { registerModel, registerSubclass } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import {
  assertNothingRaised,
  assertEmpty,
  assertNotEmpty,
  assert,
  assertNot,
} from "@blazetrails/activesupport";
import { Table, Nodes } from "@blazetrails/arel";
import { assertQueriesMatch } from "../testing/query-assertions.js";
import { captureSql } from "../testing/sql-capture.js";
import { Author, AuthorAddress } from "../test-helpers/models/author.js";
import { Post, CategoryPost } from "../test-helpers/models/post.js";
import {
  Comment,
  SpecialComment,
  SubSpecialComment,
  VerySpecialComment,
} from "../test-helpers/models/comment.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Categorization, SpecialCategorization } from "../test-helpers/models/categorization.js";
import { Category, SpecialCategory } from "../test-helpers/models/category.js";
import { Person } from "../test-helpers/models/person.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Friendship } from "../test-helpers/models/friendship.js";
import { Reference } from "../test-helpers/models/reference.js";
import { Job } from "../test-helpers/models/job.js";

describe("InnerJoinAssociationTest", () => {
  const { authors, posts, people, categories, categoriesPosts, shardedBlogPosts, shardedComments } =
    fixtures([
      "authors",
      "authorAddresses",
      "essays",
      "posts",
      "comments",
      "categories",
      "categoriesPosts",
      "categorizations",
      "taggings",
      "tags",
      "people",
      "shardedComments",
      "shardedBlogPosts",
    ]);

  Category.inheritanceColumn = "type";
  registerModel(Author);
  registerModel(AuthorAddress);
  registerModel(Post);
  Comment.inheritanceColumn = "type";
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);
  registerModel(SubSpecialComment);
  registerSubclass(SubSpecialComment);
  registerModel(VerySpecialComment);
  registerSubclass(VerySpecialComment);
  registerModel(Essay);
  registerModel(Categorization);
  registerModel(SpecialCategorization);
  registerModel(Category);
  registerModel(SpecialCategory);
  registerSubclass(SpecialCategory);
  registerModel(CategoryPost);
  registerModel(Person);
  registerModel(Tagging);
  registerModel(Tag);
  registerModel(Friendship);
  registerModel(Reference);
  registerModel(Job);

  beforeAll(async () => {
    const sharded = await import("../test-helpers/models/sharded.js");
    registerModel("ShardedBlogPost", sharded.ShardedBlogPost);
    registerModel("ShardedComment", sharded.ShardedComment);
  });

  it("construct finder sql applies aliases tables on association conditions", async () => {
    const result = await Author.joins([":thinkingPosts", ":welcomePosts"]).first();
    expect((result as any)?.id).toBe((authors("david") as any).id);
  });

  it("construct finder sql does not table name collide on duplicate associations", async () => {
    await assertNothingRaised(() => {
      const sql = Person.joins({ ":agents": { ":agents": ":agents" } })
        .joins({ ":agents": { ":agents": { ":primaryContact": ":agents" } } })
        .toSql();
      expect(sql).toMatch(/agents_people_4/i);
    });
  });

  it("construct finder sql does not table name collide on duplicate associations with left outer joins", () => {
    const sql = Person.joins({ ":agents": ":agents" })
      .leftOuterJoins({ ":agents": ":agents" })
      .toSql();
    expect(sql).toMatch(/agents_people_2/i);
    expect(sql).toMatch(/INNER JOIN/i);
    expect(sql).not.toMatch(/agents_people_4/i);
    expect(sql).not.toMatch(/LEFT OUTER JOIN/i);
  });

  it("construct finder sql does not table name collide with string joins", async () => {
    const stringJoin =
      "JOIN people agents_people ON agents_people.primary_contact_id = agents_people_2.id AND agents_people.id > agents_people_2.id";

    const expected = people("susan");
    await assertQueriesMatch(/agents_people_2/i, undefined, false, async () => {
      const result = await Person.joins(":agents").joins(stringJoin);
      expect(result.map((p) => p.id)).toEqual([(expected as any).id]);
    });
  });

  it("construct finder sql does not table name collide with aliased joins", async () => {
    const agents = Person.arelTable.alias("agents_people");
    const agents2 = Person.arelTable.alias("agents_people_2");
    const constraint = agents
      .get("primary_contact_id")
      .eq(agents2.get("id"))
      .and(agents.get("id").gt(agents2.get("id")));

    const expected = people("susan");
    await assertQueriesMatch(/agents_people_2/i, undefined, false, async () => {
      const result = await Person.joins(":agents").joins(
        new Nodes.InnerJoin(agents, new Nodes.On(constraint)),
      );
      expect(result.map((p) => p.id)).toEqual([(expected as any).id]);
    });
  });

  it("user supplied joins order should be preserved", async () => {
    const stringJoin =
      "JOIN people agents_people_2 ON agents_people_2.primary_contact_id = people.id";
    const agents = Person.arelTable.alias("agents_people");
    const agents2 = Person.arelTable.alias("agents_people_2");
    const constraint = agents
      .get("primary_contact_id")
      .eq(agents2.get("id"))
      .and(agents.get("id").gt(agents2.get("id")));

    const expected = people("susan");
    const result = await Person.joins(stringJoin).joins(
      new Nodes.InnerJoin(agents, new Nodes.On(constraint)),
    );
    expect(result.map((p) => p.id)).toEqual([(expected as any).id]);
  });

  it("deduplicate joins", async () => {
    const postsTable = new Table("posts");
    const constraint = postsTable.get("author_id").eq(Author.arelTable.get("id"));

    let authorsRel = Author.joins(
      postsTable.createJoin(postsTable, postsTable.createOn(constraint)),
    );
    authorsRel = authorsRel
      .joins(":authorAddress")
      .merge(authorsRel.where({ "posts.type": "SpecialPost" }));

    const result = await authorsRel;
    expect(result.map((a) => a.id)).toEqual([(authors("david") as any).id]);
  });

  it("eager load with string joins", async () => {
    const stringJoin =
      "LEFT JOIN people agents_people ON agents_people.primary_contact_id = agents_people_2.id AND agents_people.id > agents_people_2.id";

    expect(await Person.eagerLoad(":agents").joins(stringJoin).count()).toBe(3);
  });

  it("eager load with arel joins", async () => {
    const agents = Person.arelTable.alias("agents_people");
    const agents2 = Person.arelTable.alias("agents_people_2");
    const constraint = agents
      .get("primary_contact_id")
      .eq(agents2.get("id"))
      .and(agents.get("id").gt(agents2.get("id")));
    const arelJoin = new Nodes.OuterJoin(agents, new Nodes.On(constraint));

    expect(await Person.eagerLoad(":agents").joins(arelJoin).count()).toBe(3);
  });

  it("construct finder sql ignores empty joins hash", () => {
    const sql = Author.joins({}).toSql();
    expect(sql).not.toMatch(/JOIN/i);
  });

  it("construct finder sql ignores empty joins array", () => {
    const sql = Author.joins([]).toSql();
    expect(sql).not.toMatch(/JOIN/i);
  });

  it("join conditions added to join clause", () => {
    const sql = Author.joins(":essays").toSql();
    expect(sql).toMatch(/writer_type.*?=.*?(Author|\?|\$1|:a1)/i);
    expect(sql).not.toMatch(/WHERE/i);
  });

  it("join association conditions support string and arel expressions", async () => {
    expect(await Author.joins(":welcomePostsWithOneComment").count()).toBe(0);
    expect(await Author.joins(":welcomePostsWithComments").count()).toBe(1);
  });

  it("join conditions allow nil associations", async () => {
    const authorsRel = Author.includes(":essays").where({ essays: { id: null } });
    expect(await authorsRel.count()).toBe(1);
  });

  it("join with reserved word", async () => {
    const result = await CategoryPost.joins(":group").where({
      "group.id": (categories("technology") as any).id,
    });
    expect(result.map((cp) => [(cp as any).post_id, (cp as any).category_id])).toEqual([
      [
        (categoriesPosts("technology_welcome") as any).post_id,
        (categoriesPosts("technology_welcome") as any).category_id,
      ],
    ]);
  });

  it("find with implicit inner joins without select does not imply readonly", async () => {
    const authors = await Author.joins(":posts");
    assertNot(authors.length === 0);
    assert(authors.every((a) => !a.isReadonly()));
  });

  it("find with implicit inner joins honors readonly with select", async () => {
    const authors = await Author.joins(":posts").select("authors.*");
    assertNot(authors.length === 0);
    assert(authors.every((a) => !a.isReadonly()));
  });

  it("find with implicit inner joins honors readonly false", async () => {
    const authors = await Author.joins(":posts").readonly(false);
    assertNot(authors.length === 0);
    assert(authors.every((a) => !a.isReadonly()));
  });

  it("find with implicit inner joins does not set associations", async () => {
    const authors = await Author.joins(":posts").select("authors.*");
    assertNot(authors.length === 0);
    assert(authors.every((a) => (a as any)._loadedAssociations?.posts === undefined));
  });

  it("count honors implicit inner joins", async () => {
    const allAuthors = await Author.all();
    let realCount = 0;
    for (const a of allAuthors) realCount += await (a as any).posts.count();
    expect(await Author.joins(":posts").count()).toBe(realCount);
  });

  it("calculate honors implicit inner joins", async () => {
    const allAuthors = await Author.all();
    let realCount = 0;
    for (const a of allAuthors) realCount += await (a as any).posts.count();
    expect(await Author.joins(":posts").count("authors.id")).toBe(realCount);
  });

  it("calculate honors implicit inner joins and distinct and conditions", async () => {
    const allAuthors = await Author.all();
    let realCount = 0;
    for (const a of allAuthors) {
      const ps = await (a as any).posts;
      if (ps.some((p: any) => String(p.title).startsWith("Welcome"))) realCount += 1;
    }
    const authorsWithWelcomingPostTitles = await Author.joins(":posts")
      .where("posts.title like 'Welcome%'")
      .distinct()
      .count("authors.id");
    expect(authorsWithWelcomingPostTitles).toBe(realCount);
  });

  it("find with sti join", async () => {
    const scope = Post.joins(":specialComments").where({ id: (posts("sti_comments") as any).id });

    assertEmpty(await scope.where({ "comments.type": "Comment" }));
    assertNotEmpty(await scope.where({ "comments.type": "SpecialComment" }));
    assertNotEmpty(await scope.where({ "comments.type": "SubSpecialComment" }));
  });

  it("find with conditions on reflection", async () => {
    assertNotEmpty(await (posts("welcome") as any).comments);
    assert(
      (await Post.joins(":nonexistentComments").where({ id: (posts("welcome") as any).id }))
        .length === 0,
    );
  });

  it("find with conditions on through reflection", async () => {
    assertNotEmpty(await (posts("welcome") as any).tags);
    assertEmpty(await Post.joins(":miscTags").where({ id: (posts("welcome") as any).id }));
  });

  it("the default scope of the target is applied when joining associations", async () => {
    const author = await Author.create({ name: "Jon" });
    await (author as any).association("categorizations").create({});
    await (author as any).association("categorizations").create({ special: true });

    const result = await Author.where({ id: author.id }).joins(":specialCategorizations");
    expect(result.map((a) => a.id)).toEqual([author.id]);
  });

  it("the default scope of the target is correctly aliased when joining associations", async () => {
    const author = await Author.create({ name: "Jon" });
    await (author as any).categories.create({ name: "Not Special" });
    await (author as any).specialCategories.create({ name: "Special" });

    const categoriesRel = await (author as any).categories
      .includes(":specialCategorizations")
      .references(":specialCategorizations");
    expect(categoriesRel.length).toBe(2);
  });

  it("the correct records are loaded when including an aliased association", async () => {
    const author = await Author.create({ name: "Jon" });
    await (author as any).categories.create({ name: "Not Special" });
    await (author as any).specialCategories.create({ name: "Special" });

    const cats = await (author as any).categories
      .eagerLoad(":specialCategorizations")
      .order("name");
    expect((await cats[0].specialCategorizations).length).toBe(0);
    expect((await cats[1].specialCategorizations).length).toBe(1);
  });

  it("joins a belongs_to association with a composite foreign key", async () => {
    const { ShardedComment, ShardedBlogPost } = await import("../test-helpers/models/sharded.js");
    const firstPostComments = await ShardedComment.joins(":blogPost").where({
      blogPost: { title: "My first post in my Blog1!" },
    });
    const expectedBlogPostFixture = shardedBlogPosts("great_post_blog_one");
    const expectedBlogPost = await ShardedBlogPost.where({
      blog_id: (expectedBlogPostFixture as any).blog_id,
      id: (expectedBlogPostFixture as any).id,
    }).first();

    assertNotEmpty(firstPostComments);
    const expectedComments = await (expectedBlogPost as any).comments;
    const sortById = (a: any, b: any) => Number(a.id) - Number(b.id);
    expect([...firstPostComments].sort(sortById).map((c) => Number(c.id))).toEqual(
      [...expectedComments].sort(sortById).map((c: any) => Number(c.id)),
    );
  });

  it("joins a has_many association with a composite foreign key", async () => {
    const { ShardedBlogPost } = await import("../test-helpers/models/sharded.js");
    const blogPosts = await ShardedBlogPost.joins(":comments").where({
      comments: { body: "Your first blog post is great!" },
    });

    const expectedComment = shardedComments("unique_comment_blog_post_one");
    assertNotEmpty(blogPosts);
    const itsBlogPost = await (expectedComment as any).blogPost;
    expect(Number((blogPosts[0] as any).id)).toEqual(Number(itsBlogPost.id));
  });

  it("inner joins includes all nested associations", async () => {
    const [sql] = await captureSql(async () => {
      await Friendship.joins([":friendFavoriteReferenceJob", ":followerFavoriteReferenceJob"]);
    });
    expect(sql).toMatch(/["`]friendships["`]\.["`]friend_id["`]/);
    expect(sql).toMatch(/["`]friendships["`]\.["`]follower_id["`]/);
  });
});
