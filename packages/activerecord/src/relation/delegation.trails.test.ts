/**
 * trails-only mechanism tests for the per-model prototype-carrier delegation
 * (stories `delegation-generated-methods-per-model-prototype-carrier` and
 * `delegation-remaining-delegate-class-prototype-carriers`). These assert the
 * *mechanism* — that generated relation methods resolve as real methods via
 * per-model subclass prototype carriers for all four delegate classes
 * (`Relation`, `AssociationRelation`, `DisableJoinsAssociationRelation`,
 * `CollectionProxy`) — rather than observable behavior (covered by the
 * Rails-mirrored `delegation.test.ts`).
 */
import { describe, it, expect } from "vitest";
import {
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
// Loading these registers each delegate class with the relation family so the
// carrier resolvers find their base ctor and `uncacheableMethods()` sees the
// subclass-only methods (`target`, …).
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
    // Real own property on the carrier prototype — not a WeakMap side-table entry.
    expect(Object.prototype.hasOwnProperty.call(carrier, "somethingGenerated")).toBe(true);
    expect(carrier.somethingGenerated).toBe(fn);
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
    // Rails' ClassSpecificRelation::ClassMethods#name returns superclass.name so
    // `Relation#inspect` (`this.constructor.name`) reads "Relation", not the
    // anonymous per-model subclass identifier.
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
    // `Developer.target` is delegated in `DelegationCachingTest`; `target` is
    // uncacheable (subclass-only), so it must never land on the carrier where it
    // would shadow `CollectionProxy#target`.
    expect("target" in CollectionProxy.prototype).toBe(true); // family loaded
    const uncacheable = uncacheableMethods();
    expect(uncacheable.has("target")).toBe(true); // guard: not a vacuous loop
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
    // Realize all four carriers first, then generate: the single
    // `generatedRelationMethods(model)` module must propagate the new method to
    // every already-registered carrier (Rails' `delegate.include
    // generated_relation_methods` across each subclass).
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
    // Generate BEFORE the Comment association/proxy carriers exist: creating them
    // must back-fill the stored method as a real own property (the `includeInto`
    // catch-up loop), not miss it.
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
    // Rails' ClassSpecificRelation::ClassMethods#name returns `superclass.name`,
    // so `#inspect` (`this.constructor.name`) reads the base class name.
    expect(associationRelationClassFor(Post as never).name).toBe("AssociationRelation");
    expect(disableJoinsAssociationRelationClassFor(Post as never).name).toBe(
      "DisableJoinsAssociationRelation",
    );
    expect(collectionProxyClassFor(Post as never).name).toBe("CollectionProxy");
  });

  it("inherits an STI base model's generated module onto the child carrier (include_relation_methods recursion)", () => {
    // Rails' `include_relation_methods` recurses up the STI chain
    // (`superclass.include_relation_methods(delegate) unless base_class?`,
    // delegation.rb:57-60): a method generated on the base model (`Company`)
    // must be a real method on the child (`Firm`) carrier's prototype — resolved
    // by ordinary prototype lookup, not re-derived via the Proxy miss path.
    // `Firm extends Company`; `Company` is the STI base_class.
    generateRelationMethod(Company as never, "stiBaseGenerated", () => "base");
    const firmCarrier = relationClassFor(Firm as never).prototype as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(firmCarrier, "stiBaseGenerated")).toBe(true);
    expect((firmCarrier.stiBaseGenerated as () => string)()).toBe("base");
  });

  it("lets a child model's own generated method win over an inherited one", () => {
    // Rails includes super first, own last, so an own generated method shadows
    // an inherited one of the same name (`stiCarrierChain` returns base-first).
    generateRelationMethod(Company as never, "stiOverridden", () => "base");
    generateRelationMethod(Firm as never, "stiOverridden", () => "child");
    const firmCarrier = relationClassFor(Firm as never).prototype as Record<string, unknown>;
    expect((firmCarrier.stiOverridden as () => string)()).toBe("child");
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
    expect(uncacheable.has("target")).toBe(true); // guard: not a vacuous loop
    for (const carrier of allCarriersFor(Post as never)) {
      const proto = carrier.prototype as Record<string, unknown>;
      for (const name of uncacheable) {
        expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(false);
      }
    }
  });
});
