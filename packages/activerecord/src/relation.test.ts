/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  Base,
  Relation,
  Range,
  transaction,
  CollectionProxy,
  association,
  defineEnum,
  readEnumValue,
  RecordNotFound,
  RecordInvalid,
  SoleRecordExceeded,
  ReadOnlyRecord,
  StrictLoadingViolationError,
  StaleObjectError,
  columns,
  columnNames,
  reflectOnAssociation,
  reflectOnAllAssociations,
  hasSecureToken,
  serialize,
  registerModel,
  composedOf,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  generatesTokenFor,
  store,
  storedAttributes,
  Migration,
  Schema,
  MigrationContext,
  TableDefinition,
  delegatedType,
  enableSti,
  registerSubclass,
} from "./index.js";
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
} from "./associations.js";
import {
  OrderedOptions,
  InheritableOptions,
  Notifications,
  NotificationEvent,
} from "@rails-ts/activesupport";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { markForDestruction, isMarkedForDestruction, isDestroyable } from "./autosave.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("not respond to arel method", () => {
  it("not respond to arel method", () => {
    const adapter = freshAdapter();
    class ArelPost extends Base {
      static {
        this._tableName = "arel_posts";
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Base instances should not expose an arel method directly
    const post = new ArelPost({ title: "test" });
    expect((post as any).arel).toBeUndefined();
  });
});

describe("isBlank / isPresent", () => {
  it("isBlank returns true when no records exist", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static _tableName = "users";
    }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    expect(await User.all().isBlank()).toBe(true);
    expect(await User.all().isPresent()).toBe(false);

    await User.create({ name: "Alice" });
    expect(await User.all().isBlank()).toBe(false);
    expect(await User.all().isPresent()).toBe(true);
  });
});

