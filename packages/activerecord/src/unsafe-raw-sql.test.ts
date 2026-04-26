/**
 * Mirrors: activerecord/test/cases/unsafe_raw_sql_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, UnknownAttributeReference } from "./index.js";
import { sql as arelSql } from "@blazetrails/arel";
import { createTestAdapter } from "./test-adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

describe("UnsafeRawSqlTest", () => {
  let adapter: DatabaseAdapter;
  let Post: typeof Base;

  beforeEach(async () => {
    adapter = freshAdapter();

    class UrsPost extends Base {
      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.attribute("type", "string");
        this.attribute("tags_count", "integer");
        this.adapter = adapter;
      }
    }
    Post = UrsPost;

    await Post.create({ title: "Alpha", author_id: 2, tags_count: 3 });
    await Post.create({ title: "Beta", author_id: 1, tags_count: 1 });
    await Post.create({ title: "Gamma", author_id: 1, tags_count: 2 });
  });

  it("order: allows string column name", async () => {
    const idsExpected = await (Post as any).order(arelSql("title")).pluck("id");
    const ids = await (Post as any).order("title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows symbol column name", async () => {
    const idsExpected = await (Post as any).order(arelSql("title")).pluck("id");
    const ids = await (Post as any).order("title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows downcase symbol direction", async () => {
    const idsExpected = await (Post as any).order(arelSql("title asc")).pluck("id");
    const ids = await (Post as any).order({ title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows upcase symbol direction", async () => {
    const idsExpected = await (Post as any).order(arelSql("title ASC")).pluck("id");
    const ids = await (Post as any).order({ title: "ASC" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows string direction", async () => {
    const idsExpected = await (Post as any).order(arelSql("title asc")).pluck("id");
    const ids = await (Post as any).order({ title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows multiple columns", async () => {
    const idsExpected = await (Post as any)
      .order(arelSql("author_id"), arelSql("title"))
      .pluck("id");
    const ids = await (Post as any).order("author_id", "title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows mixed", async () => {
    const idsExpected = await (Post as any)
      .order(arelSql("author_id"), arelSql("title asc"))
      .pluck("id");
    const ids = await (Post as any).order("author_id", { title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows table and column names", async () => {
    const idsExpected = await (Post as any).order(arelSql("title")).pluck("id");
    const ids = await (Post as any).order("urs_posts.title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows quoted table and column names", async () => {
    const idsExpected = await (Post as any).order(arelSql("title")).pluck("id");
    const ids = await (Post as any).order('"urs_posts"."title"').pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows column name and direction in string", async () => {
    const idsExpected = await (Post as any).order(arelSql("title desc")).pluck("id");
    const ids = await (Post as any).order("title desc").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows table name, column name and direction in string", async () => {
    const idsExpected = await (Post as any).order(arelSql("title desc")).pluck("id");
    const ids = await (Post as any).order("urs_posts.title desc").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it.skip("order: allows NULLS FIRST and NULLS LAST too", () => {
    // PostgreSQL-only (type cast syntax `::text`); skip for in-memory adapter.
  });

  it("order: disallows invalid column name", async () => {
    // order() raises immediately (Rails-faithful); wrap in async fn so .rejects works.
    await expect(async () => {
      await (Post as any).order("REPLACE(title, 'misc', 'zzzz') asc").pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: disallows invalid direction", async () => {
    await expect(async () => {
      await (Post as any).order({ title: "foo" }).pluck("id");
    }).rejects.toThrow();
  });

  it("order: disallows invalid column with direction", async () => {
    await expect(async () => {
      await (Post as any).order({ "REPLACE(title, 'misc', 'zzzz')": "asc" }).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: always allows Arel", async () => {
    const titles = await (Post as any).order(arelSql("length(title)")).pluck("title");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("order: allows Arel.sql with binds", async () => {
    const idsExpected = await (Post as any)
      .order(arelSql("REPLACE(title, 'Alpha', 'Zeta'), id"))
      .pluck("id");
    const ids = await (Post as any)
      .order([arelSql("REPLACE(title, ?, ?), id"), "Alpha", "Zeta"])
      .pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: disallows invalid bind statement", async () => {
    await expect(async () => {
      await (Post as any).order(["REPLACE(title, ?, ?), id", "misc", "zzzz"]).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: disallows invalid Array arguments", async () => {
    await expect(async () => {
      await (Post as any).order(["author_id", "REPLACE(title, 'misc', 'zzzz')"]).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: allows valid Array arguments", async () => {
    const idsExpected = await (Post as any).order(arelSql("author_id, length(title)")).pluck("id");
    const ids = await (Post as any).order(["author_id", "length(title)"]).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it.skip("order: allows valid arguments with COLLATE", () => {
    // COLLATE syntax is adapter-specific.
  });

  it("order: allows nested functions", async () => {
    const idsExpected = await (Post as any)
      .order(arelSql("author_id, length(trim(title))"))
      .pluck("id");
    const ids = await (Post as any).order("author_id, length(trim(title))").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: disallows dangerous query method", async () => {
    let error: unknown;
    try {
      await (Post as any).order("REPLACE(title, 'misc', 'zzzz')").pluck("id");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnknownAttributeReference);
    expect((error as UnknownAttributeReference).message).toMatch(
      /Dangerous query method.*called with non-attribute argument\(s\):/,
    );
  });

  it("pluck: allows string column name", async () => {
    const titlesExpected = await (Post as any).pluck(arelSql("title"));
    const titles = await (Post as any).pluck("title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows string column name with function and alias", async () => {
    const titlesExpected = await (Post as any).pluck(arelSql("UPPER(title)"));
    const titles = await (Post as any).pluck("UPPER(title) AS title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows symbol column name", async () => {
    const titlesExpected = await (Post as any).pluck(arelSql("title"));
    const titles = await (Post as any).pluck("title");
    expect(new Set(titles)).toEqual(new Set(titlesExpected));
  });

  it("pluck: allows multiple column names", async () => {
    const valuesExpected = await (Post as any).pluck(arelSql("title"), arelSql("id"));
    const values = await (Post as any).pluck("title", "id");
    expect(values).toEqual(valuesExpected);
  });

  it("pluck: allows column names with includes", async () => {
    const valuesExpected = await (Post as any).pluck(arelSql("title"), arelSql("id"));
    const values = await (Post as any).all().pluck("title", "id");
    expect(values).toEqual(valuesExpected);
  });

  it("pluck: allows auto-generated attributes", async () => {
    const values = await (Post as any).pluck("tags_count");
    expect(values.length).toBeGreaterThan(0);
  });

  it("pluck: allows table and column names", async () => {
    const titlesExpected = await (Post as any).pluck(arelSql("title"));
    const titles = await (Post as any).pluck("urs_posts.title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows quoted table and column names", async () => {
    const titlesExpected = await (Post as any).pluck(arelSql("title"));
    const titles = await (Post as any).pluck('"urs_posts"."title"');
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows nested functions", async () => {
    const lengths = await (Post as any).pluck("length(trim(title))");
    expect(lengths.length).toBeGreaterThan(0);
  });

  it("pluck: disallows invalid column name", async () => {
    await expect((Post as any).pluck("REPLACE(title, 'misc', 'zzzz')")).rejects.toBeInstanceOf(
      UnknownAttributeReference,
    );
  });

  it("pluck: disallows invalid column name amongst valid names", async () => {
    await expect(
      (Post as any).pluck("title", "REPLACE(title, 'misc', 'zzzz')"),
    ).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("pluck: disallows invalid column names with includes", async () => {
    await expect(
      (Post as any).all().pluck("title", "REPLACE(title, 'misc', 'zzzz')"),
    ).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("pluck: rejects comma-separated column list in a single argument", async () => {
    // trails-specific guard: pluck("id, title") has ambiguous result mapping.
    // Pass each column as a separate argument instead: pluck("id", "title").
    await expect((Post as any).pluck("id, title")).rejects.toMatchObject({
      name: "ArgumentError",
      message: /pluck does not allow comma-separated/,
    });
  });

  it("pluck: always allows Arel", async () => {
    const values = await (Post as any).pluck("title", arelSql("length(title)"));
    expect(values.length).toBeGreaterThan(0);
    expect(Array.isArray(values[0])).toBe(true);
  });

  it("pluck: disallows dangerous query method", async () => {
    let error: unknown;
    try {
      await (Post as any).pluck("title", "REPLACE(title, 'misc', 'zzzz')");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnknownAttributeReference);
    expect((error as UnknownAttributeReference).message).toMatch(
      /Dangerous query method.*called with non-attribute argument\(s\):/,
    );
  });
});
