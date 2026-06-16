/**
 * Regression: a same-table model's first sync `columnsHash()` load must return
 * the table's real columns even when the schema cache was cleared after a
 * sibling model resolved an aliased-table hash select. Previously the cleared
 * cache yielded an empty synthesized hash, un-qualifying the model's
 * projection (`SELECT title` instead of `SELECT "posts"."title"`).
 *
 * Tracked: RFC 0030 columnshash-empty-after-aliased-hash-select.
 */
import { describe, it, expect } from "vitest";
import "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Post, PostWithDefaultSelect } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { registerModel } from "./associations.js";

registerModel(Post);
registerModel(Comment);

const sym = (name: string) => Symbol(name) as unknown as string;

describe("columnsHash recovery after aliased hash select", () => {
  useHandlerFixtures(["posts", "comments"], { schema: canonicalSchema });

  it("loads same-table columns after a cleared schema cache", async () => {
    // Warm a same-table sibling (`posts`), then drop its persisted reflection
    // and the in-memory schema cache so the fresh load below has nothing to
    // read synchronously — exactly the mid-suite state the bug reproduced in.
    Post.columnsHash();
    (
      PostWithDefaultSelect as unknown as { resetColumnInformation(): void }
    ).resetColumnInformation();
    Post.connection.schemaCache!.clear();

    // Resolve an aliased-table hash select (the story's reproducer).
    Post.joins("comments", "commentsWithExtend")
      .select({ commentsWithExtend: { body: sym("comment_body_2") } })
      .toSql();

    const columns = (
      PostWithDefaultSelect as unknown as {
        columnsHash(): Record<string, unknown>;
      }
    ).columnsHash();
    expect(Object.keys(columns)).toContain("title");
    expect(PostWithDefaultSelect.reselect("title").toSql()).toBe(Post.select("title").toSql());
  });
});
