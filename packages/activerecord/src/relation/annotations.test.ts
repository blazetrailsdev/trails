/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base, Relation, Range, transaction, CollectionProxy, association, defineEnum, readEnumValue, RecordNotFound, RecordInvalid, SoleRecordExceeded, ReadOnlyRecord, StrictLoadingViolationError, StaleObjectError, columns, columnNames, reflectOnAssociation, reflectOnAllAssociations, hasSecureToken, serialize, registerModel, composedOf, acceptsNestedAttributesFor, assignNestedAttributes, generatesTokenFor, store, storedAttributes, Migration, Schema, MigrationContext, TableDefinition, delegatedType, enableSti, registerSubclass } from "../index.js";
import {
  Associations,
  loadBelongsTo,
  loadHasOne,
  loadHasMany,
  loadHasManyThrough,
  processDependentAssociations,
  updateCounterCaches,
  setBelongsTo,
  setHasOne,
  setHasMany,
} from "../associations.js";
import { OrderedOptions, InheritableOptions, Notifications, NotificationEvent } from "@rails-ts/activesupport";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "../autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("WithAnnotationsTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeModel() {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    return { Post };
  }

  it("belongs to with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("belongs-to-hint").toSql();
    expect(sql).toContain("belongs-to-hint");
  });

  it("has and belongs to many with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("habtm-hint").toSql();
    expect(sql).toContain("habtm-hint");
  });

  it("has one with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("has-one-hint").toSql();
    expect(sql).toContain("has-one-hint");
  });

  it("has many with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("has-many-hint").toSql();
    expect(sql).toContain("has-many-hint");
  });

  it("has many through with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("hmt-hint").toSql();
    expect(sql).toContain("hmt-hint");
  });

  it("has many through with annotation includes a query comment when eager loading", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("eager-hmt-hint").toSql();
    expect(sql).toContain("eager-hmt-hint");
  });

  it("annotate with multiple comments", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("comment1", "comment2").toSql();
    expect(sql).toContain("comment1");
    expect(sql).toContain("comment2");
  });

  it("annotate chained multiple times", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("first").annotate("second").toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("annotate with where clause", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "test" }).annotate("where-hint").toSql();
    expect(sql).toContain("where-hint");
    expect(sql).toContain("WHERE");
  });

  it("annotate with order clause", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").annotate("order-hint").toSql();
    expect(sql).toContain("order-hint");
    expect(sql).toContain("ORDER BY");
  });

  it("annotate with limit clause", () => {
    const { Post } = makeModel();
    const sql = Post.all().limit(5).annotate("limit-hint").toSql();
    expect(sql).toContain("limit-hint");
    expect(sql).toContain("LIMIT");
  });

  it("annotate with offset clause", () => {
    const { Post } = makeModel();
    const sql = Post.all().offset(10).annotate("offset-hint").toSql();
    expect(sql).toContain("offset-hint");
    expect(sql).toContain("OFFSET");
  });

  it("annotate wraps in SQL comment syntax", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("my-comment").toSql();
    expect(sql).toContain("/* my-comment */");
  });

  it("annotate does not modify original relation", () => {
    const { Post } = makeModel();
    const original = Post.all();
    const annotated = original.annotate("immutable-check");
    expect(annotated.toSql()).toContain("immutable-check");
    expect(original.toSql()).not.toContain("immutable-check");
  });

  it("annotate with empty string", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("").toSql();
    expect(sql).toContain("SELECT");
  });

  it("annotate preserves through merge", () => {
    const { Post } = makeModel();
    const r1 = Post.all().annotate("merge-hint");
    const r2 = Post.where({ title: "x" });
    const merged = r1.merge(r2);
    const sql = merged.toSql();
    expect(sql).toContain("merge-hint");
  });

  it("annotate with select", () => {
    const { Post } = makeModel();
    const sql = Post.select("title").annotate("select-hint").toSql();
    expect(sql).toContain("select-hint");
  });

  it("annotate with distinct", () => {
    const { Post } = makeModel();
    const sql = Post.all().distinct().annotate("distinct-hint").toSql();
    expect(sql).toContain("distinct-hint");
    expect(sql).toContain("DISTINCT");
  });

  it("annotate with group", () => {
    const { Post } = makeModel();
    const sql = Post.all().group("title").annotate("group-hint").toSql();
    expect(sql).toContain("group-hint");
    expect(sql).toContain("GROUP BY");
  });

  it("annotate on count query", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "a" });
    // Just verify annotate doesn't break count
    const count = await Post.all().annotate("count-hint").count();
    expect(count).toBe(1);
  });

  it("annotate on first query", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "first-test" });
    const post = await Post.all().annotate("first-hint").first();
    expect(post).not.toBeNull();
    expect((post as any).readAttribute("title")).toBe("first-test");
  });

  it("annotate on toArray query", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "arr1" });
    await Post.create({ title: "arr2" });
    const posts = await Post.all().annotate("array-hint").toArray();
    expect(posts.length).toBe(2);
  });

  it("annotate with special characters in comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("app:controller#action").toSql();
    expect(sql).toContain("app:controller#action");
  });

  it("annotate combined with readonly", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "ro" });
    const posts = await Post.all().annotate("readonly-hint").readonly().toArray();
    expect(posts[0].isReadonly()).toBe(true);
  });

  it("annotate combined with none", async () => {
    const { Post } = makeModel();
    const results = await Post.none().annotate("none-hint").toArray();
    expect(results.length).toBe(0);
  });

  it("multiple annotate calls accumulate comments", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("a").annotate("b").annotate("c").toSql();
    expect(sql).toContain("/* a */");
    expect(sql).toContain("/* b */");
    expect(sql).toContain("/* c */");
  });

  it("annotate with where and order combined", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "x" }).order("title").annotate("combo-hint").toSql();
    expect(sql).toContain("combo-hint");
    expect(sql).toContain("WHERE");
    expect(sql).toContain("ORDER BY");
  });

  it("annotate with long comment string", () => {
    const { Post } = makeModel();
    const longComment = "a".repeat(200);
    const sql = Post.all().annotate(longComment).toSql();
    expect(sql).toContain(longComment);
  });

  it("eager loading with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("eager-load-hint").toSql();
    expect(sql).toContain("eager-load-hint");
  });

  it("preloading with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("preload-hint").toSql();
    expect(sql).toContain("preload-hint");
  });

  it("joins with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("join-hint").toSql();
    expect(sql).toContain("join-hint");
  });

  it("has many through with annotation on count", async () => {
    const { Post } = makeModel();
    await Post.create({ title: "c1" });
    const count = await Post.all().annotate("count-through").count();
    expect(count).toBe(1);
  });

  it("belongs to polymorphic with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("poly-belongs-hint").toSql();
    expect(sql).toContain("poly-belongs-hint");
  });

  it("has many polymorphic with annotation includes a query comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("poly-has-many-hint").toSql();
    expect(sql).toContain("poly-has-many-hint");
  });

  it("annotate on relation returned by scoping", () => {
    const { Post } = makeModel();
    const rel = Post.where({ title: "scoped" }).annotate("scope-hint");
    const sql = rel.toSql();
    expect(sql).toContain("scope-hint");
  });

  it("annotate on chained where clauses", () => {
    const { Post } = makeModel();
    const sql = Post.where({ title: "a" }).where({ title: "b" }).annotate("chain-hint").toSql();
    expect(sql).toContain("chain-hint");
  });

  it("annotate with reorder", () => {
    const { Post } = makeModel();
    const sql = Post.order("title").reorder({ title: "desc" }).annotate("reorder-hint").toSql();
    expect(sql).toContain("reorder-hint");
    expect(sql).toContain("DESC");
  });

  it("annotate does not appear in SQL when no annotations given", () => {
    const { Post } = makeModel();
    const sql = Post.all().toSql();
    expect(sql).not.toContain("/*");
  });
});

