/**
 * Mirrors: activerecord/test/cases/view_test.rb
 *
 * Rails conditionally runs this entire file under `if supports_views?`.
 * SQLite, PostgreSQL, and MySQL all support views, so we run unconditionally.
 * The UpdateableViewTest block is guarded to non-SQLite adapters because
 * SQLite does not support DML (INSERT/UPDATE/DELETE) through views.
 */
import { describe, expect, beforeAll, afterAll } from "vitest";
import { Base } from "./index.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";
import { adapterType } from "./test-adapter.js";
import { describeIfSupports, itIfSupports } from "./support/supports.js";
import { dumpTableSchema } from "./support/schema-dumping-helper.js";

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

// Force-recreate `books`/`authors` to the canonical shape before each suite's
// view is created. The tables come from the template clone and nothing else
// recreates them, so whatever reduced `books` shape (no `cover`/`status`) a sibling
// handler-suite file co-scheduled earlier in the same fork left in the shared
// worker DB. The `CREATE VIEW … SELECT cover, status FROM books` below then fails
// with "Unknown column" on MySQL. This drops + recreates unconditionally.
// Register this AFTER the fixtures hook so it runs last and wins, and BEFORE the
// view-creating `beforeAll` so the columns the view references exist.
async function rebuildBooksTables(): Promise<void> {
  await rebuildCanonicalTables(Base.connection, ["authors", "books"]);
}

// ---------------------------------------------------------------------------
// ViewWithPrimaryKeyTest
// ---------------------------------------------------------------------------
// Rails defines these tests in the `ViewBehavior` concern, which is mixed into
// `ViewWithPrimaryKeyTest` — a class that sits under `if …supports_views?`. The
// gate extractor now propagates that `views` feature gate to the module's tests,
// so gate this suite the same way (all adapters support views, so it gates
// nothing at runtime — it keeps the gate-fidelity match with Rails).
describeIfSupports("views", "ViewWithPrimaryKeyTest", () => {
  const { books } = fixtures(["books", "authors"]);

  class Ebook extends Base {
    static override _tableName = "ebooks'";
    static override _primaryKey = "id";
  }

  beforeAll(rebuildBooksTables);

  beforeAll(async () => {
    await dropView("ebooks'");
    await createView("ebooks'", `SELECT id, name, cover, status FROM books WHERE format = 'ebook'`);
    await Ebook.loadSchema();
  });

  afterAll(async () => {
    await dropView("ebooks'");
  });

  itIfSupports("views", "reading", async () => {
    const ebookRecords = await Ebook.all();
    expect(ebookRecords.map((b: any) => b.id)).toEqual([books("rfr").id]);
    expect(ebookRecords.map((b: any) => b.name)).toEqual(["Ruby for Rails"]);
  });

  itIfSupports("views", "views", async () => {
    expect(await conn().views()).toEqual([Ebook._tableName]);
  });

  itIfSupports("views", "view exists", async () => {
    expect(await conn().viewExists(Ebook._tableName)).toBe(true);
  });

  itIfSupports("views", "table exists", async () => {
    expect(await conn().tableExists(Ebook._tableName)).toBe(false);
  });

  itIfSupports("views", "views ara valid data sources", async () => {
    expect(await conn().isDataSourceExists(Ebook._tableName)).toBe(true);
  });

  itIfSupports("views", "column definitions", async () => {
    expect(Ebook.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["id", "integer"],
      ["name", "string"],
      ["cover", "string"],
      ["status", "integer"],
    ]);
  });

  itIfSupports("views", "attributes", async () => {
    const ebook = await Ebook.first();
    const ebookAttrs = (ebook as any).attributes;
    expect({ ...ebookAttrs, id: Number(ebookAttrs.id) }).toEqual({
      id: 2,
      name: "Ruby for Rails",
      cover: "hard",
      status: 0,
    });
  });

  itIfSupports("views", "does not assume id column as primary key", async () => {
    class Model extends Base {
      static override _tableName = "ebooks'";
    }
    // Rails resolves `primary_key` synchronously via the connection's schema
    // cache; our sync resolver reads only what's already cached, so warm it
    // first (the async analogue of Ruby's lazy schema_cache.primary_keys query).
    await Model.loadSchema();
    expect(Model.primaryKey).toBeNull();
  });

  itIfSupports("views", "does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "ebooks'");
    // TS schema DSL: ctx.createTable("ebooks'", ...) — not the Ruby create_table form
    expect(schema).not.toMatch(/ctx\.createTable\("ebooks'"/);
  });
});

