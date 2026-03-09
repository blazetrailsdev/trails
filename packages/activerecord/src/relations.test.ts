import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  Relation,
  Range,
  RecordNotFound,
  SoleRecordExceeded,
} from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ─── Shared model setup ───

let adapter: DatabaseAdapter;

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("body", "string");
    this.attribute("author", "string");
    this.attribute("status", "string");
    this.attribute("views", "integer");
    this.attribute("category", "string");
    this.attribute("published", "boolean");
  }
}

async function seedPosts() {
  adapter = freshAdapter();
  Post.adapter = adapter;
  await Post.create({ title: "First", body: "body1", author: "alice", status: "published", views: 100, category: "tech", published: true });
  await Post.create({ title: "Second", body: "body2", author: "bob", status: "draft", views: 50, category: "tech", published: false });
  await Post.create({ title: "Third", body: "body3", author: "alice", status: "published", views: 200, category: "science", published: true });
  await Post.create({ title: "Fourth", body: "body4", author: "carol", status: "archived", views: 10, category: "science", published: false });
  await Post.create({ title: "Fifth", body: "body5", author: "bob", status: "published", views: 75, category: "art", published: true });
}

// ═══════════════════════════════════════════════════════════════════
// RELATION TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Relation", () => {
  beforeEach(seedPosts);

  // ── where ──

  describe("where", () => {
    it("filters by a single condition", async () => {
      const posts = await Post.where({ author: "alice" }).toArray();
      expect(posts).toHaveLength(2);
    });

    it("filters by multiple conditions in one hash", async () => {
      const posts = await Post.where({ author: "alice", status: "published" }).toArray();
      expect(posts).toHaveLength(2);
    });

    it("chains multiple where calls (AND)", async () => {
      const posts = await Post.where({ author: "alice" }).where({ category: "tech" }).toArray();
      expect(posts).toHaveLength(1);
      expect(posts[0].readAttribute("title")).toBe("First");
    });

    it("where with array value (IN)", async () => {
      const posts = await Post.where({ status: ["published", "draft"] }).toArray();
      expect(posts).toHaveLength(4);
    });

    it("where with null value", async () => {
      await Post.create({ title: "NoAuthor", body: "x", author: null as any, status: "draft", views: 0, category: "misc", published: false });
      const posts = await Post.where({ author: null }).toArray();
      expect(posts).toHaveLength(1);
      expect(posts[0].readAttribute("title")).toBe("NoAuthor");
    });

    it("where with raw SQL string", async () => {
      const sql = Post.where("views > ?", 50).toSql();
      expect(sql).toContain("views > 50");
    });

    it("where with named binds", async () => {
      const sql = Post.where("views > :min AND views < :max", { min: 10, max: 200 }).toSql();
      expect(sql).toContain("views > 10");
      expect(sql).toContain("views < 200");
    });

    it("where returns empty when no match", async () => {
      const posts = await Post.where({ author: "nobody" }).toArray();
      expect(posts).toHaveLength(0);
    });

    it("where with boolean value", async () => {
      const posts = await Post.where({ published: true }).toArray();
      expect(posts).toHaveLength(3);
    });
  });

  // ── whereNot ──

  describe("whereNot", () => {
    it("excludes matching records", async () => {
      const posts = await Post.all().whereNot({ status: "published" }).toArray();
      expect(posts).toHaveLength(2);
    });

    it("chains with where", async () => {
      const posts = await Post.where({ category: "tech" }).whereNot({ author: "alice" }).toArray();
      expect(posts).toHaveLength(1);
      expect(posts[0].readAttribute("author")).toBe("bob");
    });
  });

  // ── or ──

  describe("or", () => {
    it("combines two relations with OR", async () => {
      const r1 = Post.where({ author: "alice" });
      const r2 = Post.where({ author: "carol" });
      const posts = await r1.or(r2).toArray();
      expect(posts).toHaveLength(3);
    });

    it("generates SQL with OR", () => {
      const sql = Post.where({ author: "alice" }).or(Post.where({ author: "bob" })).toSql();
      expect(sql).toContain("OR");
    });
  });

  // ── and ──

  describe("and", () => {
    it("merges where clauses from another relation", () => {
      const r1 = Post.where({ author: "alice" });
      const r2 = Post.where({ status: "published" });
      const sql = r1.and(r2).toSql();
      expect(sql).toContain("author");
      expect(sql).toContain("status");
    });
  });

  // ── order ──

  describe("order", () => {
    it("orders ascending by string", async () => {
      const posts = await Post.all().order("title").toArray();
      expect(posts[0].readAttribute("title")).toBe("Fifth");
      expect(posts[4].readAttribute("title")).toBe("Third");
    });

    it("orders descending by hash", async () => {
      const posts = await Post.all().order({ views: "desc" }).toArray();
      expect(posts[0].readAttribute("title")).toBe("Third");
    });

    it("orders by multiple columns", async () => {
      const posts = await Post.all().order({ category: "asc" }, { views: "desc" }).toArray();
      expect(posts[0].readAttribute("category")).toBe("art");
    });

    it("reorder replaces existing order", async () => {
      const posts = await Post.all().order("title").reorder({ views: "asc" }).toArray();
      expect(posts[0].readAttribute("views")).toBe(10);
    });

    it("reverseOrder flips the sort", async () => {
      const posts = await Post.all().order({ views: "asc" }).reverseOrder().toArray();
      expect(posts[0].readAttribute("views")).toBe(200);
    });
  });

  // ── limit / offset ──

  describe("limit and offset", () => {
    it("limit restricts result count", async () => {
      const posts = await Post.all().limit(2).toArray();
      expect(posts).toHaveLength(2);
    });

    it("offset skips records", async () => {
      const all = await Post.all().toArray();
      const offset = await Post.all().offset(2).toArray();
      expect(offset).toHaveLength(all.length - 2);
    });

    it("limit + offset for pagination", async () => {
      const page1 = await Post.all().order("title").limit(2).offset(0).toArray();
      const page2 = await Post.all().order("title").limit(2).offset(2).toArray();
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].readAttribute("title")).not.toBe(page2[0].readAttribute("title"));
    });
  });

  // ── select ──

  describe("select", () => {
    it("generates SQL with specific columns", () => {
      const sql = Post.all().select("title", "author").toSql();
      expect(sql).toContain("title");
      expect(sql).toContain("author");
    });

    it("reselect replaces previous select", () => {
      const sql = Post.all().select("title").reselect("author").toSql();
      expect(sql).toContain("author");
    });

    it("select with block filters loaded records", async () => {
      const posts = await Post.all().select((p: any) => p.readAttribute("views") > 50);
      expect(posts).toHaveLength(3);
    });
  });

  // ── distinct ──

  describe("distinct", () => {
    it("adds DISTINCT to SQL", () => {
      const sql = Post.all().select("category").distinct().toSql();
      expect(sql).toContain("DISTINCT");
    });
  });

  // ── group ──

  describe("group", () => {
    it("generates GROUP BY SQL", () => {
      const sql = Post.all().group("category").toSql();
      expect(sql).toContain("GROUP BY");
      expect(sql).toContain("category");
    });

    it("regroup replaces existing group", () => {
      const sql = Post.all().group("category").regroup("author").toSql();
      expect(sql).toContain("author");
      // Should not contain category in GROUP BY (may still appear in SELECT)
    });
  });

  // ── having ──

  describe("having", () => {
    it("generates HAVING SQL with string", () => {
      const sql = Post.all().group("category").having("COUNT(*) > 1").toSql();
      expect(sql).toContain("HAVING");
      expect(sql).toContain("COUNT(*) > 1");
    });

    it("having with hash form", () => {
      const sql = Post.all().group("category").having({ count: 5 }).toSql();
      expect(sql).toContain("HAVING");
      expect(sql).toContain("count = 5");
    });
  });

  // ── none ──

  describe("none", () => {
    it("returns empty array", async () => {
      const posts = await Post.all().none().toArray();
      expect(posts).toHaveLength(0);
    });

    it("count returns 0", async () => {
      expect(await Post.all().none().count()).toBe(0);
    });

    it("exists returns false", async () => {
      expect(await Post.all().none().exists()).toBe(false);
    });

    it("first returns null", async () => {
      expect(await Post.all().none().first()).toBeNull();
    });

    it("last returns null", async () => {
      expect(await Post.all().none().last()).toBeNull();
    });
  });

  // ── rewhere ──

  describe("rewhere", () => {
    it("replaces existing where conditions for the same key", async () => {
      const posts = await Post.where({ author: "alice" }).rewhere({ author: "bob" }).toArray();
      expect(posts.every((p: any) => p.readAttribute("author") === "bob")).toBe(true);
    });
  });

  // ── invertWhere ──

  describe("invertWhere", () => {
    it("swaps where and whereNot clauses", () => {
      const rel = Post.where({ status: "published" });
      const inverted = rel.invertWhere();
      const sql = inverted.toSql();
      expect(sql).toContain("!=");
    });
  });

  // ── merge ──

  describe("merge", () => {
    it("merges where clauses from another relation", async () => {
      const r1 = Post.where({ author: "alice" });
      const r2 = Post.where({ status: "published" });
      const posts = await r1.merge(r2).toArray();
      expect(posts).toHaveLength(2);
    });

    it("merges limit from other relation", () => {
      const r1 = Post.all().limit(10);
      const r2 = Post.all().limit(5);
      const sql = r1.merge(r2).toSql();
      expect(sql).toContain("LIMIT 5");
    });
  });

  // ── unscope ──

  describe("unscope", () => {
    it("removes where clauses", () => {
      const sql = Post.where({ author: "alice" }).unscope("where").toSql();
      expect(sql).not.toContain("alice");
    });

    it("removes order", () => {
      const sql = Post.all().order("title").unscope("order").toSql();
      expect(sql).not.toContain("ORDER BY");
    });

    it("removes limit", () => {
      const sql = Post.all().limit(5).unscope("limit").toSql();
      expect(sql).not.toContain("LIMIT");
    });

    it("removes offset", () => {
      const sql = Post.all().offset(10).unscope("offset").toSql();
      expect(sql).not.toContain("OFFSET");
    });

    it("removes group", () => {
      const sql = Post.all().group("category").unscope("group").toSql();
      expect(sql).not.toContain("GROUP BY");
    });

    it("removes multiple parts at once", () => {
      const sql = Post.all().order("title").limit(5).offset(10).unscope("order", "limit", "offset").toSql();
      expect(sql).not.toContain("ORDER BY");
      expect(sql).not.toContain("LIMIT");
      expect(sql).not.toContain("OFFSET");
    });
  });

  // ── only ──

  describe("only", () => {
    it("keeps only specified query parts", () => {
      const sql = Post.where({ author: "alice" }).order("title").limit(5).only("where").toSql();
      expect(sql).toContain("alice");
      expect(sql).not.toContain("ORDER BY");
      expect(sql).not.toContain("LIMIT");
    });
  });

  // ── lock ──

  describe("lock", () => {
    it("adds FOR UPDATE by default", () => {
      const sql = Post.all().lock().toSql();
      expect(sql).toContain("FOR UPDATE");
    });

    it("accepts a custom lock clause", () => {
      const sql = Post.all().lock("FOR SHARE").toSql();
      expect(sql).toContain("FOR SHARE");
    });
  });

  // ── readonly / strictLoading ──

  describe("readonly", () => {
    it("marks relation as readonly", () => {
      const rel = Post.all().readonly();
      expect(rel.isReadonly).toBe(true);
    });

    it("is not readonly by default", () => {
      expect(Post.all().isReadonly).toBe(false);
    });
  });

  describe("strictLoading", () => {
    it("marks relation as strict loading", () => {
      const rel = Post.all().strictLoading();
      expect(rel.isStrictLoading).toBe(true);
    });
  });

  // ── annotate ──

  describe("annotate", () => {
    it("adds SQL comments", () => {
      const sql = Post.all().annotate("loading posts for dashboard").toSql();
      expect(sql).toContain("loading posts for dashboard");
    });
  });

  // ── from ──

  describe("from", () => {
    it("changes the FROM clause", () => {
      const sql = Post.all().from("archived_posts").toSql();
      expect(sql).toContain("archived_posts");
    });
  });

  // ── inspect ──

  describe("inspect", () => {
    it("returns a readable string representation", () => {
      const str = Post.where({ author: "alice" }).order({ views: "desc" }).limit(5).inspect();
      expect(str).toContain("Post");
      expect(str).toContain("where");
      expect(str).toContain("limit");
    });

    it("shows none when applicable", () => {
      const str = Post.all().none().inspect();
      expect(str).toContain("none");
    });
  });

  // ── Relation state ──

  describe("relation state", () => {
    it("isLoaded is false before query", () => {
      expect(Post.all().isLoaded).toBe(false);
    });

    it("isLoaded is true after toArray", async () => {
      const rel = Post.all();
      await rel.toArray();
      expect(rel.isLoaded).toBe(true);
    });

    it("reset clears loaded state", async () => {
      const rel = Post.all();
      await rel.toArray();
      rel.reset();
      expect(rel.isLoaded).toBe(false);
    });

    it("reload re-fetches records", async () => {
      const rel = Post.all();
      await rel.toArray();
      expect(rel.isLoaded).toBe(true);
      await rel.reload();
      expect(rel.isLoaded).toBe(true);
    });

    it("spawn creates an independent copy", () => {
      const rel = Post.where({ author: "alice" });
      const spawned = rel.spawn();
      expect(spawned.toSql()).toBe(rel.toSql());
    });
  });

  // ── size / length / isEmpty / isAny / isMany / isOne ──

  describe("collection predicates", () => {
    it("size returns count", async () => {
      expect(await Post.all().size()).toBe(5);
    });

    it("isEmpty returns false with records", async () => {
      expect(await Post.all().isEmpty()).toBe(false);
    });

    it("isEmpty returns true with no records", async () => {
      expect(await Post.where({ author: "nobody" }).isEmpty()).toBe(true);
    });

    it("isAny returns true with records", async () => {
      expect(await Post.all().isAny()).toBe(true);
    });

    it("isMany returns true with multiple records", async () => {
      expect(await Post.all().isMany()).toBe(true);
    });

    it("isMany returns false with one record", async () => {
      expect(await Post.where({ author: "carol" }).isMany()).toBe(false);
    });

    it("isOne returns true with exactly one record", async () => {
      expect(await Post.where({ author: "carol" }).isOne()).toBe(true);
    });

    it("isBlank is alias for isEmpty", async () => {
      expect(await Post.where({ author: "nobody" }).isBlank()).toBe(true);
    });

    it("isPresent is alias for isAny", async () => {
      expect(await Post.all().isPresent()).toBe(true);
    });

    it("presence returns relation when records exist", async () => {
      const result = await Post.all().presence();
      expect(result).not.toBeNull();
    });

    it("presence returns null when no records", async () => {
      const result = await Post.where({ author: "nobody" }).presence();
      expect(result).toBeNull();
    });

    it("length returns count of loaded records", async () => {
      expect(await Post.all().length()).toBe(5);
    });
  });

  // ── structurallyCompatible ──

  describe("structurallyCompatible", () => {
    it("returns true for same model", () => {
      expect(Post.where({ author: "alice" }).structurallyCompatible(Post.where({ author: "bob" }))).toBe(true);
    });
  });

  // ── excluding / without ──

  describe("excluding", () => {
    it("excludes specific records", async () => {
      const alice = await Post.where({ author: "carol" }).first();
      const posts = await Post.all().excluding(alice as any).toArray();
      expect(posts).toHaveLength(4);
    });

    it("without is an alias", async () => {
      const carol = await Post.where({ author: "carol" }).first();
      const posts = await Post.all().without(carol as any).toArray();
      expect(posts).toHaveLength(4);
    });
  });

  // ── whereAny / whereAll ──

  describe("whereAny", () => {
    it("matches any of the given conditions", async () => {
      const posts = await Post.all().whereAny({ author: "alice" }, { author: "carol" }).toArray();
      expect(posts).toHaveLength(3);
    });
  });

  describe("whereAll", () => {
    it("matches all given conditions", async () => {
      const posts = await Post.all().whereAll({ author: "alice" }, { status: "published" }).toArray();
      expect(posts).toHaveLength(2);
    });
  });

  // ── where with Range ──

  describe("where with Range", () => {
    it("filters using BETWEEN", async () => {
      const sql = Post.where({ views: new Range(50, 150) }).toSql();
      expect(sql).toContain("BETWEEN");
    });
  });

  // ── createWith ──

  describe("createWith", () => {
    it("sets default attributes for create", async () => {
      const rel = Post.where({ author: "dave" }).createWith({ status: "draft", views: 0, category: "misc", published: false });
      const post = await rel.create({ title: "New", body: "new body" });
      expect(post.readAttribute("author")).toBe("dave");
    });
  });

  // ── build ──

  describe("build", () => {
    it("creates an unsaved record with scoped attributes", () => {
      const post = Post.where({ author: "dave" }).build({ title: "Built" });
      expect(post.readAttribute("author")).toBe("dave");
      expect(post.readAttribute("title")).toBe("Built");
      expect(post.isNewRecord()).toBe(true);
    });
  });

  // ── extending ──

  describe("extending", () => {
    it("adds custom methods to a relation", () => {
      const rel = Post.all().extending({
        techPosts(this: any) { return this.where({ category: "tech" }); },
      });
      expect(typeof (rel as any).techPosts).toBe("function");
    });
  });

  // ── set operations (SQL generation) ──

  describe("set operations", () => {
    it("union generates UNION SQL", () => {
      const sql = Post.where({ author: "alice" }).union(Post.where({ author: "bob" })).toSql();
      expect(sql).toContain("UNION");
    });

    it("unionAll generates UNION ALL SQL", () => {
      const sql = Post.where({ author: "alice" }).unionAll(Post.where({ author: "bob" })).toSql();
      expect(sql).toContain("UNION ALL");
    });

    it("intersect generates INTERSECT SQL", () => {
      const sql = Post.where({ status: "published" }).intersect(Post.where({ author: "alice" })).toSql();
      expect(sql).toContain("INTERSECT");
    });

    it("except generates EXCEPT SQL", () => {
      const sql = Post.all().except(Post.where({ status: "draft" })).toSql();
      expect(sql).toContain("EXCEPT");
    });
  });

  // ── joins (SQL generation) ──

  describe("joins", () => {
    it("joins generates JOIN SQL", () => {
      const sql = Post.all().joins("comments", '"comments"."post_id" = "posts"."id"').toSql();
      expect(sql).toContain("JOIN");
    });

    it("leftJoins generates LEFT JOIN SQL", () => {
      const sql = Post.all().leftJoins("comments", '"comments"."post_id" = "posts"."id"').toSql();
      expect(sql).toContain("LEFT");
      expect(sql).toContain("JOIN");
    });

    it("raw join string", () => {
      const sql = Post.all().joins("INNER JOIN comments ON comments.post_id = posts.id").toSql();
      expect(sql).toContain("INNER JOIN comments");
    });
  });

  // ── includes / preload / eagerLoad (SQL generation, no actual loading) ──

  describe("includes / preload / eagerLoad", () => {
    it("includes stores association names", () => {
      const rel = Post.all().includes("comments");
      // Just verify it doesn't throw and returns a relation
      expect(rel.toSql()).toBeTruthy();
    });

    it("preload stores association names", () => {
      const rel = Post.all().preload("comments");
      expect(rel.toSql()).toBeTruthy();
    });

    it("eagerLoad stores association names", () => {
      const rel = Post.all().eagerLoad("comments");
      expect(rel.toSql()).toBeTruthy();
    });
  });

  // ── inOrderOf (SQL generation) ──

  describe("inOrderOf", () => {
    it("generates CASE WHEN ordering", () => {
      const sql = Post.all().inOrderOf("status", ["published", "draft", "archived"]).toSql();
      expect(sql).toContain("CASE");
      expect(sql).toContain("WHEN");
    });
  });

  // ── reject ──

  describe("reject", () => {
    it("removes matching records from results", async () => {
      const posts = await Post.all().reject((p: any) => p.readAttribute("views") < 50);
      expect(posts).toHaveLength(4);
    });
  });

  // ── compactBlank ──

  describe("compactBlank", () => {
    it("generates whereNot null for columns", () => {
      const sql = Post.all().compactBlank("author").toSql();
      expect(sql).toContain("IS NOT NULL");
    });
  });

  // ── async iterator ──

  describe("async iterator", () => {
    it("supports for-await-of", async () => {
      const titles: string[] = [];
      for await (const post of Post.all()) {
        titles.push(post.readAttribute("title") as string);
      }
      expect(titles).toHaveLength(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// FINDER TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Finders", () => {
  beforeEach(seedPosts);

  describe("find", () => {
    it("finds a single record by id", async () => {
      const post = await Post.find(1);
      expect(post.readAttribute("title")).toBe("First");
    });

    it("finds multiple records by array of ids", async () => {
      const posts = await Post.find([1, 3]);
      expect(posts).toHaveLength(2);
    });

    it("finds multiple records with variadic args", async () => {
      const posts = await Post.find(1, 2, 3);
      expect(posts).toHaveLength(3);
    });

    it("throws RecordNotFound for missing id", async () => {
      await expect(Post.find(999)).rejects.toThrow(RecordNotFound);
    });

    it("throws RecordNotFound when some ids missing from array", async () => {
      await expect(Post.find([1, 999])).rejects.toThrow(RecordNotFound);
    });

    it("raises RecordNotFound for empty id array", async () => {
      await expect(Post.find([])).rejects.toThrow();
    });
  });

  describe("findBy", () => {
    it("returns the first matching record", async () => {
      const post = await Post.findBy({ author: "alice" });
      expect(post).not.toBeNull();
      expect(post!.readAttribute("author")).toBe("alice");
    });

    it("returns null when no match", async () => {
      const post = await Post.findBy({ author: "nobody" });
      expect(post).toBeNull();
    });

    it("finds by multiple conditions", async () => {
      const post = await Post.findBy({ author: "alice", category: "science" });
      expect(post).not.toBeNull();
      expect(post!.readAttribute("title")).toBe("Third");
    });

    it("finds by null value", async () => {
      await Post.create({ title: "Null", body: "x", author: null as any, status: "draft", views: 0, category: "misc", published: false });
      const post = await Post.findBy({ author: null });
      expect(post).not.toBeNull();
    });
  });

  describe("findByBang", () => {
    it("returns the record when found", async () => {
      const post = await Post.findByBang({ author: "carol" });
      expect(post.readAttribute("author")).toBe("carol");
    });

    it("throws RecordNotFound when not found", async () => {
      await expect(Post.findByBang({ author: "nobody" })).rejects.toThrow(RecordNotFound);
    });
  });

  describe("findSoleBy", () => {
    it("returns the sole matching record", async () => {
      const post = await Post.findSoleBy({ author: "carol" });
      expect(post.readAttribute("author")).toBe("carol");
    });

    it("throws when no records match", async () => {
      await expect(Post.findSoleBy({ author: "nobody" })).rejects.toThrow(RecordNotFound);
    });

    it("throws SoleRecordExceeded when multiple match", async () => {
      await expect(Post.findSoleBy({ author: "alice" })).rejects.toThrow(SoleRecordExceeded);
    });
  });

  describe("findByAttribute", () => {
    it("finds by a dynamic attribute", async () => {
      const post = await Post.findByAttribute("author", "carol");
      expect(post).not.toBeNull();
      expect(post!.readAttribute("author")).toBe("carol");
    });
  });

  describe("respondToMissingFinder", () => {
    it("returns true for valid attribute", () => {
      expect(Post.respondToMissingFinder("findByTitle")).toBe(true);
    });

    it("returns false for invalid attribute", () => {
      expect(Post.respondToMissingFinder("findByNonexistent")).toBe(false);
    });

    it("returns false for non-finder method", () => {
      expect(Post.respondToMissingFinder("something")).toBe(false);
    });
  });

  describe("first", () => {
    it("returns the first record", async () => {
      const post = await Post.all().first();
      expect(post).not.toBeNull();
    });

    it("first(n) returns n records", async () => {
      const posts = await Post.all().first(3);
      expect(posts).toHaveLength(3);
    });

    it("firstBang throws when no records", async () => {
      await expect(Post.where({ author: "nobody" }).firstBang()).rejects.toThrow(RecordNotFound);
    });
  });

  describe("last", () => {
    it("returns the last record", async () => {
      const post = await Post.all().last();
      expect(post).not.toBeNull();
    });

    it("last(n) returns last n records", async () => {
      const posts = await Post.all().last(2);
      expect(posts).toHaveLength(2);
    });

    it("lastBang throws when no records", async () => {
      await expect(Post.where({ author: "nobody" }).lastBang()).rejects.toThrow(RecordNotFound);
    });
  });

  describe("positional finders", () => {
    it("second returns the 2nd record", async () => {
      const post = await Post.all().second();
      expect(post).not.toBeNull();
    });

    it("third returns the 3rd record", async () => {
      const post = await Post.all().third();
      expect(post).not.toBeNull();
    });

    it("fourth returns the 4th record", async () => {
      const post = await Post.all().fourth();
      expect(post).not.toBeNull();
    });

    it("fifth returns the 5th record", async () => {
      const post = await Post.all().fifth();
      expect(post).not.toBeNull();
    });

    it("secondToLast returns the 2nd to last", async () => {
      const post = await Post.all().secondToLast();
      expect(post).not.toBeNull();
    });

    it("thirdToLast returns the 3rd to last", async () => {
      const post = await Post.all().thirdToLast();
      expect(post).not.toBeNull();
    });

    it("fortyTwo returns null when fewer than 42 records", async () => {
      const post = await Post.all().fortyTwo();
      expect(post).toBeNull();
    });
  });

  describe("take", () => {
    it("returns a single record", async () => {
      const post = await Post.all().take();
      expect(post).not.toBeNull();
    });

    it("take(n) returns n records", async () => {
      const posts = await Post.all().take(3);
      expect(posts).toHaveLength(3);
    });

    it("takeBang throws when no records", async () => {
      await expect(Post.where({ author: "nobody" }).takeBang()).rejects.toThrow(RecordNotFound);
    });
  });

  describe("sole", () => {
    it("returns the only matching record", async () => {
      const post = await Post.where({ author: "carol" }).sole();
      expect(post.readAttribute("author")).toBe("carol");
    });

    it("throws RecordNotFound when none match", async () => {
      await expect(Post.where({ author: "nobody" }).sole()).rejects.toThrow(RecordNotFound);
    });

    it("throws SoleRecordExceeded when multiple match", async () => {
      await expect(Post.where({ author: "alice" }).sole()).rejects.toThrow(SoleRecordExceeded);
    });
  });

  describe("exists", () => {
    it("returns true when records exist", async () => {
      expect(await Post.all().exists()).toBe(true);
    });

    it("returns false when no records match", async () => {
      expect(await Post.where({ author: "nobody" }).exists()).toBe(false);
    });
  });

  describe("count", () => {
    it("counts all records", async () => {
      expect(await Post.all().count()).toBe(5);
    });

    it("counts with where", async () => {
      expect(await Post.where({ author: "alice" }).count()).toBe(2);
    });
  });

  describe("sum / average / minimum / maximum", () => {
    it("sum calculates total", async () => {
      const total = await Post.all().sum("views");
      expect(total).toBe(435);
    });

    it("sum with no column returns 0", async () => {
      expect(await Post.all().sum()).toBe(0);
    });

    it("minimum returns smallest value", async () => {
      const min = await Post.all().minimum("views");
      expect(min).toBe(10);
    });

    it("maximum returns largest value", async () => {
      const max = await Post.all().maximum("views");
      expect(max).toBe(200);
    });
  });

  describe("pluck", () => {
    it("plucks a single column", async () => {
      const authors = await Post.all().pluck("author");
      expect(authors).toHaveLength(5);
      expect(authors).toContain("alice");
    });

    it("plucks multiple columns", async () => {
      const values = await Post.all().pluck("title", "author");
      expect(values).toHaveLength(5);
      expect(values[0]).toHaveLength(2);
    });
  });

  describe("pick", () => {
    it("picks value from first record", async () => {
      const title = await Post.all().order("title").pick("title");
      expect(title).toBe("Fifth");
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// SCOPING TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Scoping", () => {
  let adapter: DatabaseAdapter;

  class Article extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("status", "string");
      this.attribute("author", "string");
      this.attribute("views", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Article.adapter = adapter;
    // Clear scopes between tests
    if (Object.prototype.hasOwnProperty.call(Article, "_scopes")) {
      Article._scopes = new Map();
    }
    Article._defaultScope = null;

    await Article.create({ title: "A1", status: "published", author: "alice", views: 100 });
    await Article.create({ title: "A2", status: "draft", author: "bob", views: 50 });
    await Article.create({ title: "A3", status: "published", author: "alice", views: 200 });
  });

  describe("scope", () => {
    it("defines a named scope callable from the class", async () => {
      Article.scope("published", (rel: any) => rel.where({ status: "published" }));
      const articles = await (Article as any).published().toArray();
      expect(articles).toHaveLength(2);
    });

    it("scope is chainable with where", async () => {
      Article.scope("published", (rel: any) => rel.where({ status: "published" }));
      const articles = await (Article as any).published().where({ author: "alice" }).toArray();
      expect(articles).toHaveLength(2);
    });

    it("scope is chainable with other scopes", async () => {
      Article.scope("published", (rel: any) => rel.where({ status: "published" }));
      Article.scope("byAlice", (rel: any) => rel.where({ author: "alice" }));
      const articles = await (Article as any).published().byAlice().toArray();
      expect(articles).toHaveLength(2);
    });

    it("scope accessible from relation proxy", async () => {
      Article.scope("published", (rel: any) => rel.where({ status: "published" }));
      const articles = await Article.all().published().toArray();
      expect(articles).toHaveLength(2);
    });

    it("scope with extension block", async () => {
      Article.scope("published", (rel: any) => rel.where({ status: "published" }), {
        highViews(this: any) { return this.where("views > ?", 150); },
      });
      const rel = (Article as any).published();
      expect(typeof rel.highViews).toBe("function");
    });
  });

  describe("defaultScope", () => {
    it("applies default scope to all queries", async () => {
      Article.defaultScope((rel: any) => rel.where({ status: "published" }));
      const articles = await Article.all().toArray();
      expect(articles).toHaveLength(2);
    });

    it("default scope applies to where", async () => {
      Article.defaultScope((rel: any) => rel.where({ status: "published" }));
      const articles = await Article.where({ author: "alice" }).toArray();
      expect(articles).toHaveLength(2);
    });

    it("default scope applies to count", async () => {
      Article.defaultScope((rel: any) => rel.where({ status: "published" }));
      expect(await Article.all().count()).toBe(2);
    });
  });

  describe("unscoped", () => {
    it("bypasses default scope", async () => {
      Article.defaultScope((rel: any) => rel.where({ status: "published" }));
      const articles = await Article.unscoped().toArray();
      expect(articles).toHaveLength(3);
    });

    it("unscoped can be chained with where", async () => {
      Article.defaultScope((rel: any) => rel.where({ status: "published" }));
      const articles = await Article.unscoped().where({ author: "bob" }).toArray();
      expect(articles).toHaveLength(1);
    });
  });

  describe("scoping block", () => {
    it("sets currentScope during the block", async () => {
      const rel = Article.where({ status: "published" });
      let scopeDuringBlock: any = null;
      await Article.scoping(rel, () => {
        scopeDuringBlock = Article.currentScope;
      });
      expect(scopeDuringBlock).not.toBeNull();
    });

    it("restores previous scope after block", async () => {
      expect(Article.currentScope).toBeNull();
      const rel = Article.where({ status: "published" });
      await Article.scoping(rel, () => {});
      expect(Article.currentScope).toBeNull();
    });

    it("restores scope even on error", async () => {
      const rel = Article.where({ status: "published" });
      try {
        await Article.scoping(rel, () => { throw new Error("boom"); });
      } catch {}
      expect(Article.currentScope).toBeNull();
    });
  });
});


describe("Relation", () => {
  let adapter: DatabaseAdapter;

  class Item extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("category", "string");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Item.adapter = adapter;
    await Item.create({ name: "Apple", price: 1, category: "fruit" });
    await Item.create({ name: "Banana", price: 2, category: "fruit" });
    await Item.create({ name: "Carrot", price: 3, category: "vegetable" });
  });

  it("all returns all records", async () => {
    const items = await Item.all().toArray();
    expect(items).toHaveLength(3);
  });

  it("where filters by conditions", async () => {
    const fruits = await Item.all()
      .where({ category: "fruit" })
      .toArray();
    expect(fruits).toHaveLength(2);
  });

  it("where is chainable", async () => {
    const items = await Item.all()
      .where({ category: "fruit" })
      .where({ name: "Apple" })
      .toArray();
    expect(items).toHaveLength(1);
    expect(items[0].readAttribute("name")).toBe("Apple");
  });

  it("order sorts results", async () => {
    const items = await Item.all()
      .order({ price: "desc" })
      .toArray();
    expect(items[0].readAttribute("name")).toBe("Carrot");
    expect(items[2].readAttribute("name")).toBe("Apple");
  });

  it("limit restricts result count", async () => {
    const items = await Item.all().limit(2).toArray();
    expect(items).toHaveLength(2);
  });

  it("offset skips records", async () => {
    const items = await Item.all().offset(1).toArray();
    expect(items).toHaveLength(2);
  });

  it("first returns the first record", async () => {
    const item = await Item.all().first();
    expect(item).not.toBeNull();
    expect(item!.readAttribute("name")).toBe("Apple");
  });

  it("count returns the number of records", async () => {
    const count = await Item.all().count();
    expect(count).toBe(3);
  });

  it("count with where", async () => {
    const count = await Item.all()
      .where({ category: "fruit" })
      .count();
    expect(count).toBe(2);
  });

  it("exists returns true when records exist", async () => {
    expect(await Item.all().exists()).toBe(true);
  });

  it("exists returns false when no records match", async () => {
    expect(
      await Item.all().where({ category: "meat" }).exists()
    ).toBe(false);
  });

  it("none", async () => {
    const items = await Item.all().none().toArray();
    expect(items).toHaveLength(0);
    expect(await Item.all().none().count()).toBe(0);
  });

  it("pluck returns column values", async () => {
    const names = await Item.all().pluck("name");
    expect(names).toEqual(["Apple", "Banana", "Carrot"]);
  });

  it("ids returns primary key values", async () => {
    const ids = await Item.all().ids();
    expect(ids).toEqual([1, 2, 3]);
  });

  it("update all", async () => {
    await Item.all().where({ category: "fruit" }).updateAll({ price: 10 });
    const apple = await Item.find(1);
    expect(apple.readAttribute("price")).toBe(10);
  });

  it("delete all", async () => {
    await Item.all().where({ category: "fruit" }).deleteAll();
    const remaining = await Item.all().toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].readAttribute("name")).toBe("Carrot");
  });

  it("toSql generates SQL", () => {
    const sql = Item.all()
      .where({ category: "fruit" })
      .order("name")
      .limit(10)
      .toSql();
    expect(sql).toContain("items");
    expect(sql).toContain("fruit");
  });

  // Static shorthand
  it("Base.where is a shorthand for Base.all().where()", async () => {
    const items = await Item.where({ category: "vegetable" }).toArray();
    expect(items).toHaveLength(1);
  });

  // Immutability
  it("relations are immutable (where returns a new relation)", async () => {
    const all = Item.all();
    const filtered = all.where({ category: "fruit" });
    expect(await all.count()).toBe(3);
    expect(await filtered.count()).toBe(2);
  });

  it.skip("finding with subquery", () => {});
  it.skip("excluding array of records returns records not in array", () => {});
  it.skip("respond to delegate methods", () => {});
  it.skip("find with list of ids", () => {});
  it.skip("find with large number", () => {});
  it.skip("joins with string sql and string interpolation", () => {});
  it.skip("first with count and order", () => {});
  it.skip("last with count and order", () => {});
  it.skip("offset with count returns correct values", () => {});
  it.skip("take with count", () => {});
  it.skip("where with hash conditions on numeric field", () => {});
  it.skip("loading with one record", () => {});
  it.skip("order should return unique records", () => {});
  it.skip("to a should return same object for loaded and unloaded relations", () => {});
  it.skip("multiple selects", () => {});
  it.skip("find by is not cache polluted", () => {});
  it.skip("dynamic find by after find by id", () => {});
  it.skip("bound to array of records", () => {});
  it.skip("merging joins has an order", () => {});
  it.skip("joins with select and subquery", () => {});
  it.skip("except or only clears and then applies new where conditions", () => {});
  it.skip("eager loaded results have no duplicates", () => {});
  it.skip("find with readonly option", () => {});
  it.skip("detect preserves order", () => {});
  it.skip("each preserves order", () => {});
  it.skip("order with arel node", () => {});
  it.skip("order with multiple arel nodes", () => {});
  it.skip("reorder with arel node", () => {});
  it.skip("in clause with ar object", () => {});
  it.skip("pluck with serialized attributes", () => {});
  it.skip("relation responds to last", () => {});
  it.skip("relation responds to first", () => {});
  it.skip("sum doesnt error on no records", () => {});
  it.skip("average doesnt error on no records", () => {});
  it.skip("minimum doesnt error on no records", () => {});
  it.skip("maximum doesnt error on no records", () => {});
  it.skip("each with ar object", () => {});
  it.skip("relation with reselect", () => {});
  it.skip("relation with order and reselect", () => {});
  it.skip("relation merging with having", () => {});
  it.skip("find_or_create negotiates a race condition", () => {});
  it.skip("find_or_create_by with create_with", () => {});
  it.skip("exists returns false when no match exists", () => {});
  it.skip("exists returns true when match exists", () => {});
  it.skip("last on empty relation", () => {});
  it.skip("last on loaded empty relation", () => {});
  it.skip("first on empty relation", () => {});
  it.skip("find all using limit and offset", () => {});

  it.skip("dynamic finder", () => {});
  it.skip("scoped first", () => {});
  it.skip("finding with subquery with binds", () => {});
  it.skip("pluck with from includes original table name", () => {});
  it.skip("pluck with from includes quoted original table name", () => {});
  it.skip("select with subquery in from does not use original table name", () => {});
  it.skip("finding with arel order", () => {});
  it.skip("finding with assoc order", () => {});
  it.skip("finding with arel assoc order", () => {});
  it.skip("finding with reversed assoc order", () => {});
  it.skip("reverse arel order with function", () => {});
  it.skip("reverse arel assoc order with function", () => {});
  it.skip("reverse order with function other predicates", () => {});
  it.skip("reverse order with multiargument function", () => {});
  it.skip("finding last with arel order", () => {});
  it.skip("finding with order by aliased attributes", () => {});
  it.skip("finding with reorder by aliased attributes", () => {});
  it.skip("finding with complex order", () => {});
  it.skip("finding with sanitized order", () => {});
  it.skip("finding with order limit and offset", () => {});
  it.skip("to sql on eager join", () => {});
  it.skip("find id", () => {});
  it.skip("find in empty array", () => {});
  it.skip("where with ar relation", () => {});
  it.skip("where id with delegated ar object", () => {});
  it.skip("where relation with delegated ar object", () => {});
  it.skip("typecasting where with array", () => {});
  it.skip("find all using where with relation with bound values", () => {});
  it.skip("find all using where with relation and alternate primary key", () => {});
  it.skip("find all using where with relation with joins", () => {});
  it.skip("create with array", () => {});
  it.skip("first or create bang with valid options", () => {});
  it.skip("first or create bang with invalid options", () => {});
  it.skip("first or create bang with no parameters", () => {});
  it.skip("first or create bang with invalid block", () => {});
  it.skip("first or initialize with block", () => {});
  it.skip("find or create by race condition", () => {});
  it.skip("find or create by with block", () => {});
  it.skip("create or find by within transaction", () => {});
  it.skip("create or find by with bang", () => {});
  it.skip("order by relation attribute", () => {});
  it.skip("primary key", () => {});
  it.skip("order with reorder nil removes the order", () => {});
  it.skip("reverse order with reorder nil removes the order", () => {});
  it.skip("find_by with non-hash conditions returns the first matching record", () => {});
  it.skip("find_by requires at least one argument", () => {});
  it.skip("loaded relations cannot be mutated by multi value methods", () => {});
  it.skip("loaded relations cannot be mutated by merge!", () => {});
  it.skip("#where with empty set", () => {});
});

describe("Relation (extended)", () => {
  let adapter: DatabaseAdapter;

  class Widget extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("color", "string");
      this.attribute("weight", "integer");
      this.attribute("active", "boolean", { default: true });
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Widget.adapter = adapter;
    await Widget.create({ name: "A", color: "red", weight: 10, active: true });
    await Widget.create({ name: "B", color: "blue", weight: 20, active: true });
    await Widget.create({ name: "C", color: "red", weight: 30, active: false });
    await Widget.create({ name: "D", color: "green", weight: 10, active: true });
  });

  // -- select --
  it("select returns records with projected columns in SQL", () => {
    const sql = Widget.all().select("name", "color").toSql();
    expect(sql).toContain('"name"');
    expect(sql).toContain('"color"');
    expect(sql).not.toContain("*");
  });

  // -- distinct --
  it("distinct generates DISTINCT SQL", () => {
    const sql = Widget.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  // -- group --
  it("group generates GROUP BY SQL", () => {
    const sql = Widget.all().group("color").toSql();
    expect(sql).toContain("GROUP BY");
  });

  // -- reorder replaces existing order --
  it("reorder replaces existing order", async () => {
    const items = await Widget.all()
      .order({ name: "asc" })
      .reorder({ name: "desc" })
      .toArray();
    expect(items[0].readAttribute("name")).toBe("D");
  });

  // -- reverseOrder --
  it("reverseOrder reverses asc to desc", async () => {
    const items = await Widget.all()
      .order({ weight: "asc" })
      .reverseOrder()
      .toArray();
    expect(items[0].readAttribute("weight")).toBe(30);
  });

  // -- last with no order defaults to PK desc --
  it("last returns the last record by PK", async () => {
    const item = await Widget.all().last();
    expect(item).not.toBeNull();
    expect(item!.readAttribute("name")).toBe("D");
  });

  // -- last with explicit order reverses it --
  it("last with order reverses the order", async () => {
    const item = await Widget.all()
      .order({ name: "asc" })
      .last();
    expect(item).not.toBeNull();
    expect(item!.readAttribute("name")).toBe("D");
  });

  // -- firstBang and lastBang --
  it("firstBang returns first or throws", async () => {
    const item = await Widget.all().firstBang();
    expect(item.readAttribute("name")).toBe("A");
  });

  it("firstBang throws when empty", async () => {
    await expect(
      Widget.all().where({ color: "purple" }).firstBang()
    ).rejects.toThrow("not found");
  });

  it("lastBang returns last or throws", async () => {
    const item = await Widget.all().lastBang();
    expect(item.readAttribute("name")).toBe("D");
  });

  it("lastBang throws when empty", async () => {
    await expect(
      Widget.all().where({ color: "purple" }).lastBang()
    ).rejects.toThrow("not found");
  });

  // -- whereNot --
  it("whereNot excludes matching records", async () => {
    const items = await Widget.all().whereNot({ color: "red" }).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i: any) => i.readAttribute("color") !== "red")).toBe(true);
  });

  it("whereNot with null uses IS NOT NULL", async () => {
    const sql = Widget.all().whereNot({ color: null }).toSql();
    expect(sql).toContain("IS NOT NULL");
  });

  // -- where with array (IN) --
  it("where with array generates IN", async () => {
    const items = await Widget.all()
      .where({ color: ["red", "blue"] })
      .toArray();
    expect(items).toHaveLength(3);
  });

  // -- where with null --
  it("where with null generates IS NULL", async () => {
    const sql = Widget.all().where({ color: null }).toSql();
    expect(sql).toContain("IS NULL");
  });

  // -- multi-column pluck --
  it("pluck with multiple columns returns arrays", async () => {
    const result = await Widget.all()
      .order({ name: "asc" })
      .pluck("name", "color");
    expect(result).toEqual([
      ["A", "red"],
      ["B", "blue"],
      ["C", "red"],
      ["D", "green"],
    ]);
  });

  // -- destroyAll --
  it("destroyAll destroys all matching records", async () => {
    const destroyed = await Widget.all()
      .where({ color: "red" })
      .destroyAll();
    expect(destroyed).toHaveLength(2);
    expect(destroyed[0].isDestroyed()).toBe(true);
  });

  // -- updateAll returns count --
  it("updateAll returns the number of affected rows", async () => {
    const count = await Widget.all()
      .where({ color: "red" })
      .updateAll({ weight: 99 });
    expect(count).toBe(2);
  });

  // -- deleteAll returns count --
  it("deleteAll returns the number of deleted rows", async () => {
    const count = await Widget.all()
      .where({ color: "red" })
      .deleteAll();
    expect(count).toBe(2);
    const remaining = await Widget.all().toArray();
    expect(remaining).toHaveLength(2);
  });

  // -- none returns empty for all terminal methods --
  it("none().first() returns null", async () => {
    expect(await Widget.all().none().first()).toBeNull();
  });

  it("none().last() returns null", async () => {
    expect(await Widget.all().none().last()).toBeNull();
  });

  it("none().exists() returns false", async () => {
    expect(await Widget.all().none().exists()).toBe(false);
  });

  it("none().pluck() returns empty array", async () => {
    expect(await Widget.all().none().pluck("name")).toEqual([]);
  });

  it("none().updateAll() returns 0", async () => {
    expect(await Widget.all().none().updateAll({ weight: 0 })).toBe(0);
  });

  it("none().deleteAll() returns 0", async () => {
    expect(await Widget.all().none().deleteAll()).toBe(0);
  });

  // -- immutability --
  it("where returns a new relation", async () => {
    const all = Widget.all();
    const filtered = all.where({ color: "red" });
    expect(await all.count()).toBe(4);
    expect(await filtered.count()).toBe(2);
  });

  it("order returns a new relation", async () => {
    const all = Widget.all();
    const ordered = all.order({ name: "desc" });
    const allFirst = await all.first();
    const orderedFirst = await ordered.first();
    // ordering shouldn't change the unordered relation
    expect(allFirst!.readAttribute("name")).toBe("A");
    expect(orderedFirst!.readAttribute("name")).toBe("D");
  });
});