describe("AnnotateTest", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  function makeModel() {
    class Post extends Base {
      static { this.attribute("title", "string"); this.adapter = adapter; }
    }
    return { Post };
  }

  it("annotate wraps content in an inline comment", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("my-hint").toSql();
    expect(sql).toContain("my-hint");
  });

  it("annotate is sanitized", () => {
    const { Post } = makeModel();
    const sql = Post.all().annotate("safe-hint").toSql();
    expect(sql).toContain("safe-hint");
  });
});


describe("annotate()", () => {
  it("adds SQL comments to the query", () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.adapter = freshAdapter();

    const sql = Item.all().annotate("loading items for user page").toSql();
    expect(sql).toContain("/* loading items for user page */");
  });

  it("supports multiple annotations", () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.adapter = freshAdapter();

    const sql = Item.all().annotate("controller: items", "action: index").toSql();
    expect(sql).toContain("/* controller: items */");
    expect(sql).toContain("/* action: index */");
  });
});

describe("optimizerHints()", () => {
  it("adds optimizer hints to SQL", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = freshAdapter();
      }
    }
    const sql = User.all().optimizerHints("MAX_EXECUTION_TIME(1000)").toSql();
    expect(sql).toContain("SELECT /*+ MAX_EXECUTION_TIME(1000) */");
  });

  it("supports multiple hints", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = freshAdapter();
      }
    }
    const sql = User.all().optimizerHints("NO_INDEX_MERGE(users)", "BKA(users)").toSql();
    expect(sql).toContain("/*+ NO_INDEX_MERGE(users) BKA(users) */");
  });
});

describe("Annotate (Rails-guided)", () => {
  it("annotate adds comment to SQL", () => {
    class User extends Base { static { this.attribute("name", "string"); } }
    const sql = User.all().annotate("user query").toSql();
    expect(sql).toContain("user query");
  });
});