// ---------------------------------------------------------------------------
// ViewWithoutPrimaryKeyTest
// ---------------------------------------------------------------------------
// Rails sets `self.use_transactional_tests = false` on this class
// (vendor/rails/activerecord/test/cases/view_test.rb:100).
describeIfSupports("views", "ViewWithoutPrimaryKeyTest", () => {
  const { books } = fixtures(["books", "authors"], {
    useTransactionalTests: false,
  });

  class Paperback extends Base {
    static override _tableName = "paperbacks";
  }

  beforeAll(rebuildBooksTables);

  beforeAll(async () => {
    await dropView("paperbacks");
    await createView("paperbacks", `SELECT name, status FROM books WHERE format = 'paperback'`);
    await Paperback.loadSchema();
  });

  afterAll(async () => {
    await dropView("paperbacks");
  });

  // Rails defines these tests directly inside `ViewWithoutPrimaryKeyTest`, which
  // sits textually under `if supports_views?` — so they carry a `views` feature
  // gate. All adapters support views, so this gates nothing at runtime; it keeps
  // the gate-fidelity match with Rails.
  itIfSupports("views", "reading", async () => {
    const records = await Paperback.all();
    expect(records.map((b: any) => b.name)).toEqual([books("awdr").name]);
  });

  itIfSupports("views", "views", async () => {
    expect(await conn().views()).toEqual([Paperback._tableName]);
  });

  itIfSupports("views", "view exists", async () => {
    expect(await conn().viewExists(Paperback._tableName)).toBe(true);
  });

  itIfSupports("views", "table exists", async () => {
    expect(await conn().tableExists(Paperback._tableName)).toBe(false);
  });

  itIfSupports("views", "column definitions", async () => {
    expect(Paperback.columns().map((c: any) => [c.name, c.type])).toEqual([
      ["name", "string"],
      ["status", "integer"],
    ]);
  });

  itIfSupports("views", "attributes", async () => {
    const record = await Paperback.first();
    expect((record as any).attributes).toEqual({
      name: "Agile Web Development with Rails",
      status: 2,
    });
  });

  itIfSupports("views", "does not have a primary key", () => {
    expect(Paperback.primaryKey).toBeNull();
  });

  itIfSupports("views", "does not dump view as table", async () => {
    const schema = await dumpTableSchema(conn() as any, "paperbacks");
    // TS schema DSL: ctx.createTable("paperbacks", ...) — not the Ruby create_table form
    expect(schema).not.toMatch(/ctx\.createTable\("paperbacks"/);
  });
});

// ---------------------------------------------------------------------------
// UpdateableViewTest — MySQL/PG only (SQLite views do not support DML)
// ---------------------------------------------------------------------------
// Rails sets `self.use_transactional_tests = false` here because DML through
// views must commit to be visible across connections. The transactional
// fixtures path wraps each test in a savepoint; on MySQL a different pool
// connection for PrintedBook.last() cannot see the uncommitted row. Mirror
// Rails by passing `useTransactionalTests: false` to fixtures() (per-test
// delete/reseed via beforeEach/afterEach, committed DML, no savepoint).
describe("UpdateableViewTest", () => {
  const { books } = fixtures(["books", "authors"], {
    useTransactionalTests: false,
  });

  class PrintedBook extends Base {
    static override _tableName = "printed_books";
    static override _primaryKey = "id";
  }

  beforeAll(rebuildBooksTables);

  beforeAll(async () => {
    if (adapterType === "sqlite") return;
    await dropView("printed_books");
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

  itIfSupports.skipIf(adapterType === "sqlite")("views", "update record", async () => {
    const book = await PrintedBook.find(books("awdr").id);
    (book as any).name = "AWDwR";
    await (book as any).saveBang();
    await (book as any).reload();
    expect((book as any).name).toBe("AWDwR");
  });

  // Rails gates this `features=[views]` (runs on mysql + postgresql; SQLite views
  // do not support DML).
  itIfSupports.skipIf(adapterType === "sqlite")("views", "insert record", async () => {
    await PrintedBook.createBang({ name: "Rails in Action", status: 0, format: "paperback" });
    const newBook = await PrintedBook.last();
    expect((newBook as any).name).toBe("Rails in Action");
  });

  // Rails gates this `current_adapter?(:PostgreSQLAdapter, :SQLite3Adapter) &&
  // supports_insert_returning?` (view_test.rb:197) — the MySQL family is excluded
  // by name, and rightly so: a MariaDB view reports no `auto_increment` Extra for
  // the base table's key (SHOW FULL FIELDS), so the column is not auto-populated,
  // no RETURNING column is requested, and LAST_INSERT_ID() through a view is 0.
  // SQLite is excluded on top of Rails by the outer view block (trails creates no
  // view on that lane). Both features are carried so the extracted gate keeps
  // `insert_returning,views`.
  itIfSupports.skipIf(adapterType === "sqlite" || adapterType === "mysql")(
    "insert_returning,views",
    "insert record populates primary key",
    async () => {
      const book = await PrintedBook.createBang({
        name: "Rails in Action",
        status: 0,
        format: "paperback",
      });
      expect((book as any).id).not.toBeNull();
      expect((book as any).id).toBeGreaterThan(0);
    },
  );

  itIfSupports.skipIf(adapterType === "sqlite")(
    "views",
    "update record to fail view conditions",
    async () => {
      const book = await PrintedBook.find(books("awdr").id);
      (book as any).format = "ebook";
      await (book as any).saveBang();
      await expect((book as any).reload()).rejects.toThrow();
    },
  );
});
