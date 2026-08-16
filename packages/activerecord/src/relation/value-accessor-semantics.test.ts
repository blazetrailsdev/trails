/**
 * Rails-fidelity semantics for the `Relation::VALUE_METHODS`-generated value
 * accessors (query_methods.rb:162-181): the `joins_values=` split-routing
 * writer, the nil-vs-false tri-state of the single-value flags, and the
 * stored-reference reader semantics of the array readers. These exercise
 * trails-specific storage details (the unified `joins_values` store,
 * the `boolean | null` flag fields), so the names are descriptive rather
 * than mirrored from a metaprogrammed Rails test.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import type { Relation } from "../relation.js";
import { EXCEPT_ONLY_KEYS } from "./query-methods.js";

fixtures([]);
/** The split join-storage and group fields the reader semantics build on. */
type JoinInternals = {
  joinsValues: unknown[];
  groupValues: string[];
  orderValues: unknown[];
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
    expect(internals(rel).joinsValues).toEqual([
      { category: {} },
      "LEFT JOIN comments ON comments.post_id = posts.id",
    ]);
  });

  it("joins_values= round-trips in insertion order (no named-before-raw reorder)", () => {
    const rel = relation();
    rel.joinsValues = ["RAW JOIN x", { category: {} }];
    expect(rel.joinsValues).toEqual(["RAW JOIN x", { category: {} }]);
  });

  it("joins_values= overwrites prior join state", () => {
    const rel = relation();
    rel.joinsValues = [{ category: {} }];
    rel.joinsValues = ["RAW JOIN x"];
    expect(internals(rel).joinsValues).toEqual(["RAW JOIN x"]);
  });

  it("readonly_value defaults to nil (null) when unset", () => {
    expect(relation().readonlyValue).toBeNull();
  });

  it("reordering_value defaults to nil (null) when unset", () => {
    expect(relation().reorderingValue).toBeNull();
  });

  it("skip_query_cache_value defaults to nil (null) when unset", () => {
    expect(relation().skipQueryCacheValue).toBeNull();
  });

  it("readonly_value reflects an explicit false distinct from unset", () => {
    const rel = relation();
    rel.readonlyValue = false;
    expect(rel.readonlyValue).toBe(false);
    expect(rel.isReadonly).toBe(false);
  });

  it("unscope(:readonly) clears readonly_value back to nil (null)", () => {
    const rel = relation().readonly();
    expect(rel.readonlyValue).toBe(true);
    expect(rel.unscope("readonly").readonlyValue).toBeNull();
  });

  it("except(:strict_loading) clears strict_loading_value back to nil (null)", () => {
    const rel = relation().strictLoading();
    expect(rel.strictLoadingValue).toBe(true);
    expect(rel.except("strictLoading").strictLoadingValue).toBeNull();
  });

  it("group_values returns the stored reference", () => {
    const rel = relation().group("title");
    expect(rel.groupValues).toBe(internals(rel).groupValues);
  });

  it("order_values returns the stored reference", () => {
    const rel = relation().order("title");
    expect(rel.orderValues).toBe(internals(rel).orderValues);
  });

  it("order_values stores a raw SQL bind ordering as an Arel SqlLiteral node", () => {
    // Bind-array form [Arel.sql("... ?"), bind]: the interpolated raw SQL is
    // stored as a SqlLiteral node directly, so the reader returns it by
    // reference (no on-read normalization).
    const rel = relation().order([new Nodes.SqlLiteral("id = ?"), 1]);
    expect(rel.orderValues).toBe(internals(rel).orderValues);
    expect(rel.orderValues[0]).toBeInstanceOf(Nodes.SqlLiteral);
    // Bind is interpolated (quoting is adapter-specific, so match loosely).
    expect((rel.orderValues[0] as Nodes.SqlLiteral).value).toMatch(/^id = '?1'?$/);
  });

  it("select_values returns the shared frozen empty array when unset", () => {
    expect(relation().selectValues).toBe(relation().selectValues);
    expect(relation().selectValues).toEqual([]);
  });

  it("values() covers exactly the Relation::VALUE_METHODS key set", () => {
    // `values` is `@values.dup` (relation.rb:1281-1283), so it carries only the
    // keys actually set — a fresh relation has none — and every key it can
    // carry is a `Relation::VALUE_METHODS` entry, which is what `except`/`only`
    // slice against (spawn_methods.rb:59-68).
    expect(Object.keys(Post.all().values())).toEqual([]);
    const rel = Post.all().order("id").limit(2).distinct();
    expect(new Set(Object.keys(rel.values()))).toEqual(new Set(["order", "limit", "distinct"]));
    for (const key of Object.keys(rel.values())) {
      expect(EXCEPT_ONLY_KEYS).toContain(key);
    }
  });
});
