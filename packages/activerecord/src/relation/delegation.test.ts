/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/delegation_test.rb
 */
import { describe, it, expect } from "vitest";
import { Relation } from "../index.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("DelegationTest", () => {
  // Mirrors Rails `fixtures :posts` (DelegationCachingTest declares fixtures).
  useHandlerFixtures(["posts"], { schema: canonicalSchema });

  it("not respond to arel method", () => {
    // Rails: `assert_not_respond_to target, :exists` — the relation must not
    // leak Arel SelectManager internals. trails' Relation already owns `exists`
    // (ActiveRecord's `exists?`), so we probe `project`, which is likewise an
    // Arel SelectManager method exposed only via `relation.arel()`, never on
    // the relation itself.
    const target = Comment.all();
    expect("project" in target).toBe(false);
    expect(typeof target.arel().project).toBe("function");
  });

  describe("QueryingMethodsDelegationTest", () => {
    // Rails asserts every Querying::QUERYING_METHODS entry responds on both
    // `klass.all` (the relation) and `klass` (delegated via
    // `delegate(*QUERYING_METHODS, to: :all)`). trails has no single module
    // constant to diff against — the delegators are the `declare static`
    // block in base.ts, individually wired by `extend()` — so the literal
    // list-equality half of the Rails test has no source-of-truth analogue;
    // the comprehensive respond-to sweep below is the faithful substitute,
    // covering the full delegated set (not a hand-picked slice) so a method
    // silently dropped from querying.ts/base.ts fails the test.
    const QUERYING_METHODS = [
      "where",
      "whereNot",
      "select",
      "reselect",
      "order",
      "reorder",
      "group",
      "regroup",
      "having",
      "limit",
      "offset",
      "distinct",
      "joins",
      "leftJoins",
      "leftOuterJoins",
      "includes",
      "preload",
      "eagerLoad",
      "references",
      "none",
      "from",
      "lock",
      "readonly",
      "rewhere",
      "unscope",
      "extending",
      "annotate",
      "optimizerHints",
      "or",
      "excluding",
      "find",
      "findBy",
      "first",
      "last",
      "take",
      "second",
      "third",
      "fourth",
      "fifth",
      "fortyTwo",
      "sole",
      "exists",
      "count",
      "sum",
      "average",
      "minimum",
      "maximum",
      "pluck",
      "pick",
      "ids",
      "findEach",
      "findInBatches",
      "inBatches",
      "findOrCreateBy",
      "findOrInitializeBy",
      "firstOrCreate",
      "firstOrInitialize",
      "destroyAll",
      "deleteAll",
      "updateAll",
      "deleteBy",
      "destroyBy",
      "insert",
      "insertAll",
      "upsert",
      "upsertAll",
      "isAny",
      "isMany",
      "isOne",
      "isEmpty",
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
    it("delegation doesn't override methods defined in other relation subclasses", () => {
      // Precondition (Rails): some methods exist on Relation subclasses but not
      // on Relation itself — `target` is defined on CollectionProxy but not on
      // Relation. (Rails: Relation.method_defined?(:target) == false,
      // CollectionProxy.method_defined?(:target) == true.)
      expect("target" in Relation.prototype).toBe(false);
      expect("target" in CollectionProxy.prototype).toBe(true);

      // trails has no `Developer.all.target == :__target__` delegation-cache
      // sentinel to probe, so we assert the invariant directly: exercising the
      // delegated querying methods on a relation must not generate a `target`
      // on Relation that would shadow CollectionProxy's own definition.
      const targetGetter = Object.getOwnPropertyDescriptor(
        CollectionProxy.prototype,
        "target",
      )?.get;
      Post.all().where({ title: "x" }).order("id").limit(1);
      expect("target" in Relation.prototype).toBe(false);
      expect(Object.getOwnPropertyDescriptor(CollectionProxy.prototype, "target")?.get).toBe(
        targetGetter,
      );
    });
  }); // DelegationCachingTest
});
