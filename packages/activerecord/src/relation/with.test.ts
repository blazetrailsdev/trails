/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { Base } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    posts: {
      title: "string",
      tags_count: "integer",
      legacy_comments_count: "integer",
      type: "string",
    },
    comments: { post_id: "integer" },
    companies: { firm_id: "integer" },
  });
});

function ids(records: any[]): number[] {
  return records.map((r) => Number(r.id)).sort((a, b) => a - b);
}

// ==========================================================================
// WithTest — targets relation/with_test.rb
// ==========================================================================
describe("WithTest", () => {
  it("with when hash is passed as an argument", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("legacy_comments_count", "integer");
      }
    }
    await Post.create({ title: "no comments", legacy_comments_count: 0 });
    const p2 = await Post.create({ title: "has comments", legacy_comments_count: 1 });
    const postsWithComments = [p2.id as number];

    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).from("posts_with_comments AS posts");

    expect(ids(await relation.order("id").toArray())).toEqual(postsWithComments);
  });

  it("with when hash with multiple elements of different type is passed as an argument", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
        this.attribute("legacy_comments_count", "integer");
      }
    }
    const p1 = await Post.create({
      title: "tagged+multi-comment",
      tags_count: 1,
      legacy_comments_count: 2,
    });
    await Post.create({ title: "tagged only", tags_count: 1, legacy_comments_count: 0 });
    await Post.create({ title: "tagged+1comment", tags_count: 1, legacy_comments_count: 1 });
    await Post.create({ title: "none", tags_count: 0, legacy_comments_count: 0 });
    const postsWithTagsAndMultipleComments = [p1.id as number];

    const cteOptions = {
      posts_with_tags: Post.arelTable
        .project(arelSql("*"))
        .where(Post.arelTable.get("tags_count").gt(0)),
      posts_with_tags_and_comments: arelSql(
        "SELECT * FROM posts_with_tags WHERE legacy_comments_count > 0",
      ),
      posts_with_tags_and_multiple_comments: Post.where("legacy_comments_count > 1").from(
        "posts_with_tags_and_comments AS posts",
      ),
    };
    const relation = Post.with(cteOptions as any).from(
      "posts_with_tags_and_multiple_comments AS posts",
    );

    expect(ids(await relation.order("id").toArray())).toEqual(postsWithTagsAndMultipleComments);
  });

  it("with when invalid argument is passed", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    expect(() => {
      (Post.with as any)(Post.where({ type: "Post" }));
    }).toThrow(/Unsupported argument type/);
  });

  it("multiple with calls", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
        this.attribute("legacy_comments_count", "integer");
      }
    }
    const p1 = await Post.create({
      title: "tagged+comment1",
      tags_count: 1,
      legacy_comments_count: 1,
    });
    const p2 = await Post.create({
      title: "tagged+comment2",
      tags_count: 1,
      legacy_comments_count: 2,
    });
    await Post.create({ title: "none", tags_count: 0 });
    const postsWithTagsAndComments = [p1.id as number, p2.id as number].sort((a, b) => a - b);

    const relation = Post.with({ posts_with_tags: Post.where("tags_count > 0") })
      .from("posts_with_tags_and_comments AS posts")
      .with({
        posts_with_tags_and_comments: arelSql(
          "SELECT * FROM posts_with_tags WHERE legacy_comments_count > 0",
        ) as any,
      });

    expect(ids(await relation.order("id").toArray())).toEqual(postsWithTagsAndComments);
  });

  it("multiple dupicate with calls", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
      }
    }
    const p1 = await Post.create({ title: "t1", tags_count: 1 });
    const p2 = await Post.create({ title: "t2", tags_count: 2 });
    const p3 = await Post.create({ title: "t3", tags_count: 3 });
    await Post.create({ title: "none", tags_count: 0 });
    const postsWithTags = [p1.id as number, p2.id as number, p3.id as number].sort((a, b) => a - b);

    const postsWithTagsRel = Post.where("tags_count > 0");
    const relation = Post.with({
      posts_with_tags: postsWithTagsRel,
      one_more_posts_with_tags: postsWithTagsRel,
    })
      .with({ posts_with_tags: postsWithTagsRel })
      .from("posts_with_tags AS posts");

    expect(ids(await relation.order("id").toArray())).toEqual(postsWithTags);
  });

  it("count after with call", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("legacy_comments_count", "integer");
      }
    }
    await Post.create({ title: "with comment", legacy_comments_count: 1 });
    await Post.create({ title: "without", legacy_comments_count: 0 });
    const relation = Post.with({ posts_with_comments: Post.where("legacy_comments_count > 0") });

    expect(await Post.count()).toEqual(await relation.count());
    expect(await relation.from("posts_with_comments AS posts").count()).toEqual(1);
    expect(
      await relation.joins("JOIN posts_with_comments ON posts_with_comments.id = posts.id").count(),
    ).toEqual(1);
  });

  it("with when called from active record scope", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
      }
      static withTagsCte() {
        return Post.with({ posts_with_tags: Post.where("tags_count > 0") }).from(
          "posts_with_tags AS posts",
        );
      }
    }
    const p1 = await Post.create({ title: "tagged1", tags_count: 2 });
    const p2 = await Post.create({ title: "tagged2", tags_count: 1 });
    await Post.create({ title: "untagged", tags_count: 0 });
    const postsWithTags = [p1.id as number, p2.id as number].sort((a, b) => a - b);

    expect(ids(await Post.withTagsCte().order("id").toArray())).toEqual(postsWithTags);
  });

  it("with when invalid params are passed", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
      }
    }
    expect(() => Post.with({ posts_with_tags: null as any }).load()).toThrow();
    expect(() =>
      Post.with({ posts_with_tags: [Post.where("tags_count > 0"), 5 as any] }).load(),
    ).toThrow();
  });

  it("with when passing arrays", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("tags_count", "integer");
        this.attribute("legacy_comments_count", "integer");
        this.attribute("type", "string");
      }
    }
    const special = await Post.create({ title: "special", type: "SpecialPost" });
    const tagged = await Post.create({ title: "tagged", tags_count: 1 });
    const commented = await Post.create({ title: "commented", legacy_comments_count: 1 });
    const expected = [special.id as number, tagged.id as number, commented.id as number].sort(
      (a, b) => a - b,
    );

    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [
        Post.where({ type: "SpecialPost" }),
        arelSql("SELECT * FROM posts WHERE tags_count > 0") as any,
        Post.where("legacy_comments_count > 0"),
      ],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    expect(ids(await relation.order("id").toArray())).toEqual(expected);
  });

  it("with when passing single item array", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("type", "string");
      }
    }
    const special = await Post.create({ title: "special", type: "SpecialPost" });
    await Post.create({ title: "normal" });
    const specialIds = [special.id as number];

    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [Post.where({ type: "SpecialPost" })],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    expect(ids(await relation.order("id").toArray())).toEqual(specialIds);
  });

  it("with recursive", async () => {
    class Company extends Base {
      static {
        this.attribute("firm_id", "integer");
      }
    }
    const top1 = await Company.create({ firm_id: null });
    const top2 = await Company.create({ firm_id: null });
    const child1 = await Company.create({ firm_id: top1.id });
    const child2 = await Company.create({ firm_id: top2.id });
    const topCompaniesAndChildren = [
      top1.id as number,
      top2.id as number,
      child1.id as number,
      child2.id as number,
    ].sort((a, b) => a - b);

    const relation = (Company.withRecursive as any)({
      top_companies_and_children: [
        Company.where({ firm_id: null }),
        Company.joins(
          "JOIN top_companies_and_children ON companies.firm_id = top_companies_and_children.id",
        ),
      ],
    }).from("top_companies_and_children AS companies");

    expect(ids(await relation.order("id").toArray())).toEqual(topCompaniesAndChildren);
    expect(relation.toSql()).toMatch(/WITH RECURSIVE/i);
  });

  it("with joins", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class Comment extends Base {
      static {
        this.attribute("post_id", "integer");
      }
    }
    const p1 = await Post.create({ title: "with comment" });
    await Post.create({ title: "no comment" });
    await Comment.create({ post_id: p1.id });
    const postsWithComments = [p1.id as number];

    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() }).joins(
      "JOIN commented_posts ON commented_posts.post_id = posts.id",
    );

    expect(ids(await relation.order("id").toArray())).toEqual(postsWithComments);
  });

  it("with left joins", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
      }
    }
    class Comment extends Base {
      static {
        this.attribute("post_id", "integer");
      }
    }
    const p1 = await Post.create({ title: "with comment" });
    await Post.create({ title: "no comment" });
    await Comment.create({ post_id: p1.id });
    const postsWithComments = [p1.id as number];

    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() })
      .joins("LEFT OUTER JOIN commented_posts ON commented_posts.post_id = posts.id")
      .select("posts.*, commented_posts.post_id as has_comments");

    const records = await relation.order("posts.id").toArray();

    expect(records.length).toEqual(await Post.count());
    expect(
      records
        .filter((r: any) => r.readAttribute("has_comments") != null)
        .map((r: any) => Number(r.id)),
    ).toEqual(postsWithComments);
  });

  it.skip("raises when using block", () => {
    // TypeScript has no block/proc syntax; this Rails constraint is not applicable.
  });

  it("unscoping", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("legacy_comments_count", "integer");
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });

    const relation = Post.with({ posts_with_comments: Post.where("legacy_comments_count > 0") });

    const ctes = relation.values()["with"] as Array<{ name: string }>;
    expect(ctes.flatMap((c) => [c.name]).includes("posts_with_comments")).toBe(true);
    const unscoped = relation.unscope("with");
    expect((unscoped.values()["with"] as any[]).length).toBe(0);
    expect(await unscoped.count()).toEqual(await Post.count());
  });

  it.skip("common table expressions are unsupported", () => {
    // The test adapter (SQLite) supports CTEs. This branch only runs on
    // adapters that don't, which aren't exercised in the test suite.
  });
});
