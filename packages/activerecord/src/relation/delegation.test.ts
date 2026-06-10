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
    // Rails: `assert_not_respond_to target, :exists` — `:exists` is an Arel
    // SelectManager method that must NOT leak onto the Relation. We can't reuse
    // the same probe here because trails' `Relation.exists()` is the legitimate
    // port of ActiveRecord's `exists?` (not an Arel leak), so we pick `project`,
    // another Arel SelectManager method that lives only on `relation.arel()`
    // and must likewise stay off the relation itself.
    const target = Comment.all();
    expect("project" in target).toBe(false);
    expect(typeof target.arel().project).toBe("function");
  });

  describe("QueryingMethodsDelegationTest", () => {
    // Rails asserts every Querying::QUERYING_METHODS entry responds on both
    // `klass.all` (the relation) and `klass` (delegated via
    // `delegate(*QUERYING_METHODS, to: :all)`). trails has no single module
    // constant to diff against — the delegators are the `declare static`
    // block in base.ts, individually wired by `extend(Base, Querying)` — so the
    // literal list-equality half of the Rails test has no source-of-truth
    // analogue; the comprehensive respond-to sweep below is the faithful
    // substitute, covering the full delegated set (not a hand-picked slice) so
    // a method silently dropped from querying.ts/base.ts fails the test.
    //
    // Intentionally excluded:
    //   - `isNone`: Rails QUERYING_METHODS' `none?` is the no-records predicate,
    //     which trails delegates as `isEmpty` (see querying.ts isEmpty doc:
    //     "Rails' `none?` … falls through to `empty?`"). `Relation#isNone()` is
    //     a separate null-relation predicate (`_isNone`), intentionally not a
    //     class-level querying delegator.
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
      "findOrCreateByBang",
      "findOrInitializeBy",
      "firstOrCreate",
      "firstOrCreateBang",
      "firstOrInitialize",
      "createOrFindBy",
      "createOrFindByBang",
      "destroyAll",
      "deleteAll",
      "updateAll",
      "touchAll",
      "deleteBy",
      "destroyBy",
      "insert",
      "insertBang",
      "insertAll",
      "insertAllBang",
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

      // Rails triggers the contamination path by calling `Developer.all.target`
      // (which would insert `target` into the delegation cache); the assertion
      // is that this never shadows `CollectionProxy#target`. trails has no
      // `:__target__` sentinel, so we read `.target` off a Relation directly —
      // it is `undefined` (correct trails behavior: Relation has no `target`) —
      // and assert that touching it neither defines `target` on Relation nor
      // mutates CollectionProxy's own `target` getter.
      const targetGetter = Object.getOwnPropertyDescriptor(
        CollectionProxy.prototype,
        "target",
      )?.get;
      expect((Post.all() as any).target).toBeUndefined();
      expect("target" in Relation.prototype).toBe(false);
      expect(Object.getOwnPropertyDescriptor(CollectionProxy.prototype, "target")?.get).toBe(
        targetGetter,
      );
    });
  }); // DelegationCachingTest
});
