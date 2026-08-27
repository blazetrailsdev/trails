import { it, expect } from "vitest";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";

function copyTable(conn: any, from: string, to: string, options: Record<string, unknown> = {}) {
  return conn.copyTable(from, to, { temporary: true, ...options });
}

async function columnNames(conn: any, table: string): Promise<unknown[]> {
  const structure = await conn.tableStructure(table);
  return structure.map((column: Record<string, unknown>) => column["name"]);
}

async function columnValues(conn: any, table: string, column: string): Promise<unknown[]> {
  const rows = await conn.execute(`SELECT ${column} FROM ${table} ORDER BY id`);
  return rows.map((row: Record<string, unknown>) => row[column]);
}

async function tableIndexesWithoutName(conn: any, table: string): Promise<unknown> {
  const indexes = await conn.indexes(table);
  const at = indexes.indexOf("name");
  if (at === -1) return null;
  indexes.splice(at, 1);
  return "name";
}

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
  } catch {}
}

describeIfSqlite("CopyTableTest", () => {
  fixtures(["customers"]);

  it("copy table", async () => {
    await testCopyTable((await Base.leaseConnection()) as any);
  });

  it("copy table with column with default", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(conn, "comments", "comments_with_default", {}, async () => {
      await conn.addColumn("comments_with_default", "options", "json", { default: {} });
      await testCopyTable(conn, "comments_with_default", "comments_with_default2", {}, async () => {
        const columns = await conn.columns("comments_with_default2");
        const column = columns.find((col: { name: string }) => col.name === "options");
        expect(column.default).toEqual("{}");
      });
    });
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
        expect(expected.some((v) => v !== null && v !== undefined && v !== false)).toBe(true);
      },
    );
  });

  it("copy table allows to pass options to create table", async () => {
    const conn = (await Base.leaseConnection()) as any;
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

  it("copy table with id col that is not primary key", async () => {
    const conn = (await Base.leaseConnection()) as any;
    await testCopyTable(conn, "goofy_string_id", "goofy_string_id2", {}, async () => {
      const originalId = (await conn.columns("goofy_string_id")).find(
        (col: any) => col.name === "id",
      );
      const copiedId = (await conn.columns("goofy_string_id2")).find(
        (col: any) => col.name === "id",
      );
      expect(copiedId.type).toEqual(originalId.type);
      expect(copiedId.sqlType).toEqual(originalId.sqlType);
      expect(originalId.limit).toBeNull();
      expect(copiedId.limit).toBeNull();
    });
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
      } catch {}
    }
  });
});
