import { describe, it, expect } from "vitest";
import "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Post } from "../test-helpers/models/post.js";

fixtures([]);
function relation(): any {
  return Post.all();
}

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
      expect(rel[bang]("foo")).toBe(rel);
      expect(rel[field]).toContain("foo");
    }
  });

  it("#_select!", () => {
    const rel = relation();
    expect(rel._selectBang("foo")).toBe(rel);
    expect(rel.selectValues).toEqual(["foo"]);
  });

  it("#order!", () => {
    const rel = relation();
    expect(rel.orderBang("title ASC")).toBe(rel);
    expect(rel.orderValues).toEqual(["title ASC"]);
  });

  it("#order! with symbol prepends the table name", () => {
    const rel = relation();
    const attr = Post.arelTable.get("title");
    expect(rel.orderBang(attr)).toBe(rel);
    const node = rel.orderValues[0];
    expect(node.name).toBe("title");
    expect(node.relation.name).toBe("posts");
  });

  it("#order! on non-string does not attempt regexp match for references", () => {
    const rel = relation();
    const node = Post.arelTable.get("title");
    expect(rel.orderBang(node)).toBeTruthy();
    expect(rel.orderValues).toEqual([node]);
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
    expect(rel.extendingBang(mod)).toBe(rel);
    expect(rel.extendingValues).toEqual([mod]);
    expect(typeof rel.greeting).toBe("function");
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
    expect(rel.fromBang("foo")).toBe(rel);
    expect(rel.fromClause.value).toBe("foo");
  });

  it("#lock!", () => {
    const rel = relation();
    expect(rel.lockBang("foo")).toBe(rel);
    expect(rel.lockValue).toBe("foo");
  });

  it("#reorder!", () => {
    const rel: any = Post.order("foo");
    expect(rel.reorderBang("bar")).toBe(rel);
    expect(rel.orderValues).toEqual(["bar"]);
    expect(rel.reorderingValue).toBe(true);
  });

  it("#reorder! with symbol prepends the table name", () => {
    const rel = relation();
    const attr = Post.arelTable.get("title");
    expect(rel.reorderBang(attr)).toBe(rel);
    const node = rel.orderValues[0];
    expect(node.name).toBe("title");
    expect(node.relation.name).toBe("posts");
  });

  it("reverse_order!", () => {
    const rel: any = Post.order("title ASC", "comments_count DESC");
    const litValues = (): string[] => rel.orderValues.map((c: any) => String(c.value));
    rel.reverseOrderBang();
    expect(litValues()).toEqual(["title DESC", "comments_count ASC"]);
    rel.reverseOrderBang();
    expect(litValues()).toEqual(["title ASC", "comments_count DESC"]);
  });

  it("create_with!", () => {
    const rel = relation();
    expect(rel.createWithBang({ foo: "bar" })).toBe(rel);
    expect(rel.createWithValue).toEqual({ foo: "bar" });
  });

  it("merge!", () => {
    const rel = relation();
    expect(rel.mergeBang(Post.select("body"))).toBe(rel);
    expect(rel.selectValues).toEqual(["body"]);
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
    expect(rel.noneBang()).toBe(rel);
    expect(await rel.isNone()).toBe(true);
    expect(rel.isNullRelation()).toBe(true);
  });

  it("skip_query_cache!", () => {
    const rel = relation();
    expect(rel.skipQueryCacheBang()).toBe(rel);
    expect(rel.skipQueryCacheValue).toBe(true);
  });

  it("skip_preloading!", () => {
    const rel = relation();
    expect(rel.skipPreloadingBang()).toBe(rel);
    expect(rel.skipPreloadingValue).toBe(true);
  });

  it("#regroup!", () => {
    const rel: any = Post.group("foo");
    expect(rel.regroupBang("bar")).toBe(rel);
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
      expect(rel[bang](arg)).toBe(rel);
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
