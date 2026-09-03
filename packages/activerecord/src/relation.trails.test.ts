import { describe, it, expect, beforeAll } from "vitest";
import { Nodes, Table as ArelTable } from "@blazetrails/arel";
import { Base } from "./index.js";
import { registerModel, modelRegistry } from "./associations.js";
import { merge, SpawnMethods } from "./relation/spawn-methods.js";
import { reverseSqlOrder, QueryMethods } from "./relation/query-methods.js";
import { Relation } from "./relation.js";
import { FinderMethods } from "./relation/finder-methods.js";
import { Calculations } from "./relation/calculations.js";
import { Batches } from "./relation/batches.js";
import { Explain } from "./explain.js";
import { DelegationMethods } from "./relation/delegation.js";
import { CpkOrder } from "./test-helpers/models/cpk.js";
import { AssociationRelation } from "./association-relation.js";
import { AliasTracker } from "./associations/alias-tracker.js";

import { fixtures } from "./test-fixtures.js";
import { Company as CanonCompany, Firm as CanonFirm } from "./test-helpers/models/company.js";
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
  fixtures([]);

  it("isBlank returns true when no records exist", async () => {
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

  it("merging a valid-key hash dispatches to value-methods", () => {
    const rel = CanonPost.all().merge({ where: { title: "a" }, limit: 5, order: "id" } as any);
    const sql = rel.toSql();
    expect(sql).toContain("WHERE");
    expect(sql).toContain("title");
    expect(sql).toContain("LIMIT");
    expect(sql.toLowerCase()).toContain("order by");
    expect(CanonPost.all().merge({ readonly: true } as any).isReadonly).toBe(true);
  });

  it("merge is non-destructive while mergeBang mutates in place through one path", () => {
    const base = CanonPost.all().where({ title: "a" });
    const baseSqlBefore = base.toSql();

    const merged = base.merge(CanonPost.where({ type: "SpecialPost" }));
    expect(base.toSql()).toBe(baseSqlBefore);
    expect(merged.toSql()).toContain("title");
    expect(merged.toSql()).toContain("type");

    const target = CanonPost.all().where({ title: "a" });
    const returned = (target as any).mergeBang(CanonPost.where({ type: "SpecialPost" }));
    expect(returned).toBe(target);
    expect(target.toSql()).toBe(merged.toSql());
  });

  it("merge with an array returns the records intersection while mergeBang rejects it", async () => {
    const a = await CanonPost.createBang({ title: "ary-a", body: "b" });
    await CanonPost.createBang({ title: "ary-b", body: "b" });

    const intersection = await (CanonPost.where({ title: ["ary-a", "ary-b"] }) as any).merge([a]);
    expect(intersection.map((p: any) => Number(p.id))).toEqual([Number(a.id)]);

    const dupReceiver = { toArray: async () => [a, a] };
    const deduped = await (merge as (this: unknown, o: unknown) => Promise<any[]>).call(
      dupReceiver,
      [a],
    );
    expect(deduped.map((p: any) => Number(p.id))).toEqual([Number(a.id)]);

    expect(() => (CanonPost.all() as any).mergeBang([a])).toThrow(/not an ActiveRecord::Relation/);
  });

  it("merge unions preload/includes/eager_load specs without duplicating", () => {
    const preloadMerged = CanonPost.preload(":comments").merge(CanonPost.preload(":comments"));
    expect((preloadMerged as any).preloadValues).toEqual([":comments"]);

    const includesMerged = CanonPost.includes(":comments").merge(CanonPost.includes(":comments"));
    expect((includesMerged as any).includesValues).toEqual([":comments"]);

    const eagerMerged = CanonPost.eagerLoad(":comments").merge(CanonPost.eagerLoad(":comments"));
    expect((eagerMerged as any).eagerLoadValues).toEqual([":comments"]);
  });

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
    const fnSql = Order.group("DATE(created_at)").toSql();
    expect(fnSql).toContain("GROUP BY DATE(created_at)");
    expect(fnSql).not.toContain('"orders"."DATE(created_at)"');
    const castSql = Order.group("created_at::date").toSql();
    expect(castSql).toContain("GROUP BY created_at::date");
    expect(castSql).not.toContain('"orders"."created_at::date"');
    expect(Order.group("1").toSql()).toContain("GROUP BY 1");
  });

  it("constructJoinDependency handles array-form spec — joins(['posts','comments'])", () => {
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
    const sql = Author.all().leftJoins([":posts", ":comments"]).toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*posts/i);
    expect(sql).toMatch(/LEFT OUTER JOIN.*comments/i);
  });

  it("constructJoinDependency handles hash spec — leftJoins({ posts: 'comments' })", () => {
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
    const sql = Author.all().leftJoins({ ":posts": ":comments" }).toSql();
    expect(sql).toMatch(/LEFT OUTER JOIN.*posts/i);
    expect(sql).toMatch(/LEFT OUTER JOIN.*comments/i);
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

  it("leftJoins(:assoc) stores in leftOuterJoinsValues and generates LEFT OUTER JOIN", () => {
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

    const rel = Author.leftJoins(":posts");
    expect((rel as any).leftOuterJoinsValues).toContain(":posts");
    expect(rel.toSql()).toMatch(/LEFT OUTER JOIN\s+\S*posts\S*\s+ON/i);
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

    const rel = Author.leftJoins(5 as any);
    expect((rel as any).leftOuterJoinsValues).toContain(5);
    expect(() => rel.toSql()).toThrow("only Hash, Symbol and Array are allowed");
  });

  it("includes().references() + leftJoins(): no duplicate LEFT OUTER JOIN in SQL", () => {
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

    const rel = Author.all().includes(":posts").references("posts").leftJoins(":posts");
    const sqlStr = rel.toSql();
    const leftJoinMatches = sqlStr.match(/LEFT OUTER JOIN/gi) ?? [];
    expect(leftJoinMatches.length).toBe(1);
  });

  it("eagerLoad + leftJoins: buildJoinBuckets short-circuit does not drop eager stash", () => {
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
    const rel = Author.leftJoins(":posts").eagerLoad(":posts");
    expect((rel as any).eagerLoadValues).toContain(":posts");
    expect((rel as any).leftOuterJoinsValues).toContain(":posts");
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
    const joinValues = relation.joinsValues as unknown[];
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
    const ranked = Book.select("title").arel().as("ranked");
    const result = Book.from(ranked).where("ranked.title IS NOT NULL").toSql();
    expect(result).toContain("FROM (SELECT");
    expect(result).toContain(") ranked");
    expect(result).toContain("ranked.title IS NOT NULL");
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
      const sql = Book.all().eagerLoad(":author").limit(10).toSql();
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
      const sql = EagerArticle.all().eagerLoad(":eagerComments").limit(5).toSql();
      expect(sql).toContain(" IN (SELECT");
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
      const limitableEager = JlArticle.all().eagerLoad(":jlAuthor").limit(5);
      expect((limitableEager as any)._isDeferredDistinctPkSubquery()).toBe(false);

      const withCollectionJoin = JlArticle.all()
        .eagerLoad(":jlAuthor")
        .joins(":jlComments")
        .limit(5);
      expect((withCollectionJoin as any)._isDeferredDistinctPkSubquery()).toBe(true);

      const withCollectionLeftJoin = JlArticle.all()
        .eagerLoad(":jlAuthor")
        .leftJoins(":jlComments")
        .limit(5);
      expect((withCollectionLeftJoin as any)._isDeferredDistinctPkSubquery()).toBe(true);

      const singularJoin = JlArticle.all().eagerLoad(":jlAuthor").joins(":jlAuthor").limit(5);
      expect((singularJoin as any)._isDeferredDistinctPkSubquery()).toBe(false);

      const singularNestedJoin = JlArticle.all()
        .eagerLoad(":jlAuthor")
        .joins({ ":jlAuthor": ":jlProfile" })
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

  const arelSql = (rel: any) => {
    const conn = Widget.connection as any;
    const wasPreparedStatements = conn.preparedStatements;
    conn.preparedStatements = false;
    try {
      return conn.toSql(rel.arel().ast);
    } finally {
      conn.preparedStatements = wasPreparedStatements;
    }
  };
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
    expect(sql).toMatch(/["`]cheap["`]/);
    expect(sql).toBe(placeholderSql(rel));
  });

  it("arel carries lock", () => {
    const rel = Widget.all().lock("FOR UPDATE");
    expect(arelSql(rel)).toBe(placeholderSql(rel));
  });

  it("arel of an eager relation projects normal columns, not join-dependency aliases", () => {
    const rel = Gadget.eagerLoad(":widget").select(Gadget.arelTable.get("id"));
    const sql = Gadget.connection.toSql(rel.arel().ast);
    expect(sql).not.toMatch(/t\d+_r\d+/);
    expect(sql).toMatch(/SELECT\s+["`]gadgets["`]\.["`]id["`]/);
  });

  it("where with eager-loading relation subquery converts eager-load to a join", () => {
    const sql = Widget.where({ id: Gadget.eagerLoad(":widget") }).toSql();
    expect(sql).toContain("LEFT OUTER JOIN");
    expect(sql).toMatch(/IN \(SELECT ["`]gadgets["`]\.["`]id["`]/);
    expect(sql).not.toMatch(/t\d+_r\d+/);
  });

  it("where with a star-projection subquery passes the projection through unchanged", () => {
    const sql = Widget.where({ id: Gadget.select("gadgets.*") }).toSql();
    expect(sql).toMatch(/IN \(SELECT gadgets\.\*/);
  });

  it("where with a multi-column subquery passes the projection through unchanged", () => {
    const sql = Widget.where({ id: Gadget.select("id, widget_id") }).toSql();
    expect(sql).toMatch(/IN \(SELECT id, widget_id/);
  });

  it("where with eager-loading limited collection relation subquery renders the inline distinct subquery for sync toSql", () => {
    const sql = Gadget.where({ widget_id: Widget.eagerLoad(":gadgets").limit(5) }).toSql();
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

  it("where with eager-loading limited collection relation subquery materializes distinct primary keys at load time", async () => {
    const subquery = CanonAuthor.eagerLoad(":posts").order({ id: "asc" }).limit(2);

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

    expect(queries.some((sql) => /SELECT\s+DISTINCT/i.test(sql) && /\bLIMIT\b/i.test(sql))).toBe(
      true,
    );
    const mainQuery = queries.find((sql) => /\bIN\b/i.test(sql) && /author_id/i.test(sql));
    expect(mainQuery).toBeDefined();
    expect(/IN\s*\(\s*SELECT/i.test(mainQuery!)).toBe(false);
    for (const id of limitedAuthorIds) {
      expect(mainQuery!).toContain(String(id));
    }
  });

  it("where with eager-loading limited collection relation subquery yielding no ids is empty", async () => {
    const subquery = CanonAuthor.where({ id: -1 })
      .eagerLoad(":posts")
      .order({ id: "asc" })
      .limit(2);

    let records: any[] = [];
    const queries = await captureSql(async () => {
      records = await CanonPost.where({ author_id: subquery });
    });

    expect(records).toEqual([]);
    expect(queries.some((sql) => /author_id/i.test(sql) && /\bIN\b/i.test(sql))).toBe(false);
  });

  it("count, pluck, and exists over an eager-loading limited collection subquery materialize distinct primary keys", async () => {
    const subquery = () => CanonAuthor.eagerLoad(":posts").order({ id: "asc" }).limit(2);
    const limitedAuthorIds = await CanonAuthor.order("id").limit(2).pluck("id");
    const expectedPostIds = await CanonPost.where({ author_id: limitedAuthorIds })
      .order("id")
      .pluck("id");

    let count = 0;
    const countQueries = await captureSql(async () => {
      count = (await CanonPost.where({ author_id: subquery() }).count()) as number;
    });
    expect(count).toBe(expectedPostIds.length);
    expect(countQueries.every((sql) => !/IN\s*\(\s*SELECT/i.test(sql))).toBe(true);

    const pluckedIds = await CanonPost.where({ author_id: subquery() }).order("id").pluck("id");
    expect(pluckedIds).toEqual(expectedPostIds);

    expect(await CanonPost.where({ author_id: subquery() }).exists()).toBe(true);
  });

  it("where with a grouped eager-loading limited subquery does not defer materialization", () => {
    const subquery = CanonAuthor.eagerLoad(":posts").group("authors.id").limit(2);
    const sql = CanonPost.where({ author_id: subquery }).toSql();
    expect(sql).toMatch(/IN \(SELECT/i);
    expect(sql).toMatch(/GROUP BY/i);
  });

  it("where with a singular nested-hash eager-loading limited subquery does not defer materialization", () => {
    const subquery = CanonAuthor.eagerLoad({ ":post": ":author" }).order({ id: "asc" }).limit(2);
    expect((subquery as any)._isDeferredDistinctPkSubquery()).toBe(false);
  });

  it("where with a collection nested-hash eager-loading limited subquery defers materialization", () => {
    const subquery = CanonAuthor.eagerLoad({ ":post": ":comments" }).order({ id: "asc" }).limit(2);
    expect((subquery as any)._isDeferredDistinctPkSubquery()).toBe(true);
  });
});

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

  it("renders the qualified Rails class name for an unloaded relation", () => {
    const relation = CanonPost.all();
    expect(relation.isLoaded).toBe(false);
    expect(relation.inspect()).toBe("#<ActiveRecord::Relation [...]>");
  });

  it("defaults an unordered reverseOrder to the primary key descending", () => {
    expect(CanonPost.all().reverseOrder().toSql()).toContain("ORDER BY");
    expect(CanonPost.all().reverseOrder().toSql()).toMatch(/ORDER BY .*\bid\b.* DESC/i);
  });

  it("defaults an unordered reverseOrder to a composite primary key descending", () => {
    const clauses = reverseSqlOrder.call(CpkOrder.all() as any, []);
    expect(clauses).toHaveLength(1);
    const ordering = clauses[0] as InstanceType<typeof Nodes.Descending>;
    expect(ordering).toBeInstanceOf(Nodes.Descending);
    expect((ordering.expr as any).name).toEqual(["shop_id", "id"]);

    expect(CpkOrder.all().reverseOrder().toSql()).toContain(`ORDER BY`);
    expect(CpkOrder.all().reverseOrder().toSql()).toContain(
      `${quoteTableName("cpk_orders")}.${quoteColumnName('["shop_id", "id"]')} DESC`,
    );
  });

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
    expect(seeded.aliasedTableFor(table, null, () => "comments_posts").right).toBe(
      "comments_posts",
    );
  });
});

describe("apply_join_dependency limitable reflections (trails)", () => {
  fixtures([]);

  it("materializes distinct parent ids when a joined reflection is a collection", () => {
    const sql = CanonPost.eagerLoad(":author").joins(":comments").limit(1).toSql();
    expect(sql).toMatch(/WHERE .*IN \(SELECT DISTINCT /);
    expect(sql).not.toMatch(/\bLIMIT 1\s*$/);
  });

  it("applies the limit directly when every eager and joined reflection is singular", () => {
    const sql = CanonPost.eagerLoad(":author").limit(1).toSql();
    expect(sql).not.toContain("SELECT DISTINCT");
    expect(sql).toMatch(/\bLIMIT 1\s*$/);
  });
});

describe("relation.rb:68 mixin ancestry", () => {
  const modules: [string, Record<string, unknown>][] = [
    ["FinderMethods", FinderMethods as unknown as Record<string, unknown>],
    ["Calculations", Calculations as unknown as Record<string, unknown>],
    ["SpawnMethods", SpawnMethods as unknown as Record<string, unknown>],
    ["QueryMethods", QueryMethods as unknown as Record<string, unknown>],
    ["Batches", Batches as unknown as Record<string, unknown>],
    ["Explain", Explain as unknown as Record<string, unknown>],
    ["Delegation", DelegationMethods as unknown as Record<string, unknown>],
  ];

  it("resolves a colliding method to the module highest in relation.rb:68's order", () => {
    const proto = Relation.prototype as unknown as Record<string, unknown>;

    const collisions = modules.flatMap(([name, mod], i) =>
      Object.keys(mod)
        .filter((key) => typeof mod[key] === "function" && !/^[A-Z]/.test(key))
        .map((key) => ({
          name,
          key,
          mod,
          lower: modules.slice(i + 1).find(([, other]) => typeof other[key] === "function"),
        }))
        .filter((entry) => entry.lower !== undefined),
    );

    const misresolved = collisions
      .filter(({ key, mod, lower }) => proto[key] === lower![1][key] && proto[key] !== mod[key])
      .map(({ name, key, lower }) => `${key}: ${lower![0]} outranks ${name}`);
    expect(misresolved).toEqual([]);

    expect(collisions.map(({ name, key }) => `${name}#${key}`)).toEqual([]);
  });
});

describe("Relation Enumerable surface (trails)", () => {
  fixtures(["authors", "posts"]);

  beforeAll(() => {
    registerModel(CanonAuthor);
    registerModel(CanonPost);
  });

  it("groups, indexes and compacts the loaded records the way Enumerable does", async () => {
    const posts = CanonPost.where({ type: "Post" }).order("id");

    const grouped = await posts.groupBy((post: any) => post.author_id);
    expect([...grouped.keys()].sort()).toEqual(
      [...new Set((await posts).map((post: any) => post.author_id))].sort(),
    );
    expect([...grouped.values()].flat().length).toBe(await posts.count());

    const indexed = await posts.indexBy((post: any) => post.id as number);
    const first = (await posts)[0] as any;
    expect((indexed[first.id] as any).id).toBe(first.id);

    const loaded = await posts;
    expect(await posts.compactBlank()).toEqual(loaded);
    expect((await CanonPost.where({ id: -1 }).compactBlank()).length).toBe(0);
  });

  it("presence returns the relation when records exist and null when none do", async () => {
    expect(await CanonPost.where({ id: -1 }).presence()).toBeNull();
    const present = await CanonPost.all().presence();
    expect(present).not.toBeNull();
    expect((await present!.toArray()).length).toBe(await CanonPost.all().count());
  });
});

describe("association equality re-dispatches to the other side", () => {
  fixtures(["authors", "posts"]);

  it("AssociationRelation#== asks other, passing its own records", async () => {
    const author = await CanonAuthor.first();
    const relation = (author!.posts as any).where({}) as AssociationRelation<any>;
    const records = await relation.records();
    const other = CanonPost.where({ id: records.map((r: any) => r.id) });

    expect(await relation.equals(other)).toBe(await other.equals(records));
    expect(await relation.equals(CanonPost.where({ id: -1 }))).toBe(false);

    expect(await relation.equals("posts")).toBe(false);
  });

  it("CollectionProxy#== compares its loaded target element-wise", async () => {
    const author = await CanonAuthor.first();
    const proxy = author!.posts as any;
    const records = await proxy.records();

    expect(await proxy.equals([...records])).toBe(true);
    expect(await proxy.equals(records.slice(1))).toBe(false);
    expect(await proxy.equals("posts")).toBe(false);
  });
});

describe("Relation#empty_scope? STI type_condition (trails)", () => {
  fixtures(["companies"]);

  beforeAll(() => {
    registerModel(CanonCompany);
    registerModel(CanonFirm);
  });

  it("reports an empty scope for an unscoped subclass relation carrying the type_condition", () => {
    expect((CanonFirm as any).isFinderNeedsTypeCondition()).toBe(true);
    expect((CanonFirm.all() as any).isEmptyScope).toBe(true);
    expect((CanonFirm.where({ name: "x" }) as any).isEmptyScope).toBe(false);
    expect((CanonCompany.all() as any).isEmptyScope).toBe(true);
  });
});

describe("lock_value stores the argument", () => {
  fixtures([]);

  it("stores true for a bare lock and false for lock(false)", () => {
    expect(CanonPost.all().lock().lockValue).toBe(true);
    expect(CanonPost.all().lock(null).lockValue).toBe(true);
    expect(CanonPost.all().lock(false).lockValue).toBe(false);
    expect(CanonPost.all().lock("FOR SHARE").lockValue).toBe("FOR SHARE");
  });

  it("builds the Arel default clause for a bare lock", () => {
    expect((CanonPost.all().arel() as any).ast.lock).toBe(null);
    expect(String((CanonPost.all().lock().arel() as any).ast.lock.expr)).toBe("FOR UPDATE");
    expect((CanonPost.all().lock(false).arel() as any).ast.lock).toBe(null);
    expect(String((CanonPost.all().lock("FOR SHARE").arel() as any).ast.lock.expr)).toBe(
      "FOR SHARE",
    );
  });
});
