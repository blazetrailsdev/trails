/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Mirrors associations/cascaded_eager_loading_test.rb — the cascaded
 * Author/Post/Comment/Categorization/Category/Topic/Vertex eager-loading suite.
 * Rails declares a single fixtures set for the whole class; we mirror that with
 * one `useHandlerFixtures` call seeding the canonical association tables.
 */
import { describe, it, expect } from "vitest";
import { registerModel, enableSti, registerSubclass, resetCallbacks } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
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
  const { authors, topics, vertices, companies, people } = useHandlerFixtures(
    [
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
    ],
    { schema: canonicalSchema },
  );

  enableSti(Topic);
  registerModel(Person);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(FirstPost);
  enableSti(Comment);
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
    const loaded = await Author.all().includes({ posts: "comments" }).order("id").toArray();
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading with cascaded two levels and one level", async () => {
    const loaded = await Author.all()
      .includes({ posts: "comments" }, "categorizations")
      .order("id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
    expect(targetArr(loaded[0], "categorizations")).toHaveLength(1);
    expect(targetArr(loaded[1], "categorizations")).toHaveLength(2);
  });

  it("eager association loading with hmt does not table name collide when joining associations", async () => {
    const authors = await Author.joins("posts")
      .eagerLoad("comments")
      .where({ posts: { tags_count: 1 } })
      .order("id")
      .toArray();
    await assertQueriesCount(0, false, () => {
      expect(authors).toHaveLength(3);
    });
    await assertQueriesCount(0, false, () => {
      expect(targetArr(authors[0], "comments")).toHaveLength(11);
    });
  });

  it("eager association loading grafts stashed associations to correct parent", async () => {
    const person = await Person.all()
      .eagerLoad({ primaryContact: "primaryContact" })
      .where("primary_contacts_people_2.first_name = ?", "Susan")
      .order("people.id")
      .first();
    // Rails: assert_equal people(:michael), ...first — AR#== is same class + same id.
    expect(person).toBeInstanceOf(Person);
    expect(person!.id).toBe((people("michael") as any).id);
  });

  it("cascaded eager association loading with join for count", async () => {
    const categories = Category.all()
      .joins("categorizations")
      .includes({ posts: "comments" }, "authors");
    expect(await categories.count()).toBe(4);
    expect((await categories.toArray()).length).toBe(4);
    expect(await categories.distinct().count()).toBe(3);
    const uniqIds = new Set((await categories.toArray()).map((c) => c.id));
    expect(uniqIds.size).toBe(3);
  });

  it("cascaded eager association loading with duplicated includes", async () => {
    const categories = Category.all()
      .includes("categorizations")
      .includes({ categorizations: "author" })
      .where("categorizations.id is not null")
      .references("categorizations");
    expect(await categories.count()).toBe(3);
    expect((await categories.toArray()).length).toBe(3);
  });

  it("cascaded eager association loading with twice includes edge cases", async () => {
    const categories = Category.all()
      .includes({ categorizations: "author" })
      .includes({ categorizations: "post" })
      .where("posts.id is not null")
      .references("posts");
    expect(await categories.count()).toBe(3);
    expect((await categories.toArray()).length).toBe(3);
  });

  it("eager association loading with join for count", async () => {
    const authorsRel = Author.all().joins("specialPosts").includes("posts", "categorizations");
    await authorsRel.count();
    await assertQueriesCount(3, false, async () => {
      await authorsRel.toArray();
    });
  });

  it("eager association loading with nil associations", async () => {
    let authors = await Author.includes(null).toArray();
    expect(authors).toHaveLength(3);

    authors = await Author.includes(["posts", null]).toArray();
    expect(authors).toHaveLength(3);

    authors = await Author.includes({ posts: null }).toArray();
    expect(authors).toHaveLength(3);
  });

  it("eager association loading with cascaded two levels with two has many associations", async () => {
    const loaded = await Author.all()
      .includes({ posts: ["comments", "categorizations"] })
      .order("authors.id")
      .toArray();
    expect(loaded).toHaveLength(3);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
    expect(targetArr(loaded[1], "posts")).toHaveLength(3);
    expect(commentCount(targetArr(loaded[0], "posts"))).toBe(11);
  });

  it("eager association loading with cascaded two levels and self table reference", async () => {
    const loaded = await Author.all()
      .includes({ posts: ["comments", "author"] })
      .order("authors.id")
      .toArray();
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
      .includes({ posts: "comments" })
      .where("authors.id=1")
      .order("authors.id")
      .toArray();
    expect(loaded).toHaveLength(1);
    expect(targetArr(loaded[0], "posts")).toHaveLength(5);
  });

  it("eager association loading with cascaded three levels by ping pong", async () => {
    const firms = await Firm.all()
      .includes({ account: { firm: "account" } })
      .order("companies.id")
      .toArray();
    expect(firms).toHaveLength(3);
    const firstAccount = target(firms[0], "account") as Base;
    const firmAccount = target(target(firstAccount, "firm") as Base, "account") as Base;
    expect(firmAccount.id).toBe(firstAccount.id);
    // companies(:first_firm).account — fixture record's has_one, loaded directly.
    const expected = (await (companies("first_firm") as Firm).loadHasOne("account")) as Base;
    await assertQueriesCount(0, false, () => {
      expect((target(target(firstAccount, "firm") as Base, "account") as Base).id).toBe(
        expected.id,
      );
    });
    // companies(:first_firm).account.firm.account — same value via a deeper walk.
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
    const loaded = await Topic.all().includes("replies").order("topics.id").toArray();
    // topics(:first).replies.size / topics(:second).replies.size — Topic#replies
    // is has_many Reply by parent_id, so query it directly to avoid loading the
    // fixture record's proxy (whose STI subtree drags in an unrelated inverse_of).
    const firstSize = (await Reply.where({ parent_id: (topics("first") as any).id }).toArray())
      .length;
    const secondSize = (await Reply.where({ parent_id: (topics("second") as any).id }).toArray())
      .length;
    await assertQueriesCount(0, false, () => {
      expect(targetArr(loaded[0], "replies")).toHaveLength(firstSize);
      expect(targetArr(loaded[1], "replies")).toHaveLength(secondSize);
    });
  });

  it.skip("eager association loading with has many sti and subclasses", () => {
    // BLOCKED: join-dependency eager-load alias ordering gap.
    // ROOT-CAUSE: `order: ["topics.id", "replies_topics.id"]` over `includes(:replies)`
    //   forces an eager-load join aliased `replies_topics`; trails' alias naming
    //   differs. Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
  });

  it("eager association loading with belongs to sti", async () => {
    const replies = await Reply.all().includes("topic").order("topics.id").toArray();
    expect(replies.map((r) => r.id)).toContain((topics("second") as any).id);
    expect(replies.map((r) => r.id)).not.toContain((topics("first") as any).id);
    await assertQueriesCount(0, false, () => {
      expect((target(replies[0], "topic") as any)?.id).toBe((topics("first") as any).id);
    });
  });

  it("eager association loading with multiple stis and order", async () => {
    const author = await Author.all()
      .includes({ posts: ["specialComments", "verySpecialComment"] })
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

  it.skip("eager association loading of stis with multiple references", () => {
    // BLOCKED: join-dependency eager-load alias ordering gap.
    // ROOT-CAUSE: includes({posts: {special_comments: {post: ...}}}) with order on
    //   `very_special_comments_posts.body` needs the same alias-naming fidelity.
    //   Tracked: RFC 0030 story cascaded-eager-join-emit-alias.
  });

  it("eager association loading where first level returns nil", async () => {
    const loaded = await Author.all()
      .includes({ postAboutThinking: "comments" })
      .order("authors.id DESC")
      .toArray();
    expect(loaded.map((a) => a.id)).toEqual([
      (authors("bob") as any).id,
      (authors("mary") as any).id,
      (authors("david") as any).id,
    ]);
    await assertQueriesCount(0, false, () => {
      // Rails (rb:171) only evaluates post_about_thinking.comments.first inside
      // the 0-query guard and never asserts the value (.first may be nil), so we
      // exercise the preloaded access without strengthening: a Comment or null.
      const post = target(loaded[2], "postAboutThinking") as Base;
      const firstComment = targetArr(post, "comments")[0] ?? null;
      expect(firstComment === null || firstComment instanceof Comment).toBe(true);
    });
  });

  it("preload through missing records", async () => {
    const post = await Post.all()
      .whereNot({ author_id: Author.all().select("id") })
      .preload({ author: { comments: "post" } })
      .firstBang();
    await assertQueriesCount(0, false, () => {
      expect(target(post, "author")).toBeNull();
    });
  });

  it("eager association loading with missing first record", async () => {
    const posts = await Post.all()
      .where({ id: 3 })
      .preload({ author: { comments: "post" } })
      .toArray();
    expect(posts).toHaveLength(1);
  });

  it("eager association loading with recursive cascading four levels has many through", async () => {
    const source = (
      await Vertex.all()
        .includes({ sinks: { sinks: { sinks: "sinks" } } })
        .order("vertices.id")
        .toArray()
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
        .includes({ sources: { sources: { sources: "sources" } } })
        .order("vertices.id DESC")
        .toArray()
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
      .includes("comments", { posts: "categorizations" })
      .order("authors.id")
      .toArray();
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
    const expectedPosts = await Post.where({ author }).includes({ author: "firstPosts" }).toArray();
    const expected = expectedPosts.map(
      (post) => targetArr(target(post, "author")!, "firstPosts").length,
    );
    const actualPosts = await (author as any).posts.includes({ author: "firstPosts" }).toArray();
    const actual = actualPosts.map(
      (post: Base) => targetArr(target(post, "author")!, "firstPosts").length,
    );
    expect(actual).toEqual(expected);
  });

  it("preloading across has one constrains loaded records", async () => {
    const author = (await Author.findBy({ id: (authors("david") as any).id }))!;

    const oldPost = await (author as any).posts.createBang({ title: "first post", body: "test" });
    await oldPost.comments.createBang({
      author_id: (authors("mary") as any).id,
      body: "a response",
    });

    const recentPost = await (author as any).posts.createBang({
      title: "first post",
      body: "test",
    });
    const lastComment = await recentPost.comments.createBang({
      author_id: (authors("bob") as any).id,
      body: "a response",
    });

    const authorsRel = Author.where({ id: author.id });
    const retrievedComments: Base[] = [];

    await resetCallbacks(Comment, "initialize", async () => {
      Comment.afterInitialize((record: Comment) => {
        retrievedComments.push(record);
      });
      await authorsRel.preload({ recentPost: "comments" }).load();
    });

    // Rails: assert_equal [last_comment], retrieved_comments — AR#== is same
    // class + same id, so match the recorded record's class and id.
    expect(retrievedComments).toHaveLength(1);
    expect(retrievedComments[0]).toBeInstanceOf(Comment);
    expect(retrievedComments[0].id).toBe(lastComment.id);
  });

  it.skip("preloading across has one through constrains loaded records", () => {
    // BLOCKED: nested preload through a has_one :through does not instantiate the
    //   nested association (separate from the now-available resetCallbacks API).
    // ROOT-CAUSE: `preload(recent_response: :author)` loads recent_response (the
    //   has_one :through), but the nested `:author` on that record is never
    //   instantiated, so the after_initialize recorder sees 1 record instead of
    //   2. The recentResponse target loads; its `author` child does not preload.
    //   Tracked: RFC 0030 story nested-preload-through-has-one-source.
  });
});
