import { describe, it, expect } from "vitest";
import {
  delegateArrayMethod,
  generateRelationMethod,
  relationClassFor,
  associationRelationClassFor,
  disableJoinsAssociationRelationClassFor,
  collectionProxyClassFor,
  uncacheableMethods,
} from "./delegation.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { fixtures } from "../test-fixtures.js";
import { registerModel } from "../index.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import "../association-relation.js";
import "../disable-joins-association-relation.js";

describe("generated relation methods — per-model prototype carrier", () => {
  it("installs a generated delegator as a real method on the per-model carrier", () => {
    const fn = function (this: unknown) {
      return "generated-result";
    };
    generateRelationMethod(Post as never, "somethingGenerated", fn);

    const carrier = relationClassFor(Post as never).prototype as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(carrier, "somethingGenerated")).toBe(true);
    expect(carrier.somethingGenerated).toBe(fn);
  });

  it("keeps the first generated delegator for a name (Rails' method_defined? memo)", () => {
    generateRelationMethod(Post as never, "memoizedGenerated", () => "first");
    generateRelationMethod(Post as never, "memoizedGenerated", () => "second");

    const rel = Post.all() as unknown as { memoizedGenerated: () => string };
    expect(rel.memoizedGenerated()).toBe("first");
  });

  it("resolves the generated method on a constructed relation via prototype lookup", () => {
    generateRelationMethod(Post as never, "anotherGenerated", function () {
      return 42;
    });
    const rel = Post.all() as unknown as { anotherGenerated: () => number };
    expect(typeof rel.anotherGenerated).toBe("function");
    expect(rel.anotherGenerated()).toBe(42);
  });

  it("reports the base Relation class name (per-model carrier stays anonymous)", () => {
    const carrier = relationClassFor(Post as never);
    expect(carrier.name).toBe("Relation");
    expect((Post.limit(2) as unknown as { constructor: { name: string } }).constructor.name).toBe(
      "Relation",
    );
  });

  it("gives distinct models distinct carriers (no cross-model leakage)", () => {
    generateRelationMethod(Post as never, "postOnly", () => "post");
    expect(relationClassFor(Post as never)).not.toBe(relationClassFor(Comment as never));
    const commentCarrier = relationClassFor(Comment as never).prototype as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(commentCarrier, "postOnly")).toBe(false);
  });

  it("never generates an uncacheable method onto the carrier (gate is load-bearing)", () => {
    expect("target" in CollectionProxy.prototype).toBe(true);
    const uncacheable = uncacheableMethods();
    expect(uncacheable.has("target")).toBe(true);
    const carrier = relationClassFor(Post as never).prototype as Record<string, unknown>;
    for (const name of uncacheable) {
      expect(Object.prototype.hasOwnProperty.call(carrier, name)).toBe(false);
    }
  });
});

describe("generated relation methods — remaining delegate-class carriers", () => {
  const allCarriersFor = (model: never) => [
    relationClassFor(model),
    associationRelationClassFor(model),
    disableJoinsAssociationRelationClassFor(model),
    collectionProxyClassFor(model),
  ];

  it("feeds one generated method to all four per-model carriers (propagation)", () => {
    const carriers = allCarriersFor(Post as never);
    const fn = () => "shared";
    generateRelationMethod(Post as never, "sharedAcrossCarriers", fn);
    for (const carrier of carriers) {
      const proto = carrier.prototype as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(proto, "sharedAcrossCarriers")).toBe(true);
      expect(proto.sharedAcrossCarriers).toBe(fn);
    }
  });

  it("installs already-generated methods when a carrier is created later (includeInto catch-up)", () => {
    generateRelationMethod(Comment as never, "lateCarrierGenerated", () => "late");
    for (const carrier of [
      associationRelationClassFor(Comment as never),
      disableJoinsAssociationRelationClassFor(Comment as never),
      collectionProxyClassFor(Comment as never),
    ]) {
      const proto = carrier.prototype as Record<string, unknown>;
      expect(Object.prototype.hasOwnProperty.call(proto, "lateCarrierGenerated")).toBe(true);
    }
  });

  it("each carrier reports its base delegate class name (per-model subclass stays anonymous)", () => {
    expect(associationRelationClassFor(Post as never).name).toBe("AssociationRelation");
    expect(disableJoinsAssociationRelationClassFor(Post as never).name).toBe(
      "DisableJoinsAssociationRelation",
    );
    expect(collectionProxyClassFor(Post as never).name).toBe("CollectionProxy");
  });

  it("inherits an STI base model's generated module onto the child carrier (include_relation_methods recursion)", () => {
    generateRelationMethod(Company as never, "stiBaseGenerated", () => "base");
    const firmCarrier = relationClassFor(Firm as never).prototype as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(firmCarrier, "stiBaseGenerated")).toBe(true);
    expect((firmCarrier.stiBaseGenerated as () => string)()).toBe("base");
  });

  it("lets a child model's own generated method win over an inherited one", () => {
    generateRelationMethod(Firm as never, "stiOverridden", () => "child");
    generateRelationMethod(Company as never, "stiOverridden", () => "base");
    const firmCarrier = relationClassFor(Firm as never).prototype as Record<string, unknown>;
    expect((firmCarrier.stiOverridden as () => string)()).toBe("child");
    const companyCarrier = relationClassFor(Company as never).prototype as Record<string, unknown>;
    expect((companyCarrier.stiOverridden as () => string)()).toBe("base");
  });

  it("gives distinct models distinct carriers per delegate class (no cross-model leakage)", () => {
    expect(associationRelationClassFor(Post as never)).not.toBe(
      associationRelationClassFor(Comment as never),
    );
    expect(collectionProxyClassFor(Post as never)).not.toBe(
      collectionProxyClassFor(Comment as never),
    );
  });

  it("never generates an uncacheable method onto any of the four carriers", () => {
    const uncacheable = uncacheableMethods();
    expect(uncacheable.has("target")).toBe(true);
    for (const carrier of allCarriersFor(Post as never)) {
      const proto = carrier.prototype as Record<string, unknown>;
      for (const name of uncacheable) {
        expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(false);
      }
    }
  });
});

