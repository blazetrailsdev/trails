import { describe, it, expect, afterEach } from "vitest";
import { DelegateCache, relationClassFor, uncacheableMethods } from "./delegation.js";
import { NotImplementedError } from "../errors.js";
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
    expect(carrier.name).toBe("ActiveRecord::Relation");
    expect((Post.limit(2) as unknown as { constructor: { name: string } }).constructor.name).toBe(
      "ActiveRecord::Relation",
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
      "ActiveRecord::AssociationRelation",
    );
    expect(relationClassFor.call(DisableJoinsAssociationRelation, Post as never).name).toBe(
      "ActiveRecord::DisableJoinsAssociationRelation",
    );
    expect(relationClassFor.call(CollectionProxy, Post as never).name).toBe(
      "ActiveRecord::Associations::CollectionProxy",
    );
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

describe("Enumerable members answered over the loaded records", () => {
  fixtures(["comments"]);

  it("loads records for all?, collect, each_cons, each_with_index, exclude?, find_all, to_set", async () => {
    const rel = Comment.order("id") as unknown as {
      isAll(fn: (c: Comment) => boolean): Promise<boolean>;
      collect(fn: (c: Comment) => unknown): Promise<unknown[]>;
      findAll(fn: (c: Comment) => boolean): Promise<Comment[]>;
      eachCons(n: number): Promise<Comment[][]>;
      eachWithIndex(fn: (c: Comment, i: number) => unknown): Promise<Comment[]>;
      isExclude(c: Comment): Promise<boolean>;
      toSet(): Promise<Set<Comment>>;
    };
    const comments: Comment[] = await Comment.order("id");
    expect(await rel.isAll((c: Comment) => c.id != null)).toBe(true);
    expect(await rel.collect((c: Comment) => c.id)).toEqual(comments.map((c) => c.id));
    expect(await rel.findAll((c: Comment) => c.id === comments[0].id)).toHaveLength(1);
    expect(await rel.eachCons(2)).toHaveLength(comments.length - 1);
    const indexes: number[] = [];
    await rel.eachWithIndex((_: Comment, i: number) => indexes.push(i));
    expect(indexes).toEqual(comments.map((_, i) => i));
    expect(await rel.isExclude(comments[0])).toBe(false);
    expect(await rel.toSet()).toBeInstanceOf(Set);
  });
});

describe("DelegateCache#inherited is deferred to a subclass's first relation_delegate_class read", () => {
  it("gives a subclass delegate classes of its own", () => {
    class SubPost extends Post {}

    const delegate = relationClassFor.call(Relation, SubPost as never);
    expect(delegate).not.toBe(relationClassFor.call(Relation, Post as never));
    expect(relationClassFor.call(Relation, SubPost as never)).toBe(delegate);
    expect(Object.getPrototypeOf(delegate)).toBe(Relation);
  });
});

type MethodMissing = { methodMissing(name: string): unknown };
type Row = { id: number };
type LoadedProxy = {
  loaded: boolean;
  target: Comment[];
  load(): Promise<unknown>;
  toArray(): Promise<Comment[]>;
  sort(fn: (a: Row, b: Row) => number): Promise<Row[]>;
  isIntersect(other: Comment[]): Promise<boolean>;
  each(fn: (c: Row) => unknown): unknown;
  index(c: Comment): unknown;
};

describe("delegate_base_methods guard", () => {
  fixtures(["posts", "comments"]);

  afterEach(() => {
    DelegateCache.delegateBaseMethods = false;
  });

  it("does not delegate Base methods on a relation when banned", () => {
    DelegateCache.delegateBaseMethods = false;
    const relation = Post.all() as unknown as { belongsTo(name: string): unknown };
    expect(() => relation.belongsTo("author")).toThrow(NotImplementedError);
  });

  it("does not ban Function.prototype builtins when banned", () => {
    DelegateCache.delegateBaseMethods = false;
    expect(() => (Post.all() as unknown as MethodMissing).methodMissing("belongsTo")).toThrow(
      NotImplementedError,
    );
    expect(Object.prototype.hasOwnProperty.call(Post, "containingTheLetterA")).toBe(true);
    expect(() =>
      (Post.all() as unknown as MethodMissing).methodMissing("containingTheLetterA"),
    ).not.toThrow();
  });

  it("delegates Base methods on a relation when allowed (default)", () => {
    DelegateCache.delegateBaseMethods = true;
    const relation = Post.all() as unknown as { belongsTo(name: string): unknown };
    expect(() => relation.belongsTo("author")).not.toThrow(NotImplementedError);
  });
});

describe("delegateArrayMethod curated list", () => {
  const loaded = (records: unknown[]) =>
    Object.assign(Comment.all(), { _records: records, _loaded: true }) as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >;

  it("delegates curated/Enumerable members to the records", () => {
    const rel = loaded(["a", "b", "c"]);
    for (const method of [
      "forEach",
      "join",
      "reverse",
      "slice",
      "map",
      "sort",
      "indexOf",
      "lastIndexOf",
    ]) {
      expect(typeof rel[method]).toBe("function");
    }
    expect(rel.join(",")).toBe("a,b,c");
  });

  it("does not delegate JS-only Array methods absent from Rails", () => {
    const rel = loaded(["a", "b", "c"]);
    for (const method of ["findIndex", "flat", "copyWithin", "fill"]) {
      expect(rel[method]).toBeUndefined();
    }
  });
});

