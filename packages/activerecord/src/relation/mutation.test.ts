/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/mutation_test.rb
 *
 * Rails' RelationMutationTest asserts that each bang method mutates the relation
 * in place, returns `self` (`assert relation.foo!(...).equal?(relation)`), and
 * writes the value into the matching internal accessor (`foo_values` /
 * `foo_value`). The trails port asserts the same contract against trails'
 * internal fields (`_orderClauses`, `_selectColumns`, `_lockValue`, …), which
 * are the camelCase equivalents of Rails' `*_values` / `*_value`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({ posts: TEST_SCHEMA.posts });
});

/** Fresh relation per test — the trails analogue of Rails' `Relation.new(FakeKlass)`. */
function relation(): any {
  return Post.all();
}

describe("RelationMutationTest", () => {
  // Rails: `(MULTI_VALUE_METHODS - [...]).each { |m| test "##{m}!" { ... } }` —
  // every multi-value bang returns self and appends its argument to the matching
  // `*_values` array. The metaprogrammed loop extracts to a single `#!` test
  // name; we sweep the supported multi-value bang methods to honor it.
  it("#!", () => {
    const MULTI: ReadonlyArray<[string, string]> = [
      ["includesBang", "_includesAssociations"],
      ["eagerLoadBang", "_eagerLoadAssociations"],
      ["preloadBang", "_preloadAssociations"],
      ["groupBang", "_groupColumns"],
      ["joinsBang", "_joinValues"],
      ["leftOuterJoinsBang", "_leftOuterJoinsValues"],
      ["referencesBang", "_referencesValues"],
      ["optimizerHintsBang", "_optimizerHints"],
      ["annotateBang", "_annotations"],
    ];
    for (const [bang, field] of MULTI) {
      const rel = relation();
      expect(rel[bang]("foo")).toBe(rel);
      expect(rel[field]).toContain("foo");
    }
  });

  it("#_select!", () => {
    const rel = relation();
    expect(rel._selectBang("foo")).toBe(rel);
    expect(rel._selectColumns).toEqual(["foo"]);
  });

  it("#order!", () => {
    const rel = relation();
    expect(rel.orderBang("title ASC")).toBe(rel);
    expect(rel._orderClauses).toEqual(["title ASC"]);
  });

  it("#order! with symbol prepends the table name", () => {
    // Rails passes a Symbol (`order!(:name)`), which build_order resolves to an
    // Arel attribute qualified by the table — `node.expr.name == "name"`,
    // `node.expr.relation.name == "posts"`. trails has no symbols; the faithful
    // analogue is an Arel attribute off the model's table, which orderBang stores
    // verbatim, so we assert the same qualified node.
    const rel = relation();
    const attr = Post.arelTable.get("title");
    expect(rel.orderBang(attr)).toBe(rel);
    const node = rel._orderClauses[0];
    expect(node.name).toBe("title");
    expect(node.relation.name).toBe("posts");
  });

  it("#order! on non-string does not attempt regexp match for references", () => {
    // Rails passes a bare Object and asserts it lands in order_values untouched
    // (no String#=~ reference scan). trails' analogue is any Arel node, which is
    // pushed by identity without raw-SQL/reference inspection.
    const rel = relation();
    const node = Post.arelTable.get("title");
    expect(rel.orderBang(node)).toBeTruthy();
    expect(rel._orderClauses).toEqual([node]);
  });

  it("extending!", () => {
    const rel = relation();
    const mod = {
      greeting() {
        return "hello";
      },
    };
    const mod2 = {
      farewell() {
        return "bye";
      },
    };
    expect(rel.extendingBang(mod)).toBe(rel);
    expect(rel._extending).toEqual([mod]);
    // Rails asserts `relation.is_a?(mod)`; the trails analogue is that the
    // module's methods are mixed onto the relation instance.
    expect(typeof rel.greeting).toBe("function");
    rel.extendingBang(mod2);
    expect(rel._extending).toEqual([mod, mod2]);
  });

  it("extending! with empty args", () => {
    const rel = relation();
    rel.extendingBang();
    expect(rel._extending).toEqual([]);
  });

  it("#from!", () => {
    const rel = relation();
    expect(rel.fromBang("foo")).toBe(rel);
    expect(rel._fromClause.value).toBe("foo");
  });

  it("#lock!", () => {
    const rel = relation();
    expect(rel.lockBang("foo")).toBe(rel);
    expect(rel._lockValue).toBe("foo");
  });

  it("#reorder!", () => {
    const rel: any = Post.order("foo");
    expect(rel.reorderBang("bar")).toBe(rel);
    expect(rel._orderClauses).toEqual(["bar"]);
    expect(rel._reordering).toBe(true);
  });

  it("#reorder! with symbol prepends the table name", () => {
    // Same symbol→qualified-attribute analogue as `#order! with symbol`.
    const rel = relation();
    const attr = Post.arelTable.get("title");
    expect(rel.reorderBang(attr)).toBe(rel);
    const node = rel._orderClauses[0];
    expect(node.name).toBe("title");
    expect(node.relation.name).toBe("posts");
  });

  it("reverse_order!", () => {
    const rel: any = Post.order("title ASC", "comments_count DESC");
    rel.reverseOrderBang();
    // trails stores reversed terms as [col, dir] tuples (Rails keeps strings like
    // "title DESC"); the flip — first term ASC→DESC, last DESC→ASC — is identical.
    expect(rel._orderClauses).toEqual([
      ["title", "desc"],
      ["comments_count", "asc"],
    ]);
    rel.reverseOrderBang();
    expect(rel._orderClauses).toEqual([
      ["title", "asc"],
      ["comments_count", "desc"],
    ]);
  });

  it("create_with!", () => {
    const rel = relation();
    expect(rel.createWithBang({ foo: "bar" })).toBe(rel);
    expect(rel._createWithAttrs).toEqual({ foo: "bar" });
  });

  it("merge!", () => {
    // Rails uses the hash form `merge!(select: :foo)`. trails' mergeBang merges a
    // relation field-by-field, so we merge a relation carrying the select; the
    // result is identical — select_values become [:foo] — and it returns self.
    const rel = relation();
    expect(rel.mergeBang(Post.select("body"))).toBe(rel);
    expect(rel._selectColumns).toEqual(["body"]);
  });

  it("merge with a proc", () => {
    // Rails: `merge(-> { select(:foo) })` instance-execs the proc in the relation
    // context. trails' mergeBang invokes a function arg as `fn.call(this)`, so the
    // proc mutates the relation directly.
    const rel = relation();
    rel.mergeBang(function (this: any) {
      this._selectBang("body");
    });
    expect(rel._selectColumns).toEqual(["body"]);
  });

  it("none!", async () => {
    const rel = relation();
    expect(rel.noneBang()).toBe(rel);
    expect(rel.isNone()).toBe(true);
    expect(rel.isNullRelation()).toBe(true);
  });

  it("skip_query_cache!", () => {
    const rel = relation();
    expect(rel.skipQueryCacheBang()).toBe(rel);
    expect(rel._skipQueryCache).toBe(true);
  });

  it("skip_preloading!", () => {
    const rel = relation();
    expect(rel.skipPreloadingBang()).toBe(rel);
    expect(rel._skipPreloading).toBe(true);
  });

  it("#regroup!", () => {
    const rel: any = Post.group("foo");
    expect(rel.regroupBang("bar")).toBe(rel);
    expect(rel._groupColumns).toEqual(["bar"]);
  });

  // Rails generates two separate loops that both produce "##{method}!" test names:
  // one for MULTI_VALUE_METHODS (above) and one for SINGLE_VALUE_METHODS (here).
  // The duplicate name is intentional — test:compare matches by description count.
  it("#!", () => {
    // Every single-value bang returns self and sets its `*_value` scalar.
    const SINGLE: ReadonlyArray<[string, unknown, string, unknown]> = [
      ["limitBang", 5, "_limitValue", 5],
      ["offsetBang", 5, "_offsetValue", 5],
      ["readonlyBang", true, "_isReadonly", true],
      ["distinctBang", true, "_isDistinct", true],
    ];
    for (const [bang, arg, field, expected] of SINGLE) {
      const rel = relation();
      expect(rel[bang](arg)).toBe(rel);
      expect(rel[field]).toBe(expected);
    }
  });

  it("distinct!", () => {
    const rel = relation();
    rel.distinctBang("foo");
    expect(rel._isDistinct).toBe("foo");
  });

  it("uniq! deduplicates the named clause array", () => {
    const rel: any = Post.group("title").group("title").group("author");
    expect(rel._groupColumns).toEqual(["title", "title", "author"]);
    rel.uniqBang("group");
    expect(rel._groupColumns).toEqual(["title", "author"]);
  });

  it("uniq! is a no-op for unknown clause names", () => {
    const rel: any = Post.group("title");
    expect(() => rel.uniqBang("unknown_clause")).not.toThrow();
  });

  it("uniq! with no argument is a no-op", () => {
    const rel: any = Post.group("title");
    expect(() => rel.uniqBang()).not.toThrow();
  });

  it("order! with empty string does not emit ORDER BY", () => {
    // Test the bang method directly — order() delegates to orderBang() on a clone.
    const rel: any = Post.all();
    rel.orderBang("");
    expect(rel.toSql()).not.toContain("ORDER BY");
  });
});
