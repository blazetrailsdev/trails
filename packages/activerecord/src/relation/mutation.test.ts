import { describe, it, expect, beforeEach } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post, FakeKlass } from "../test-helpers/models/post.js";
import { Relation } from "../relation.js";
import type { Base } from "../base.js";

fixtures([]);
let _relation: any;
function relation(): any {
  return (_relation ??= new Relation(FakeKlass as unknown as typeof Base));
}

beforeEach(() => {
  _relation = undefined;
});

describe("RelationMutationTest", () => {
  it("#!", () => {
    const MULTI: ReadonlyArray<[string, string]> = [
      ["includesBang", "includesValues"],
      ["eagerLoadBang", "eagerLoadValues"],
      ["preloadBang", "preloadValues"],
      ["groupBang", "groupValues"],
      ["joinsBang", "joinsValues"],
      ["leftOuterJoinsBang", "leftOuterJoinsValues"],
      ["referencesBang", "referencesValues"],
      ["optimizerHintsBang", "optimizerHintsValues"],
      ["annotateBang", "annotateValues"],
    ];
    for (const [bang, field] of MULTI) {
      const rel = relation();
      expect(rel[bang]("foo") === rel).toBeTruthy();
      expect(rel[field]).toEqual(["foo"]);
    }
  });

  it("#_select!", () => {
    const rel = relation();
    expect(rel._selectBang("foo") === rel).toBeTruthy();
    expect(rel.selectValues).toEqual(["foo"]);
  });

  it("#order!", () => {
    const rel = relation();
    expect(rel.orderBang("title ASC") === rel).toBeTruthy();
    expect(rel.orderValues).toEqual(["title ASC"]);
  });

  it("#order! with symbol prepends the table name", () => {
    const rel: any = relation();
    expect(rel.orderBang(":name") === rel).toBeTruthy();
    const node = rel.orderValues[0];
    expect(node.isAscending()).toBeTruthy();
    expect(node.expr.name).toBe("name");
    expect(node.expr.relation.name).toBe("posts");
  });

  it("#order! on non-string does not attempt regexp match for references", () => {
    const obj = new (class {})();
    const rel = relation();
    expect(rel.orderBang(obj)).toBeTruthy();
    expect(rel.orderValues).toEqual([obj]);
  });

  it("extending!", () => {
    const rel = relation();
    const mod = {
      greeting() {
        return "hello";
      },
    };
    const mod2 = {
      farewell() {
        return "bye";
      },
    };
    expect(rel.extendingBang(mod) === rel).toBeTruthy();
    expect(rel.extendingValues).toEqual([mod]);
    expect(typeof rel.greeting === "function").toBeTruthy();
    rel.extendingBang(mod2);
    expect(rel.extendingValues).toEqual([mod, mod2]);
  });

  it("extending! with empty args", () => {
    const rel = relation();
    rel.extendingBang();
    expect(rel.extendingValues).toEqual([]);
  });

  it("#from!", () => {
    const rel = relation();
    expect(rel.fromBang("foo") === rel).toBeTruthy();
    expect(rel.fromClause.value).toBe("foo");
  });

  it("#lock!", () => {
    const rel = relation();
    expect(rel.lockBang("foo") === rel).toBeTruthy();
    expect(rel.lockValue).toBe("foo");
  });

  it("#reorder!", () => {
    _relation = relation().order("foo");
    const rel: any = relation();
    expect(rel.reorderBang("bar") === rel).toBeTruthy();
    expect(rel.orderValues).toEqual(["bar"]);
    expect(rel.reorderingValue).toBeTruthy();
  });

  it("#reorder! with symbol prepends the table name", () => {
    const rel: any = relation();
    expect(rel.reorderBang(":name") === rel).toBeTruthy();
    const node = rel.orderValues[0];
    expect(node.isAscending()).toBeTruthy();
    expect(node.expr.name).toBe("name");
    expect(node.expr.relation.name).toBe("posts");
  });

  it.skip("reverse_order!", () => {
    // BLOCKED: relation-mutation-order-values-sqlliteral-not-string
    const rel: any = Post.order("title ASC", "comments_count DESC");
    rel.reverseOrderBang();
    expect(rel.orderValues.at(0)).toEqual("title DESC");
    expect(rel.orderValues.at(-1)).toEqual("comments_count ASC");
    rel.reverseOrderBang();
    expect(rel.orderValues.at(0)).toEqual("title ASC");
    expect(rel.orderValues.at(-1)).toEqual("comments_count DESC");
  });

  it("create_with!", () => {
    const rel = relation();
    expect(rel.createWithBang({ foo: "bar" }) === rel).toBeTruthy();
    expect(rel.createWithValue).toEqual({ foo: "bar" });
  });

  it("merge!", () => {
    const rel = relation();
    expect(rel.mergeBang({ select: "foo" }) === rel).toBeTruthy();
    expect(rel.selectValues).toEqual(["foo"]);
  });

  it("merge with a proc", () => {
    const rel = relation();
    rel.mergeBang(function (this: any) {
      this._selectBang("body");
    });
    expect(rel.selectValues).toEqual(["body"]);
  });

  it("none!", async () => {
    const rel = relation();
    expect(rel.noneBang() === rel).toBeTruthy();
    expect(await rel.isNone()).toBeTruthy();
    expect(rel.isNullRelation()).toBeTruthy();
  });

  it("skip_query_cache!", () => {
    const rel = relation();
    rel.skipQueryCacheBang();
    expect(rel.skipQueryCacheValue).toBeTruthy();
  });

  it("skip_preloading!", () => {
    const rel = relation();
    rel.skipPreloadingBang();
    expect(rel.skipPreloadingValue).toBeTruthy();
  });

  it("#regroup!", () => {
    _relation = relation().group("foo");
    const rel: any = relation();
    expect(rel.regroupBang("bar") === rel).toBeTruthy();
    expect(rel.groupValues).toEqual(["bar"]);
  });

  it("#!", () => {
    const SINGLE: ReadonlyArray<[string, unknown, string, unknown]> = [
      ["limitBang", 5, "limitValue", 5],
      ["offsetBang", 5, "offsetValue", 5],
      ["readonlyBang", true, "readonlyValue", true],
      ["distinctBang", true, "distinctValue", true],
    ];
    for (const [bang, arg, field, expected] of SINGLE) {
      const rel = relation();
      expect(rel[bang](arg) === rel).toBeTruthy();
      expect(rel[field]).toBe(expected);
    }
  });

  it("distinct!", () => {
    const rel = relation();
    rel.distinctBang("foo");
    expect(rel.distinctValue).toBe("foo");
  });

  it("uniq! deduplicates the named clause array", () => {
    const rel: any = Post.group("title").group("title").group("author");
    expect(rel.groupValues).toEqual(["title", "title", "author"]);
    rel.uniqBang("group");
    expect(rel.groupValues).toEqual(["title", "author"]);
  });

  it("uniq! is a no-op for unknown clause names", () => {
    const rel: any = Post.group("title");
    expect(() => rel.uniqBang("unknown_clause")).not.toThrow();
  });

  it("uniq! with no argument is a no-op", () => {
    const rel: any = Post.group("title");
    expect(() => rel.uniqBang()).not.toThrow();
  });
});
