/**
 * Trails-specific Relation tests relocated from relation.test.ts (RFC 0043).
 *
 * These guard documented trails-specific invariants — SQL generation shapes,
 * join-ordering internals, build_arel convergence, and the deferred
 * distinct-PK materialization mechanism — that have no like-named Rails test
 * in relation_test.rb. Moved verbatim so they no longer count as bespoke
 * "extra" tests against the Rails parity metric.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Nodes, Table as ArelTable } from "@blazetrails/arel";
import { Base } from "./index.js";
import { registerModel, modelRegistry } from "./associations.js";
import { performMerge } from "./relation/spawn-methods.js";
import { reverseSqlOrder } from "./relation/query-methods.js";
import { CpkOrder } from "./test-helpers/models/cpk.js";
import { AssociationRelation } from "./association-relation.js";
import { AliasTracker } from "./associations/alias-tracker.js";

import { fixtures } from "./test-fixtures.js";
import { Post as CanonPost } from "./test-helpers/models/post.js";
import {
  Comment as CanonComment,
  SpecialComment as CanonSpecialComment,
} from "./test-helpers/models/comment.js";
import { Rating as CanonRating } from "./test-helpers/models/rating.js";
import { Author as CanonAuthor } from "./test-helpers/models/author.js";
import { Categorization as CanonCategorization } from "./test-helpers/models/categorization.js";
import { captureSql } from "./testing/sql-capture.js";
import { quoteTableName, quoteColumnName } from "./support/quote-regex.js";

describe("isBlank / isPresent", () => {
  // `developers` is canonical (schema.rb `create_table :developers`) and
  // boot-laid empty on the primary worker DB, so ride `Base.connection` (the
  // handler suite) rather than a sidecar-pool lease with an in-test
  // `createTable`. Transactional fixtures roll back the inserted row per test.
  fixtures([]);

  it("isBlank returns true when no records exist", async () => {
    // Inline model on the canonical `developers` table (not the canonical
    // Developer model): this exercises isBlank/isPresent mechanics, and
    // Developer's `name` is a restricted, non-dirty-tracked attribute, so
    // `create({ name })` needs a plainly-declared `name` to persist.
    class SampleRecord extends Base {
      static _tableName = "developers";
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }

    expect(await SampleRecord.all().isBlank()).toBe(true);
    expect(await SampleRecord.all().isPresent()).toBe(false);

    await SampleRecord.create({ name: "Alice" });
    expect(await SampleRecord.all().isBlank()).toBe(false);
    expect(await SampleRecord.all().isPresent()).toBe(true);
  });
});

describe("RelationTest", () => {
  fixtures([]);

  // No like-named Rails test: relation_test.rb only covers the invalid-key path
  // ("merging a hash with unknown keys raises"). This guards the positive
  // HashMerger path — a valid VALUE_METHODS-keyed hash builds a fresh base
  // Relation (via `_newRelation`) and dispatches each key to its value-method
  // bang setter, then merges through Merger — so a regression to the old
  // where-conditions behavior (or a missing base-class `_newRelation`) is caught.
  it("merging a valid-key hash dispatches to value-methods", () => {
    const rel = CanonPost.all().merge({ where: { title: "a" }, limit: 5, order: "id" } as any);
    const sql = rel.toSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("title");
    expect(sql).toContain("LIMIT");
    expect(sql.toLowerCase()).toContain("order by");
    expect(CanonPost.all().merge({ readonly: true } as any).isReadonly).toBe(true);
  });

  // No like-named Rails test: guards trails' merge/merge! structure, which
  // mirrors Rails' `merge` = `spawn.merge!` (spawn_methods.rb). `merge` clones
  // first so the receiver is untouched; `merge!` runs the one Merger#merge
  // algorithm in place, returning the same object. Both must land the same
  // conditions — a regression that re-splits the two paths is caught here.
  it("merge is non-destructive while mergeBang mutates in place through one path", () => {
    const base = CanonPost.all().where({ title: "a" });
    const baseSqlBefore = base.toSql();

    const merged = base.merge(CanonPost.where({ type: "SpecialPost" }));
    // merge() left the receiver untouched (spawn cloned first)...
    expect(base.toSql()).toBe(baseSqlBefore);
    // ...and produced the combined conditions on a fresh relation.
    expect(merged.toSql()).toContain("title");
    expect(merged.toSql()).toContain("type");

    // mergeBang() mutates the receiver in place and returns it (same object),
    // landing the identical conditions merge() produced on its clone.
    const target = CanonPost.all().where({ title: "a" });
    const returned = (target as any).mergeBang(CanonPost.where({ type: "SpecialPost" }));
    expect(returned).toBe(target);
    expect(target.toSql()).toBe(merged.toSql());
  });

  // No like-named Rails test: guards the merge/merge! Array dispatch
  // (spawn_methods.rb:33-51). `merge` special-cases an Array as `records & other`
  // (the receiver's records intersected by AR equality — async in trails, so a
  // Promise of the intersection); `merge!` never treats an Array as a Hash and
  // raises. A JS Array is `typeof "object"`, so this guards against it wrongly
  // routing into HashMerger.
  it("merge with an array returns the records intersection while mergeBang rejects it", async () => {
    const a = await CanonPost.createBang({ title: "ary-a", body: "b" });
    await CanonPost.createBang({ title: "ary-b", body: "b" });

    const intersection = await (CanonPost.where({ title: ["ary-a", "ary-b"] }) as any).merge([a]);
    expect(intersection.map((p: any) => Number(p.id))).toEqual([Number(a.id)]);

    // Rails `records & other` is Array#& — set-style, so a receiver that loads
    // `a` twice (e.g. a join that duplicates the row) still yields it once. Drive
    // performMerge with a stub receiver whose records include the duplicate.
    const dupReceiver = { toArray: async () => [a, a] };
    const deduped = await (performMerge as (this: unknown, o: unknown) => Promise<any[]>).call(
      dupReceiver,
      [a],
    );
    expect(deduped.map((p: any) => Number(p.id))).toEqual([Number(a.id)]);

    expect(() => (CanonPost.all() as any).mergeBang([a])).toThrow(/not an ActiveRecord::Relation/);
  });

  // No like-named Rails test: guards Rails' `|=` union for the preload/includes/
  // eager_load merge folds (merger.rb / query_methods.rb) — a repeated spec across
  // a merge must dedup structurally, not accumulate duplicate specs the preloader
  // then double-loads.
  it("merge unions preload/includes/eager_load specs without duplicating", () => {
    const preloadMerged = CanonPost.preload("comments").merge(CanonPost.preload("comments"));
    expect((preloadMerged as any)._preloadAssociations).toEqual(["comments"]);

    const includesMerged = CanonPost.includes("comments").merge(CanonPost.includes("comments"));
    expect((includesMerged as any)._includesAssociations).toEqual(["comments"]);

    const eagerMerged = CanonPost.eagerLoad("comments").merge(CanonPost.eagerLoad("comments"));
    expect((eagerMerged as any)._eagerLoadAssociations).toEqual(["comments"]);
  });

  // No like-named Rails test: guards the documented proc-merge path
  // (`Post.where(...).merge(-> { ... })`, spawn_methods.rb). Through the single
  // path `merge` = `spawn.merge!` and `merge!` runs the block via
  // `instance_exec(&other)` — trails routes a function argument to
  // `other.call(this)` on the spawned clone, so the receiver stays untouched and
  // the block's returned relation carries the added condition.
  it("merge evaluates a proc against the spawned relation", () => {
    const base = CanonPost.all().where({ title: "a" });
    const baseSqlBefore = base.toSql();
    const merged = (base as any).merge(function (this: any) {
      return this.where({ type: "SpecialPost" });
    });
    expect(base.toSql()).toBe(baseSqlBefore);
    expect(merged.toSql()).toContain("title");
    expect(merged.toSql()).toContain("type");
  });

  it("dotted string order passes through as raw SQL (Rails treats all string orders as SqlLiteral)", () => {
    class Post extends Base {
      static _tableName = "posts";
      static {
        this.attribute("id", "integer");
      }
    }
    // Rails never strips or re-qualifies cross-table references in string form.
    expect(Post.order("comments.body ASC").toSql()).toContain("ORDER BY comments.body ASC");
    expect(Post.order("posts.id DESC").toSql()).toContain("ORDER BY posts.id DESC");
  });

  it("group by SQL expression passes through unqualified", () => {
    class Order extends Base {
      static _tableName = "orders";
      static {
        this.attribute("created_at", "string");
      }
    }
    // Function expressions pass through as raw SQL (not quoted as identifier)
    const fnSql = Order.group("DATE(created_at)").toSql();
    expect(fnSql).toContain("GROUP BY DATE(created_at)");
    expect(fnSql).not.toContain('"orders"."DATE(created_at)"');
    // Cast expressions pass through as raw SQL (not quoted as identifier)
    const castSql = Order.group("created_at::date").toSql();
    expect(castSql).toContain("GROUP BY created_at::date");
    expect(castSql).not.toContain('"orders"."created_at::date"');
    // Positional GROUP BY passes through as raw SQL
    expect(Order.group("1").toSql()).toContain("GROUP BY 1");
  });

  it("constructJoinDependency handles array-form spec — joins(['posts','comments'])", () => {
    // leftJoins(["posts", "comments"]) is equivalent to chaining leftJoins("posts").leftJoins("comments").
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "CJDPost", foreignKey: "author_id" });
        this.hasMany("comments", { className: "CJDComment", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
      }
    }
    class Comment extends Base {
      static {
        this.tableName = "comments";
        this.attribute("author_id", "integer");
      }
    }
    registerModel("CJDAuthor", Author);
    registerModel("CJDPost", Post);
    registerModel("CJDComment", Comment);
    // Array spec goes directly through constructJoinDependency via leftJoins
    const sql = Author.all().leftJoins(["posts", "comments"]).toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*posts/i);
    expect(sql).toMatch(/LEFT OUTER JOIN.*comments/i);
  });

  it("constructJoinDependency handles hash spec — leftJoins({ posts: 'comments' })", () => {
    // Hash spec { posts: "comments" } means: join posts, then join comments via posts.
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "HashPost", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
        this.hasMany("comments", { className: "HashComment", foreignKey: "post_id" });
      }
    }
    class Comment extends Base {
      static {
        this.tableName = "comments";
        this.attribute("post_id", "integer");
      }
    }
    registerModel("HashAuthor", Author);
    registerModel("HashPost", Post);
    registerModel("HashComment", Comment);
    const sql = Author.all().leftJoins({ posts: "comments" }).toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*posts/i);
    expect(sql).toMatch(/LEFT OUTER JOIN.*comments/i);
    // Verify comments is joined through posts: ON clause must reference the
    // effective SQL name of the posts table (real name or collision alias).
    const postsJoinMatch = sql.match(
      /LEFT OUTER JOIN\s+["`]?posts["`]?(?:\s+(?:AS\s+)?["`]?(\w+)["`]?)?\s+ON/i,
    );
    expect(postsJoinMatch).not.toBeNull();
    const postsRef = postsJoinMatch?.[1] ?? "posts";
    const escapedPostsRef = postsRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const commentsJoinMatch = sql.match(
      /LEFT OUTER JOIN\s+["`]?comments["`]?(?:\s+(?:AS\s+)?["`]?\w+["`]?)?\s+ON\s+([\s\S]*?)(?=\s+LEFT OUTER JOIN|\s*$)/i,
    );
    expect(commentsJoinMatch).not.toBeNull();
    const commentsOnClause = commentsJoinMatch?.[1] ?? "";
    expect(commentsOnClause).toMatch(
      new RegExp(
        `["\`]?comments["\`]?\\.["\`]?post_id["\`]?\\s*=\\s*["\`]?${escapedPostsRef}["\`]?\\.["\`]?id["\`]?`,
        "i",
      ),
    );
  });

  it("leftJoins(:assoc) stores in _leftOuterJoinsValues and generates LEFT OUTER JOIN", () => {
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "LeftJoinPost2", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
      }
    }
    registerModel("LeftJoinAuthor2", Author);
    registerModel("LeftJoinPost2", Post);

    const rel = Author.leftJoins("posts");
    // Association name stored in _leftOuterJoinsValues, not pre-resolved to _joinClauses
    expect((rel as any)._leftOuterJoinsValues).toContain("posts");
    expect((rel as any)._joinClauses.some((j: any) => j.table === "posts")).toBe(false);
    // SQL still contains LEFT OUTER JOIN
    expect(rel.toSql()).toMatch(/LEFT OUTER JOIN/i);
  });

  it("leftJoins stores an invalid non-Hash/Symbol/Array arg verbatim and raises lazily at build", () => {
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "LazyRaisePost", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
      }
    }
    registerModel("LazyRaiseAuthor", Author);
    registerModel("LazyRaisePost", Post);

    // Rails stores args verbatim (`left_outer_joins_values |= args`) and only
    // raises in build_join_buckets — for ANY non-Hash/Symbol/Array arg, not just
    // a whitespace string. A bare Integer is neither, so building raises.
    const rel = Author.leftJoins(5 as any);
    expect((rel as any)._leftOuterJoinsValues).toContain(5);
    expect(() => rel.toSql()).toThrow("only Hash, Symbol and Array are allowed");
  });

  it("includes().references() + leftJoins(): no duplicate LEFT OUTER JOIN in SQL", () => {
    // Regression: includes promoted to eager load via references() causes
    // _buildEagerJoinManager to emit the LEFT OUTER JOIN. The pendingLeftOuter
    // filter must exclude promoted includes so leftJoins(:assoc) doesn't emit
    // a second JOIN for the same association.
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "RefLeftPost", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
      }
    }
    registerModel("RefLeftAuthor", Author);
    registerModel("RefLeftPost", Post);

    const rel = Author.all().includes("posts").references("posts").leftJoins("posts");
    const sqlStr = rel.toSql();
    // "posts" table should appear only once in LEFT OUTER JOIN clauses
    const leftJoinMatches = sqlStr.match(/LEFT OUTER JOIN/gi) ?? [];
    expect(leftJoinMatches.length).toBe(1);
  });

  it("eagerLoad + leftJoins: buildJoinBuckets short-circuit does not drop eager stash", () => {
    // Regression: when _joinValues and _joinClauses are empty, buildJoinBuckets
    // short-circuits for the left-outer-only path. If _eagerLoadAssociations is
    // also present, the short-circuit must not fire — eager stash would be skipped.
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("posts", { className: "EagerLeftPost", foreignKey: "author_id" });
      }
    }
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.attribute("author_id", "integer");
      }
    }
    registerModel("EagerLeftAuthor", Author);
    registerModel("EagerLeftPost", Post);
    // Both eagerLoad and leftJoins present, no explicit _joinValues/_joinClauses
    const rel = Author.leftJoins("posts").eagerLoad("posts");
    expect((rel as any)._eagerLoadAssociations).toContain("posts");
    expect((rel as any)._leftOuterJoinsValues).toContain("posts");
    // buildJoinBuckets must not short-circuit; SQL must be non-empty (no throw)
    expect(() => rel.toSql()).not.toThrow();
  });

  it("joins() preserves Arel node type — InnerJoin stays InnerJoin in _joinValues, not StringJoin", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
      }
    }
    const authors = new ArelTable("authors");
    const node = new Nodes.InnerJoin(
      authors,
      new Nodes.On(new Nodes.SqlLiteral("books.author_id = authors.id")),
    );
    const relation = Book.joins(node);
    const joinValues = (relation as any)._joinValues as unknown[];
    expect(relation.toSql()).toContain("INNER JOIN");
    expect(relation.toSql()).toContain("authors");
    expect(joinValues).toHaveLength(1);
    expect(joinValues[0]).toBeInstanceOf(Nodes.InnerJoin);
    expect(joinValues[0]).not.toBeInstanceOf(Nodes.StringJoin);
  });

  it("from() with an Arel TableAlias node emits (SELECT …) alias subquery form", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.attribute("title", "string");
      }
    }
    // SelectManager#as produces a Nodes.TableAlias — mirrors Rails'
    // `relation.arel.as("ranked")` as the from() argument.
    const ranked = Book.select("title").toArel().as("ranked");
    const result = Book.from(ranked).where("ranked.title IS NOT NULL").toSql();
    expect(result).toContain("FROM (SELECT");
    expect(result).toContain(") ranked");
    expect(result).toContain("ranked.title IS NOT NULL");
    // Must not produce [object Object]
    expect(result).not.toContain("[object");
  });

  it("from(relation, alias) emits bare alias (mirrors Rails SqlLiteral unquoted path)", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.attribute("active", "boolean");
      }
    }
    const sql = Book.from(Book.where({ active: true }), "books").toSql();
    // Rails: FROM (SELECT "books".* FROM "books" WHERE ...) books  ← bare alias
    expect(sql).toMatch(/FROM \(SELECT .+\) books/);
    expect(sql).not.toContain(') "books"');
  });

  it("from(rawSql, alias) emits bare alias for valid identifiers", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
      }
    }
    const sql = Book.from("(SELECT * FROM books WHERE active = 1) books", "books").toSql();
    expect(sql).toMatch(/\) books/);
    expect(sql).not.toContain(') "books"');
  });

  it("eagerLoad with LIMIT emits direct LIMIT for non-collection associations", () => {
    try {
      class Author extends Base {
        static {
          this.attribute("name", "string");
          registerModel(this);
        }
      }
      class Book extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          this.belongsTo("author", { className: "Author" });
          registerModel(this);
        }
      }
      const sql = Book.all().eagerLoad("author").limit(10).toSql();
      expect(sql).toContain("LIMIT 10");
      expect(sql).not.toContain(" IN (SELECT");
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });

  it("eagerLoad hasMany with LIMIT uses IN-subquery to avoid fan-out", () => {
    try {
      class EagerComment extends Base {
        static {
          this.tableName = "eager_comments";
          this.attribute("body", "string");
          this.attribute("eager_article_id", "integer");
          registerModel(this);
        }
      }
      class EagerArticle extends Base {
        static {
          this.tableName = "eager_articles";
          this.attribute("title", "string");
          this.hasMany("eagerComments", {
            className: "EagerComment",
            foreignKey: "eager_article_id",
          });
          registerModel(this);
        }
      }
      // hasMany is a collection association → not limitable → IN-subquery for fan-out avoidance
      const sql = EagerArticle.all().eagerLoad("eagerComments").limit(5).toSql();
      expect(sql).toContain(" IN (SELECT");
      // LIMIT 5 lives inside the subquery, not on the outer query
      expect(sql).toMatch(/IN \(SELECT .* LIMIT 5\)/s);
    } finally {
      modelRegistry.delete("EagerComment");
      modelRegistry.delete("EagerArticle");
    }
  });

  it("defers distinct-PK when a collection is in joins despite limitable eager reflections", () => {
    try {
      class JlComment extends Base {
        static {
          this.tableName = "jl_comments";
          this.attribute("body", "string");
          this.attribute("jl_article_id", "integer");
          registerModel(this);
        }
      }
      class JlProfile extends Base {
        static {
          this.tableName = "jl_profiles";
          this.attribute("bio", "string");
          registerModel(this);
        }
      }
      class JlAuthor extends Base {
        static {
          this.tableName = "jl_authors";
          this.attribute("name", "string");
          this.attribute("jl_profile_id", "integer");
          this.belongsTo("jlProfile", {
            className: "JlProfile",
            foreignKey: "jl_profile_id",
          });
          registerModel(this);
        }
      }
      class JlArticle extends Base {
        static {
          this.tableName = "jl_articles";
          this.attribute("title", "string");
          this.attribute("jl_author_id", "integer");
          this.belongsTo("jlAuthor", {
            className: "JlAuthor",
            foreignKey: "jl_author_id",
          });
          this.hasMany("jlComments", {
            className: "JlComment",
            foreignKey: "jl_article_id",
          });
          registerModel(this);
        }
      }
      // Eager reflection (belongsTo) is singular → limitable on its own, but the
      // joins ∪ left_outer_joins clause (finder_methods.rb:464-470) has a
      // collection (hasMany), so the two-clause using_limitable_reflections? test
      // is false and the relation defers to distinct-PK materialization.
      const limitableEager = JlArticle.all().eagerLoad("jlAuthor").limit(5);
      expect((limitableEager as any)._isDeferredDistinctPkSubquery()).toBe(false);

      const withCollectionJoin = JlArticle.all().eagerLoad("jlAuthor").joins("jlComments").limit(5);
      expect((withCollectionJoin as any)._isDeferredDistinctPkSubquery()).toBe(true);

      const withCollectionLeftJoin = JlArticle.all()
        .eagerLoad("jlAuthor")
        .leftJoins("jlComments")
        .limit(5);
      expect((withCollectionLeftJoin as any)._isDeferredDistinctPkSubquery()).toBe(true);

      // Singular joins — including a nested-hash chain (jlAuthor → jlProfile,
      // both belongsTo) — resolve to non-collection reflections, so the second
      // using_limitable_reflections? clause stays true and the relation does NOT
      // defer (Rails resolves the hash via construct_join_dependency.reflections).
      const singularJoin = JlArticle.all().eagerLoad("jlAuthor").joins("jlAuthor").limit(5);
      expect((singularJoin as any)._isDeferredDistinctPkSubquery()).toBe(false);

      const singularNestedJoin = JlArticle.all()
        .eagerLoad("jlAuthor")
        .joins({ jlAuthor: "jlProfile" })
        .limit(5);
      expect((singularNestedJoin as any)._isDeferredDistinctPkSubquery()).toBe(false);
    } finally {
      modelRegistry.delete("JlComment");
      modelRegistry.delete("JlProfile");
      modelRegistry.delete("JlAuthor");
      modelRegistry.delete("JlArticle");
    }
  });
});

// Mirrors: ActiveRecord::Relation#arel returning the full build_arel manager
// (active_record/relation/query_methods.rb#build_arel). Asserts that the AST
// from `relation.arel()` carries joins/HAVING/GROUP/FROM/LOCK/CTEs and compiles
// to exactly the same SQL as `relation.toSql()` — i.e. the legacy string-assembly
// path and the Arel-manager path can no longer drift.
describe("Relation#arel build_arel convergence", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel("Widget", Widget);
    registerModel("Gadget", Gadget);
  });

  class Widget extends Base {
    static _tableName = "widgets";
    static {
      this.attribute("id", "integer");
      this.attribute("name", "string");
      this.attribute("category", "string");
      this.attribute("price", "integer");
      this.hasMany("gadgets", { className: "Gadget", foreignKey: "widget_id" });
    }
  }

  class Gadget extends Base {
    static _tableName = "gadgets";
    static {
      this.attribute("id", "integer");
      this.attribute("widget_id", "integer");
      this.attribute("label", "string");
      this.belongsTo("widget", { className: "Widget" });
    }
  }

  // `connection.toSql(rel.arel())` and `rel.toSql()` both compile through the
  // adapter visitor with binds inlined, so they yield identical SQL when arel
  // encodes the whole query (joins/HAVING/FROM/LOCK/CTEs).
  const arelSql = (rel: any) => Widget.connection.toSql(rel.arel().ast);
  const placeholderSql = (rel: any) => rel.toSql();

  it("arel carries joins, group, and having", () => {
    const rel = Widget.joins(
      `INNER JOIN "widgets" AS "w2" ON "w2"."category" = "widgets"."category"`,
    )
      .group("category")
      .having("COUNT(*) > 1");
    const sql = arelSql(rel);
    expect(sql).toContain('INNER JOIN "widgets" AS "w2"');
    expect(sql).toContain("GROUP BY");
    expect(sql).toContain("HAVING");
    expect(sql).toBe(placeholderSql(rel));
  });

  it("arel carries a from-subquery", () => {
    const rel = Widget.from(Widget.where({ category: "fruit" }), "widgets");
    const sql = arelSql(rel);
    expect(sql).toContain("FROM (SELECT");
    expect(sql).toBe(placeholderSql(rel));
  });

  it("arel carries a CTE", () => {
    const rel = Widget.with({ cheap: Widget.where({ category: "fruit" }) }).where("1 = 1");
    const sql = arelSql(rel);
    expect(sql).toContain("WITH");
    // Quote-char varies by adapter ("cheap" on sqlite/PG, `cheap` on MySQL).
    expect(sql).toMatch(/["`]cheap["`]/);
    expect(sql).toBe(placeholderSql(rel));
  });

  it("arel carries lock", () => {
    const rel = Widget.all().lock("FOR UPDATE");
    expect(arelSql(rel)).toBe(placeholderSql(rel));
  });

  // Rails `arel`/`build_arel` projects the model's normal columns even when
  // eager loading — the `t0_r0…` alias projection belongs only to
  // apply_join_dependency on the loading path. So an eager relation used as a
  // subquery with an explicit single-column select projects that one column,
  // not JoinDependency aliases (regression guard for build_arel convergence).
  it("arel of an eager relation projects normal columns, not join-dependency aliases", () => {
    const rel = Gadget.eagerLoad("widget").select(Gadget.arelTable.get("id"));
    const sql = Gadget.connection.toSql(rel.arel().ast);
    expect(sql).not.toMatch(/t\d+_r\d+/);
    expect(sql).toMatch(/SELECT\s+["`]gadgets["`]\.["`]id["`]/);
  });

  // Mirrors Rails RelationHandler applying apply_join_dependency before the
  // subquery: an eager-loading relation used as a `where(id: …)` value has its
  // eager_load converted to a LEFT OUTER JOIN (not dropped), projecting only PK.
  it("where with eager-loading relation subquery converts eager-load to a join", () => {
    const sql = Widget.where({ id: Gadget.eagerLoad("widget") }).toSql();
    expect(sql).toContain("LEFT OUTER JOIN");
    expect(sql).toMatch(/IN \(SELECT ["`]gadgets["`]\.["`]id["`]/);
    expect(sql).not.toMatch(/t\d+_r\d+/);
  });

  // Rails' RelationHandler has no single-column validation: a subquery with an
  // explicit projection (including `table.*` or multiple columns) passes
  // straight to `attribute.in(value.arel)`, and the database — not trails —
  // raises on any column-count mismatch. Regression guard for removing the
  // bespoke `ensureSingleColumnSelect` throw.
  it("where with a star-projection subquery passes the projection through unchanged", () => {
    const sql = Widget.where({ id: Gadget.select("gadgets.*") }).toSql();
    expect(sql).toMatch(/IN \(SELECT gadgets\.\*/);
  });

  it("where with a multi-column subquery passes the projection through unchanged", () => {
    const sql = Widget.where({ id: Gadget.select("id, widget_id") }).toSql();
    expect(sql).toMatch(/IN \(SELECT id, widget_id/);
  });

  // Rails apply_join_dependency materializes distinct primary keys (executing a
  // query) when eager loading with a limit over a collection reflection. trails
  // defers that query to relation load time; the synchronous `toSql()` display
  // path cannot run it, so it renders the inline `IN (SELECT DISTINCT … LIMIT n)`
  // fallback (valid on SQLite/PostgreSQL). The load path substitutes a literal
  // id list instead — see the canonical RelationTest materialization tests.
  it("where with eager-loading limited collection relation subquery renders the inline distinct subquery for sync toSql", () => {
    const sql = Gadget.where({ widget_id: Widget.eagerLoad("gadgets").limit(5) }).toSql();
    expect(sql).toMatch(/widget_id\W+IN \(SELECT DISTINCT ["`]widgets["`]\.["`]id["`]/);
    expect(sql).toContain("LEFT OUTER JOIN");
    expect(sql).toMatch(/LIMIT 5/);
  });
});

describe("RelationTest", () => {
  const { authors } = fixtures([
    "authors",
    "posts",
    "comments",
    "ratings",
    "categorizations",
    "categories",
  ]);

  beforeAll(() => {
    registerModel(CanonAuthor);
    registerModel(CanonPost);
    registerModel(CanonComment);
    registerModel(CanonSpecialComment);
    registerModel(CanonRating);
    registerModel(CanonCategorization);
  });

  // Rails RelationHandler#call routes an eager-loading subquery that also has a
  // limit/offset over a collection reflection through
  // distinct_relation_for_primary_key (finder_methods.rb:463), which EXECUTES a
  // `SELECT DISTINCT <pk> … LIMIT n` to materialize a literal id list rather than
  // nesting `IN (SELECT … LIMIT n)` (MySQL rejects LIMIT inside IN). trails'
  // `.where()` is synchronous, so the materialization is deferred to relation
  // load time: the main query carries the literal `author_id IN (<ids>)`, never
  // a LIMIT-bearing subquery, on every adapter.
  it("where with eager-loading limited collection relation subquery materializes distinct primary keys at load time", async () => {
    const subquery = CanonAuthor.eagerLoad("posts").order({ id: "asc" }).limit(2);

    let records: any[] = [];
    const queries = await captureSql(async () => {
      records = await CanonPost.where({ author_id: subquery }).order("id");
    });

    const limitedAuthorIds = await CanonAuthor.order("id").limit(2).pluck("id");
    const expectedPostIds = await CanonPost.where({ author_id: limitedAuthorIds })
      .order("id")
      .pluck("id");
    expect(records.map((p) => p.id)).toEqual(expectedPostIds);
    expect(expectedPostIds.length).toBeGreaterThan(0);

    // A standalone DISTINCT-pk materialization query ran (Rails
    // distinct_relation_for_primary_key), carrying the LIMIT.
    expect(queries.some((sql) => /SELECT\s+DISTINCT/i.test(sql) && /\bLIMIT\b/i.test(sql))).toBe(
      true,
    );
    // The main Post query embeds the materialized ids as a literal IN list — no
    // nested subquery, no LIMIT inside IN (the MySQL parity assertion).
    const mainQuery = queries.find((sql) => /\bIN\b/i.test(sql) && /author_id/i.test(sql));
    expect(mainQuery).toBeDefined();
    expect(/IN\s*\(\s*SELECT/i.test(mainQuery!)).toBe(false);
    for (const id of limitedAuthorIds) {
      expect(mainQuery!).toContain(String(id));
    }
  });

  // An empty materialized id set yields an empty `IN`, which the where clause
  // short-circuits as a contradiction (Rails `none!`): an empty result with no
  // main query issued and no error.
  it("where with eager-loading limited collection relation subquery yielding no ids is empty", async () => {
    const subquery = CanonAuthor.where({ id: -1 }).eagerLoad("posts").order({ id: "asc" }).limit(2);

    let records: any[] = [];
    const queries = await captureSql(async () => {
      records = await CanonPost.where({ author_id: subquery });
    });

    expect(records).toEqual([]);
    // No main Post SELECT was issued (contradiction short-circuit before SQL).
    expect(queries.some((sql) => /author_id/i.test(sql) && /\bIN\b/i.test(sql))).toBe(false);
  });

  // The deferred materialization must fire for every terminal that compiles the
  // where clause — not just toArray — or count/pluck/exists would render the
  // inline LIMIT-in-IN subquery MySQL rejects. Rails materializes at
  // `.where()`-build time, so all terminals see `pk IN (ids)`.
  it("count, pluck, and exists over an eager-loading limited collection subquery materialize distinct primary keys", async () => {
    const subquery = () => CanonAuthor.eagerLoad("posts").order({ id: "asc" }).limit(2);
    const limitedAuthorIds = await CanonAuthor.order("id").limit(2).pluck("id");
    const expectedPostIds = await CanonPost.where({ author_id: limitedAuthorIds })
      .order("id")
      .pluck("id");

    let count = 0;
    const countQueries = await captureSql(async () => {
      count = (await CanonPost.where({ author_id: subquery() }).count()) as number;
    });
    expect(count).toBe(expectedPostIds.length);
    // No terminal renders the inline LIMIT-in-IN subquery MySQL rejects.
    expect(countQueries.every((sql) => !/IN\s*\(\s*SELECT/i.test(sql))).toBe(true);

    const pluckedIds = await CanonPost.where({ author_id: subquery() }).order("id").pluck("id");
    expect(pluckedIds).toEqual(expectedPostIds);

    expect(await CanonPost.where({ author_id: subquery() }).exists()).toBe(true);
  });

  // Rails `apply_join_dependency(eager_loading: group_values.empty?)`
  // (finder_methods.rb:457): a grouped subquery passes `eager_loading: false`,
  // skipping distinct_relation_for_primary_key — so a grouped eager+limit
  // subquery is NOT deferred and builds the plain `IN (SELECT … GROUP BY …)`.
  it("where with a grouped eager-loading limited subquery does not defer materialization", () => {
    const subquery = CanonAuthor.eagerLoad("posts").group("authors.id").limit(2);
    const sql = CanonPost.where({ author_id: subquery }).toSql();
    expect(sql).toMatch(/IN \(SELECT/i);
    expect(sql).toMatch(/GROUP BY/i);
  });

  // Rails resolves nested-hash/array eager specs through
  // construct_join_dependency(eager_load_values | includes_values).reflections
  // (finder_methods.rb:457-470, join_dependency.rb:81-82) before
  // using_limitable_reflections?. A spec whose whole tree is singular
  // (Author hasOne post → Post belongsTo author) stays limitable, so a
  // limit/offset relation is NOT deferred to distinct_relation_for_primary_key.
  it("where with a singular nested-hash eager-loading limited subquery does not defer materialization", () => {
    const subquery = CanonAuthor.eagerLoad({ post: "author" }).order({ id: "asc" }).limit(2);
    expect((subquery as any)._isDeferredDistinctPkSubquery()).toBe(false);
  });

  // A collection anywhere in the nested eager tree (Author hasOne post → Post
  // hasMany comments) makes the reflection set non-limitable, so the relation
  // defers to distinct-PK materialization just as a top-level collection does.
  it("where with a collection nested-hash eager-loading limited subquery defers materialization", () => {
    const subquery = CanonAuthor.eagerLoad({ post: "comments" }).order({ id: "asc" }).limit(2);
    expect((subquery as any)._isDeferredDistinctPkSubquery()).toBe(true);
  });
});

// Ruby's `self.class.name` is namespace-qualified, so Rails' inspect wrapper
// reads `#<ActiveRecord::Relation ...>` — pinned for the plain Relation by
// relations_test.rb:2108-2111. Its sibling wrapper classes have no like-named
// Rails test, so guard their qualified names here: JS `constructor.name` is
// unqualified (and bundler-manglable), which is why each class pins the Rails
// constant path on `_railsClassName`.
describe("inspect wrapper class name", () => {
  fixtures(["authors", "posts"]);

  it("renders the qualified Rails class name for a CollectionProxy", async () => {
    const author = await CanonAuthor.first();
    const str = await (author!.posts as any).inspect();
    expect(str.startsWith("#<ActiveRecord::Associations::CollectionProxy [")).toBe(true);
  });

  it("renders the qualified Rails class name for an AssociationRelation", async () => {
    const author = await CanonAuthor.first();
    const relation = (author!.posts as any).where({});
    expect(relation).toBeInstanceOf(AssociationRelation);
    await relation.load();
    expect(relation.inspect().startsWith("#<ActiveRecord::AssociationRelation [")).toBe(true);
  });

  // The unloaded branch elides entries with `[...]` (sync JS can't block on the
  // load Rails does here), but the wrapper name is Rails' either way.
  it("renders the qualified Rails class name for an unloaded relation", () => {
    const relation = CanonPost.all();
    expect(relation.isLoaded).toBe(false);
    expect(relation.inspect()).toBe("#<ActiveRecord::Relation [...]>");
  });

  // reverse_sql_order's empty-order branch has two outcomes; the no-PK raise is
  // covered by Rails' test_default_reverse_order_on_table_without_primary_key in
  // relations.test.ts. This guards the other half, which has no like-named Rails
  // test: a PK-bearing table falls back to ORDER BY <pk> DESC. Before the
  // reverseOrderBang fix, an empty order was a silent no-op and emitted no
  // ORDER BY at all.
  it("defaults an unordered reverseOrder to the primary key descending", () => {
    expect(CanonPost.all().reverseOrder().toSql()).toContain("ORDER BY");
    expect(CanonPost.all().reverseOrder().toSql()).toMatch(/ORDER BY .*\bid\b.* DESC/i);
  });

  // A composite primary key is an Array, which is truthy in Rails'
  // `return [table[primary_key].desc] if primary_key` guard, so it takes the
  // same default-order path as a scalar PK rather than raising. trails used to
  // invent an IrreversibleOrderError here.
  //
  // Note the resulting SQL is a *broken* column reference in Rails too:
  // `Arel::Table#[]` builds `Attribute.new(table, name)` for any name
  // (arel/table.rb:82) and `visit_Arel_Attributes_Attribute` hands it to the
  // adapter's `quote_column_name`, which stringifies the Array via `name.to_s`.
  // We match Rails byte-for-byte — `"cpk_orders"."[\"shop_id\", \"id\"]"` —
  // because the visitor routes the name through `rubyToS` (Ruby's `Array#to_s`
  // is inspect-style, not JS's comma-join). Both fail at the database;
  // reproducing Rails' exact text is the point.
  it("defaults an unordered reverseOrder to a composite primary key descending", () => {
    const clauses = reverseSqlOrder.call(CpkOrder.all() as any, []);
    expect(clauses).toHaveLength(1);
    const ordering = clauses[0] as InstanceType<typeof Nodes.Descending>;
    expect(ordering).toBeInstanceOf(Nodes.Descending);
    expect((ordering.expr as any).name).toEqual(["shop_id", "id"]);

    // End-to-end: builds rather than raising.
    expect(CpkOrder.all().reverseOrder().toSql()).toContain(`ORDER BY`);
    // Assert through the active adapter's quoter rather than hardcoding
    // double quotes: the inspect-style name is escaped differently per
    // dialect (MySQL backticks it; SQLite/PG double the interior quotes).
    expect(CpkOrder.all().reverseOrder().toSql()).toContain(
      `${quoteTableName("cpk_orders")}.${quoteColumnName('["shop_id", "id"]')} DESC`,
    );
  });

  // compact_blank: a blank string order is rejected before the reverse, so the
  // relation still falls back to the primary-key default rather than trying to
  // flip "" into " DESC".
  it("treats a blank string order as no order when reversing", () => {
    expect(CanonPost.order("").reverseOrder().toSql()).toMatch(/ORDER BY .*\bid\b.* DESC/i);
  });
});

describe("aliasTracker (trails)", () => {
  fixtures([]);

  it("returns an AliasTracker seeded with the relation table and joins", () => {
    const tracker = CanonPost.all().aliasTracker();
    expect(tracker).toBeInstanceOf(AliasTracker);
    expect(tracker.aliases.get("posts")).toBe(1);

    const table = new ArelTable("comments");
    const join = new Nodes.InnerJoin(table, new Nodes.On(new Nodes.SqlLiteral("1=1")));
    const seeded = CanonPost.all().aliasTracker([join]);
    expect(seeded.aliasedTableFor(table, "comments_posts").right).toBe("comments_posts");
  });
});