describe("Relation#having", () => {
  it("generates SQL with HAVING clause", () => {
    class Order extends Base {
      static {
        this.attribute("customer_id", "integer");
        this.attribute("amount", "integer");
      }
    }

    const sql = Order.all()
      .select("customer_id")
      .group("customer_id")
      .having("COUNT(*) > 1")
      .toSql();

    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
    expect(sql).toContain("COUNT(*) > 1");
  });
});

describe("Relation edge cases", () => {
  it("where with multiple keys including null", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", email: "a@b.com" });
    await User.create({ name: "Bob" }); // email null

    const result = await User.where({ name: "Bob", email: null }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });

  it("whereNot with array generates NOT IN", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const result = await User.all().whereNot({ name: ["Alice", "Charlie"] }).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });

  it("chaining multiple whereNot calls", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 35 });

    const result = await User.all()
      .whereNot({ name: "Alice" })
      .whereNot({ name: "Charlie" })
      .toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });

  it("limit overrides previous limit", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });

    const result = await User.all().limit(10).limit(2).toArray();
    expect(result).toHaveLength(2);
  });

  it("offset without limit returns remaining records", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });

    const result = await User.all().offset(3).toArray();
    expect(result).toHaveLength(2);
  });

  it("select restricts returned attributes", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("email", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", email: "a@b.com" });

    const result = await User.all().select("name").toArray();
    expect(result[0].readAttribute("name")).toBe("Alice");
    // email should not be in the selected columns
    expect(result[0].readAttribute("email")).toBeNull();
  });

  it("pluck with multiple columns returns arrays", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });

    const result = await User.all().pluck("name", "age");
    expect(result).toEqual([
      ["Alice", 25],
      ["Bob", 30],
    ]);
  });

  it("ids returns primary key values", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const ids = await User.all().ids();
    expect(ids).toEqual([1, 2, 3]);
  });

  it("ids with where returns filtered IDs", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const ids = await User.where({ name: "Bob" }).ids();
    expect(ids).toEqual([2]);
  });

  it("none chained with where still returns empty", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice" });
    // once none() is applied, additional conditions are irrelevant
    const result = await User.all().none().where({ name: "Alice" }).toArray();
    expect(result).toEqual([]);
  });

  it("first on unordered relation returns first by PK", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Bob" });
    await User.create({ name: "Alice" });

    const first = await User.all().first();
    expect((first as any)!.readAttribute("name")).toBe("Bob"); // ID 1
  });

  it("last on unordered relation returns last by PK", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Bob" });
    await User.create({ name: "Alice" });

    const last = await User.all().last();
    expect((last as any)!.readAttribute("name")).toBe("Alice"); // ID 2
  });

  it("count on empty table returns 0", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(await User.all().count()).toBe(0);
  });

  it("pluck on empty table returns empty array", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    expect(await User.all().pluck("name")).toEqual([]);
  });

  it("reverseOrder with multiple columns flips all", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Alice", age: 30 });
    await User.create({ name: "Bob", age: 20 });

    const sql = User.all()
      .order({ name: "asc" }, { age: "asc" })
      .reverseOrder()
      .toSql();
    expect(sql).toContain("DESC");
    expect(sql).not.toContain("ASC");
  });

  it("reorder then additional order", async () => {
    const adapter = freshAdapter();

    class User extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }

    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Alice", age: 25 });

    const result = await User.all()
      .order({ age: "desc" })
      .reorder("name")
      .toArray();
    expect(result[0].readAttribute("name")).toBe("Alice");
  });
});

