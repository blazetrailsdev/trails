import { describe, it, expect } from "vitest";
import { relationClassFor, uncacheableMethods } from "./delegation.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { fixtures } from "../test-fixtures.js";
import { registerModel } from "../index.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import { Relation } from "../relation.js";
import { AssociationRelation } from "../association-relation.js";
import { DisableJoinsAssociationRelation } from "../disable-joins-association-relation.js";

const defineClassMethod = (model: object, name: string, fn: (...args: never[]) => unknown) =>
  Object.defineProperty(model, name, { value: fn, writable: true, configurable: true });

describe("generated relation methods — per-model prototype carrier", () => {
  it("installs a generated delegator as a real method on the per-model carrier", () => {
    defineClassMethod(Post, "somethingGenerated", () => "generated-result");
    Post.generateRelationMethod("somethingGenerated");

    const carrier = relationClassFor.call(Relation, Post as never).prototype as Record<
      string,
      unknown
    >;
    expect("somethingGenerated" in carrier).toBe(true);
    const rel = Post.all() as unknown as { somethingGenerated: () => string };
    expect(rel.somethingGenerated()).toBe("generated-result");
  });

  it("keeps the first generated delegator for a name (Rails' method_defined? memo)", () => {
    defineClassMethod(Post, "memoizedGenerated", () => "first");
    Post.generateRelationMethod("memoizedGenerated");
    const carrier = relationClassFor.call(Relation, Post as never).prototype as Record<
      string,
      unknown
    >;
    const first = carrier.memoizedGenerated;
    Post.generateRelationMethod("memoizedGenerated");

    expect(carrier.memoizedGenerated).toBe(first);
  });

  it("resolves the generated method on a constructed relation via prototype lookup", () => {
    defineClassMethod(Post, "anotherGenerated", () => 42);
    Post.generateRelationMethod("anotherGenerated");
    const rel = Post.all() as unknown as { anotherGenerated: () => number };
    expect(typeof rel.anotherGenerated).toBe("function");
    expect(rel.anotherGenerated()).toBe(42);
  });

  it("reports the base Relation class name (per-model carrier stays anonymous)", () => {
    const carrier = relationClassFor.call(Relation, Post as never);
    expect(carrier.name).toBe("Relation");
    expect((Post.limit(2) as unknown as { constructor: { name: string } }).constructor.name).toBe(
      "Relation",
    );
  });

  it("gives distinct models distinct carriers (no cross-model leakage)", () => {
    defineClassMethod(Post, "postOnly", () => "post");
    Post.generateRelationMethod("postOnly");
    expect(relationClassFor.call(Relation, Post as never)).not.toBe(
      relationClassFor.call(Relation, Comment as never),
    );
    const commentCarrier = relationClassFor.call(Relation, Comment as never).prototype as Record<
      string,
      unknown
    >;
    expect("postOnly" in commentCarrier).toBe(false);
  });

  it("never generates an uncacheable method onto the carrier (gate is load-bearing)", () => {
    expect("target" in CollectionProxy.prototype).toBe(true);
    const uncacheable = uncacheableMethods();
    expect(uncacheable.has("target")).toBe(true);
    const carrier = relationClassFor.call(Relation, Post as never).prototype as Record<
      string,
      unknown
    >;
    for (const name of uncacheable) {
      expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(carrier), name)).toBe(
        false,
      );
    }
  });
});

