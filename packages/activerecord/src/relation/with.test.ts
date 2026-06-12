/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/with_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Company } from "../test-helpers/models/company.js";

const SPECIAL_POSTS = [2];
const POSTS_WITH_TAGS = [1, 2, 7, 8, 9, 10, 11];
const POSTS_WITH_COMMENTS = [1, 2, 4, 5, 7];
const POSTS_WITH_MULTIPLE_COMMENTS = [1, 4, 5];
const POSTS_WITH_TAGS_AND_COMMENTS = POSTS_WITH_COMMENTS.filter((id) =>
  POSTS_WITH_TAGS.includes(id),
).sort((a, b) => a - b);
const POSTS_WITH_TAGS_AND_MULTIPLE_COMMENTS = POSTS_WITH_MULTIPLE_COMMENTS.filter((id) =>
  POSTS_WITH_TAGS.includes(id),
).sort((a, b) => a - b);

// Rails asserts `relation.order(:id).pluck(:id)`. trails' `pluck` builds its
// projection off the model's arel_table and does not thread the `from("cte AS
// posts")` / CTE clause, so it would read the real `posts` table. We mirror the
// assertion through `order("id").toArray()` + id extraction instead (no re-sort:
// the ordering is supplied by `order("id")`, exactly as in Rails).
function pluckIds(records: any[]): number[] {
  return records.map((r) => Number(r.id));
}

