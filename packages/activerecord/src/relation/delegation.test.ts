/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/relation/delegation_test.rb
 */
import { describe, it, expect } from "vitest";
import { Relation, registerModel } from "../index.js";
import { delegateArrayMethod } from "./delegation.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";

describe("DelegationTest", () => {
  // Mirrors Rails `fixtures :posts` (DelegationCachingTest declares fixtures).
  // `comments` is added for the Enumerable delegation sweep below
  // (DelegationRelationTest declares `fixtures :comments`).
  useHandlerFixtures(["posts", "comments"], { schema: canonicalSchema });

  registerModel(Post);
  registerModel(Comment);

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
    //   - `withCte`: trails' class-level name for Rails' `with`; only the `with`
    //     alias exists on the Relation, so we sweep `with` (the Rails
    //     QUERYING_METHODS name) below — `withCte` is the same delegator.
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
      "and",
      "invertWhere",
      "inOrderOf",
      "strictLoading",
      "without",
      "only",
      "merge",
      "with",
      "withRecursive",
      "find",
      "findBy",
      "findByBang",
      "first",
      "firstBang",
      "last",
      "lastBang",
      "take",
      "takeBang",
      "second",
      "secondBang",
      "third",
      "thirdBang",
      "fourth",
      "fourthBang",
      "fifth",
      "fifthBang",
      "fortyTwo",
      "fortyTwoBang",
      "secondToLast",
      "secondToLastBang",
      "thirdToLast",
      "thirdToLastBang",
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
      "asyncIds",
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

  describe("delegateArrayMethod curated list", () => {
    // Rails delegates only the curated `delegate ... to: :records` set plus the
    // Enumerable methods `Relation` mixes in (delegation.rb:101); anything else
    // falls through method_missing → super and raises NoMethodError. trails must
    // mirror that boundary rather than delegating arbitrary `Array.prototype`
    // methods (the PR #3497 deviation).
    const records = () => ["a", "b", "c"];

    it("delegates curated/Enumerable members to the records", () => {
      for (const method of [
        "forEach",
        "join",
        "reverse",
        "slice",
        "map",
        "sort",
        "indexOf",
        "lastIndexOf", // Rails `rindex`
      ]) {
        expect(typeof delegateArrayMethod(method, records)).toBe("function");
      }
      expect(delegateArrayMethod("join", records)!(",")).toBe("a,b,c");
    });

    it("does not delegate JS-only Array methods absent from Rails", () => {
      // These raise NoMethodError in Rails; returning undefined lets the proxy
      // fall through so the call is rejected rather than silently succeeding.
      for (const method of ["findIndex", "flat", "copyWithin", "fill", "findLast"]) {
        expect(delegateArrayMethod(method, records)).toBeUndefined();
      }
    });
  });

  // Mirrors Rails' DelegationWhitelistBlacklistTests, which generates a
  // `test_delegates_<method>_to_Array` per ARRAY_DELEGATES entry; `partition`
  // is an `Enumerable` method `Relation`/`CollectionProxy` mix in. It is
  // present on an *unloaded* target (Rails' `assert_respond_to`) and — because
  // JS has no blocking IO — is async: invoking it loads the records itself
  // (mirroring Rails' `records` → `load`), then splits them. `partition`
  // returns `[matched, unmatched]` preserving order.
  describe("DelegationAssociationTest", () => {
    it("delegates partition to Array", async () => {
      const post = await Post.first();
      const target = (post as any).comments;
      // Unloaded — partition is still present and loads the rows on call.
      expect(typeof (target as any).partition).toBe("function");

      const records: any[] = await (target as any).load();
      const firstId = records[0].id;
      const [matched, unmatched] = await (target as any).partition((c: any) => c.id === firstId);
      expect(matched.map((c: any) => c.id)).toEqual([firstId]);
      expect(unmatched.map((c: any) => c.id)).toEqual(records.slice(1).map((c: any) => c.id));
    });
  }); // DelegationAssociationTest

  describe("DelegationRelationTest", () => {
    it("delegates partition to Array", async () => {
      const target = Comment.all();
      // Unloaded — partition is still present and loads the rows on call.
      expect(typeof (target as any).partition).toBe("function");

      const records: any[] = await (target as any).toArray();
      const firstId = records[0].id;
      const [matched, unmatched] = await (target as any).partition((c: any) => c.id === firstId);
      expect(matched.map((c: any) => c.id)).toEqual([firstId]);
      expect(unmatched.map((c: any) => c.id)).toEqual(records.slice(1).map((c: any) => c.id));
    });
  }); // DelegationRelationTest
});
