/**
 * Mirrors: activerecord/test/cases/view_test.rb
 *
 * Rails conditionally runs this entire file under `if supports_views?`.
 * SQLite, PostgreSQL, and MySQL all support views, so we run unconditionally.
 * The UpdateableViewTest block is guarded to non-SQLite adapters because
 * SQLite does not support DML (INSERT/UPDATE/DELETE) through views.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { adapterType } from "./test-adapter.js";
import { dumpTableSchema } from "./test-helpers/schema-dumping-helper.js";

// In Rails, AbstractAdapter includes SchemaStatements, so introspection
// methods (views, viewExists, tableExists, isDataSourceExists) live directly
// on the connection object. Cast once here; all helpers pass through.
function conn(): AbstractAdapter {
  return Base.connection as unknown as AbstractAdapter;
}

// Rails view tests create/drop views with raw execute, not schema statement
// helpers (create_view / drop_view don't exist in the vendored Rails source).
// Use conn().quoteTableName so the adapter's own quoting is used (backticks on
// MySQL, double-quotes on PG/SQLite) — mirrors Rails' quote_table_name(name).
async function createView(name: string, sql: string): Promise<void> {
  await conn().executeMutation(`CREATE VIEW ${conn().quoteTableName(name)} AS ${sql}`);
}
async function dropView(name: string): Promise<void> {
  if (await conn().viewExists(name)) {
    await conn().executeMutation(`DROP VIEW ${conn().quoteTableName(name)}`);
  }
}

// ---------------------------------------------------------------------------
// ViewWithPrimaryKeyTest
// ---------------------------------------------------------------------------
describe("ViewWithPrimaryKeyTest", () => {
  const { books } = useHandlerFixtures(["books", "authors"], { schema: canonicalSchema });

  class Ebook extends Base {
    static override _tableName = "ebooks'";
    static override _primaryKey = "id";
  }

  beforeAll(async () => {
    await createView("ebooks'", `SELECT id, name, cover, status FROM books WHERE format = 'ebook'`);
    await Ebook.loadSchema();
  });

  afterAll(async () => {
    await dropView("ebooks'");
  });

  it("reading", async () => {
    const ebookRecords = await Ebook.all();
    expect(ebookRecords.map((b: any) => b.id)).toEqual([books("rfr").id]);
    expect(ebookRecords.map((b: any) => b.name)).toEqual(["Ruby for Rails"]);
  });

  it("views", async () => {
    expect(await conn().views()).toEqual([Ebook._tableName]);
  });

  it("view exists", async () => {
    expect(await conn().viewExists(Ebook._tableName)).toBe(true);
  });

  it("table exists", async () => {
    expect(await conn().tableExists(Ebook._tableName)).toBe(false);
  });

  it("views ara valid data sources", async () => {
    expect(await conn().isDataSourceExists(Ebook._tableName)).toBe(true);
  });

  it("column definitions", async () => {
    expect(Ebook.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["id", "integer"],
      ["name", "string"],
      ["cover", "string"],
      ["status", "integer"],
    ]);
  });

  it("attributes", async () => {
    const ebook = await Ebook.first();
    expect((ebook as any).attributes).toEqual({
      id: 2,
      name: "Ruby for Rails",
      cover: "hard",
      status: 0,
    });
  });

  it.skip("does not assume id column as primary key", () => {
    // BLOCKED: primary-key detection — our default pk is "id"; detecting nil
    // requires schema-based reset_primary_key (queries PRAGMA table_info for pk=0).
  });

  it("does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "ebooks'");
    expect(schema).not.toMatch(/create_table "ebooks'"/);
  });
});

// ---------------------------------------------------------------------------
// ViewWithoutPrimaryKeyTest
// ---------------------------------------------------------------------------
describe("ViewWithoutPrimaryKeyTest", () => {
  const { books } = useHandlerFixtures(["books", "authors"], { schema: canonicalSchema });

  class Paperback extends Base {
    static override _tableName = "paperbacks";
  }

  beforeAll(async () => {
    await createView("paperbacks", `SELECT name, status FROM books WHERE format = 'paperback'`);
    await Paperback.loadSchema();
  });

  afterAll(async () => {
    await dropView("paperbacks");
  });

  it("reading", async () => {
    const records = await Paperback.all();
    expect(records.map((b: any) => b.name)).toEqual([books("awdr").name]);
  });

  it("views", async () => {
    expect(await conn().views()).toEqual([Paperback._tableName]);
  });

  it("view exists", async () => {
    expect(await conn().viewExists(Paperback._tableName)).toBe(true);
  });

  it("table exists", async () => {
    expect(await conn().tableExists(Paperback._tableName)).toBe(false);
  });

  it("column definitions", async () => {
    expect(Paperback.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["name", "string"],
      ["status", "integer"],
    ]);
  });

  it("attributes", async () => {
    const record = await Paperback.first();
    expect((record as any).attributes).toEqual({
      name: "Agile Web Development with Rails",
      status: 2,
    });
  });

  it.skip("does not have a primary key", () => {
    // BLOCKED: primary-key detection — see ViewWithPrimaryKeyTest note.
  });

  it("does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "paperbacks");
    expect(schema).not.toMatch(/create_table "paperbacks"/);
  });
});

// ---------------------------------------------------------------------------
// UpdateableViewTest — MySQL/PG only (SQLite views do not support DML)
// ---------------------------------------------------------------------------
describe("UpdateableViewTest", () => {
  const { books } = useHandlerFixtures(["books", "authors"], { schema: canonicalSchema });

  class PrintedBook extends Base {
    static override _tableName = "printed_books";
    static override _primaryKey = "id";
  }

  beforeAll(async () => {
    if (adapterType === "sqlite") return;
    await createView(
      "printed_books",
      `SELECT id, name, status, format FROM books WHERE format = 'paperback'`,
    );
    await PrintedBook.loadSchema();
  });

  afterAll(async () => {
    if (adapterType === "sqlite") return;
    await dropView("printed_books");
  });

  it.skipIf(adapterType === "sqlite")("update record", async () => {
    const book = await PrintedBook.find(books("awdr").id);
    (book as any).name = "AWDwR";
    await (book as any).save();
    await (book as any).reload();
    expect((book as any).name).toBe("AWDwR");
  });

  it.skipIf(adapterType === "sqlite")("insert record", async () => {
    await PrintedBook.create({ name: "Rails in Action", status: 0, format: "paperback" });
    const newBook = await PrintedBook.last();
    expect((newBook as any).name).toBe("Rails in Action");
  });

  // Rails: only runs on PostgreSQL (and SQLite) with supports_insert_returning?.
  // The outer UpdateableViewTest block already excludes SQLite, leaving PG only.
  it.skipIf(adapterType !== "postgres")("insert record populates primary key", async () => {
    const book = await PrintedBook.create({
      name: "Rails in Action",
      status: 0,
      format: "paperback",
    });
    expect((book as any).id).not.toBeNull();
    expect((book as any).id).toBeGreaterThan(0);
  });

  it.skipIf(adapterType === "sqlite")("update record to fail view conditions", async () => {
    const book = await PrintedBook.find(books("awdr").id);
    (book as any).format = "ebook";
    await (book as any).save();
    await expect((book as any).reload()).rejects.toThrow();
  });
});