describe("sort delegated to Array", () => {
  fixtures(["posts", "comments"]);

  it("an association delegates sort to Array loading records on call", async () => {
    const post = await Post.first();
    const target = post!.comments as unknown as LoadedProxy;
    expect(target.loaded).toBe(false);
    const sorted = await target.sort((a: Row, b: Row) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(target.loaded).toBe(true);
    expect(Array.isArray(sorted)).toBe(true);
    expect(sorted.length).toBeGreaterThan(0);
    const ids = sorted.map((c: Row) => c.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("a relation delegates sort to Array loading records on call", async () => {
    const target = Comment.all();
    const sorted = await (target as unknown as LoadedProxy).sort((a: Row, b: Row) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    expect(Array.isArray(sorted)).toBe(true);
    expect(sorted.length).toBeGreaterThan(0);
    const ids = sorted.map((c: Row) => c.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

describe("DelegationNamedMethods", () => {
  fixtures(["posts", "comments"]);

  it("index and rindex locate records by value", async () => {
    const relation = Comment.all();
    const records = await relation;
    const mid = records[Math.floor(records.length / 2)];
    expect(await relation.index(mid)).toBe(records.findIndex((c) => c.id === mid.id));
    expect(await relation.rindex((c: Comment) => c.id === mid.id)).toBe(
      records.map((c) => c.id).lastIndexOf(mid.id),
    );
  });

  it("intersect? reports whether any record is shared, by record equality", async () => {
    const records = await Comment.all();
    const reloaded = await Comment.find(records[0].id);
    expect(await Comment.all().isIntersect([reloaded])).toBe(true);
    expect(await Comment.all().isIntersect([])).toBe(false);
    expect(await Comment.all().isIntersect([new Comment()])).toBe(false);
  });

  it("intersect? is delegated on a CollectionProxy too", async () => {
    const post = await Post.first();
    const proxy = post!.comments as unknown as LoadedProxy;
    const comments = await proxy.toArray();
    expect(await proxy.isIntersect(comments.slice(0, 1))).toBe(true);
    expect(await proxy.isIntersect([new Comment()])).toBe(false);
  });

  it("to_fs(:db) joins the record ids", async () => {
    const records = await Comment.all();
    expect(await Comment.all().toFs("db")).toBe(records.map((c) => c.id).join(","));
  });

  it("to_fs default falls back to Array#to_s (bracketed inspect, not a bare join)", async () => {
    const records = await Comment.all();
    const fs = await Comment.all().toFs();
    expect(fs).toBe(`[${records.map((c) => c.inspect()).join(", ")}]`);
  });

  it("on a loaded proxy each/index delegate to records synchronously", async () => {
    const post = await Post.first();
    const proxy = post!.comments as unknown as LoadedProxy;
    await proxy.load();
    expect(proxy.loaded).toBe(true);
    const seen: number[] = [];
    const ret = proxy.each((c: Row) => seen.push(c.id));
    expect(ret).not.toBeInstanceOf(Promise);
    expect(seen).toEqual(proxy.target.map((c: Comment) => c.id));
    expect(proxy.index(proxy.target[0])).toBe(0);
  });

  it("to_xml serializes the collection with a plural root and singular children", async () => {
    const base = Comment.where({ type: "Comment" });
    const xml = await base.toXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<comments type="array">');
    expect(xml).toContain("</comments>");
    expect(xml).toContain('<comment type="Comment">');
  });

  it("to_xml(skip_types: true) drops the type attributes and skip_instruct omits the prolog", async () => {
    const xml = await Comment.where({ type: "Comment" }).toXml({
      skipTypes: true,
      skipInstruct: true,
    });
    expect(xml.startsWith("<comments>")).toBe(true);
    expect(xml).not.toContain("type=");
  });

  it("to_xml roots a heterogeneous collection under <objects> (Rails all?(first.class))", async () => {
    class Sparrow {}
    class Hawk {}
    const host = {
      async records() {
        return [new Sparrow(), new Hawk()];
      },
    };
    const xml = await (
      Relation.prototype as unknown as { toXml(this: unknown, options: object): Promise<string> }
    ).toXml.call(host, { skipInstruct: true });
    expect(xml.startsWith('<objects type="array">')).toBe(true);
    expect(xml.trimEnd().endsWith("</objects>")).toBe(true);
  });

  it("to_xml on an empty collection self-closes under nil-classes (or :root)", async () => {
    const empty = Comment.where({ id: -1 });
    expect(await empty.toXml({ skipInstruct: true })).toBe('<nil-classes type="array"/>\n');
    expect(await Comment.where({ id: -1 }).toXml({ skipInstruct: true, root: "comments" })).toBe(
      '<comments type="array"/>\n',
    );
  });

  it("to_xml threads dasherize/camelize through the empty-collection default root", async () => {
    const empty = Comment.where({ id: -1 });
    expect(await empty.toXml({ skipInstruct: true, dasherize: false })).toBe(
      '<nil_classes type="array"/>\n',
    );
    expect(await Comment.where({ id: -1 }).toXml({ skipInstruct: true, camelize: true })).toBe(
      '<NilClasses type="array"/>\n',
    );
  });

  it("delegates connection, primary_key, table_name and transaction to the model", async () => {
    const relation = Comment.all();
    expect(relation.tableName).toBe(Comment.tableName);
    expect(relation.primaryKey).toBe(Comment.primaryKey);
    expect(await relation.connection).toBe(await Comment.leaseConnection());
    expect(await Comment.all().transaction(async () => 42)).toBe(42);
  });

  it("delegates slice to records (self-loading a slice of the loaded rows)", async () => {
    const records = await Comment.all();
    const sliced = (await Comment.all().slice(1, 2)) as Comment[];
    expect(sliced.map((c) => c.id)).toEqual(records.slice(1, 3).map((c) => c.id));
  });

  it("delegates name to the model class name", () => {
    expect(Comment.all().name).toBe("Comment");
  });
});
