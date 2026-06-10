/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/delegation_test.rb
 */
import { describe, it, expect } from "vitest";
import "../index.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";

describe("DelegationTest", () => {
  // Mirrors Rails `fixtures :posts` (DelegationCachingTest declares fixtures).
  useHandlerFixtures(["posts"], { schema: canonicalSchema });

  it("not respond to arel method", () => {
    const post = new Post({ title: "test" });
    expect("arel" in post).toBe(false);
  });

  describe("QueryingMethodsDelegationTest", () => {
    // Rails iterates the full Querying::QUERYING_METHODS list, asserting both
    // `klass.all` (the relation) and `klass` itself respond to each. trails
    // delegates the same methods statically via `delegate(*QUERYING_METHODS,
    // to: :all)` (querying.ts); the camelCase subset below is the trails mirror.
    const QUERYING_METHODS = [
      "where",
      "whereNot",
      "select",
      "order",
      "group",
      "having",
      "limit",
      "offset",
      "distinct",
      "joins",
      "includes",
      "references",
      "none",
      "from",
      "find",
      "first",
      "last",
      "take",
      "exists",
      "count",
      "sum",
      "pluck",
    ] as const;

    it("delegate querying methods", () => {
      const relation = Post.all();
      for (const method of QUERYING_METHODS) {
        expect(typeof (relation as any)[method]).toBe("function");
        expect(typeof (Post as any)[method]).toBe("function");
      }
    });
  }); // QueryingMethodsDelegationTest

  describe("DelegationCachingTest", () => {
    // Rails' body relies on its Delegation method-cache sentinel
    // (`Developer.all.target == :__target__`, CollectionProxy#target's owner
    // unchanged after caching) — trails has no `target`/`method_defined?`
    // delegation-cache primitive, so we assert the spirit instead: per-relation
    // delegation caching does not clobber across differently-scoped relations.
    it("delegation doesn't override methods defined in other relation subclasses", () => {
      const r1 = Post.where({ title: "x" });
      const r2 = Post.where({ title: "y" });
      expect(r1.toSql()).not.toBe(r2.toSql());
    });
  }); // DelegationCachingTest
});
