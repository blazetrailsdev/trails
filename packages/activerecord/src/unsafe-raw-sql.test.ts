/**
 * Mirrors: activerecord/test/cases/unsafe_raw_sql_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, UnknownAttributeReference } from "./index.js";
import { sql as arelSql } from "@blazetrails/arel";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

class Post extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("author_id", "integer");
    this.attribute("type", "string");
    this.attribute("tags_count", "integer");
  }
}

describe("UnsafeRawSqlTest", () => {
  beforeAll(async () => {
    await defineSchema({
      posts: { title: "string", author_id: "integer", type: "string", tags_count: "integer" },
    });

    await Post.create({ title: "Alpha", author_id: 2, tags_count: 3 });
    await Post.create({ title: "Beta", author_id: 1, tags_count: 1 });
    await Post.create({ title: "Gamma", author_id: 1, tags_count: 2 });
  });

  it("order: allows string column name", async () => {
    const idsExpected = await Post.order(arelSql("title")).pluck("id");
    const ids = await Post.order("title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows symbol column name", async () => {
    const idsExpected = await Post.order(arelSql("title")).pluck("id");
    const ids = await Post.order("title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows downcase symbol direction", async () => {
    const idsExpected = await Post.order(arelSql("title asc")).pluck("id");
    const ids = await Post.order({ title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows upcase symbol direction", async () => {
    const idsExpected = await Post.order(arelSql("title ASC")).pluck("id");
    const ids = await Post.order({ title: "ASC" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows string direction", async () => {
    const idsExpected = await Post.order(arelSql("title asc")).pluck("id");
    const ids = await Post.order({ title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows multiple columns", async () => {
    const idsExpected = await Post.order(arelSql("author_id"), arelSql("title")).pluck("id");
    const ids = await Post.order("author_id", "title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows mixed", async () => {
    const idsExpected = await Post.order(arelSql("author_id"), arelSql("title asc")).pluck("id");
    const ids = await Post.order("author_id", { title: "asc" }).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows table and column names", async () => {
    const idsExpected = await Post.order(arelSql("title")).pluck("id");
    const ids = await Post.order("posts.title").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows quoted table and column names", async () => {
    const idsExpected = await Post.order(arelSql("title")).pluck("id");
    const ids = await Post.order('"posts"."title"').pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows column name and direction in string", async () => {
    const idsExpected = await Post.order(arelSql("title desc")).pluck("id");
    const ids = await Post.order("title desc").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: allows table name, column name and direction in string", async () => {
    const idsExpected = await Post.order(arelSql("title desc")).pluck("id");
    const ids = await Post.order("posts.title desc").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it.skip("order: allows NULLS FIRST and NULLS LAST too", () => {
    // BLOCKED: relation — unsafe-raw-sql feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for unsafe_raw_sql
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in unsafe-raw-sql.test.ts
    // PostgreSQL-only (type cast syntax `::text`); skip for in-memory adapter.
  });

  it("order: disallows invalid column name", async () => {
    await expect(async () => {
      await Post.order("REPLACE(title, 'misc', 'zzzz') asc").pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: disallows invalid direction", async () => {
    await expect(async () => {
      await Post.order({ title: "foo" } as any).pluck("id");
    }).rejects.toThrow();
  });

  it("order: disallows invalid column with direction", async () => {
    await expect(async () => {
      await Post.order({ "REPLACE(title, 'misc', 'zzzz')": "asc" }).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: always allows Arel", async () => {
    const titles = await Post.order(arelSql("length(title)")).pluck("title");
    expect(titles.length).toBeGreaterThan(0);
  });

  it("order: allows Arel.sql with binds", async () => {
    const idsExpected = await Post.order(arelSql("REPLACE(title, 'misc', 'zzzz'), id")).pluck("id");
    const ids = await Post.order([arelSql("REPLACE(title, ?, ?), id"), "misc", "zzzz"]).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: disallows invalid bind statement", async () => {
    await expect(async () => {
      await Post.order(["REPLACE(title, ?, ?), id", "misc", "zzzz"]).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: disallows invalid Array arguments", async () => {
    await expect(async () => {
      await Post.order(["author_id", "REPLACE(title, 'misc', 'zzzz')"]).pluck("id");
    }).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("order: allows valid Array arguments", async () => {
    const idsExpected = await Post.order(arelSql("author_id, length(title)")).pluck("id");
    const ids = await Post.order(["author_id", "length(title)"]).pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it.skip("order: allows valid arguments with COLLATE", () => {
    // BLOCKED: relation — unsafe-raw-sql feature gap
    // ROOT-CAUSE: relation.ts or abstract-adapter.ts missing Rails parity for unsafe_raw_sql
    // SCOPE: ~20–50 LOC fix in relation.ts or abstract-adapter.ts; affects ~1–2 tests in unsafe-raw-sql.test.ts
    // COLLATE syntax is adapter-specific.
  });

  it("order: allows nested functions", async () => {
    const idsExpected = await Post.order(arelSql("author_id, length(trim(title))")).pluck("id");
    const ids = await Post.order("author_id, length(trim(title))").pluck("id");
    expect(ids).toEqual(idsExpected);
  });

  it("order: disallows dangerous query method", async () => {
    let error: unknown;
    try {
      await Post.order("REPLACE(title, 'misc', 'zzzz')").pluck("id");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnknownAttributeReference);
    expect((error as UnknownAttributeReference).message).toMatch(
      /Dangerous query method.*called with non-attribute argument\(s\):/,
    );
  });

  it("pluck: allows string column name", async () => {
    const titlesExpected = await Post.pluck(arelSql("title"));
    const titles = await Post.pluck("title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows string column name with function and alias", async () => {
    const titlesExpected = await Post.pluck(arelSql("UPPER(title)"));
    const titles = await Post.pluck("UPPER(title) AS title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows symbol column name", async () => {
    const titlesExpected = await Post.pluck(arelSql("title"));
    const titles = await Post.pluck("title");
    expect(new Set(titles)).toEqual(new Set(titlesExpected));
  });

  it("pluck: allows multiple column names", async () => {
    const valuesExpected = await Post.pluck(arelSql("title"), arelSql("id"));
    const values = await Post.pluck("title", "id");
    expect(values).toEqual(valuesExpected);
  });

  it("pluck: allows column names with includes", async () => {
    const valuesExpected = await Post.pluck(arelSql("title"), arelSql("id"));
    const values = await Post.all().pluck("title", "id");
    expect(values).toEqual(valuesExpected);
  });

  it("pluck: allows auto-generated attributes", async () => {
    const values = await Post.pluck("tags_count");
    expect(values.length).toBeGreaterThan(0);
  });

  it("pluck: allows table and column names", async () => {
    const titlesExpected = await Post.pluck(arelSql("title"));
    const titles = await Post.pluck("posts.title");
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows quoted table and column names", async () => {
    const titlesExpected = await Post.pluck(arelSql("title"));
    const titles = await Post.pluck('"posts"."title"');
    expect(titles).toEqual(titlesExpected);
  });

  it("pluck: allows nested functions", async () => {
    const lengths = await Post.pluck("length(trim(title))");
    expect(lengths.length).toBeGreaterThan(0);
  });

  it("pluck: disallows invalid column name", async () => {
    await expect(Post.pluck("REPLACE(title, 'misc', 'zzzz')")).rejects.toBeInstanceOf(
      UnknownAttributeReference,
    );
  });

  it("pluck: disallows invalid column name amongst valid names", async () => {
    await expect(Post.pluck("title", "REPLACE(title, 'misc', 'zzzz')")).rejects.toBeInstanceOf(
      UnknownAttributeReference,
    );
  });

  it("pluck: disallows invalid column names with includes", async () => {
    await expect(
      Post.all().pluck("title", "REPLACE(title, 'misc', 'zzzz')"),
    ).rejects.toBeInstanceOf(UnknownAttributeReference);
  });

  it("pluck: rejects comma-separated column list in a single argument", async () => {
    // trails-specific guard: pluck("id, title") has ambiguous result mapping.
    // Pass each column as a separate argument instead: pluck("id", "title").
    await expect(Post.pluck("id, title")).rejects.toMatchObject({
      name: "ArgumentError",
      message: /pluck does not allow comma-separated/,
    });
  });

  it("pluck: always allows Arel", async () => {
    const expectedValues = (await Post.pluck("title")).map((title: unknown) => [
      title,
      (title as string).length,
    ]);
    const values = await Post.pluck("title", arelSql("length(title)"));
    expect(values).toEqual(expectedValues);
  });

  it("pluck: disallows dangerous query method", async () => {
    let error: unknown;
    try {
      await Post.pluck("title", "REPLACE(title, 'misc', 'zzzz')");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(UnknownAttributeReference);
    expect((error as UnknownAttributeReference).message).toMatch(
      /Dangerous query method.*called with non-attribute argument\(s\):/,
    );
  });
});
