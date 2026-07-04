/**
 * Regression coverage for structural dedup of `left_outer_joins_values`
 * (RFC 0023 left-outer-joins-values-structural-dedup).
 *
 * Rails' `left_outer_joins!` unions with `left_outer_joins_values |= args`;
 * Array `|=` dedups by Ruby `eql?`/`hash`, which is structural for Hash specs.
 * trails previously deduped via JS `includes` (reference `===`), so a Hash spec
 * passed twice stored two structurally-equal entries and emitted a duplicate
 * LEFT OUTER JOIN. `deepEqual` now mirrors `eql?`: structural for plain objects,
 * identity for Arel nodes.
 *
 * Not a Rails-mirrored test name — this covers a trails-specific deviation with
 * no direct Ruby counterpart.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("left_outer_joins_values structural dedup", () => {
  fixtures({});
  beforeAll(() => {
    registerModel("Author", Author);
    registerModel("Post", Post);
    registerModel("Comment", Comment);
  });

  it("emits a single LEFT OUTER JOIN for a structurally-equal Hash spec joined twice", () => {
    const rel = Author.leftJoins({ posts: "comments" }).leftJoins({ posts: "comments" });
    // left_outer_joins_values |= dedups the structurally-equal Hash spec (eql?),
    // so the value survives once — mirroring Rails, not JS reference identity.
    expect(
      (rel as unknown as { leftOuterJoinsValues: unknown[] }).leftOuterJoinsValues,
    ).toHaveLength(1);
    const sql = (rel as unknown as { toSql(): string }).toSql();
    expect((sql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2); // posts + comments, no dup
  });
});