describe("Relation: pick, first(n), last(n)", () => {
  it("pick returns first row's columns", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice", age: 25 });
    await User.create({ name: "Bob", age: 30 });
    const result = await User.all().order("name").pick("name");
    expect(result).toBe("Alice");
  });

  it("pick returns null when no records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    expect(await User.all().pick("name")).toBe(null);
  });

  it("first(n) returns array of n records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "A" });
    await User.create({ name: "B" });
    await User.create({ name: "C" });
    const result = await User.all().first(2) as Base[];
    expect(result).toHaveLength(2);
  });

  it("first(n) returns empty array for none", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const result = await User.all().none().first(2);
    expect(result).toEqual([]);
  });

  it("last(n) returns array of last n records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "A" });
    await User.create({ name: "B" });
    await User.create({ name: "C" });
    const result = await User.all().last(2) as Base[];
    expect(result).toHaveLength(2);
  });

  it("last(n) returns empty array for none", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const result = await User.all().none().last(2);
    expect(result).toEqual([]);
  });
});

describe("Relation: explain()", () => {
  it("returns explain output", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const result = await User.all().explain();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Relation: set operations", () => {
  it("union combines two relations", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("age", "integer"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice", age: 20 });
    await User.create({ name: "Bob", age: 30 });
    await User.create({ name: "Charlie", age: 25 });

    const young = User.where({ age: 20 });
    const old = User.where({ age: 30 });
    const result = await young.union(old).toArray();
    expect(result).toHaveLength(2);
  });

  it("unionAll includes duplicates", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice" });
    const all1 = User.all();
    const all2 = User.all();
    const result = await all1.unionAll(all2).toArray();
    expect(result).toHaveLength(2);
  });

  it("intersect finds common records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });

    const result = await User.all().intersect(User.where({ active: true })).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Alice");
  });

  it("except removes common records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.attribute("active", "boolean"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice", active: true });
    await User.create({ name: "Bob", active: false });

    const result = await User.all().except(User.where({ active: true })).toArray();
    expect(result).toHaveLength(1);
    expect(result[0].readAttribute("name")).toBe("Bob");
  });

  it("toSql generates UNION SQL", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.where({ name: "A" }).union(User.where({ name: "B" })).toSql();
    expect(sql).toContain("UNION");
  });
});

