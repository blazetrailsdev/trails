import { describe, it, expect } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Company } from "../test-helpers/models/company.js";
import { describeIfSupports } from "../support/supports.js";

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

function toIds(ids: any[]): number[] {
  return ids.map((id) => Number(id));
}

describeIfSupports("common_table_expressions", "WithTest", () => {
  fixtures(["comments", "posts", "companies"]);

  it("with when hash is passed as an argument", async () => {
    const relation = Post.with({
      posts_with_comments: Post.where("legacy_comments_count > 0"),
    }).from("posts_with_comments AS posts");

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(POSTS_WITH_COMMENTS);
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

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(
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

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(POSTS_WITH_TAGS_AND_COMMENTS);
  });

  it("multiple dupicate with calls", async () => {
    const postsWithTags = Post.where("tags_count > 0");
    const relation = Post.with({
      posts_with_tags: postsWithTags,
      one_more_posts_with_tags: postsWithTags,
    })
      .with({ posts_with_tags: postsWithTags })
      .from("posts_with_tags AS posts");

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(POSTS_WITH_TAGS);
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

  it("count after with call with bound conditions", async () => {
    const relation = Post.with({ typed_posts: Post.where({ type: "Post" }) })
      .from("typed_posts AS posts")
      .where({ type: "Post" });

    expect(await relation.count()).toEqual(await Post.where({ type: "Post" }).count());
  });

  it("with when called from active record scope", async () => {
    expect(toIds(await (Post as any).withTagsCte().order("id").pluck("id"))).toEqual(
      POSTS_WITH_TAGS,
    );
  });

  it("with when invalid params are passed", async () => {
    await expect(Post.with({ posts_with_tags: null as any }).load()).rejects.toThrow(
      /Unsupported argument type/,
    );
    await expect(
      Post.with({ posts_with_tags: [Post.where("tags_count > 0"), 5 as any] }).load(),
    ).rejects.toThrow(/Unsupported argument type/);
  });

  it("with when passing arrays", async () => {
    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [
        Post.where({ type: "SpecialPost" }),
        arelSql("SELECT * FROM posts WHERE tags_count > 0") as any,
        Post.where("legacy_comments_count > 0"),
      ],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    const expected = [...SPECIAL_POSTS, ...POSTS_WITH_TAGS, ...POSTS_WITH_COMMENTS].sort(
      (a, b) => a - b,
    );
    expect(toIds(await relation.order("id").pluck("id"))).toEqual(expected);
  });

  it("with when passing single item array", async () => {
    const relation = Post.with({
      posts_with_special_type_or_tags_or_comments: [Post.where({ type: "SpecialPost" })],
    }).from("posts_with_special_type_or_tags_or_comments AS posts");

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(
      [...SPECIAL_POSTS].sort((a, b) => a - b),
    );
  });

  it("with recursive", async () => {
    const topCompanies = await Company.where({ firm_id: null });
    const childCompanies = await Company.where({ firm_id: topCompanies });
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

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(topCompaniesAndChildren);
    expect(relation.toSql()).toMatch("WITH RECURSIVE");
  });

  it("with joins", async () => {
    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() }).joins(
      ":commented_posts",
    );

    expect(toIds(await relation.order("id").pluck("id"))).toEqual(POSTS_WITH_COMMENTS);
  });

  it("with joins routes a cte symbol to an inner join", () => {
    const sql = (
      Post.with({
        commented_posts: Comment.select("post_id").distinct(),
      }).joins(":commented_posts") as unknown as { toSql(): string }
    ).toSql();

    const q = `["\`]?`;
    expect(sql).toMatch(
      new RegExp(
        `INNER JOIN ${q}commented_posts${q} ON ${q}commented_posts${q}\\.${q}post_id${q} = ${q}posts${q}\\.${q}id${q}`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`LEFT OUTER JOIN ${q}commented_posts${q}`));
  });

  it("with left joins", async () => {
    const relation = Post.with({ commented_posts: Comment.select("post_id").distinct() })
      .joins("LEFT OUTER JOIN commented_posts ON commented_posts.post_id = posts.id")
      .select("posts.*, commented_posts.post_id as has_comments");

    const records = await relation.order("id");

    expect(records.length).toEqual(await Post.count());
    expect(
      records
        .filter((r: any) => r.readAttribute("has_comments") != null)
        .map((r: any) => Number(r.id)),
    ).toEqual(POSTS_WITH_COMMENTS);
  });

  it("with left joins routes a cte symbol to a left outer join", () => {
    const relation = Post.with({
      commented_posts: Comment.select("post_id").distinct(),
    })
      .leftOuterJoins(":commented_posts")
      .select("posts.id");

    const sql = (relation as unknown as { toSql(): string }).toSql();

    const q = `["\`]?`;
    expect(sql).toMatch(
      new RegExp(
        `LEFT OUTER JOIN ${q}commented_posts${q} ON ${q}commented_posts${q}\\.${q}post_id${q} = ${q}posts${q}\\.${q}id${q}`,
      ),
    );
    expect(sql).not.toMatch(new RegExp(`INNER JOIN ${q}commented_posts${q}`));
  });

  it("with left joins routes a cte symbol before a raw joins node", () => {
    const relation = Post.with({
      commented_posts: Comment.select("post_id").distinct(),
    })
      .joins("INNER JOIN authors ON authors.id = posts.author_id")
      .leftOuterJoins(":commented_posts")
      .select("posts.id");

    const sql = (relation as unknown as { toSql(): string }).toSql();

    const q = `["\`]?`;
    const cteJoin = sql.search(new RegExp(`LEFT OUTER JOIN ${q}commented_posts${q}`));
    const rawJoin = sql.search(/INNER JOIN authors/);
    expect(cteJoin).toBeGreaterThanOrEqual(0);
    expect(rawJoin).toBeGreaterThanOrEqual(0);
    expect(cteJoin).toBeLessThan(rawJoin);
  });

  it("raises when using block", () => {
    expect(() => (Post as any).with({ attributes_for_inspect: "id" }, () => {})).toThrow(
      /does not accept a block/,
    );
  });

  it("unscoping", async () => {
    const relation = Post.with({ posts_with_comments: Post.where("legacy_comments_count > 0") });

    const ctes = relation.values()["with"] as Array<Record<string, unknown>>;
    expect(ctes.flatMap((c) => Object.keys(c)).includes("posts_with_comments")).toBe(true);
    const unscoped = relation.unscope("with");
    expect(unscoped.values()["with"]).toBeUndefined();
    expect(await unscoped.count()).toEqual(await Post.count());
  });
});

describe("WithTest", () => {
  it.skip("common table expressions are unsupported", () => {});
});
