import { describe, it, expect } from "vitest";
import { registerModel, registerSubclass, resetCallbacks } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Base } from "../base.js";
import { Author } from "../test-helpers/models/author.js";
import { Person } from "../test-helpers/models/person.js";
import { Post, SpecialPost, FirstPost } from "../test-helpers/models/post.js";
import {
  Comment,
  SpecialComment,
  SubSpecialComment,
  VerySpecialComment,
} from "../test-helpers/models/comment.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Category } from "../test-helpers/models/category.js";
import { Vertex } from "../test-helpers/models/vertex.js";
import { Edge } from "../test-helpers/models/edge.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply, SillyReply } from "../test-helpers/models/reply.js";
import { Company, Firm, Client } from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

describe("CascadedEagerLoadingTest", () => {
  const { authors, topics, vertices, companies, people } = fixtures([
    "authors",
    "posts",
    "topics",
    "companies",
    "accounts",
    "comments",
    "categorizations",
    "categories",
    "categoriesPosts",
    "edges",
    "vertices",
    "people",
  ]);

  Topic.inheritanceColumn = "type";
  registerModel(Person);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(FirstPost);
  Comment.inheritanceColumn = "type";
  registerModel(Comment);
  registerModel(SpecialComment);
  registerSubclass(SpecialComment);
  registerModel(SubSpecialComment);
  registerSubclass(SubSpecialComment);
  registerModel(VerySpecialComment);
  registerSubclass(VerySpecialComment);
  registerModel(Categorization);
  registerModel(Category);
  registerModel(Topic);
  registerModel(Reply);
  registerSubclass(Reply);
  registerModel(SillyReply);
  registerSubclass(SillyReply);
  registerModel(Vertex);
  registerModel(Edge);
  registerModel(Company);
  registerModel(Firm);
  registerModel(Client);
  registerModel(Account);

  const targetArr = (rec: Base, name: string): Base[] =>
    (rec.association(name).target as Base[]) ?? [];
  const target = (rec: Base, name: string): Base | null =>
    (rec.association(name).target as Base) ?? null;
  const commentCount = (posts: Base[]): number =>
    posts.reduce((sum, p) => sum + targetArr(p, "comments").length, 0);

  it("eager association loading with cascaded two levels", async () => {
    const loaded = await Author.all().includes({ ":posts": ":comments" }).order("id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading with cascaded two levels and one level", async () => {
    const loaded = await Author.all()
      .includes({ ":posts": ":comments" }, ":categorizations")
      .order("id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
    expect(targetArr(loaded[0], "categorizations")).toHaveLength(1);
    expect(targetArr(loaded[1], "categorizations")).toHaveLength(2);
  });

  it("eager association loading with hmt does not table name collide when joining associations", async () => {
    const authors = await Author.joins(":posts")
      .eagerLoad(":comments")
      .where({ posts: { tags_count: 1 } })
      .order(":id");
    await assertQueriesCount(0, false, () => {
      expect(authors).toHaveLength(3);
    });
    await assertQueriesCount(0, false, () => {
      expect(targetArr(authors[0], "comments")).toHaveLength(11);
    });
  });

  it("eager association loading dedups a manual join coinciding with an eager root", async () => {
    const loaded = await Author.all()
      .joins(":posts")
      .eagerLoad({ ":posts": ":comments" })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading dedups a single-step manual join and eager root", async () => {
    const loaded = await Author.all().joins(":posts").eagerLoad(":posts").order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
  });

  it("eager association loading dedups a manual join coinciding with a dotted eager root", async () => {
    const loaded = await Author.all()
      .joins(":posts")
      .eagerLoad("posts.comments")
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading dedups a nested hash-form manual join and eager spec", async () => {
    const loaded = await Author.all()
      .joins({ ":posts": ":comments" })
      .eagerLoad({ ":posts": ":comments" })
      .order("authors.id");
    expect(loaded).toHaveLength(2);
    expect(targetArr(loaded[0], "posts")).toHaveLength(4);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
    expect(targetArr(loaded[1], "posts")).toHaveLength(1);
    expect(commentCount(targetArr(loaded[1], "posts"))).toBe(1);
  });

  it("eager association loading dedups a through-association intermediate join and eager spec", async () => {
    const rel = Author.all().joins(":comments").eagerLoad(":comments").order("authors.id");
    const sql = rel.toSql();
    expect(sql).not.toMatch(/posts_authors/);
    const loaded = await rel;
    expect(loaded).toHaveLength(2);
    expect(targetArr(loaded[0], "comments")).toHaveLength(11);
    expect(targetArr(loaded[1], "comments")).toHaveLength(1);
  });

  it("eager association loading grafts stashed associations to correct parent", async () => {
    const person = await Person.all()
      .eagerLoad({ ":primaryContact": ":primaryContact" })
      .where("primary_contacts_people_2.first_name = ?", "Susan")
      .order("people.id")
      .first();
    expect(person).toBeInstanceOf(Person);
    expect(person!.id).toBe((people("michael") as any).id);
  });

  it("cascaded eager association loading with join for count", async () => {
    const categories = Category.all()
      .joins(":categorizations")
      .includes({ ":posts": ":comments" }, ":authors");
    expect(await categories.count()).toBe(4);
    expect((await categories).length).toBe(4);
    expect(await categories.distinct().count()).toBe(3);
    const uniqIds = new Set((await categories).map((c) => c.id));
    expect(uniqIds.size).toBe(3);
  });

  it("cascaded eager association loading with duplicated includes", async () => {
    const categories = Category.all()
      .includes(":categorizations")
      .includes({ ":categorizations": ":author" })
      .where("categorizations.id is not null")
      .references(":categorizations");
    expect(await categories.count()).toBe(3);
    expect((await categories).length).toBe(3);
  });

  it("cascaded eager association loading with twice includes edge cases", async () => {
    const categories = Category.all()
      .includes({ ":categorizations": ":author" })
      .includes({ ":categorizations": ":post" })
      .where("posts.id is not null")
      .references(":posts");
    expect(await categories.count()).toBe(3);
    expect((await categories).length).toBe(3);
  });

  it("eager association loading with join for count", async () => {
    const authorsRel = Author.all().joins(":specialPosts").includes(":posts", ":categorizations");
    await authorsRel.count();
    await assertQueriesCount(3, false, async () => {
      await authorsRel;
    });
  });

  it("eager association loading with nil associations", async () => {
    let authors = await Author.includes(null);
    expect(authors).toHaveLength(3);

    authors = await Author.includes([":posts", null]);
    expect(authors).toHaveLength(3);

    authors = await Author.includes({ ":posts": null });
    expect(authors).toHaveLength(3);
  });

  it("eager association loading with cascaded two levels with two has many associations", async () => {
    const loaded = await Author.all()
      .includes({ ":posts": [":comments", ":categorizations"] })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading with cascaded two levels and self table reference", async () => {
    const loaded = await Author.all()
      .includes({ ":posts": [":comments", ":author"] })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect((loaded[0] as any).name).toBe((authors("david") as any).name);
    const postAuthorNames = new Set(
      targetArr(loaded[0], "posts").map((p) => (target(p, "author") as any)?.name),
    );
    expect([...postAuthorNames]).toEqual([(authors("david") as any).name]);
  });

  it("eager association loading with cascaded two levels with condition", async () => {
    const loaded = await Author.all()
      .includes({ ":posts": ":comments" })
      .where("authors.id=1")
      .order("authors.id");
    expect(loaded).toHaveLength(1);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
  });

  it("eager association loading with cascaded three levels by ping pong", async () => {
    const firms = await Firm.all()
      .includes({ ":account": { ":firm": ":account" } })
      .order("companies.id");
    expect(firms).toHaveLength(3);
    const firstAccount = target(firms[0], "account") as Base;
    const firmAccount = target(target(firstAccount, "firm") as Base, "account") as Base;
    expect(firmAccount.id).toBe(firstAccount.id);
    const expected = (await (companies("first_firm") as Firm).loadHasOne("account")) as Base;
    await assertQueriesCount(0, false, () => {
      expect((target(target(firstAccount, "firm") as Base, "account") as Base).id).toBe(
        expected.id,
      );
    });
    const ffAccount = (await (companies("first_firm") as Firm).loadHasOne("account")) as Account;
    const ffFirm = (await ffAccount.loadBelongsTo("firm")) as Firm;
    const expectedDeep = (await ffFirm.loadHasOne("account")) as Base;
    await assertQueriesCount(0, false, () => {
      expect((target(target(firstAccount, "firm") as Base, "account") as Base).id).toBe(
        expectedDeep.id,
      );
    });
  });

  it("eager association loading with has many sti", async () => {
    const loaded = await Topic.all().includes(":replies").order("topics.id");
    const firstSize = (await Reply.where({ parent_id: (topics("first") as any).id })).length;
    const secondSize = (await Reply.where({ parent_id: (topics("second") as any).id })).length;
    await assertQueriesCount(0, false, () => {
      expect(targetArr(loaded[0], "replies")).toHaveLength(firstSize);
      expect(targetArr(loaded[1], "replies")).toHaveLength(secondSize);
    });
  });

  it("eager association loading with has many sti and subclasses", async () => {
    const reply = new Reply({ title: "gaga", content: "boo-boo", parent_id: 1 });
    expect(await reply.save()).toBe(true);

    const loaded = await Topic.all().includes(":replies").order(["topics.id", "replies_topics.id"]);
    await assertQueriesCount(0, false, () => {
      expect(targetArr(loaded[0], "replies")).toHaveLength(2);
      expect(targetArr(loaded[1], "replies")).toHaveLength(0);
    });
  });

  it("eager association loading with belongs to sti", async () => {
    const replies = await Reply.all().includes(":topic").order("topics.id");
    expect(replies.map((r) => r.id)).toContain((topics("second") as any).id);
    expect(replies.map((r) => r.id)).not.toContain((topics("first") as any).id);
    await assertQueriesCount(0, false, () => {
      expect((target(replies[0], "topic") as any)?.id).toBe((topics("first") as any).id);
    });
  });

  it("eager association loading with multiple stis and order", async () => {
    const author = await Author.all()
      .includes({ ":posts": [":specialComments", ":verySpecialComment"] })
      .order(["authors.name", "comments.body", "very_special_comments_posts.body"])
      .where("posts.id = 4")
      .first();
    expect(author!.id).toBe((authors("david") as any).id);
    await assertQueriesCount(0, false, () => {
      const post = targetArr(author!, "posts")[0];
      targetArr(post, "specialComments");
      target(post, "verySpecialComment");
    });
  });

  it("eager association loading of stis with multiple references", async () => {
    const loaded = await Author.all()
      .includes({
        ":posts": { ":specialComments": { ":post": [":specialComments", ":verySpecialComment"] } },
      })
      .order("comments.body, very_special_comments_posts.body")
      .where("posts.id = 4");
    expect(loaded.map((a) => a.id)).toEqual([(authors("david") as any).id]);
    await assertQueriesCount(0, false, () => {
      const post = target(
        targetArr(targetArr(loaded[0], "posts")[0], "specialComments")[0],
        "post",
      );
      targetArr(post!, "specialComments");
      target(post!, "verySpecialComment");
    });
  });

  it("eager association loading where first level returns nil", async () => {
    const loaded = await Author.all()
      .includes({ ":postAboutThinking": ":comments" })
      .order("authors.id DESC");
    expect(loaded.map((a) => a.id)).toEqual([
      (authors("bob") as any).id,
      (authors("mary") as any).id,
      (authors("david") as any).id,
    ]);
    await assertQueriesCount(0, false, () => {
      const post = target(loaded[2], "postAboutThinking") as Base;
      const firstComment = targetArr(post, "comments")[0] ?? null;
      expect(firstComment === null || firstComment instanceof Comment).toBe(true);
    });
  });

  it("preload through missing records", async () => {
    const post = await Post.all()
      .where()
      .not({ author_id: Author.all().select("id") })
      .preload({ ":author": { ":comments": ":post" } })
      .firstBang();
    await assertQueriesCount(0, false, () => {
      expect(target(post, "author")).toBeNull();
    });
  });

  it("eager association loading with missing first record", async () => {
    const posts = await Post.all()
      .where({ id: 3 })
      .preload({ ":author": { ":comments": ":post" } });
    expect(posts).toHaveLength(1);
  });

  it("eager association loading with recursive cascading four levels has many through", async () => {
    const source = (
      await Vertex.all()
        .includes({ ":sinks": { ":sinks": { ":sinks": ":sinks" } } })
        .order("vertices.id")
    )[0];
    await assertQueriesCount(0, false, () => {
      expect(targetArr(targetArr(targetArr(source, "sinks")[0], "sinks")[0], "sinks")[0].id).toBe(
        (vertices("vertex_4") as any).id,
      );
    });
  });

  it("eager association loading with recursive cascading four levels has and belongs to many", async () => {
    const sink = (
      await Vertex.all()
        .includes({ ":sources": { ":sources": { ":sources": ":sources" } } })
        .order("vertices.id DESC")
    )[0];
    await assertQueriesCount(0, false, () => {
      expect(
        targetArr(
          targetArr(targetArr(targetArr(sink, "sources")[0], "sources")[0], "sources")[0],
          "sources",
        )[0].id,
      ).toBe((vertices("vertex_1") as any).id);
    });
  });

  it("eager association loading with cascaded interdependent one level and two levels", async () => {
    const loaded = await Author.all()
      .includes(":comments", { ":posts": ":categorizations" })
      .order("authors.id");
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "comments")).toHaveLength(11);
    expect(targetArr(loaded[1], "comments")).toHaveLength(1);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    const catSum = targetArr(loaded[0], "posts").reduce(
      (sum, p) => sum + targetArr(p, "categorizations").length,
      0,
    );
    expect(catSum).toBe(3);
  });

  it("preloaded records are not duplicated", async () => {
    const author = (await Author.first())!;
    const expectedPosts = await Post.where({ author }).includes({ ":author": ":firstPosts" });
    const expected = expectedPosts.map(
      (post) => targetArr(target(post, "author")!, "firstPosts").length,
    );
    const actualPosts = await (author as any).posts
      .includes({ ":author": ":firstPosts" })
      .toArray();
    const actual = actualPosts.map(
      (post: Base) => targetArr(target(post, "author")!, "firstPosts").length,
    );
    expect(actual).toEqual(expected);
  });

  it("preloading across has one constrains loaded records", async () => {
    const author = (await Author.findBy({ id: (authors("david") as any).id }))!;

    const oldPost = await (author as any).posts.createBang({ title: "first post", body: "test" });
    await oldPost.comments.createBang({
      author: authors("mary"),
      body: "a response",
    });

    const recentPost = await (author as any).posts.createBang({
      title: "first post",
      body: "test",
    });
    const lastComment = await recentPost.comments.createBang({
      author: authors("bob"),
      body: "a response",
    });

    const authorsRel = Author.where({ id: author.id });
    const retrievedComments: Base[] = [];

    await resetCallbacks(Comment, "initialize", async () => {
      Comment.afterInitialize((record: Comment) => {
        retrievedComments.push(record);
      });
      await authorsRel.preload({ ":recentPost": ":comments" }).load();
    });

    expect(retrievedComments).toHaveLength(1);
    expect(retrievedComments[0]).toBeInstanceOf(Comment);
    expect(retrievedComments[0].id).toBe(lastComment.id);
  });

  it("preloading across has one through constrains loaded records", async () => {
    const author = (await Author.findBy({ id: (authors("david") as any).id }))!;

    const oldPost = await (author as any).posts.createBang({ title: "first post", body: "test" });
    await oldPost.comments.createBang({
      author: authors("mary"),
      body: "a response",
    });

    const recentPost = await (author as any).posts.createBang({
      title: "first post",
      body: "test",
    });
    await recentPost.comments.createBang({
      author: authors("bob"),
      body: "a response",
    });

    const authorsRel = Author.where({ id: author.id });
    const retrievedAuthors: Base[] = [];

    await resetCallbacks(Author, "initialize", async () => {
      Author.afterInitialize((record: Author) => {
        retrievedAuthors.push(record);
      });
      await authorsRel.preload({ ":recentResponse": ":author" }).load();
    });

    expect(retrievedAuthors).toHaveLength(2);
    expect(retrievedAuthors.map((r) => (r as any).id)).toEqual([
      author.id,
      (authors("bob") as any).id,
    ]);
  });
});
