/**
 * Covers the real-table-name reuse in JoinDependency#_addThroughAssociation.
 *
 * Mirrors AliasTracker behavior (`activerecord/lib/active_record/table_metadata.rb`
 * / `alias_tracker.rb`): a joined table uses its real name when not already
 * in use, falling back to a tN alias only on collision. Previously
 * `_addThroughAssociation` hard-coded `tN` aliases for both the through
 * and target tables regardless of collisions, diverging from the
 * single-step `addAssociation` path.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import { Associations } from "../associations.js";
import { JoinDependency } from "./join-dependency.js";
import { Nodes, Table } from "@blazetrails/arel";

describe("JoinDependency#_addThroughAssociation real-table-name reuse", () => {
  class JdtAuthor extends Base {
    static {
      this.attribute("name", "string");
    }
  }
  class JdtPost extends Base {
    static {
      this.attribute("author_id", "integer");
      this.attribute("title", "string");
    }
  }
  class JdtComment extends Base {
    static {
      this.attribute("post_id", "integer");
      this.attribute("body", "string");
    }
  }

  beforeEach(() => {
    const adapter = createTestAdapter();
    for (const m of [JdtAuthor, JdtPost, JdtComment]) {
      m.adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(JdtAuthor, "jdtPosts", {
      className: "JdtPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(JdtPost, "jdtComments", {
      className: "JdtComment",
      foreignKey: "post_id",
    });
    Associations.hasMany.call(JdtAuthor, "jdtComments", {
      through: "jdtPosts",
      source: "jdtComments",
      className: "JdtComment",
    });
  });

  it("uses real table names for through+target when no collision", () => {
    const jd = new JoinDependency(JdtAuthor);
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();
    expect(node!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);
    expect(node!.effectiveSqlName).toBe("jdt_comments");

    // Target table uses real name (no alias)
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toBeNull();

    // Through node also uses real name
    const throughNode = jd.nodes.find((n) => n.tableName === "jdt_posts");
    expect(throughNode).toBeDefined();
    expect(throughNode!.arelJoin).toBeInstanceOf(Nodes.OuterJoin);
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toBeNull();
  });

  it("uses the Rails alias_candidate when the target real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    Associations.hasMany.call(JdtAuthor, "directComments", {
      className: "JdtComment",
      foreignKey: "post_id",
    });
    jd.addAssociation("directComments");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();

    // Aliasing is deferred to emit: resolve against the shared AliasTracker.
    jd.joinConstraints([]);
    // Rails names the collision `{plural_name}_{owner_table}` (root link, no _join).
    expect(node!.effectiveSqlName).toBe("jdt_comments_jdt_authors");

    // Target aliased
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toBe("jdt_comments_jdt_authors");

    // Through still uses real name
    const throughNode = jd.nodes.find(
      (n) => n.tableName === "jdt_posts" && n.assocName.includes("_through_"),
    );
    expect(throughNode).toBeDefined();
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toBeNull();
  });

  it("builds tree with through node as child of root and target as sibling", () => {
    const jd = new JoinDependency(JdtAuthor);
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();

    const root = jd.joinRoot;
    expect(root.baseKlass).toBe(JdtAuthor);
    // Through + target are both children of root (flat under root for has_many :through)
    expect(root.children.length).toBe(2);
    const throughChild = root.children[0];
    expect(throughChild.immediateAssocName).toBe("_through_jdtPosts");
    expect(throughChild.tableName).toBe("jdt_posts");
    const targetChild = root.children[1];
    expect(targetChild.immediateAssocName).toBe("jdtComments");
    expect(targetChild.tableName).toBe("jdt_comments");
  });

  it("emits canonical self-join aliases when a nested-through chain references a table multiple times", () => {
    // Mirrors the alias-emission slice of Rails
    // test_nested_has_many_through_with_a_table_referenced_multiple_times
    // (nested_through_associations_test.rb:437): Author.similar_posts walks
    // Author -> tags -> tagged_posts so the chain visits `posts` and `taggings`
    // twice. AliasTracker names the colliding self-joins
    // `{plural_name}_{owner_table}_join` (join_dependency.rb:204-206), giving
    // `posts_authors_join` / `taggings_authors_join`.
    class StjAuthor extends Base {
      static {
        this.tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class StjPost extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    class StjTagging extends Base {
      static {
        this.tableName = "taggings";
        this.attribute("tag_id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
      }
    }
    class StjTag extends Base {
      static {
        this.tableName = "tags";
        this.attribute("name", "string");
      }
    }
    const adapter = createTestAdapter();
    for (const m of [StjAuthor, StjPost, StjTagging, StjTag]) {
      m.adapter = adapter;
      (m as any)._associations = [];
      registerModel(m);
    }
    Associations.hasMany.call(StjAuthor, "posts", {
      className: "StjPost",
      foreignKey: "author_id",
    });
    Associations.hasMany.call(StjPost, "taggings", {
      className: "StjTagging",
      foreignKey: "taggable_id",
      as: "taggable",
    });
    Associations.hasMany.call(StjAuthor, "taggings", {
      className: "StjTagging",
      through: "posts",
      source: "taggings",
    });
    Associations.belongsTo.call(StjTagging, "tag", { className: "StjTag", foreignKey: "tag_id" });
    Associations.hasMany.call(StjAuthor, "tags", {
      className: "StjTag",
      through: "taggings",
      source: "tag",
    });
    Associations.hasMany.call(StjTag, "taggings", {
      className: "StjTagging",
      foreignKey: "tag_id",
    });
    Associations.belongsTo.call(StjTagging, "taggable", {
      polymorphic: true,
      foreignKey: "taggable_id",
    });
    Associations.hasMany.call(StjTag, "taggedPosts", {
      className: "StjPost",
      through: "taggings",
      source: "taggable",
      sourceType: "StjPost",
    });
    Associations.hasMany.call(StjAuthor, "similarPosts", {
      className: "StjPost",
      through: "tags",
      source: "taggedPosts",
    });

    const jd = new JoinDependency(StjAuthor);
    const node = jd.addAssociation("similarPosts");
    expect(node).not.toBeNull();

    // Aliasing is deferred to emit: resolve the whole chain against the shared
    // AliasTracker (_resolveThroughGroup).
    jd.joinConstraints([]);
    const effectiveNames = jd.nodes.map((n) => n.effectiveSqlName);
    // A twice-visited table keeps its real name on first encounter and is
    // self-join aliased only on the colliding second encounter (the emit-time
    // chain resolution claims each link in forward order), so exactly one
    // aliased + one real-named join exists for each.
    expect(effectiveNames).toContain("posts_authors_join");
    expect(effectiveNames).toContain("taggings_authors_join");
    expect(effectiveNames.filter((n) => n === "taggings").length).toBe(1);
    expect(effectiveNames.filter((n) => n === "posts").length).toBe(1);

    // The canonical alias is addressable in the emitted SQL. Match either
    // quote style (PG/SQLite double-quote, MySQL backtick) so the assertion
    // isn't tied to the test adapter's quoting.
    const sql = (StjAuthor as any).all().leftJoins("similarPosts").toSql();
    expect(sql).toMatch(/["`]taggings["`]\s+["`]taggings_authors_join["`]/);
    expect(sql).toMatch(/["`]posts["`]\s+["`]posts_authors_join["`]/);
  });

  it("aliases a referenced through-target table to the reference name when free", () => {
    // Mirrors Rails JoinDependency#make_constraints consuming `@references`
    // uniformly across every reflection in the chain (join_dependency.rb:202):
    // `Author.includes(:jdt_comments).references(:jdt_comments)` records the
    // through-target name in `@references`, and when its join is emitted
    // `aliased_table_for` uses the referenced name on first/free use
    // (`jdt_comments AS jdtComments`). The aliasing is consumed lazily in
    // `joinConstraints`/`makeConstraints`, so the through-target JoinAssociation
    // is reference-aliased identically to a direct join target — without
    // `_addThroughViaJoinAssociation` receiving `references` at build time.
    const jd = new JoinDependency(JdtAuthor);
    jd.addAssociation("jdtComments");
    const target = jd.nodes.find((n) => n.immediateAssocName === "jdtComments")!;
    expect(target.effectiveSqlName).toBe("jdt_comments");

    // Lazily consume references; the free reference name renames the target.
    jd.joinConstraints([], (jd as any)._aliasTracker, ["jdtComments"]);
    expect(target.effectiveSqlName).toBe("jdtComments");
    expect((target.arelTable as Table).name).toBe("jdt_comments");
    expect((target.arelTable as Table).tableAlias).toBe("jdtComments");

    // The intermediate `_through_` link is internal and never reference-aliased.
    const throughNode = jd.nodes.find((n) => n.assocName.includes("_through_"))!;
    expect(throughNode.effectiveSqlName).toBe("jdt_posts");
  });

  it("reuses one chain-tail alias for two distinct through associations sharing it", () => {
    // Mirrors Rails JoinDependency#make_constraints memoizing `@joined_tables`
    // (join_dependency.rb:193-200): two `through: :posts` associations both
    // carry the owner's single `posts` reflection as their chain tail, so
    // eager-loading both reuses ONE `mem_posts` join instead of minting a
    // second `mem_posts_mem_authors_join` alias.
    class MemAuthor extends Base {
      static {
        this.attribute("name", "string");
        this.hasMany("memPosts", { className: "MemPost", foreignKey: "author_id" });
        this.hasMany("memComments", {
          through: "memPosts",
          source: "memComments",
          className: "MemComment",
        });
        this.hasMany("memRatings", {
          through: "memPosts",
          source: "memRatings",
          className: "MemRating",
        });
      }
    }
    class MemPost extends Base {
      static {
        this.attribute("author_id", "integer");
        this.hasMany("memComments", { className: "MemComment", foreignKey: "post_id" });
        this.hasMany("memRatings", { className: "MemRating", foreignKey: "post_id" });
      }
    }
    class MemComment extends Base {
      static {
        this.attribute("post_id", "integer");
        this.attribute("body", "string");
      }
    }
    class MemRating extends Base {
      static {
        this.attribute("post_id", "integer");
        this.attribute("value", "integer");
      }
    }
    const adapter = createTestAdapter();
    for (const m of [MemAuthor, MemPost, MemComment, MemRating]) {
      m.adapter = adapter;
      registerModel(m);
    }

    const jd = new JoinDependency(MemAuthor);
    jd.addAssociation("memComments");
    jd.addAssociation("memRatings");
    jd.joinConstraints([]);

    const effectiveNames = jd.nodes.map((n) => n.effectiveSqlName);
    // Exactly one `mem_posts` join survives; the shared tail emits no spurious
    // `_join` alias for the second through path.
    expect(effectiveNames.filter((n) => n === "mem_posts").length).toBe(1);
    expect(effectiveNames.some((n) => n.includes("mem_posts") && n.includes("_join"))).toBe(false);

    // Both targets still join — and both key off the one shared `mem_posts`.
    expect(effectiveNames).toContain("mem_comments");
    expect(effectiveNames).toContain("mem_ratings");
  });

  it("uses the Rails alias_candidate with _join when the through real name collides", () => {
    const jd = new JoinDependency(JdtAuthor);
    jd.addAssociation("jdtPosts");
    const node = jd.addAssociation("jdtComments");
    expect(node).not.toBeNull();

    // Aliasing is deferred to emit: resolve against the shared AliasTracker.
    jd.joinConstraints([]);

    // Through table aliased because jdt_posts already used. Non-root chain
    // links get the `_join` suffix (join_dependency.rb:206).
    const throughNode = jd.nodes.find(
      (n) => n.tableName === "jdt_posts" && n.assocName.includes("_through_"),
    );
    expect(throughNode).toBeDefined();
    expect(throughNode!.effectiveSqlName).toBe("jdt_posts_jdt_authors_join");
    const throughTable = (throughNode!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(throughTable.name).toBe("jdt_posts");
    expect(throughTable.tableAlias).toBe("jdt_posts_jdt_authors_join");

    // Target uses real name (first use)
    const targetTable = (node!.arelJoin as Nodes.OuterJoin).left as Table;
    expect(targetTable.name).toBe("jdt_comments");
    expect(targetTable.tableAlias).toBeNull();
  });
});