describe("Relation: lock()", () => {
  it("toSql includes FOR UPDATE", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().lock().toSql();
    expect(sql).toContain("FOR UPDATE");
  });

  it("toSql includes custom lock clause", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().lock("FOR SHARE").toSql();
    expect(sql).toContain("FOR SHARE");
  });

  it("lock(false) removes lock", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().lock().lock(false).toSql();
    expect(sql).not.toContain("FOR UPDATE");
  });

  it("MemoryAdapter tolerates FOR UPDATE in queries", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "Alice" });
    const result = await User.all().lock().toArray();
    expect(result).toHaveLength(1);
  });
});

describe("Relation: joins and leftJoins", () => {
  it("joins generates INNER JOIN SQL", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().joins("posts", '"users"."id" = "posts"."user_id"').toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain('"posts"');
  });

  it("leftJoins generates LEFT OUTER JOIN SQL", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().leftJoins("posts", '"users"."id" = "posts"."user_id"').toSql();
    expect(sql).toContain("LEFT OUTER JOIN");
  });

  it("raw joins with single string", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    const sql = User.all().joins('INNER JOIN "posts" ON "posts"."user_id" = "users"."id"').toSql();
    expect(sql).toContain("INNER JOIN");
  });
});

describe("createWith()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("applies default attrs when creating via findOrCreateBy", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.attribute("status", "string");
    Item.adapter = adapter;

    const item = await Item.all().createWith({ status: "active" }).findOrCreateBy({ name: "Widget" });
    expect(item.readAttribute("status")).toBe("active");
  });
});

