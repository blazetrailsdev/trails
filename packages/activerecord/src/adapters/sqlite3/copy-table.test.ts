/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/copy_table_test.rb
 */
import { it, expect } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "./test-helper.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-helpers/fixtures.js";

// Rails calls the private `copy_table` with `{ temporary: true }.merge(options)`.
function copyTable(conn: any, from: string, to: string, options: Record<string, unknown> = {}) {
  return conn.copyTable(from, to, { temporary: true, ...options });
}

// Rails: table_structure(table).map { |column| column["name"] }
async function columnNames(conn: any, table: string): Promise<unknown[]> {
  const structure = await conn.tableStructure(table);
  return structure.map((column: Record<string, unknown>) => column["name"]);
}

// Rails: select_all("SELECT #{column} FROM #{table} ORDER BY id").map { |row| row[column] }
async function columnValues(conn: any, table: string, column: string): Promise<unknown[]> {
  const rows = await conn.execute(`SELECT ${column} FROM ${table} ORDER BY id`);
  return rows.map((row: Record<string, unknown>) => row[column]);
}

// Rails: indexes(table).delete(:name). Ruby's Array#delete returns the deleted
// element or nil; no IndexDefinition equals the symbol :name, so this is always
// nil — mirror that exactly.
async function tableIndexesWithoutName(conn: any, table: string): Promise<unknown> {
  const indexes = await conn.indexes(table);
  const at = indexes.indexOf("name");
  if (at === -1) return null;
  indexes.splice(at, 1);
  return "name";
}

// Rails: select_one("SELECT COUNT(*) AS count FROM #{table}")["count"]
async function rowCount(conn: any, table: string): Promise<unknown> {
  const rows = await conn.execute(`SELECT COUNT(*) AS count FROM ${table}`);
  return rows[0]["count"];
}

async function testCopyTable(
  conn: any,
  from = "customers",
  to = "customers2",
  options: Record<string, unknown> = {},
  block?: (from: string, to: string, options: Record<string, unknown>) => void | Promise<void>,
): Promise<void> {
  let raised: unknown;
  try {
    await copyTable(conn, from, to, options);
  } catch (e) {
    raised = e;
  }
  expect(raised).toBeUndefined();
  expect(await rowCount(conn, to)).toEqual(await rowCount(conn, from));

  if (block) {
    await block(from, to, options);
  } else {
    expect(await columnNames(conn, to)).toEqual(await columnNames(conn, from));
  }

  try {
    await conn.dropTable(to);
  } catch {
    // rescue nil
  }
}

// -- Rails test class: copy_table_test.rb (ActiveRecord::SQLite3TestCase) --
// `copy_table` and `table_structure` are SQLite-specific private adapter methods
// and the assertions probe SQLite identifier quoting / PRAGMA structure, so this
// must skip when the handler connection is PG/MySQL in the CI matrix.
describeIfSqlite("CopyTableTest", () => {
  // Rails `fixtures :customers`. The canonical tables — including the
  // copy_table source tables (comments, owners, …) — come from the template
  // clone.
  fixtures(["customers"]);

  it("copy table", async () => {
    await testCopyTable((await Base.leaseConnection()) as any);
  });

  it.skip("copy table with column with default", () => {
    // BLOCKED: adapter-sqlite — a `json` column added with `default: {}` quotes
    // its default via String({}) → "[object Object]" instead of serializing the
    // value to JSON "{}", so the copied column's default mismatches Rails.
    // ROOT-CAUSE: the json type's default serialization is not applied on the
    // addColumn DEFAULT path for SQLite.
    // SCOPE: serialize structured defaults through the column type before
    // quoting; file sqlite3-json-default-serialization.
  });

  it("copy table renaming column", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(
      conn,
      "customers",
      "customers2",
      { rename: { name: "person_name" } },
      async (from, to) => {
        const expected = await columnValues(conn, from, "name");
        expect(await columnValues(conn, to, "person_name")).toEqual(expected);
        // Rails `assert_predicate expected, :any?`: Ruby's blockless `any?` is
        // truthy for everything except nil/false, so 0/"" count as present.
        expect(expected.some((v) => v !== null && v !== undefined && v !== false)).toBe(true);
      },
    );
  });

  it("copy table allows to pass options to create table", async () => {
    const conn = (await Base.leaseConnection()) as any;
    // testCopyTable drops `blocker_table` (its `to`) at the end, mirroring Rails.
    // eslint-disable-next-line blazetrails/require-table-teardown
    await conn.createTable("blocker_table");
    await testCopyTable(conn, "customers", "blocker_table", { force: true });
  });

  it("copy table with index", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(conn, "comments", "comments_with_index", {}, async () => {
      await conn.addIndex("comments_with_index", ["post_id", "type"]);
      await testCopyTable(conn, "comments_with_index", "comments_with_index2", {}, async () => {
        expect(await tableIndexesWithoutName(conn, "comments_with_index")).toBeNull();
        expect(await tableIndexesWithoutName(conn, "comments_with_index2")).toBeNull();
      });
    });
  });

  it("copy table without primary key", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(conn, "developers_projects", "programmers_projects", {}, async () => {
      expect(await conn.primaryKey("programmers_projects")).toBeNull();
    });
  });

  it.skip("copy table with id col that is not primary key", () => {
    // BLOCKED: schema-emission — the canonical `goofy_string_id.id` string column
    // is emitted as `varchar(255)`, so its introspected `limit` is 255 where
    // Rails' bare `t.string` carries no limit (nil). The test asserts both the
    // original and copied id columns have a nil limit.
    // ROOT-CAUSE: defineSchema/SQLite type-mapping appends the default 255 limit
    // to unbounded string columns; Rails' sqlite3 string maps to `varchar`
    // without a length.
    // SCOPE: drop the implicit 255 limit on unbounded string columns for SQLite;
    // file sqlite3-string-column-no-default-limit.
  });

  it("copy table with unconventional primary key", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(conn, "owners", "owners_unconventional", {}, async () => {
      const originalPk = await conn.primaryKey("owners");
      const copiedPk = await conn.primaryKey("owners_unconventional");
      expect(copiedPk).toEqual(originalPk);
    });
  });

  it("copy table with binary column", async () => {
    await testCopyTable((await Base.leaseConnection()) as any, "binaries", "binaries2");
  });

  it("copy table with virtual column", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await conn.createTable("virtual_columns", { force: true }, (t: any) => {
      t.string("name");
      t.virtual("upper_name", { type: "string", as: "UPPER(name)", stored: true });
    });

    try {
      await testCopyTable(conn, "virtual_columns", "virtual_columns2", {}, async () => {
        const columns = await conn.columns("virtual_columns2");
        const column = columns.find((col: any) => col.name === "upper_name");
        expect(column.isVirtualStored()).toBe(true);
        expect(column.type).toBe("string");
        expect(column.defaultFunction).toBe("UPPER(name)");
      });
    } finally {
      try {
        await conn.dropTable("virtual_columns");
      } catch {
        // rescue nil
      }
    }
  });
});
