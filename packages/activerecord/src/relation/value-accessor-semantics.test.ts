/**
 * Rails-fidelity semantics for the `Relation::VALUE_METHODS`-generated value
 * accessors (query_methods.rb:162-181): the `joins_values=` split-routing
 * writer, the nil-vs-false tri-state of the single-value flags, and the
 * stored-reference reader semantics of the array readers. These exercise
 * trails-specific storage details (the `_namedInnerJoins`/`_joinValues` split,
 * the `boolean | undefined` flag fields), so the names are descriptive rather
 * than mirrored from a metaprogrammed Rails test.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import type { Relation } from "../relation.js";

setupFixtures();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ posts: TEST_SCHEMA.posts });
});

/** The split join-storage and group fields the reader semantics build on. */
type JoinInternals = {
  _namedInnerJoins: unknown[];
  _joinValues: unknown[];
  _groupColumns: string[];
};

function relation(): Relation<Post> {
  return Post.all();
}

function internals(rel: Relation<Post>): JoinInternals {
  return rel as unknown as JoinInternals;
}

describe("Relation value accessor Rails semantics", () => {
  it("joins_values= split-routes association hashes and raw joins", () => {
    const rel = relation();
    rel.joinsValues = [{ category: {} }, "LEFT JOIN comments ON comments.post_id = posts.id"];
    expect(internals(rel)._namedInnerJoins).toEqual([{ category: {} }]);
    expect(internals(rel)._joinValues).toEqual([
      "LEFT JOIN comments ON comments.post_id = posts.id",
    ]);
  });

  it("joins_values= places named joins ahead of raw joins (reader concat order)", () => {
    const rel = relation();
    rel.joinsValues = ["RAW JOIN x", { category: {} }];
    expect(rel.joinsValues).toEqual([{ category: {} }, "RAW JOIN x"]);
  });

  it("joins_values= overwrites prior join state", () => {
    const rel = relation();
    rel.joinsValues = [{ category: {} }];
    rel.joinsValues = ["RAW JOIN x"];
    expect(internals(rel)._namedInnerJoins).toEqual([]);
    expect(internals(rel)._joinValues).toEqual(["RAW JOIN x"]);
  });

  it("readonly_value defaults to nil (undefined) when unset", () => {
    expect(relation().readonlyValue).toBeUndefined();
  });

  it("reordering_value defaults to nil (undefined) when unset", () => {
    expect(relation().reorderingValue).toBeUndefined();
  });

  it("skip_query_cache_value defaults to nil (undefined) when unset", () => {
    expect(relation().skipQueryCacheValue).toBeUndefined();
  });

  it("readonly_value reflects an explicit false distinct from unset", () => {
    const rel = relation();
    rel.readonlyValue = false;
    expect(rel.readonlyValue).toBe(false);
    expect(rel.isReadonly).toBe(false);
  });

  it("unscope(:readonly) clears readonly_value back to nil (undefined)", () => {
    const rel = relation().readonly();
    expect(rel.readonlyValue).toBe(true);
    expect(rel.unscope("readonly").readonlyValue).toBeUndefined();
  });

  it("except(:strict_loading) clears strict_loading_value back to nil (undefined)", () => {
    const rel = relation().strictLoading();
    expect(rel.strictLoadingValue).toBe(true);
    expect(rel.except("strictLoading").strictLoadingValue).toBeUndefined();
  });

  it("group_values returns the stored reference", () => {
    const rel = relation().group("title");
    expect(rel.groupValues).toBe(internals(rel)._groupColumns);
  });

  it("select_values returns the shared frozen empty array when unset", () => {
    expect(relation().selectValues).toBe(relation().selectValues);
    expect(relation().selectValues).toEqual([]);
  });
});
