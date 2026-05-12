/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/virtual_column_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let VirtualColumn: any;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS virtual_columns`);
    await (adapter as any).createTable("virtual_columns", { force: true }, (t: any) => {
      t.string("name");
      t.column("upper_name", "virtual", {
        type: "string",
        as: "UPPER(name)",
        stored: true,
      });
      t.column("name_length", "virtual", {
        type: "integer",
        as: "LENGTH(name)",
        stored: true,
      });
      t.column("name_octet_length", "virtual", {
        type: "integer",
        as: "OCTET_LENGTH(name)",
        stored: true,
      });
      t.integer("column1");
      t.column("column2", "virtual", {
        type: "integer",
        as: "column1 + 1",
        stored: true,
      });
    });
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

    it("virtual column", async () => {
      const column = VirtualColumn.columnsHash["upper_name"];
      expect(column.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.upper_name).toBe("RAILS");
    });

    it("stored column", async () => {
      const column = VirtualColumn.columnsHash["name_length"];
      expect(column.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.name_length).toBe(5);
    });

    it("change table", async () => {
      await adapter.changeTable("virtual_columns", (t: any) => {
        t.column("lower_name", "virtual", {
          type: "string",
          as: "LOWER(name)",
          stored: true,
        });
      });
      VirtualColumn.resetColumnInformation();
      await VirtualColumn.loadSchema();
      const column = VirtualColumn.columnsHash["lower_name"];
      expect(column.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.lower_name).toBe("rails");
    });

    it("non persisted column", async () => {
      await expect(
        adapter.changeTable("virtual_columns", (t: any) => {
          t.column("invalid_definition", "virtual", {
            type: "string",
            as: "LOWER(name)",
          });
        }),
      ).rejects.toThrow(/does not support VIRTUAL.*Specify 'stored: true'/s);
    });

    it("schema dumping", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "virtual_columns");
      expect(output).toMatch(
        /t\.virtual\s+"upper_name",\s+type: :string,\s+as: "upper\(\(name\)::text\)", stored: true/i,
      );
      expect(output).toMatch(
        /t\.virtual\s+"name_length",\s+type: :integer,\s+as: "length\(\(name\)::text\)", stored: true/i,
      );
      expect(output).toMatch(
        /t\.virtual\s+"name_octet_length",\s+type: :integer,\s+as: "octet_length\(\(name\)::text\)", stored: true/i,
      );
      expect(output).toMatch(
        /t\.virtual\s+"column2",\s+type: :integer,\s+as: "\(column1 \+ 1\)", stored: true/i,
      );
    });

    it.skip("build fixture sql", () => {
      // BLOCKED: fixtures — FixtureSet.createFixtures not ported
      // ROOT-CAUSE: ActiveRecord::FixtureSet not implemented in @blazetrails/activerecord
      // SCOPE: cross-cutting fixtures port; affects many tests
    });
  });
});
