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
import { registerModel, enableSti, registerSubclass } from "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Base } from "../base.js";
import { Author } from "../test-helpers/models/author.js";
import { Post, SpecialPost, FirstPost } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Category } from "../test-helpers/models/category.js";
import { Vertex } from "../test-helpers/models/vertex.js";
import { Edge } from "../test-helpers/models/edge.js";
import { Topic } from "../test-helpers/models/topic.js";
import { Reply, SillyReply } from "../test-helpers/models/reply.js";
import { assertQueriesCount } from "../testing/query-assertions.js";

describe("CascadedEagerLoadingTest", () => {
  const { authors, topics, vertices } = useHandlerFixtures(
    [
      "authors",
      "posts",
      "topics",
      "comments",
      "categorizations",
      "categories",
      "categoriesPosts",
      "edges",
      "vertices",
    ],
    { schema: canonicalSchema },
  );

  enableSti(Topic);
  registerModel(Author);
  registerModel(Post);
  registerModel(SpecialPost);
  registerModel(FirstPost);
  registerModel(Comment);
  registerModel(Categorization);
  registerModel(Category);
  registerModel(Topic);
  registerModel(Reply);
  registerSubclass(Reply);
  registerModel(SillyReply);
  registerSubclass(SillyReply);
  registerModel(Vertex);
  registerModel(Edge);

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

  it.skip("eager association loading with hmt does not table name collide when joining associations", () => {
    // BLOCKED: join-dependency self-join aliasing gap.
    // ROOT-CAUSE: Author.joins(:posts).eager_load(:comments) (comments is
    //   has_many :through :posts) emits a second un-aliased `posts` join and
    //   raises `ambiguous column name: posts.id`. Rails aliases to
    //   `posts_authors`. Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
  });

  it.skip("eager association loading grafts stashed associations to correct parent", () => {
    // BLOCKED: join-dependency self-join aliasing gap.
    // ROOT-CAUSE: Person.eager_load(primary_contact: :primary_contact) needs the
    //   generated self-join alias `primary_contacts_people_2`; trails' alias
    //   naming differs. Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
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

  it.skip("eager association loading with cascaded three levels by ping pong", () => {
    // BLOCKED: canonical Company model lacks enableSti.
    // ROOT-CAUSE: Firm.all returns all 12 companies because
    //   test-helpers/models/company.ts never calls enableSti, so STI type
    //   scoping is absent. Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
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

  it.skip("eager association loading with multiple stis and order", () => {
    // BLOCKED: join-dependency eager-load alias ordering gap.
    // ROOT-CAUSE: includes + order on eager-load aliases
    //   (`very_special_comments_posts.body`) needs the alias-naming fidelity
    //   above. Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
  });

  it.skip("eager association loading of stis with multiple references", () => {
    // BLOCKED: join-dependency eager-load alias ordering gap.
    // ROOT-CAUSE: includes({posts: {special_comments: {post: ...}}}) with order on
    //   `very_special_comments_posts.body` needs the same alias-naming fidelity.
    //   Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
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

  it.skip("preloading across has one constrains loaded records", () => {
    // BLOCKED: no reset_callbacks / callback-removal API.
    // ROOT-CAUSE: test installs a temporary after_initialize recorder via
    //   reset_callbacks to assert a has_one (ordered) preload instantiates only
    //   the constrained record; trails callbacks.ts exposes registration only.
    //   Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
  });

  it.skip("preloading across has one through constrains loaded records", () => {
    // BLOCKED: no reset_callbacks / callback-removal API.
    // ROOT-CAUSE: as above, for a has_one :through (recent_response) preload.
    //   Tracked: RFC 0030 story cascaded-eager-join-alias-and-callbacks.
  });
});