describe("extending()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("adds custom methods to a relation", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "Widget" });
    await Item.create({ name: "Gadget" });

    const mod = {
      onlyWidgets() { return (this as any).where({ name: "Widget" }); }
    };

    const items = await Item.all().extending(mod).onlyWidgets().toArray();
    expect(items).toHaveLength(1);
    expect(items[0].readAttribute("name")).toBe("Widget");
  });
});

describe("Relation state: isLoaded, reset, size, isEmpty, isAny, isMany", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("isLoaded returns false before loading", () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.adapter = adapter;

    const rel = Item.all();
    expect(rel.isLoaded).toBe(false);
  });

  it("isLoaded returns true after toArray()", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    const rel = Item.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
  });

  it("reset clears loaded state", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    const rel = Item.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
    rel.reset();
    expect(rel.isLoaded).toBe(false);
  });

  it("size returns count without loading", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    const rel = Item.all();
    expect(await rel.size()).toBe(2);
  });

  it("isEmpty returns true when no records", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.adapter = adapter;

    expect(await Item.all().isEmpty()).toBe(true);
  });

  it("isAny returns true when records exist", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    expect(await Item.all().isAny()).toBe(true);
  });

  it("isMany returns true when more than one record", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    expect(await Item.all().isMany()).toBe(false);
    await Item.create({ name: "B" });
    expect(await Item.all().isMany()).toBe(true);
  });
});