describe("name delegate — property-reader typing invariant", () => {
  it("reads as a getter returning the model class name (no parens)", () => {
    expect(Comment.all().name).toBe("Comment");
  });

  it("keeps Relation off the `{ name: string }` structural surface (reduce guard)", () => {
    const rel = Comment.all();
    // @ts-expect-error Relation must NOT be assignable to { name: string }
    const structural: { name: string } = rel;
    void structural;
  });

  it("stays a supertype of `string` so string literals remain assignable at call sites", () => {
    const rel = Comment.all();
    const name: typeof rel.name = "Comment";
    expect(name).toBe("Comment");
  });
});

describe("delegated records operators without an Array.prototype counterpart", () => {
  const records = () => ["a", "b", "c"];

  it("delegates the records operators Array.prototype cannot spell", () => {
    const dup = () => ["a", "b", "b", "c"];
    expect(delegateArrayMethod("intersection", dup)!(["b", "c", "d"])).toEqual(["b", "c"]);
    expect(delegateArrayMethod("union", dup)!(["c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(delegateArrayMethod("difference", dup)!(["c"])).toEqual(["a", "b", "b"]);
    expect(delegateArrayMethod("at", records)!(1)).toBe("b");
    expect(delegateArrayMethod("concat", records)!(["d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("compares records with Core#== rather than object identity", () => {
    const equals = (other: unknown): boolean => (other as { id?: number })?.id === 1;
    const post = { equals, id: 1 };
    const same = { equals, id: 1 };
    expect(delegateArrayMethod("intersection", () => [post])!([same])).toEqual([post]);
    expect(delegateArrayMethod("difference", () => [post])!([same])).toEqual([]);
  });
});

describe("respond_to_missing? — `in` on the dispatch proxies", () => {
  fixtures(["posts", "comments"]);

  registerModel(Post);
  registerModel(Comment);

  it("answers a named scope, a class method and a delegated array method on a Relation", () => {
    const rel = Comment.all();
    expect("containingTheLetterE" in rel).toBe(true);
    expect("whatAreYou" in rel).toBe(true);
    expect("toSentence" in rel).toBe(true);
    expect("partition" in rel).toBe(true);
    expect("noSuchThingAtAll" in rel).toBe(false);
  });

  it("answers a named scope, a class method and a delegated array method on a CollectionProxy", async () => {
    const post = await Post.find(1);
    const comments = post.comments as unknown as object;
    expect(comments).toBeInstanceOf(CollectionProxy);
    expect("containingTheLetterE" in comments).toBe(true);
    expect("whatAreYou" in comments).toBe(true);
    expect("toSentence" in comments).toBe(true);
    expect("partition" in comments).toBe(true);
    expect("noSuchThingAtAll" in comments).toBe(false);
  });

  it("keeps an own property whose value is undefined off the delegation path", async () => {
    const rel = Comment.all() as unknown as Record<string, unknown>;
    Object.defineProperty(rel, "whatAreYou", { value: undefined, configurable: true });
    expect(rel.whatAreYou).toBeUndefined();

    const post = await Post.find(1);
    const comments = post.comments as unknown as Record<string, unknown>;
    Object.defineProperty(comments, "whatAreYou", { value: undefined, configurable: true });
    expect(comments.whatAreYou).toBeUndefined();
  });
});
