/**
 * Single-PK eager-count limit/offset id subquery must apply the relation's
 * order.
 *
 * The single-PK eager-count limit/offset branch in `calculations.ts` builds a
 * `SELECT DISTINCT pk ... LIMIT/OFFSET` id-materialization subquery to bound
 * which ROWS participate before the re-count. It previously applied only
 * joins, wheres, from, take, and skip — never the relation's `order_values`.
 * Rails `distinct_relation_for_primary_key`
 * (schema_statements.rb:1429-1452) builds the limited relation via
 * `columns_for_distinct(primary_key_columns, relation.order_values)`, i.e. it
 * RETAINS the order so the LIMIT/OFFSET selects a deterministic, Rails-ordered
 * top-n set of primary keys.
 *
 * Without the order,
 * `Model.eager_load(:assoc).order(:col).limit(n).count(:other)` materializes an
 * arbitrary limited id set, so the subsequent `COUNT(DISTINCT other)` over
 * `pk IN (<ids>)` can diverge from Rails whenever the ordered vs unordered
 * top-n rows differ. This mirrors the composite-PK sibling (PR #4549), which
 * already applies `_applyOrderToManager(idSubquery, table)`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../associations.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { captureSql } from "../testing/sql-capture.js";
import type { Base } from "../index.js";

describe("Post single-PK eager count limit id subquery applies order", () => {
  fixtures([]);

  beforeAll(() => {
    [Post, Comment].forEach((m) => registerModel(m as unknown as typeof Base));
  });

  // Order by title ascending picks a different top-2 than pk order:
  //   pk order (1, 2)  → tags_count {5, 7} → COUNT(DISTINCT) = 2
  //   title order (A=2, B=3) → tags_count {7, 7} → COUNT(DISTINCT) = 1
  // So a limited id set that ignores the order would (wrongly) count 2.
  async function seedPosts(): Promise<void> {
    await Post.create({ id: 1, title: "C", body: "b", tags_count: 5 });
    await Post.create({ id: 2, title: "A", body: "b", tags_count: 7 });
    await Post.create({ id: 3, title: "B", body: "b", tags_count: 7 });
    // Two comments on post 2 fan the LEFT OUTER JOIN, so the DISTINCT-pk id
    // fetch must de-duplicate.
    await Comment.create({ post_id: 2, body: "c1" });
    await Comment.create({ post_id: 2, body: "c2" });
    await Comment.create({ post_id: 1, body: "c3" });
    await Comment.create({ post_id: 3, body: "c4" });
  }

  it("eager_load(:comments).order(:title).limit(n).count(column) counts over the ordered top-n rows", async () => {
    await seedPosts();
    let count = 0;
    const sqls = await captureSql(async () => {
      count = (await Post.eagerLoad("comments")
        .order("title")
        .limit(2)
        .count("posts.tags_count")) as number;
    });
    // Rails materializes the ordered, limited DISTINCT pk set (posts 2 & 3),
    // then re-counts COUNT(DISTINCT tags_count) over `pk IN (...)` — both rows
    // have tags_count 7, so the answer is 1. An unordered top-2 (posts 1 & 2)
    // would wrongly return 2.
    expect(count).toBe(1);
    // The id-materialization subquery carries the ORDER BY title.
    const idSql = sqls.find(
      (s) => /DISTINCT/i.test(s) && /ORDER BY/i.test(s) && /LIMIT 2/i.test(s),
    );
    expect(idSql).toBeTruthy();
    expect(idSql).toMatch(/ORDER BY.*title/i);
  });

  it("eager_load(:comments).order(:title).offset(n).count(column) counts over the ordered rows after the offset", async () => {
    await seedPosts();
    // title order: A=2, B=3, C=1. offset(1) drops post 2, leaving posts 3 & 1
    // → tags_count {7, 5} → COUNT(DISTINCT) = 2. An unordered offset could drop
    // a different row and diverge.
    const count = await Post.eagerLoad("comments")
      .order("title")
      .offset(1)
      .count("posts.tags_count");
    expect(count).toBe(2);
  });
});