describe("inspect()", () => {
  it("returns a human-readable string", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = freshAdapter();

    const item = await Item.create({ name: "Widget" });
    const str = item.inspect();
    expect(str).toContain("#<Item");
    expect(str).toContain('name: "Widget"');
    expect(str).toContain("id:");
  });
});

describe("load()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("eagerly loads records and returns the relation", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    await Item.create({ name: "B" });

    const rel = Item.all();
    expect(rel.isLoaded).toBe(false);

    const result = await rel.load();
    expect(result).toBe(rel); // Returns itself
    expect(rel.isLoaded).toBe(true);
  });
});

describe("length()", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("returns the number of records after loading", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.adapter = adapter;

    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "C" });

    expect(await Item.all().length()).toBe(3);
  });
});

describe("slice()", () => {
  it("returns a subset of attributes", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.attribute("status", "string");
    Item.adapter = freshAdapter();

    const item = await Item.create({ name: "Widget", status: "active" });
    const sliced = item.slice("name", "status");
    expect(sliced).toEqual({ name: "Widget", status: "active" });
    expect(sliced).not.toHaveProperty("id");
  });
});

describe("valuesAt()", () => {
  it("returns attribute values as an array", async () => {
    class Item extends Base { static _tableName = "items"; }
    Item.attribute("id", "integer");
    Item.attribute("name", "string");
    Item.attribute("status", "string");
    Item.adapter = freshAdapter();

    const item = await Item.create({ name: "Widget", status: "active" });
    const values = item.valuesAt("name", "status");
    expect(values).toEqual(["Widget", "active"]);
  });
});

describe("lockBang", () => {
  it("reloads the record with a lock clause", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    const user = await User.create({ name: "Alice" });
    // Update via raw SQL to simulate another process changing the data
    await adapter.executeMutation(`UPDATE "users" SET "name" = 'Updated' WHERE "id" = ${user.id}`);

    await user.lockBang();
    expect(user.readAttribute("name")).toBe("Updated");
  });
});

describe("reject()", () => {
  it("filters out matching records from loaded results", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    await User.create({ name: "Charlie" });

    const results = await User.all().reject((u: any) => u.readAttribute("name") === "Bob");
    expect(results.length).toBe(2);
    expect(results.map((u: any) => u.readAttribute("name")).sort()).toEqual(["Alice", "Charlie"]);
  });
});

describe("compactBlank()", () => {
  it("filters out records where column is null", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.attribute("email", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice", email: "alice@test.com" });
    await User.create({ name: "Bob" }); // email is null

    const results = await User.all().compactBlank("email").toArray();
    expect(results.length).toBe(1);
    expect(results[0].readAttribute("name")).toBe("Alice");
  });
});

describe("isOne()", () => {
  it("returns true when exactly one record matches", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    expect(await User.all().isOne()).toBe(true);
    await User.create({ name: "Bob" });
    expect(await User.all().isOne()).toBe(false);
  });
});

describe("Relation reload and records", () => {
  it("reload() re-queries the database", async () => {
    const adapter = freshAdapter();
    class User extends Base { static _tableName = "users"; }
    User.attribute("id", "integer");
    User.attribute("name", "string");
    User.adapter = adapter;

    await User.create({ name: "Alice" });
    const rel = User.all();
    const first = await rel.toArray();
    expect(first.length).toBe(1);

    // Add another record
    await User.create({ name: "Bob" });
    // Without reload, the cached result is stale
    await rel.reload();
    const second = await rel.records();
    expect(second.length).toBe(2);
  });
});

describe("Relation.isReadonly", () => {
  it("returns false by default", () => {
    class User extends Base {
      static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
    }
    expect(User.all().isReadonly).toBe(false);
  });

  it("returns true after .readonly()", () => {
    class User extends Base {
      static { this.attribute("id", "integer"); this.adapter = freshAdapter(); }
    }
    expect(User.all().readonly().isReadonly).toBe(true);
  });
});

describe("Relation#extending with function", () => {
  it("accepts a function that modifies the relation", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ name: "Alice" }).extending((r: any) => {
      r.customMethod = () => "hello";
    });
    expect((rel as any).customMethod()).toBe("hello");
  });
});

describe("Relation#loadAsync", () => {
  it("returns the relation for chaining", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ name: "Alice" }).loadAsync();
    expect(rel).toBeDefined();
  });
});

describe("Relation#invertWhere", () => {
  it.skip("swaps where and whereNot clauses", async () => {
    const adapter = freshAdapter();
    class InvertWhereUser extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
    }
    const alice = await InvertWhereUser.create({ name: "Alice", role: "admin" });
    const bob = await InvertWhereUser.create({ name: "Bob", role: "user" });
    const charlie = await InvertWhereUser.create({ name: "Charlie", role: "admin" });

    // where({ role: "admin" }) returns Alice, Charlie
    const admins = await InvertWhereUser.where({ role: "admin" }).toArray();
    expect(admins.length).toBe(2);

    // invertWhere() should return Bob (non-admins)
    const nonAdmins = await InvertWhereUser.where({ role: "admin" }).invertWhere().toArray();
    expect(nonAdmins.length).toBe(1);
    expect(nonAdmins[0].readAttribute("name")).toBe("Bob");
  });
});

describe("Relation#inspect", () => {
  it("returns a readable string representation", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ name: "Alice" }).order("name").limit(10);
    const str = rel.inspect();
    expect(str).toContain("User");
    expect(str).toContain("where");
    expect(str).toContain("Alice");
    expect(str).toContain("limit(10)");
  });

  it("shows distinct and group info", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("role", "string"); this.adapter = adapter; }
    }
    const str = User.where({ role: "admin" }).distinct().inspect();
    expect(str).toContain("distinct");
    expect(str).toContain("admin");
  });
});

describe("Relation spawn/build/create", () => {
  it("spawn returns an independent copy of the relation", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ role: "admin" });
    const spawned = rel.spawn();
    expect(spawned).not.toBe(rel);
    expect(spawned.toSql()).toBe(rel.toSql());
  });

  it("build creates an unsaved record with scoped attributes", () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ role: "admin" });
    const u = rel.build({ name: "Alice" });
    expect(u).toBeInstanceOf(User);
    expect(u.readAttribute("role")).toBe("admin");
    expect(u.readAttribute("name")).toBe("Alice");
    expect(u.isPersisted()).toBe(false);
  });

  it("create persists a record with scoped attributes", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static { this.attribute("id", "integer"); this.attribute("name", "string"); this.attribute("role", "string"); this.adapter = adapter; }
    }
    const rel = User.where({ role: "admin" });
    const u = await rel.create({ name: "Bob" });
    expect(u.isPersisted()).toBe(true);
    expect(u.readAttribute("role")).toBe("admin");
    expect(u.readAttribute("name")).toBe("Bob");
  });

  it("createBang raises on validation failure", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
        this.validates("name", { presence: true });
      }
    }
    const rel = User.where({ role: "admin" });
    await expect(rel.createBang({})).rejects.toThrow();
  });
});

