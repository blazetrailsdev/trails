import { describe, it, expect, afterEach } from "vitest";
import { Relation, registerModel } from "../index.js";
import {
  delegateArrayMethod,
  DelegateCache,
  guardBaseMethodDelegation,
  uncacheableMethods,
} from "./delegation.js";
import { NotImplementedError } from "../errors.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer } from "../test-helpers/models/developer.js";

describe("DelegationTest", () => {
  fixtures(["posts", "comments"]);

  registerModel(Post);
  registerModel(Comment);

  it("not respond to arel method", () => {
    const target = Comment.all();
    expect("project" in target).toBe(false);
    expect(typeof target.arel().project).toBe("function");
  });

  describe("delegate_base_methods guard", () => {
    afterEach(() => {
      DelegateCache.delegateBaseMethods = false;
    });

    it("does not delegate Base methods on a relation when banned", () => {
      DelegateCache.delegateBaseMethods = false;
      const relation = Post.all() as any;
      expect(() => relation.belongsTo("author")).toThrow(NotImplementedError);
    });

    it("does not ban Function.prototype builtins when banned", () => {
      DelegateCache.delegateBaseMethods = false;
      for (const builtin of ["call", "apply", "bind", "constructor"]) {
        expect(() => guardBaseMethodDelegation(Post as any, builtin)).not.toThrow();
      }
      expect(() => guardBaseMethodDelegation(Post as any, "belongsTo")).toThrow(
        NotImplementedError,
      );
      expect(Object.prototype.hasOwnProperty.call(Post, "namedExtension")).toBe(true);
      expect(() => guardBaseMethodDelegation(Post as any, "namedExtension")).not.toThrow();
    });

    it("delegates Base methods on a relation when allowed (default)", () => {
      DelegateCache.delegateBaseMethods = true;
      const relation = Post.all() as any;
      expect(() => relation.belongsTo("author")).not.toThrow(NotImplementedError);
    });
  });

  describe("QueryingMethodsDelegationTest", () => {
    const QUERYING_METHODS = [
      "where",
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
      "isNone",
      "isEmpty",
    ] as const;

    it("delegate querying methods", () => {
      const relation = Post.all();
      for (const method of QUERYING_METHODS) {
        expect(typeof (relation as any)[method]).toBe("function");
        expect(typeof (Post as any)[method]).toBe("function");
      }
    });
  });

  describe("DelegationCachingTest", () => {
    it("delegation doesn't override methods defined in other relation subclasses", () => {
      expect("target" in Relation.prototype).toBe(false);
      expect("target" in CollectionProxy.prototype).toBe(true);

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
  });

  describe("delegateArrayMethod curated list", () => {
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
        "lastIndexOf",
      ]) {
        expect(typeof delegateArrayMethod(method, records)).toBe("function");
      }
      expect(delegateArrayMethod("join", records)!(",")).toBe("a,b,c");
    });

    it("does not delegate JS-only Array methods absent from Rails", () => {
      for (const method of ["findIndex", "flat", "copyWithin", "fill", "findLast"]) {
        expect(delegateArrayMethod(method, records)).toBeUndefined();
      }
    });
  });

  const DELEGATED_ARRAY_METHODS = [
    "forEach",
    "join",
    "reverse",
    "slice",
    "at",
    "indexOf",
    "lastIndexOf",
    "concat",
    "map",
    "filter",
    "find",
    "some",
    "every",
    "includes",
    "reduce",
    "sort",
    "flatMap",
  ] as const;

  describe("DelegationAssociationTest", () => {
    it("delegates partition to Array", async () => {
      const post = await Post.first();
      const target = (post as any).comments;
      expect(typeof target.partition).toBe("function");
      expect(target.loaded).toBe(false);

      const someId = (await Comment.first())!.id;
      const [matched, unmatched] = await target.partition((c: any) => c.id === someId);

      expect(target.loaded).toBe(true);
      const records: any[] = target.target;
      expect(records.length).toBeGreaterThan(0);
      expect(matched.map((c: any) => c.id)).toEqual(
        records.filter((c: any) => c.id === someId).map((c: any) => c.id),
      );
      expect(unmatched.map((c: any) => c.id)).toEqual(
        records.filter((c: any) => c.id !== someId).map((c: any) => c.id),
      );
    });

    for (const method of DELEGATED_ARRAY_METHODS) {
      it(`test_delegates_${method}_to_Array`, async () => {
        const post = await Post.first();
        const target = (post as any).comments;
        expect(target.loaded).toBe(false);
        expect(typeof target[method]).toBe("function");
      });
    }

    it("delegates sort to Array loading records on call", async () => {
      const post = await Post.first();
      const target = (post as any).comments;
      expect(target.loaded).toBe(false);
      const sorted = await target.sort((a: any, b: any) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      expect(target.loaded).toBe(true);
      expect(Array.isArray(sorted)).toBe(true);
      expect(sorted.length).toBeGreaterThan(0);
      const ids = sorted.map((c: any) => c.id);
      expect(ids).toEqual([...ids].sort((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0)));
    });
  });

  describe("DelegationRelationTest", () => {
    it("delegates partition to Array", async () => {
      const target = Comment.all();
      expect(typeof (target as any).partition).toBe("function");

      const someId = (await Comment.first())!.id;
      const [matched, unmatched] = await (target as any).partition((c: any) => c.id === someId);

      const records: any[] = await (target as any).toArray();
      expect(records.length).toBeGreaterThan(0);
      expect(matched.map((c: any) => c.id)).toEqual(
        records.filter((c: any) => c.id === someId).map((c: any) => c.id),
      );
      expect(unmatched.map((c: any) => c.id)).toEqual(
        records.filter((c: any) => c.id !== someId).map((c: any) => c.id),
      );
    });

    for (const method of DELEGATED_ARRAY_METHODS) {
      it(`test_delegates_${method}_to_Array`, () => {
        const target = Comment.all();
        expect(typeof (target as any)[method]).toBe("function");
      });
    }

    it("delegates sort to Array loading records on call", async () => {
      const target = Comment.all();
      const sorted = await (target as any).sort((a: any, b: any) =>
        a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
      );
      expect(Array.isArray(sorted)).toBe(true);
      expect(sorted.length).toBeGreaterThan(0);
      const ids = sorted.map((c: any) => c.id);
      expect(ids).toEqual([...ids].sort((a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0)));
    });
  });

  describe("DelegationNamedMethods", () => {
    const RECORD_DELEGATES: ReadonlyArray<readonly [string, string]> = [
      ["each", "each"],
      ["join", "join"],
      ["intersect?", "isIntersect"],
      ["reverse", "reverse"],
      ["compact", "compact"],
      ["shuffle", "shuffle"],
      ["rotate", "rotate"],
      ["sample", "sample"],
      ["index", "index"],
      ["rindex", "rindex"],
      ["in_groups", "inGroups"],
      ["in_groups_of", "inGroupsOf"],
      ["to_sentence", "toSentence"],
      ["to_formatted_s", "toFormattedS"],
      ["to_fs", "toFs"],
      ["as_json", "asJson"],
      ["to_xml", "toXml"],
    ];

    for (const [rubyName, jsName] of RECORD_DELEGATES) {
      it(`test_delegates_${rubyName}_to_Array`, () => {
        expect(typeof (Comment.all() as any)[jsName]).toBe("function");
      });
    }

    it("index and rindex locate records by value", async () => {
      const relation = Comment.all();
      const records = await relation;
      const mid = records[Math.floor(records.length / 2)];
      expect(await relation.index(mid)).toBe(records.findIndex((c) => c.id === mid.id));
      expect(await relation.rindex((c: any) => c.id === mid.id)).toBe(
        records.map((c) => c.id).lastIndexOf(mid.id),
      );
    });

    it("intersect? reports whether any record is shared, by record equality", async () => {
      const records = await Comment.all();
      const reloaded = await Comment.find(records[0].id);
      expect(await Comment.all().isIntersect([reloaded])).toBe(true);
      expect(await Comment.all().isIntersect([])).toBe(false);
      expect(await Comment.all().isIntersect([Comment.new()])).toBe(false);
    });

    it("intersect? is delegated on a CollectionProxy too", async () => {
      const post = await Post.first();
      const proxy = (post as any).comments;
      const comments = await proxy.toArray();
      expect(await proxy.isIntersect(comments.slice(0, 1))).toBe(true);
      expect(await proxy.isIntersect([Comment.new()])).toBe(false);
    });

    it("to_fs(:db) joins the record ids", async () => {
      const records = await Comment.all();
      expect(await Comment.all().toFs("db")).toBe(records.map((c) => c.id).join(","));
    });

    it("to_fs default falls back to Array#to_s (bracketed inspect, not a bare join)", async () => {
      const records = await Comment.all();
      const fs = await Comment.all().toFs();
      expect(fs).toBe(`[${records.map((c) => (c as any).inspect()).join(", ")}]`);
    });

    it("on a loaded proxy each/index delegate to records synchronously", async () => {
      const post = await Post.first();
      const proxy = (post as any).comments;
      await proxy.load();
      expect(proxy.loaded).toBe(true);
      const seen: number[] = [];
      const ret = proxy.each((c: any) => seen.push(c.id));
      expect(ret).not.toBeInstanceOf(Promise);
      expect(seen).toEqual(proxy.target.map((c: any) => c.id));
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
      const xml = await (Relation.prototype as any).toXml.call(host, { skipInstruct: true });
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
      expect(relation.connection).toBe(Comment.connection);
      expect(await Comment.all().transaction(async () => 42)).toBe(42);
    });

    it("delegates slice to records (self-loading a slice of the loaded rows)", async () => {
      const records = await Comment.all();
      const sliced = await Comment.all().slice(1, 3);
      expect(sliced.map((c: any) => c.id)).toEqual(records.slice(1, 3).map((c) => c.id));
    });

    it("delegates name to the model class name", () => {
      expect(Comment.all().name).toBe("Comment");
    });
  });
});

describe("DelegationCachingTest", () => {
  const { projects } = fixtures(["projects", "developers", "developersProjects"]);

  registerModel(Project);
  registerModel(Developer);

  it("delegation doesn't override methods defined in other relation subclasses", async () => {
    expect("target" in Relation.prototype).toBe(false);
    expect("target" in CollectionProxy.prototype).toBe(true);

    expect(uncacheableMethods().has("target")).toBe(true);

    expect(await (Developer.all() as any).target()).toBe("__target__");

    const project = projects("active_record");
    const proxy = (project as any).developersWithCallbacks;
    await proxy.load();
    expect(proxy.target).not.toBe("__target__");
    expect(Array.isArray(proxy.target)).toBe(true);
  });
});
