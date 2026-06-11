import { afterEach, beforeEach, expect, it } from "vitest";
import { describeIfPg, PG_TEST_URL, PostgreSQLAdapter } from "./test-helper.js";
import type { TableDefinition as PgTableDefinition } from "../../connection-adapters/postgresql/schema-definitions.js";

let adapter: PostgreSQLAdapter;

describeIfPg("PostgreSQL adapter PG-only column types", () => {
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS hstore`);
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS citext`);
  });

  afterEach(async () => {
    await adapter.dropTable("ds_pg_types", "ds_pg_array", { ifExists: true });
    await adapter.close();
  });

  it("round-trips citext, hstore, uuid, interval, and oid columns", async () => {
    await adapter.createTable("ds_pg_types", { force: true }, (t) => {
      const td = t as PgTableDefinition;
      td.citext("col_citext");
      td.hstore("col_hstore");
      td.uuid("col_uuid");
      td.interval("col_interval");
      td.oid("col_oid");
    });

    await adapter.executeMutation(
      `INSERT INTO "ds_pg_types" ("col_citext","col_hstore","col_uuid","col_interval","col_oid") ` +
        `VALUES ('FooBar', 'a=>1,b=>2', '11111111-1111-1111-1111-111111111111', ` +
        `'1 day'::interval, 42)`,
    );

    const rows = (await adapter.execute(
      `SELECT col_citext, col_uuid, col_oid FROM "ds_pg_types"`,
    )) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]["col_citext"]).toBe("FooBar");
    expect(rows[0]["col_uuid"]).toBe("11111111-1111-1111-1111-111111111111");
    expect(Number(rows[0]["col_oid"])).toBe(42);
  });

  it("creates array columns when array:true is set", async () => {
    await adapter.createTable("ds_pg_array", { force: true }, (t) => {
      t.integer("tags", { array: true });
      t.string("labels", { array: true });
    });

    await adapter.executeMutation(
      `INSERT INTO "ds_pg_array" ("tags","labels") VALUES ('{1,2,3}', '{"a","b"}')`,
    );
    const rows = (await adapter.execute(`SELECT tags, labels FROM "ds_pg_array"`)) as Array<
      Record<string, unknown>
    >;
    expect(rows).toHaveLength(1);
    expect(rows[0]["tags"]).toEqual([1, 2, 3]);
    expect(rows[0]["labels"]).toEqual(["a", "b"]);
  });
});