describe("Relation value accessors", () => {
  it("limitValue returns the limit", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const rel = User.where({ name: "Alice" }).limit(10);
    expect(rel.limitValue).toBe(10);
  });

  it("offsetValue returns the offset", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const rel = User.where({}).offset(5);
    expect(rel.offsetValue).toBe(5);
  });

  it("selectValues returns selected columns", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const rel = User.where({}).select("name", "id");
    expect(rel.selectValues).toEqual(["name", "id"]);
  });

  it("orderValues returns order clauses", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const rel = User.where({}).order("name", { id: "desc" });
    expect(rel.orderValues).toEqual(["name", ["id", "desc"]]);
  });

  it("groupValues returns group columns", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("role", "string");
      }
    }
    const rel = User.where({}).group("role");
    expect(rel.groupValues).toEqual(["role"]);
  });

  it("distinctValue returns the distinct flag", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    expect(User.where({}).distinctValue).toBe(false);
    expect(User.where({}).distinct().distinctValue).toBe(true);
  });

  it("whereValues returns where clause hashes", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const rel = User.where({ name: "Alice" });
    expect(rel.whereValues).toEqual([{ name: "Alice" }]);
  });
});

describe("Relation collection convenience methods", () => {
  it("groupByColumn groups records by column value", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("role", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice", role: "admin" });
    await User.create({ name: "Bob", role: "user" });
    await User.create({ name: "Carol", role: "admin" });
    const groups = await User.where({}).groupByColumn("role");
    expect(groups["admin"].length).toBe(2);
    expect(groups["user"].length).toBe(1);
  });

  it("groupByColumn accepts a function", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Adam" });
    await User.create({ name: "Bob" });
    const groups = await User.where({}).groupByColumn(
      (u: any) => String(u.readAttribute("name")).charAt(0)
    );
    expect(groups["A"].length).toBe(2);
    expect(groups["B"].length).toBe(1);
  });

  it("indexBy indexes records by column value", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const indexed = await User.where({}).indexBy("name");
    expect(indexed["Alice"].readAttribute("name")).toBe("Alice");
    expect(indexed["Bob"].readAttribute("name")).toBe("Bob");
  });

  it("indexBy accepts a function", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const indexed = await User.where({}).indexBy(
      (u: any) => String(u.readAttribute("name")).toLowerCase()
    );
    expect(indexed["alice"]).toBeDefined();
    expect(indexed["bob"]).toBeDefined();
  });
});

describe("async query aliases (Rails 7.0+)", () => {
  it("asyncCount returns the same as count", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const count = await User.where({}).asyncCount();
    expect(count).toBe(2);
  });

  it("asyncSum returns the same as sum", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    await User.create({ age: 20 });
    await User.create({ age: 30 });
    const total = await User.where({}).asyncSum("age");
    expect(total).toBe(50);
  });

  it("asyncMinimum returns the same as minimum", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    await User.create({ age: 20 });
    await User.create({ age: 30 });
    const min = await User.where({}).asyncMinimum("age");
    expect(min).toBe(20);
  });

  it("asyncMaximum returns the same as maximum", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("age", "integer");
        this.adapter = adapter;
      }
    }
    await User.create({ age: 20 });
    await User.create({ age: 30 });
    const max = await User.where({}).asyncMaximum("age");
    expect(max).toBe(30);
  });

  it("asyncPluck returns the same as pluck", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const names = await User.where({}).asyncPluck("name");
    expect(names).toEqual(["Alice", "Bob"]);
  });
});

describe("Relation#size and Relation#length", () => {
  it("size returns count without loading records", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });
    const rel = User.where({});
    expect(await rel.size()).toBe(2);
  });

  it("length forces loading and returns count", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    expect(await User.where({}).length()).toBe(1);
  });
});

describe("Relation#toArel", () => {
  it("returns a SelectManager", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const manager = User.where({ name: "Alice" }).toArel();
    expect(typeof manager.toSql).toBe("function");
    const sql = manager.toSql();
    expect(sql).toContain("users");
    expect(sql).toContain("Alice");
  });

  it("respects limit and offset", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    const manager = User.where({}).limit(5).offset(10).toArel();
    const sql = manager.toSql();
    expect(sql).toContain("LIMIT 5");
    expect(sql).toContain("OFFSET 10");
  });
});

describe("Relation#presence", () => {
  it("returns self when records exist", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });

    const rel = User.where({ name: "Alice" });
    const result = await rel.presence();
    expect(result).not.toBeNull();
  });

  it("returns null when no records exist", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }

    const rel = User.where({ name: "Nobody" });
    const result = await rel.presence();
    expect(result).toBeNull();
  });
});

describe("Relation async iterator", () => {
  it("supports for-await-of", async () => {
    const adapter = freshAdapter();
    class User extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    await User.create({ name: "Alice" });
    await User.create({ name: "Bob" });

    const names: string[] = [];
    for await (const user of User.where({})) {
      names.push(user.readAttribute("name") as string);
    }
    expect(names.sort()).toEqual(["Alice", "Bob"]);
  });
});

describe("Relation State (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("isLoaded is false before loading", () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    expect(Item.all().isLoaded).toBe(false);
  });

  it("isLoaded is true after toArray", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    const rel = Item.all();
    await rel.toArray();
    expect(rel.isLoaded).toBe(true);
  });

  it("reset clears loaded state", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    const rel = Item.all();
    await rel.toArray();
    rel.reset();
    expect(rel.isLoaded).toBe(false);
  });

  it("size returns record count", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    expect(await Item.all().size()).toBe(2);
  });

  it("isEmpty returns true on empty table", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    expect(await Item.all().isEmpty()).toBe(true);
  });

  it("isEmpty returns false with records", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    expect(await Item.all().isEmpty()).toBe(false);
  });

  it("isAny returns true when records exist", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    expect(await Item.all().isAny()).toBe(true);
  });

  it("isMany returns false with single record", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    expect(await Item.all().isMany()).toBe(false);
  });

  it("isMany returns true with multiple records", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    expect(await Item.all().isMany()).toBe(true);
  });

  it("length returns count after loading", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    await Item.create({ name: "B" });
    await Item.create({ name: "C" });
    expect(await Item.all().length()).toBe(3);
  });

  it("load eagerly loads and returns relation", async () => {
    class Item extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await Item.create({ name: "A" });
    const rel = Item.all();
    const result = await rel.load();
    expect(result).toBe(rel);
    expect(rel.isLoaded).toBe(true);
  });
});

describe("Lock (Rails-guided)", () => {
  it("lock generates FOR UPDATE SQL", () => {
    class User extends Base { static { this.attribute("name", "string"); } }
    const sql = User.all().lock().toSql();
    expect(sql).toContain("FOR UPDATE");
  });

  it("lock with custom clause", () => {
    class User extends Base { static { this.attribute("name", "string"); } }
    const sql = User.all().lock("FOR SHARE").toSql();
    expect(sql).toContain("FOR SHARE");
  });
});

describe("Relation immutability (Rails-guided)", () => {
  let adapter: DatabaseAdapter;
  beforeEach(() => { adapter = freshAdapter(); });

  it("where returns a new relation", async () => {
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "A" });
    await User.create({ name: "B" });

    const all = User.all();
    const filtered = all.where({ name: "A" });
    expect(await all.count()).toBe(2);
    expect(await filtered.count()).toBe(1);
  });

  it("order returns a new relation", async () => {
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    await User.create({ name: "Bob" });
    await User.create({ name: "Alice" });

    const all = User.all();
    const ordered = all.order({ name: "desc" });
    const allFirst = await all.first();
    const orderedFirst = await ordered.first();
    expect(allFirst!.readAttribute("name")).toBe("Bob");
    expect(orderedFirst!.readAttribute("name")).toBe("Bob");
  });

  it("limit returns a new relation", async () => {
    class User extends Base {
      static { this.attribute("name", "string"); this.adapter = adapter; }
    }
    for (let i = 0; i < 5; i++) await User.create({ name: `U${i}` });
    const all = User.all();
    const limited = all.limit(2);
    expect(await all.count()).toBe(5);
    // limit restricts toArray() but count() returns the total
    const limitedRecords = await limited.toArray();
    expect(limitedRecords).toHaveLength(2);
  });
});


