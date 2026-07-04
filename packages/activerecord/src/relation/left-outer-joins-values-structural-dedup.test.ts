/**
 * Regression coverage for structural dedup of the join-value unions
 * (RFC 0023 left-outer-joins-values-structural-dedup).
 *
 * Rails' `left_outer_joins!` / `joins!` union with `|=`; Array `|=` dedups by
 * Ruby `eql?`/`hash`, which is structural for Hash specs (and, for Arel nodes,
 * `Arel::Nodes::Binary#eql?`). trails previously deduped via JS `includes`
 * (reference `===`) — and the inner-`joins` Hash path deduped not at all — so a
 * structurally-equal spec passed twice stored two entries and emitted a
 * duplicate JOIN. `structuralUnionEq` now mirrors `eql?`: `===` first, then a
 * node's own `eql`, then per-key structural equality for plain objects.
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

interface JoinValueHost {
  leftOuterJoinsValues: unknown[];
  _namedInnerJoins: unknown[];
  toSql(): string;
}

const asHost = (rel: unknown): JoinValueHost => rel as JoinValueHost;

describe("join value union structural dedup", () => {
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
    expect(asHost(rel).leftOuterJoinsValues).toHaveLength(1);
    const sql = asHost(rel).toSql();
    expect((sql.match(/LEFT OUTER JOIN/g) ?? []).length).toBe(2); // posts + comments, no dup
  });

  it("emits a single INNER JOIN for a structurally-equal Hash spec joined twice", () => {
    // The inner-joins Hash path previously pushed to _namedInnerJoins with no
    // dedup at all; joins_values |= folds the structurally-equal spec in Rails.
    const rel = Author.joins({ posts: "comments" }).joins({ posts: "comments" });
    expect(asHost(rel)._namedInnerJoins).toHaveLength(1);
    const sql = asHost(rel).toSql();
    expect((sql.match(/INNER JOIN/g) ?? []).length).toBe(2); // posts + comments, no dup
  });

  it("keeps distinct Hash specs as separate joins", () => {
    // Dedup is by value, not by shape: two hashes with the same key but
    // different nested target must both survive.
    const rel = Author.leftJoins({ posts: "comments" }).leftJoins({ posts: "author" });
    expect(asHost(rel).leftOuterJoinsValues).toHaveLength(2);
  });

  it("folds a structurally-equal Hash spec across a same-klass merge", () => {
    // Rails merge_joins unions via joins! (joins_values |=), so a same-klass
    // merge dedups the equal spec structurally rather than by reference.
    const rel = Author.joins({ posts: "comments" }).merge(Author.joins({ posts: "comments" }));
    expect(asHost(rel)._namedInnerJoins).toHaveLength(1);
  });
});