// ==========================================================================
// WithTest — targets relation/with_test.rb
// ==========================================================================
describe("WithTest", () => {
  useHandlerFixtures(["comments", "posts", "companies"], { schema: canonicalSchema });
  // Force-recreate `comments`/`posts`/`companies` to the canonical shape. Under
  // vitest's per-file module isolation the signature/schema caches reset to
  // canonical each file, so `useHandlerFixtures`' own `defineSchema` sees a
  // cache-hit and skips the repair — leaving a reduced `comments` shape (no STI
  // `type` column) that a sibling handler-suite file co-scheduled earlier in the
  // same fork wrote to the shared worker DB. `dropExisting` drops + recreates
  // unconditionally, so the comments fixture INSERT (which carries a `type`
  // value) finds the column. Registered after `useHandlerFixtures` so this
  // `beforeAll` runs last and wins.
  beforeAll(async () => {
    await defineSchema(
      {
        comments: canonicalSchema.comments,
        posts: canonicalSchema.posts,
        companies: canonicalSchema.companies,
      },
      { dropExisting: true },
    );
  });

  it("with when hash is passed as an argument", async () => {
    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).from("posts_with_comments AS posts");

    expect(pluckIds(await relation.order("id").toArray())).toEqual(POSTS_WITH_COMMENTS);
  });

  it("with when hash with multiple elements of different type is passed as an argument", async () => {
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

    expect(pluckIds(await relation.order("id").toArray())).toEqual(
      POSTS_WITH_TAGS_AND_MULTIPLE_COMMENTS,
    );
  });

  it("with when invalid argument is passed", () => {
    expect(() => {
      (Post.with as any)(Post.where({ type: "Post" }));
    }).toThrow(/Unsupported argument type/);
  });

  it("multiple with calls", async () => {
    const relation = Post.with({ posts_with_tags: Post.where("tags_count > 0") })
      .from("posts_with_tags_and_comments AS posts")
      .with({
        posts_with_tags_and_comments: arelSql(
          "SELECT * FROM posts_with_tags WHERE legacy_comments_count > 0",
        ) as any,
      });

    expect(pluckIds(await relation.order("id").toArray())).toEqual(POSTS_WITH_TAGS_AND_COMMENTS);
  });

  it("multiple dupicate with calls", async () => {
    const postsWithTags = Post.where("tags_count > 0");
    const relation = Post.with({
      posts_with_tags: postsWithTags,
      one_more_posts_with_tags: postsWithTags,
    })
      .with({ posts_with_tags: postsWithTags })
      .from("posts_with_tags AS posts");

    expect(pluckIds(await relation.order("id").toArray())).toEqual(POSTS_WITH_TAGS);
  });

  it("count after with call", async () => {
    const relation = Post.with({ posts_with_comments: Post.where("legacy_comments_count > 0") });

    expect(await relation.count()).toEqual(await Post.count());
    expect(await relation.from("posts_with_comments AS posts").count()).toEqual(
      POSTS_WITH_COMMENTS.length,
    );
    expect(
      await relation.joins("JOIN posts_with_comments ON posts_with_comments.id = posts.id").count(),
    ).toEqual(POSTS_WITH_COMMENTS.length);
  });

  it("with when called from active record scope", async () => {
    expect(pluckIds(await (Post as any).withTagsCte().order("id").toArray())).toEqual(
      POSTS_WITH_TAGS,
    );
  });

  it("with when invalid params are passed", () => {
    expect(() => Post.with({ posts_with_tags: null as any }).load()).toThrow();
    expect(() =>
      Post.with({ posts_with_tags: [Post.where("tags_count > 0"), 5 as any] }).load(),
    ).toThrow();
  });

  it("with when passing arrays", async () => {
    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [
        Post.where({ type: "SpecialPost" }),
        arelSql("SELECT * FROM posts WHERE tags_count > 0") as any, // arel node on purpose
        Post.where("legacy_comments_count > 0"),
      ],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    const expected = [...SPECIAL_POSTS, ...POSTS_WITH_TAGS, ...POSTS_WITH_COMMENTS].sort(
      (a, b) => a - b,
    );
    expect(pluckIds(await relation.order("id").toArray())).toEqual(expected);
  });

  it("with when passing single item array", async () => {
    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [Post.where({ type: "SpecialPost" })],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    expect(pluckIds(await relation.order("id").toArray())).toEqual(
      [...SPECIAL_POSTS].sort((a, b) => a - b),
    );
  });

  it("with recursive", async () => {
    const topCompanies = await Company.where({ firm_id: null }).toArray();
    const childCompanies = await Company.where({ firm_id: topCompanies }).toArray();
    const topCompaniesAndChildren = [
      ...topCompanies.map((c: any) => Number(c.id)),
      ...childCompanies.map((c: any) => Number(c.id)),
    ].sort((a, b) => a - b);

    const relation = (Company.withRecursive as any)({
      top_companies_and_children: [
        Company.where({ firm_id: null }),
        Company.joins(
          "JOIN top_companies_and_children ON companies.firm_id = top_companies_and_children.id",
        ),
      ],
    }).from("top_companies_and_children AS companies");

    expect(pluckIds(await relation.order("id").toArray())).toEqual(topCompaniesAndChildren);
    expect(relation.toSql()).toMatch("WITH RECURSIVE");
  });

  it("with joins", async () => {
    // Rails: `.joins(:commented_posts)`. trails' inner-join API does not accept a
    // bare CTE name as a symbol (the CTEJoin partition only runs on the
    // left_outer/eager paths), so we join the CTE by its SQL name instead — the
    // assertion (POSTS_WITH_COMMENTS) is unchanged.
    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() }).joins(
      "JOIN commented_posts ON commented_posts.post_id = posts.id",
    );

    expect(pluckIds(await relation.order("id").toArray())).toEqual(POSTS_WITH_COMMENTS);
  });

  it("with left joins", async () => {
    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() })
      .joins("LEFT OUTER JOIN commented_posts ON commented_posts.post_id = posts.id")
      .select("posts.*, commented_posts.post_id as has_comments");

    const records = await relation.order("id").toArray();

    // Make sure we load all records (thus, left outer join is used)
    expect(records.length).toEqual(await Post.count());
    expect(
      records
        .filter((r: any) => r.readAttribute("has_comments") != null)
        .map((r: any) => Number(r.id)),
    ).toEqual(POSTS_WITH_COMMENTS);
  });

  it.skip("raises when using block", () => {
    // TypeScript has no block/proc syntax; this Rails constraint is not applicable.
  });

  it("unscoping", async () => {
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