describe("Relation (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Product extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("price", "integer");
      this.attribute("category", "string");
      this.attribute("active", "boolean");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    Product.adapter = adapter;
    await Product.create({
      name: "Apple",
      price: 1,
      category: "fruit",
      active: true,
    });
    await Product.create({
      name: "Banana",
      price: 2,
      category: "fruit",
      active: true,
    });
    await Product.create({
      name: "Carrot",
      price: 3,
      category: "vegetable",
      active: true,
    });
    await Product.create({
      name: "Expired",
      price: 1,
      category: "fruit",
      active: false,
    });
  });

  // -- where edge cases --

  it("where with null produces IS NULL", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("category", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "Orphan", category: null });
    await Item.create({ name: "Categorized", category: "fruit" });

    const items = await Item.where({ category: null }).toArray();
    expect(items).toHaveLength(1);
    expect(items[0].readAttribute("name")).toBe("Orphan");
  });

  it("where with array produces IN", async () => {
    const items = await Product.where({
      category: ["fruit", "vegetable"],
    }).toArray();
    expect(items).toHaveLength(4);
  });

  it("where with empty array produces no results", async () => {
    // An IN with empty set should match nothing
    const items = await Product.where({ category: [] }).toArray();
    expect(items).toHaveLength(0);
  });

  // -- whereNot --

  it("whereNot excludes matching records", async () => {
    const items = await Product.all()
      .whereNot({ category: "fruit" })
      .toArray();
    expect(items).toHaveLength(1);
    expect(items[0].readAttribute("name")).toBe("Carrot");
  });

  it("whereNot with null produces IS NOT NULL", async () => {
    class Item extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("category", "string");
        this.adapter = adapter;
      }
    }
    await Item.create({ name: "Orphan", category: null });
    await Item.create({ name: "Categorized", category: "fruit" });

    const items = await Item.all().whereNot({ category: null }).toArray();
    expect(items).toHaveLength(1);
    expect(items[0].readAttribute("name")).toBe("Categorized");
  });

  // -- select --

  it("select limits returned columns", async () => {
    const sql = Product.all().select("name", "price").toSql();
    expect(sql).toContain('"name"');
    expect(sql).toContain('"price"');
    expect(sql).not.toContain("*");
  });

  // -- distinct --

  it("distinct removes duplicate results", () => {
    const sql = Product.all().distinct().toSql();
    expect(sql).toContain("DISTINCT");
  });

  // -- group --

  it("group generates GROUP BY clause", () => {
    const sql = Product.all().group("category").toSql();
    expect(sql).toContain("GROUP BY");
  });

  // -- reorder --

  it("reorder replaces existing order", () => {
    const rel = Product.all().order("name").reorder({ price: "desc" });
    const sql = rel.toSql();
    // Should have price DESC, not name ASC
    expect(sql).toContain('"price" DESC');
    expect(sql).not.toContain('"name" ASC');
  });

  // -- reverseOrder --

  it("reverseOrder flips ASC to DESC", () => {
    const rel = Product.all().order("name").reverseOrder();
    const sql = rel.toSql();
    expect(sql).toContain('"name" DESC');
  });

  it("reverseOrder flips DESC to ASC", () => {
    const rel = Product.all().order({ price: "desc" }).reverseOrder();
    const sql = rel.toSql();
    expect(sql).toContain('"price" ASC');
  });

  // -- first / last --

  it("first returns null on empty result", async () => {
    const result = await Product.where({ category: "meat" }).first();
    expect(result).toBeNull();
  });

  it("firstBang throws on empty result", async () => {
    await expect(
      Product.where({ category: "meat" }).firstBang()
    ).rejects.toThrow("not found");
  });

  it("last returns the last record by primary key", async () => {
    const product = await Product.all().last();
    expect(product).not.toBeNull();
    expect(product!.readAttribute("name")).toBe("Expired");
  });

  it("last with ordering returns the last in that order", async () => {
    const product = await Product.all().order({ price: "asc" }).last();
    // Price desc (reversed), so highest price = Carrot (3)
    expect(product).not.toBeNull();
    expect(product!.readAttribute("name")).toBe("Carrot");
  });

  it("last returns null on empty result", async () => {
    const result = await Product.where({ category: "meat" }).last();
    expect(result).toBeNull();
  });

  it("lastBang throws on empty result", async () => {
    await expect(
      Product.where({ category: "meat" }).lastBang()
    ).rejects.toThrow("not found");
  });

  // -- pluck --

  it("pluck with multiple columns returns array of arrays", async () => {
    const result = await Product.all()
      .order("name")
      .pluck("name", "price");
    expect(result).toEqual([
      ["Apple", 1],
      ["Banana", 2],
      ["Carrot", 3],
      ["Expired", 1],
    ]);
  });

  // -- count / exists on none --

  it("count on none returns 0", async () => {
    expect(await Product.all().none().count()).toBe(0);
  });

  it("exists on none returns false", async () => {
    expect(await Product.all().none().exists()).toBe(false);
  });

  it("first on none returns null", async () => {
    expect(await Product.all().none().first()).toBeNull();
  });

  it("last on none returns null", async () => {
    expect(await Product.all().none().last()).toBeNull();
  });

  it("pluck on none returns empty array", async () => {
    expect(await Product.all().none().pluck("name")).toEqual([]);
  });

  // -- deleteAll / destroyAll --

  it("delete all", async () => {
    const count = await Product.where({ category: "fruit" }).deleteAll();
    expect(count).toBe(3);
    expect(await Product.all().count()).toBe(1);
  });

  it("destroyAll runs callbacks on each record", async () => {
    const log: string[] = [];

    class Tracked extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
        this.beforeDestroy((record: any) => {
          log.push(`destroy:${record.readAttribute("name")}`);
        });
      }
    }

    await Tracked.create({ name: "A" });
    await Tracked.create({ name: "B" });
    await Tracked.create({ name: "C" });

    const destroyed = await Tracked.all().destroyAll();
    expect(destroyed).toHaveLength(3);
    expect(log).toEqual(["destroy:A", "destroy:B", "destroy:C"]);
    // All records are marked destroyed
    for (const r of destroyed) {
      expect(r.isDestroyed()).toBe(true);
    }
  });

  it("destroyAll returns destroyed records", async () => {
    const destroyed = await Product.where({ category: "vegetable" }).destroyAll();
    expect(destroyed).toHaveLength(1);
    expect(destroyed[0].readAttribute("name")).toBe("Carrot");
  });

  // -- updateAll returns count --

  it("update all", async () => {
    const count = await Product.where({ category: "fruit" }).updateAll({
      price: 99,
    });
    expect(count).toBe(3);
  });

  // -- immutability --

  it("whereNot returns a new relation", async () => {
    const all = Product.all();
    const filtered = all.whereNot({ category: "fruit" });
    expect(await all.count()).toBe(4);
    expect(await filtered.count()).toBe(1);
  });
});

describe("Relation query edge cases (Rails-guided)", () => {
  let adapter: DatabaseAdapter;

  class Post extends Base {
    static {
      this.attribute("title", "string");
      this.attribute("body", "string");
      this.attribute("status", "string");
      this.attribute("views", "integer");
      this.attribute("created_at", "datetime");
    }
  }

  beforeEach(() => {
    adapter = freshAdapter();
    Post.adapter = adapter;
  });

  // Rails: test_where_with_nil
  it("where with null generates IS NULL", async () => {
    await Post.create({ title: "Has Body", body: "content" });
    await Post.create({ title: "No Body", body: null });

    const results = await Post.where({ body: null }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("No Body");
  });

  // Rails: test_where_not
  it("whereNot excludes matching records", async () => {
    await Post.create({ title: "Draft", status: "draft" });
    await Post.create({ title: "Published", status: "published" });

    const results = await Post.all().whereNot({ status: "draft" }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("Published");
  });

  // Rails: test_where_not_with_nil
  it("whereNot with null generates IS NOT NULL", async () => {
    await Post.create({ title: "Has Body", body: "content" });
    await Post.create({ title: "No Body", body: null });

    const results = await Post.all().whereNot({ body: null }).toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("Has Body");
  });

  // Rails: test_where_not_in
  it("whereNot with array generates NOT IN", async () => {
    await Post.create({ title: "Draft", status: "draft" });
    await Post.create({ title: "Published", status: "published" });
    await Post.create({ title: "Archived", status: "archived" });

    const results = await Post.all()
      .whereNot({ status: ["draft", "archived"] })
      .toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("Published");
  });

  // Rails: test_chaining_where
  it("multiple where calls narrow results", async () => {
    await Post.create({ title: "A", status: "published", views: 100 });
    await Post.create({ title: "B", status: "published", views: 50 });
    await Post.create({ title: "C", status: "draft", views: 100 });

    const results = await Post.where({ status: "published" })
      .where({ views: 100 })
      .toArray();
    expect(results).toHaveLength(1);
    expect(results[0].readAttribute("title")).toBe("A");
  });

  // Rails: test_limit_and_offset
  it("limit with offset for pagination", async () => {
    for (let i = 1; i <= 5; i++) {
      await Post.create({ title: `Post ${i}`, views: i });
    }

    const page2 = await Post.all()
      .order("views")
      .limit(2)
      .offset(2)
      .toArray();
    expect(page2).toHaveLength(2);
    expect(page2[0].readAttribute("title")).toBe("Post 3");
    expect(page2[1].readAttribute("title")).toBe("Post 4");
  });

  // Rails: test_order_asc_desc
  it("order with explicit asc/desc", async () => {
    await Post.create({ title: "A", views: 3 });
    await Post.create({ title: "B", views: 1 });
    await Post.create({ title: "C", views: 2 });

    const desc = await Post.all().order({ views: "desc" }).pluck("title");
    expect(desc).toEqual(["A", "C", "B"]);
  });

  // Rails: test_reverse_order
  it("reverseOrder flips the order", async () => {
    await Post.create({ title: "A", views: 1 });
    await Post.create({ title: "B", views: 2 });
    await Post.create({ title: "C", views: 3 });

    const result = await Post.all()
      .order({ views: "asc" })
      .reverseOrder()
      .pluck("title");
    expect(result).toEqual(["C", "B", "A"]);
  });

  // Rails: test_reorder
  it("reorder replaces previous order", async () => {
    await Post.create({ title: "A", views: 1 });
    await Post.create({ title: "B", views: 3 });
    await Post.create({ title: "C", views: 2 });

    const result = await Post.all()
      .order("title")
      .reorder("views")
      .pluck("title");
    expect(result).toEqual(["A", "C", "B"]);
  });

  // Rails: test_select_with_specific_columns
  it("select restricts columns", async () => {
    await Post.create({ title: "Hello", body: "world", views: 5 });

    const results = await Post.all().select("title", "views").toArray();
    expect(results[0].readAttribute("title")).toBe("Hello");
    expect(results[0].readAttribute("views")).toBe(5);
  });

  // Rails: test_distinct
  it("distinct generates DISTINCT SQL", async () => {
    await Post.create({ title: "A", status: "draft" });
    await Post.create({ title: "B", status: "draft" });
    await Post.create({ title: "C", status: "published" });

    const sql = Post.all().distinct().toSql();
    expect(sql).toMatch(/SELECT DISTINCT/i);
  });

  // Rails: test_none_is_chainable
  it("none returns empty and is chainable", async () => {
    await Post.create({ title: "A" });

    const result = await Post.all().none().where({ title: "A" }).toArray();
    expect(result).toHaveLength(0);

    expect(await Post.all().none().count()).toBe(0);
    expect(await Post.all().none().exists()).toBe(false);
    expect(await Post.all().none().pluck("title")).toEqual([]);
  });

  // Rails: test_pluck_multiple_columns
  it("pluck with multiple columns returns arrays", async () => {
    await Post.create({ title: "Hello", views: 10 });
    await Post.create({ title: "World", views: 20 });

    const result = await Post.all().order("views").pluck("title", "views");
    expect(result).toEqual([
      ["Hello", 10],
      ["World", 20],
    ]);
  });

  // Rails: test_ids
  it("ids returns all primary key values", async () => {
    const a = await Post.create({ title: "A" });
    const b = await Post.create({ title: "B" });

    const ids = await Post.all().ids();
    expect(ids).toContain(a.readAttribute("id"));
    expect(ids).toContain(b.readAttribute("id"));
  });
});
