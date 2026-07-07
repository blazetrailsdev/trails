/**
 * trails-only mechanism tests for the per-model prototype-carrier delegation
 * (story `delegation-generated-methods-per-model-prototype-carrier`). These
 * assert the *mechanism* — that generated relation methods resolve as real
 * methods via a per-model `Relation` subclass prototype carrier — rather than
 * observable behavior (covered by the Rails-mirrored `delegation.test.ts`).
 */
import { describe, it, expect } from "vitest";
import { generateRelationMethod, relationClassFor, uncacheableMethods } from "./delegation.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
// Loading CollectionProxy registers it with the relation family so
// `uncacheableMethods()` sees the subclass-only methods (`target`, …).
import { CollectionProxy } from "../associations/collection-proxy.js";

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
