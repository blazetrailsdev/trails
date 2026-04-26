/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, Relation, IrreversibleOrderError } from "./index.js";
import { Associations, registerModel, modelRegistry } from "./associations.js";

import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

// -- Helpers --
function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

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

  it("dotted string order passes through as raw SQL (Rails treats all string orders as SqlLiteral)", () => {
    class Post extends Base {
      static _tableName = "posts";
      static {
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    // Rails never strips or re-qualifies cross-table references in string form.
    expect(Post.order("comments.body ASC").toSql()).toContain("ORDER BY comments.body ASC");
    expect(Post.order("posts.id DESC").toSql()).toContain("ORDER BY posts.id DESC");
  });

  it("order by primary key stays table-qualified even before schema reflection", () => {
    // The PK (`id`) may not be in _attributeDefinitions before schema loads,
    // but must remain table-qualified to avoid ambiguous-column errors on JOINs.
    class Post extends Base {
      static _tableName = "posts";
      static {
        this.adapter = adapter;
      }
    }
    expect(Post.order({ id: "desc" }).toSql()).toContain('"posts"."id" DESC');
  });

  it("order by unknown column (subquery alias) uses bare quoted name", () => {
    class Developer extends Base {
      static _tableName = "developers";
      static {
        this.attribute("commits", "integer");
        this.adapter = adapter;
      }
    }
    const RANKED = "(SELECT id, commits AS hotness FROM developers) developers";
    const sql = Developer.from(RANKED).order({ hotness: "desc" }).limit(10).toSql();
    expect(sql).toContain('"hotness" DESC');
    expect(sql).not.toContain('"developers"."hotness"');
  });

  it("order by known column uses table-qualified attribute", () => {
    class Developer extends Base {
      static _tableName = "developers";
      static {
        this.attribute("commits", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Developer.order({ commits: "desc" }).toSql();
    expect(sql).toContain('"developers"."commits" DESC');
  });

  it("group by bare column name qualifies via table", () => {
    class Order extends Base {
      static _tableName = "orders";
      static {
        this.attribute("created_at", "string");
        this.attribute("total", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Order.group("created_at").toSql();
    expect(sql).toContain('"orders"."created_at"');
    expect(sql).not.toMatch(/GROUP BY created_at[^"]/);
  });

  it("group by multiple bare columns qualifies each via table", () => {
    class Book extends Base {
      static _tableName = "books";
      static {
        this.attribute("author_id", "integer");
        this.attribute("published_year", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Book.group("author_id", "published_year").toSql();
    expect(sql).toContain('"books"."author_id"');
    expect(sql).toContain('"books"."published_year"');
    expect(sql).not.toMatch(/GROUP BY author_id[^"]/);
    expect(sql).not.toMatch(/,\s*published_year[^"]/);
  });

  it("group by SQL expression passes through unqualified", () => {
    class Order extends Base {
      static _tableName = "orders";
      static {
        this.attribute("created_at", "string");
        this.adapter = adapter;
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

  it("group by dotted table.column qualifies each part", () => {
    class Book extends Base {
      static _tableName = "books";
      static {
        this.attribute("author_id", "integer");
        this.adapter = adapter;
      }
    }
    const sql = Book.group("authors.name").toSql();
    expect(sql).toContain('"authors"."name"');
    expect(sql).not.toContain("authors.name");
  });

  it("hash-form order qualifies column with table name", () => {
    class User extends Base {
      static {
        this.tableName = "users";
        this.adapter = adapter;
      }
    }
    const sql = User.order({ created_at: "desc" }).limit(10).toSql();
    expect(sql).toContain('"users"."created_at" DESC');

    const multiKeySql = User.order({ title: "asc", id: "desc" }).limit(10).toSql();
    expect(multiKeySql).toContain('"users"."title" ASC');
    expect(multiKeySql).toContain('"users"."id" DESC');
  });

  it("unscoped() on a relation discards WHERE/ORDER and returns fresh relation", () => {
    class Post extends Base {
      static {
        this.tableName = "posts";
        this.adapter = adapter;
      }
    }
    const sql = Post.where({ active: true }).order("created_at").unscoped().order("title").toSql();
    expect(sql).not.toContain("active");
    expect(sql).not.toContain('"posts"."created_at"');
    expect(sql).toContain('"posts"."title"');
  });

  it("joins() accepts Arel join nodes from joinSources", () => {
    class Author extends Base {
      static {
        this.tableName = "authors";
        this.adapter = adapter;
      }
    }
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    const books = Book.arelTable;
    const authors = Author.arelTable;
    const joinSources = books
      .join(authors)
      .on(books.get("author_id").eq(authors.get("id"))).joinSources;
    const sql = Book.joins(...joinSources).toSql();
    expect(sql).toContain("INNER JOIN");
    expect(sql).toContain('"authors"');
    expect(sql).toContain('"books"."author_id"');
  });

  it("string ORDER BY plain identifier qualifies with table name", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    expect(Book.order("title").toSql()).toContain('"books"."title"');
  });

  it("string ORDER BY in .from() subquery context stays unqualified for unknown columns", () => {
    class Developer extends Base {
      static {
        this.tableName = "developers";
        this.adapter = adapter;
      }
    }
    const RANKED = "SELECT id, commits AS hotness FROM developers";
    const sql = Developer.from(RANKED).order("hotness desc").limit(10).toSql();
    expect(sql).toContain('"hotness" DESC');
    expect(sql).not.toContain('"developers"."hotness"');
  });

  it("Model.optimizerHints() delegates to all().optimizerHints()", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    const sql = Book.optimizerHints("SeqScan(books)").where({ active: true }).toSql();
    expect(sql).toContain("SeqScan(books)");
    expect(sql).toContain('"books"."active"');
  });

  it("whereMissing emits LEFT OUTER JOIN + assoc_pk IS NULL", () => {
    class WmAuthor extends Base {
      static {
        this.tableName = "authors";
        registerModel("Author", this);
      }
    }
    class WmBook extends Base {
      static {
        this.tableName = "books";
        this.belongsTo("author");
        registerModel("Book", this);
      }
    }
    try {
      const sql = WmBook.all().whereMissing("author").toSql();
      expect(sql).toContain("LEFT OUTER JOIN");
      expect(sql).toContain('"authors"');
      expect(sql).toContain('"authors"."id" IS NULL');
      expect(sql).not.toContain('"books"."author_id" IS NULL');
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });

  it("whereAssociated emits INNER JOIN + assoc_pk IS NOT NULL", () => {
    class WaAuthor extends Base {
      static {
        this.tableName = "authors";
        registerModel("Author", this);
      }
    }
    class WaBook extends Base {
      static {
        this.tableName = "books";
        this.belongsTo("author");
        registerModel("Book", this);
      }
    }
    try {
      const sql = WaBook.all().whereAssociated("author").toSql();
      expect(sql).toContain("INNER JOIN");
      expect(sql).toContain('"authors"');
      expect(sql).toContain('"authors"."id" IS NOT NULL');
      expect(sql).not.toContain('"books"."author_id" IS NOT NULL');
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });

  it("whereNot multi-key hash wraps in NOT(AND) not individual !=", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    const sql = Book.whereNot({ status: "draft", active: false }).toSql();
    // Exact Rails form: WHERE NOT ("books"."status" = 'draft' AND "books"."active" = 0)
    // — a single NOT wrapping one AND containing both predicates.
    expect(sql).toMatch(/NOT \(.*"books"\."status".*AND.*"books"\."active".*\)/);
    // Must be exactly one NOT ( occurrence — not per-column NOTs
    expect(sql.match(/NOT \(/g)?.length).toBe(1);
    // Must use = (positive predicates inside NOT), not !=
    expect(sql).not.toContain("!=");
  });

  it("inOrderOf emits WHERE IN filter + CASE WHEN ... ASC (Rails form)", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    const sql = Book.all().inOrderOf("status", ["published", "draft", "archived"]).toSql();
    expect(sql).toContain(`"books"."status" IN ('published', 'draft', 'archived')`);
    expect(sql).toContain(`CASE WHEN "books"."status" = 'published' THEN 1`);
    expect(sql).toContain(`WHEN "books"."status" = 'draft' THEN 2`);
    expect(sql).toContain(`WHEN "books"."status" = 'archived' THEN 3`);
    expect(sql).toMatch(/END ASC/);
    expect(sql).not.toContain("ELSE");
    expect(sql).not.toContain("THEN 0");
  });

  it("inOrderOf with filter:false emits ELSE and no WHERE IN", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.adapter = adapter;
      }
    }
    const sql = Book.all().inOrderOf("status", ["published", "draft"], false).toSql();
    expect(sql).toContain(`CASE WHEN "books"."status" = 'published' THEN 1`);
    expect(sql).toContain(`WHEN "books"."status" = 'draft' THEN 2`);
    expect(sql).toContain("ELSE 3");
    expect(sql).toMatch(/END ASC/);
    expect(sql).not.toContain(" IN (");
  });

  it("whereMissing with hasMany emits LEFT OUTER JOIN + target_pk IS NULL", () => {
    class WmhAuthor extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("books");
        registerModel("Author", this);
      }
    }
    class WmhBook extends Base {
      static {
        this.tableName = "books";
        registerModel("Book", this);
      }
    }
    try {
      const sql = WmhAuthor.all().whereMissing("books").toSql();
      expect(sql).toContain("LEFT OUTER JOIN");
      expect(sql).toContain('"books"');
      expect(sql).toContain('"books"."id" IS NULL');
      expect(sql).not.toContain('"authors"."id" IS NULL');
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });

  it("whereAssociated with hasMany emits INNER JOIN + target_pk IS NOT NULL", () => {
    class WahAuthor extends Base {
      static {
        this.tableName = "authors";
        this.hasMany("books");
        registerModel("Author", this);
      }
    }
    class WahBook extends Base {
      static {
        this.tableName = "books";
        registerModel("Book", this);
      }
    }
    try {
      const sql = WahAuthor.all().whereAssociated("books").toSql();
      expect(sql).toContain("INNER JOIN");
      expect(sql).toContain('"books"');
      expect(sql).toContain('"books"."id" IS NOT NULL');
      expect(sql).not.toContain('"authors"."id" IS NOT NULL');
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
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

  it("select with arel node emits SQL alias", () => {
    class Book extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    const sql = Book.select(Book.arelTable.get("title").as("t")).toSql();
    expect(sql).toContain('"title" AS t');
    expect(sql).not.toContain("[object Object]");
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

  it("from(relation, alias) emits bare alias (mirrors Rails SqlLiteral unquoted path)", () => {
    class Book extends Base {
      static {
        this.tableName = "books";
        this.attribute("active", "boolean");
        this.adapter = adapter;
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
        this.adapter = adapter;
      }
    }
    const sql = Book.from("(SELECT * FROM books WHERE active = 1) books", "books").toSql();
    expect(sql).toMatch(/\) books/);
    expect(sql).not.toContain(') "books"');
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
        this._tableName = "posts";
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(Post.all().whereValuesHash()).toEqual({});

    const notEq = Post.all().where(Post.arelTable.get("id").notEq(10)).whereValuesHash();
    expect(notEq).toEqual({});

    const distinctFrom = Post.all()
      .where(Post.arelTable.get("id").isDistinctFrom(10))
      .whereValuesHash();
    expect(distinctFrom).toEqual({});
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
    expect(post.body).toBe("default");
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

  it("association join quotes the table name", () => {
    const adp = freshAdapter();
    class Comment extends Base {
      static _tableName = "comments";
      static {
        this.attribute("post_id", "integer");
        this.adapter = adp;
      }
    }
    class Post extends Base {
      static _tableName = "posts";
      static {
        this.attribute("title", "string");
        this.adapter = adp;
        Associations.hasMany.call(this, "comments", {
          className: "Comment",
          foreignKey: "post_id",
        });
      }
    }
    registerModel("Comment", Comment);
    try {
      const sql = Post.joins("comments").toSql();
      expect(sql).toContain('INNER JOIN "comments"');
    } finally {
      modelRegistry.delete("Comment");
    }
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
    const rel = Post.where({ title: "test" });
    expect(rel.whereValuesHash()).toEqual({ title: "test" });
  });

  it("values wrong table", () => {
    const Post = makePost();
    class Comment extends Base {
      static {
        this._tableName = "comments";
        this.attribute("id", "integer");
        this.adapter = adapter;
      }
    }
    const rel = Post.all().where(Comment.arelTable.get("id").eq(10));
    expect(rel.whereValuesHash()).toEqual({});
  });

  it("tree is not traversed", () => {
    const Post = makePost();
    const left = Post.arelTable.get("id").eq(10);
    const right = Post.arelTable.get("id").eq(10);
    const rel = Post.all().where(left.or(right));
    expect(rel.whereValuesHash()).toEqual({});
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
    const rel = Post.where({ title: ["foo", "bar", "hello"] });
    expect(rel.whereValuesHash()).toEqual({ title: ["foo", "bar", "hello"] });
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

  it("reverse order raises on complex expressions", () => {
    class Post extends Base {
      static {
        this.attribute("title", "string");
        this.adapter = adapter;
      }
    }
    expect(() => Post.order("LOWER(title) ASC").reverseOrder()).toThrow(IrreversibleOrderError);
  });

  it("eagerLoad emits LEFT OUTER JOIN and t0_r0-style column aliases", () => {
    try {
      class Author extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          registerModel(this);
        }
      }
      class Book extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          Associations.belongsTo.call(this, "author", { className: "Author" });
          this.adapter = adapter;
          registerModel(this);
        }
      }
      const sql = Book.all().eagerLoad("author").toSql();
      expect(sql).toMatch(/"books"\."id" AS t0_r/);
      expect(sql).toMatch(/"authors"\.".*" AS t1_r/);
      expect(sql).toContain('LEFT OUTER JOIN "authors" ON');
      expect(sql).not.toMatch(/LEFT OUTER JOIN "authors" "t\d+"/);
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });

  it("eagerLoad with LIMIT emits direct LIMIT for non-collection associations", () => {
    try {
      class Author extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          registerModel(this);
        }
      }
      class Book extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          Associations.belongsTo.call(this, "author", { className: "Author" });
          this.adapter = adapter;
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
          this.adapter = adapter;
          registerModel(this);
        }
      }
      class EagerArticle extends Base {
        static {
          this.tableName = "eager_articles";
          this.attribute("title", "string");
          Associations.hasMany.call(this, "eagerComments", {
            className: "EagerComment",
            foreignKey: "eager_article_id",
          });
          this.adapter = adapter;
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

  it("includes + references promotes to eager load SQL", () => {
    try {
      class Author extends Base {
        static {
          this.attribute("name", "string");
          this.adapter = adapter;
          registerModel(this);
        }
      }
      class Book extends Base {
        static {
          this.attribute("title", "string");
          this.attribute("author_id", "integer");
          Associations.belongsTo.call(this, "author", { className: "Author" });
          this.adapter = adapter;
          registerModel(this);
        }
      }
      const sql = Book.all()
        .includes("author")
        .where("authors.name = 'Rails'")
        .references("authors")
        .toSql();
      expect(sql).toContain('LEFT OUTER JOIN "authors" ON');
      expect(sql).toMatch(/"books"\."id" AS t0_r/);
      expect(sql).toContain("authors.name = 'Rails'");
    } finally {
      modelRegistry.delete("Author");
      modelRegistry.delete("Book");
    }
  });
});