describe("generated relation methods — remaining delegate-class carriers", () => {
  const allCarriersFor = (model: never) => [
    relationClassFor.call(Relation, model),
    relationClassFor.call(AssociationRelation, model),
    relationClassFor.call(DisableJoinsAssociationRelation, model),
    relationClassFor.call(CollectionProxy, model),
  ];

  it("feeds one generated method to all four per-model carriers (propagation)", () => {
    const carriers = allCarriersFor(Post as never);
    defineClassMethod(Post, "sharedAcrossCarriers", () => "shared");
    Post.generateRelationMethod("sharedAcrossCarriers");
    const fn = (carriers[0].prototype as Record<string, unknown>).sharedAcrossCarriers;
    for (const carrier of carriers) {
      const proto = carrier.prototype as Record<string, unknown>;
      expect("sharedAcrossCarriers" in proto).toBe(true);
      expect(proto.sharedAcrossCarriers).toBe(fn);
    }
  });

  it("installs already-generated methods when a carrier is created later (includeInto catch-up)", () => {
    defineClassMethod(Comment, "lateCarrierGenerated", () => "late");
    Comment.generateRelationMethod("lateCarrierGenerated");
    for (const carrier of [
      relationClassFor.call(AssociationRelation, Comment as never),
      relationClassFor.call(DisableJoinsAssociationRelation, Comment as never),
      relationClassFor.call(CollectionProxy, Comment as never),
    ]) {
      const proto = carrier.prototype as Record<string, unknown>;
      expect("lateCarrierGenerated" in proto).toBe(true);
    }
  });

  it("each carrier reports its base delegate class name (per-model subclass stays anonymous)", () => {
    expect(relationClassFor.call(AssociationRelation, Post as never).name).toBe(
      "AssociationRelation",
    );
    expect(relationClassFor.call(DisableJoinsAssociationRelation, Post as never).name).toBe(
      "DisableJoinsAssociationRelation",
    );
    expect(relationClassFor.call(CollectionProxy, Post as never).name).toBe("CollectionProxy");
  });

  it("inherits an STI base model's generated module onto the child carrier (include_relation_methods recursion)", () => {
    defineClassMethod(Company, "stiBaseGenerated", () => "base");
    Company.generateRelationMethod("stiBaseGenerated");
    const firmCarrier = relationClassFor.call(Relation, Firm as never).prototype as Record<
      string,
      unknown
    >;
    expect("stiBaseGenerated" in firmCarrier).toBe(true);
    expect((Firm.all() as unknown as { stiBaseGenerated: () => string }).stiBaseGenerated()).toBe(
      "base",
    );
  });

  it("lets a child model's own generated method win over an inherited one", () => {
    defineClassMethod(Firm, "stiOverridden", () => "child");
    defineClassMethod(Company, "stiOverridden", () => "base");
    Firm.generateRelationMethod("stiOverridden");
    Company.generateRelationMethod("stiOverridden");
    expect((Firm.all() as unknown as { stiOverridden: () => string }).stiOverridden()).toBe(
      "child",
    );
    expect((Company.all() as unknown as { stiOverridden: () => string }).stiOverridden()).toBe(
      "base",
    );
  });

  it("gives distinct models distinct carriers per delegate class (no cross-model leakage)", () => {
    expect(relationClassFor.call(AssociationRelation, Post as never)).not.toBe(
      relationClassFor.call(AssociationRelation, Comment as never),
    );
    expect(relationClassFor.call(CollectionProxy, Post as never)).not.toBe(
      relationClassFor.call(CollectionProxy, Comment as never),
    );
  });

  it("never generates an uncacheable method onto any of the four carriers", () => {
    const uncacheable = uncacheableMethods();
    expect(uncacheable.has("target")).toBe(true);
    for (const carrier of allCarriersFor(Post as never)) {
      const proto = carrier.prototype as Record<string, unknown>;
      for (const name of uncacheable) {
        expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(proto), name)).toBe(
          false,
        );
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
  const loaded = (records: unknown[]) =>
    Object.assign(Comment.all(), { _records: records, _loaded: true }) as unknown as Record<
      "intersection" | "union" | "difference" | "plus" | "at" | "concat",
      (...args: unknown[]) => unknown
    >;

  it("delegates the records operators Array.prototype cannot spell", () => {
    const dup = loaded(["a", "b", "b", "c"]);
    expect(dup.intersection(["b", "c", "d"])).toEqual(["b", "c"]);
    expect(dup.union(["c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(dup.difference(["c"])).toEqual(["a", "b", "b"]);
    expect(dup.plus(["c"])).toEqual(["a", "b", "b", "c", "c"]);
    expect(loaded(["a", "b", "c"]).at(1)).toBe("b");
    expect(loaded(["a", "b", "c"]).at(1, 2)).toEqual(["b", "c"]);
    expect(loaded(["a", "b", "c"]).concat(["d"])).toEqual(["a", "b", "c", "d"]);
  });

  it("compares records with Core#== rather than object identity", () => {
    const equals = (other: unknown): boolean => (other as { id?: number })?.id === 1;
    const post = { equals, id: 1 };
    const same = { equals, id: 1 };
    expect(loaded([post]).intersection([same])).toEqual([post]);
    expect(loaded([post]).difference([same])).toEqual([]);
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

  it("does not answer Function.prototype members Ruby's Module never defines", () => {
    const rel = Comment.all() as unknown as Record<string, unknown>;
    for (const name of ["call", "apply", "bind"]) {
      expect(name in rel).toBe(false);
      expect(rel[name]).toBeUndefined();
    }
    expect(rel.toString).toBe(Object.prototype.toString);
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

describe("partition delegated to Array", () => {
  fixtures(["posts", "comments"]);

  type Partitioned = Promise<[Comment[], Comment[]]>;
  type Partitionable = { partition(fn: (c: Comment) => boolean): Partitioned };

  it("loads an association and splits its records", async () => {
    const post = (await Post.first())!;
    const target = post.comments as unknown as Partitionable & {
      loaded: boolean;
      target: Comment[];
    };
    expect(target.loaded).toBe(false);

    const someId = (await Comment.first())!.id;
    const [matched, unmatched] = await target.partition((c) => c.id === someId);

    expect(target.loaded).toBe(true);
    const records = target.target;
    expect(records.length).toBeGreaterThan(0);
    expect(matched.map((c) => c.id)).toEqual(
      records.filter((c) => c.id === someId).map((c) => c.id),
    );
    expect(unmatched.map((c) => c.id)).toEqual(
      records.filter((c) => c.id !== someId).map((c) => c.id),
    );
  });

  it("splits a relation's records", async () => {
    const target = Comment.all() as unknown as Partitionable & { toArray(): Promise<Comment[]> };
    const someId = (await Comment.first())!.id;
    const [matched, unmatched] = await target.partition((c) => c.id === someId);

    const records = await target.toArray();
    expect(records.length).toBeGreaterThan(0);
    expect(matched.map((c) => c.id)).toEqual(
      records.filter((c) => c.id === someId).map((c) => c.id),
    );
    expect(unmatched.map((c) => c.id)).toEqual(
      records.filter((c) => c.id !== someId).map((c) => c.id),
    );
  });
});
