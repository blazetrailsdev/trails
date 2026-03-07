import { describe, it, expect, beforeEach } from "vitest";
import {
  Base,
  Relation,
  Range,
  MemoryAdapter,
  RecordNotFound,
  SoleRecordExceeded,
} from "./index.js";

function freshAdapter(): MemoryAdapter {
  return new MemoryAdapter();
}

// ─── Shared model setup ───

let adapter: MemoryAdapter;

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
  let adapter: MemoryAdapter;

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