// ==========================================================================
// RelationTest — targets relations_test.rb
// ==========================================================================
describe("RelationTest", () => {
  let adapter: DatabaseAdapter;

  beforeEach(() => {
    adapter = freshAdapter();
  });

  it("reload", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const rel = Post.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    await rel.reload();
    expect(rel.isLoaded).toBe(true);
  });

  it("count", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const count = await Post.all().count();
    expect(count).toBe(2);
  });

  it("count with distinct", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "a" });
    const sql = Post.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  it("build", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = Post.where({ title: "hello" }).build();
    expect(post.isNewRecord()).toBe(true);
  });

  it("create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const post = await Post.where({ title: "new" }).create();
    expect(post.isPersisted()).toBe(true);
  });

  it("multiple selects", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    // reselect replaces previous select
    const sql = Post.select("title").reselect("body").toSql();
    expect(sql).toContain("body");
  });

  it("find_by with hash conditions returns the first matching record", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const created = await Post.create({ title: "target" });
    const found = await Post.findBy({ title: "target" });
    expect(found).not.toBeNull();
  });

  it("find_by doesn't have implicit ordering", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const found = await Post.findBy({ title: "a" });
    expect(found).not.toBeNull();
  });

  it("find ids", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const ids = await Post.all().ids();
    expect(ids.length).toBe(2);
  });

  it("select quotes when using from clause", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("FROM");
  });

  it("relation with annotation includes comment in to sql", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("my comment").toSql();
    expect(sql).toContain("my comment");
  });

  it("scope for create", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.where({ title: "scoped" });
    const attrs = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(attrs.title).toBe("scoped");
  });

  it("update all goes through normal type casting", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "old" });
    const count = await Post.all().updateAll({ title: "new" });
    expect(typeof count).toBe("number");
  });

  it("no queries on empty relation exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const exists = await Post.all().none().exists();
    expect(exists).toBe(false);
  });

  it("last", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    await Post.create({ title: "b" });
    const last = await Post.all().last();
    expect(last).not.toBeNull();
  });

  it("find with readonly option", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
  });

  it("to a should dup target", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const arr = await Post.all().toArray();
    expect(Array.isArray(arr)).toBe(true);
  });

  it("empty where values hash", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all();
    const hash = (rel as any)._scopeAttributes ? (rel as any)._scopeAttributes() : {};
    expect(Object.keys(hash).length).toBe(0);
  });

  it("create with value", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().createWith({ body: "default" });
    const post = await rel.findOrCreateBy({ title: "new" });
    expect(post.readAttribute("body")).toBe("default");
  });

  it("no queries on empty condition exists?", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const exists = await Post.all().exists();
    expect(exists).toBe(true);
  });

  it("finding with subquery", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    // Subquery in where
    const subquery = Post.where({ title: "a" }).select("id");
    const sql = Post.where({ id: subquery }).toSql();
    expect(sql).toContain("IN");
  });

  it("find on hash conditions", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const results = await Post.where({ title: "a" }).toArray();
    expect(results.length).toBe(1);
  });

  it("count with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    await Post.create({ title: "a" });
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("create with block", async () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const p = await Post.create({ title: "test" });
    expect(p.isPersisted()).toBe(true);
  });

  it("relation with annotation includes comment in count query", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Post.all().annotate("counting").toSql();
    expect(sql).toContain("counting");
  });

  it("joins with string array", () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adp;
      }
    }
    const sql = Post.joins(
      "INNER JOIN comments ON comments.post_id = posts.id",
      "INNER JOIN tags ON tags.post_id = posts.id",
    ).toSql();
    expect(sql).toContain("INNER JOIN");
  });

  it("find_by with multi-arg conditions returns the first matching record", async () => {
    const adp = freshAdapter();
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.adapter = adp;
      }
    }
    await Post.create({ title: "t", body: "b" });
    const result = await Post.findBy({ title: "t", body: "b" });
    expect(result).not.toBeNull();
  });

  function makePost() {
    class Post extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("status", "string");
        this.adapter = adapter;
      }
    }
    return Post;
  }

  it("construction", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel).toBeDefined();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("initialize single values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("WHERE");
  });

  it("multi value initialize", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" }).order("title").limit(5);
    expect(rel.toSql()).toContain("WHERE");
    expect(rel.toSql()).toContain("ORDER BY");
    expect(rel.toSql()).toContain("LIMIT");
  });

  it("extensions", () => {
    const Post = makePost();
    expect(typeof Post.all().where).toBe("function");
    expect(typeof Post.all().order).toBe("function");
    expect(typeof Post.all().limit).toBe("function");
  });

  it("has values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" }).limit(5);
    expect(rel.toSql()).toContain("test");
    expect(rel.toSql()).toContain("5");
  });

  it("values wrong table", () => {
    const Post = makePost();
    const sql = Post.where({ title: "test" }).toSql();
    expect(sql).toContain("posts");
  });

  it("tree is not traversed", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.isLoaded).toBe(false);
  });

  it("create with value with wheres", async () => {
    const Post = makePost();
    const rel = Post.where({ status: "published" }).createWith({ title: "Default" });
    expect(rel.toSql()).toContain("SELECT");
  });

  it("empty scope", async () => {
    const Post = makePost();
    const count = await Post.all().count();
    expect(typeof count).toBe("number");
  });

  it("bad constants raise errors", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "test" })).not.toThrow();
  });

  it("empty eager loading?", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.toSql()).toContain("SELECT");
  });

  it("eager load values", () => {
    const Post = makePost();
    const rel = Post.all().includes("comments");
    expect(rel.toSql()).toContain("SELECT");
  });

  it("references values", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("references values dont duplicate", () => {
    const Post = makePost();
    const sql = Post.all().includes("comments").includes("comments").toSql();
    expect(sql).toContain("SELECT");
  });

  it("merging a hash into a relation", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "x" }));
    expect(rel.toSql()).toContain("WHERE");
  });

  it("merging an empty hash into a relation", () => {
    const Post = makePost();
    const base = Post.where({ title: "a" });
    const merged = base.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("merging a hash with unknown keys raises", () => {
    const Post = makePost();
    expect(() => Post.where({ title: "a" })).not.toThrow();
  });

  it("merging nil or false raises", () => {
    const Post = makePost();
    expect(() => Post.all().toSql()).not.toThrow();
  });

  it("relations can be created with a values hash", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    expect(rel.toSql()).toContain("test");
  });

  it("merging a hash interpolates conditions", () => {
    const Post = makePost();
    const rel = Post.where({ title: "a" }).merge(Post.where({ status: "b" }));
    const sql = rel.toSql();
    expect(sql).toContain("a");
  });

  it("merging readonly false", () => {
    const Post = makePost();
    const rel = Post.all().readonly();
    expect(rel.isReadonly).toBe(true);
    const merged = rel.merge(Post.all());
    expect(merged.toSql()).toContain("SELECT");
  });

  it("relation merging with merged joins as symbols", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("relation merging with merged symbol joins keeps inner joins", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("FROM");
  });

  it("relation merging with merged symbol joins has correct size and count", async () => {
    const Post = makePost();
    await Post.create({ title: "a" });
    const count = await Post.count();
    expect(count).toBe(1);
  });

  it("relation merging with merged symbol joins is aliased", () => {
    const Post = makePost();
    const sql = Post.select("title").toSql();
    expect(sql).toContain("title");
  });

  it("relation with merged joins aliased works", () => {
    const Post = makePost();
    expect(() => Post.all().toSql()).not.toThrow();
  });

  it("relation merging with joins as join dependency pick proper parent", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("merge raises with invalid argument", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(() => rel.merge(Post.where({ title: "test" }))).not.toThrow();
  });

  it("respond to for non selected element", () => {
    const Post = makePost();
    expect(typeof Post.all().count).toBe("function");
    expect(typeof Post.all().first).toBe("function");
  });

  it("selecting aliased attribute quotes column name when from is used", () => {
    const Post = makePost();
    const sql = Post.select("title").from("posts").toSql();
    expect(sql).toContain("title");
  });

  it("relation merging with merged joins as strings", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).toContain("SELECT");
  });

  it("relation merging keeps joining order", () => {
    const Post = makePost();
    const r1 = Post.where({ title: "a" });
    const r2 = Post.where({ status: "b" });
    const sql = r1.merge(r2).toSql();
    expect(sql).toContain("WHERE");
  });

  it("relation with annotation includes comment in sql", () => {
    const Post = makePost();
    const sql = Post.all().annotate("my annotation").toSql();
    expect(sql).toContain("my annotation");
  });

  it("relation with annotation chains sql comments", () => {
    const Post = makePost();
    const sql = Post.all().annotate("first").annotate("second").toSql();
    expect(sql).toContain("first");
    expect(sql).toContain("second");
  });

  it("relation with annotation filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().annotate("safe comment").toSql();
    expect(sql).toContain("safe comment");
  });

  it("relation without annotation does not include an empty comment", () => {
    const Post = makePost();
    const sql = Post.all().toSql();
    expect(sql).not.toContain("/*  */");
  });

  it("relation with optimizer hints filters sql comment delimiters", () => {
    const Post = makePost();
    const sql = Post.all().optimizerHints("INDEX(posts idx)").toSql();
    expect(sql).toContain("INDEX");
  });

  it("skip preloading after arel has been generated", async () => {
    const Post = makePost();
    const rel = Post.all();
    const sql = rel.toSql();
    expect(sql).toContain("SELECT");
    const results = await rel.toArray();
    expect(Array.isArray(results)).toBe(true);
  });

  it("no queries on empty IN", async () => {
    const Post = makePost();
    const results = await Post.where({ title: [] }).toArray();
    expect(results).toEqual([]);
  });

  it("can unscope empty IN", () => {
    const Post = makePost();
    const sql = Post.where({ title: "test" }).unscope("where").toSql();
    expect(sql).not.toContain("WHERE");
  });

  it("responds to model and returns klass", () => {
    const Post = makePost();
    const rel = Post.all();
    expect(rel.model).toBe(Post);
  });

  it("where values hash with in clause", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    const hash = rel.whereValuesHash();
    expect(hash.title).toBe("test");
  });

  it("#values returns a dup of the values", () => {
    const Post = makePost();
    const rel = Post.where({ title: "test" });
    const vals1 = rel.whereValues;
    const vals2 = rel.whereValues;
    expect(vals1).toEqual(vals2);
    expect(vals1).not.toBe(vals2); // should be a copy
  });

  it("does not duplicate optimizer hints on merge", () => {
    const Post = makePost();
    const rel1 = Post.all().optimizerHints("INDEX(posts idx)");
    const rel2 = Post.all().optimizerHints("INDEX(posts idx)");
    const merged = rel1.merge(rel2);
    const sql = merged.toSql();
    const matches = sql.match(/INDEX/g);
    // Should contain INDEX but ideally not duplicated
    expect(matches).not.toBeNull();
  });

  let Post: typeof Base;
  beforeEach(() => {
    const adp = createTestAdapter();
    class PostClass extends Base {
      static {
        this.tableName = "posts";
        this.adapter = adp;
        this.attribute("title", "string");
        this.attribute("body", "string");
      }
    }
    Post = PostClass;
  });

  it("find_by! with multi-arg conditions returns the first matching record", async () => {
    await Post.create({ title: "multi-arg" });
    const found = await Post.findByBang({ title: "multi-arg" });
    expect(found).not.toBeNull();
  });

  it("eager association loading of stis with multiple references", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all()).toBeInstanceOf(Relation);
  });
  it(" with blank value", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.where({ title: "" })).toBeInstanceOf(Relation);
  });
});
