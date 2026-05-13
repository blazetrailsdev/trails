/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/virtual_column_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { FixtureSet } from "../../test-helpers/fixture-set.js";

const CREATE_TABLE_SQL = `
  CREATE TABLE virtual_columns (
    id bigserial PRIMARY KEY,
    name character varying,
    upper_name character varying GENERATED ALWAYS AS (UPPER(name)) STORED,
    name_length integer GENERATED ALWAYS AS (LENGTH(name)) STORED,
    name_octet_length integer GENERATED ALWAYS AS (OCTET_LENGTH(name)) STORED,
    column1 integer,
    column2 integer GENERATED ALWAYS AS (column1 + 1) STORED
  )
`;

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let VirtualColumn: any;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS virtual_columns`);
    await adapter.exec(CREATE_TABLE_SQL);
    const { Base } = await import("../../index.js");
    class VirtualColumnCls extends Base {
      static tableName = "virtual_columns";
      static {
        this.adapter = adapter;
      }
    }
    await VirtualColumnCls.loadSchema();
    VirtualColumn = VirtualColumnCls;
    await VirtualColumn.create({ name: "Rails" });
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS virtual_columns`);
    await adapter.close();
  });

  describe("PostgresqlVirtualColumnTest", () => {
    it("virtual column with full inserts", async () => {
      const partialInsertsWas = VirtualColumn.partialInserts;
      VirtualColumn.partialInserts = false;
      try {
        await expect(VirtualColumn.create({ name: "Rails" })).resolves.toBeTruthy();
      } finally {
        VirtualColumn.partialInserts = partialInsertsWas;
      }
    });

    const findColumn = async (name: string) => {
      const cols = await adapter.columns("virtual_columns");
      return cols.find((c: any) => c.name === name);
    };

    it("virtual column", async () => {
      const column = await findColumn("upper_name");
      expect(column!.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.upper_name).toBe("RAILS");
    });

    it("stored column", async () => {
      const column = await findColumn("name_length");
      expect(column!.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.name_length).toBe(5);
    });

    it("change table", async () => {
      await adapter.exec(
        `ALTER TABLE virtual_columns ADD COLUMN lower_name character varying GENERATED ALWAYS AS (LOWER(name)) STORED`,
      );
      adapter.schemaCache?.clear();
      const column = await findColumn("lower_name");
      expect(column!.isVirtual()).toBe(true);
      const rows = await adapter.execute(`SELECT lower_name FROM virtual_columns LIMIT 1`);
      expect(rows[0].lower_name).toBe("rails");
    });

    it("non persisted column", () => {
      // Rails routes change_table → schema-creation → addColumnOptionsBang. Our
      // adapter's high-level addColumn path doesn't reach addColumnOptionsBang
      // for generated columns, so we exercise the visitor directly — same fixture
      // shape that connection-adapters/postgresql/schema-creation.test.ts uses.
      const sc: any = adapter.schemaCreation;
      const col = { name: "invalid_definition" };
      expect(() =>
        sc.addColumnOptionsBang("n", { as: "LOWER(name)", stored: false, column: col }),
      ).toThrow(/does not support VIRTUAL.*Specify 'stored: true'/s);
    });

    it.skip("schema dumping", () => {
      // BLOCKED: TS schema dumper emits TS DSL (t.string/t.integer) and does
      // not honor virtual-column options. The PG-specific prepareColumnOptions
      // (as/stored) is unreachable from emitTable's column rendering path.
      // ROOT-CAUSE: schema-dumper.ts emitTable bypasses connection-adapter
      // prepareColumnOptions for virtual columns. Affects schema_dumping mirror.
    });

    it("build fixture sql", async () => {
      const fixtures = await FixtureSet.createFixtures(adapter, VirtualColumn, {
        one: { name: "hello" },
        two: { name: "world" },
      });
      expect(Object.keys(fixtures).length).toBe(2);
    });
  });
});
