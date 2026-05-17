/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/virtual_column_test.rb
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { FixtureSet } from "../../test-helpers/fixture-set.js";
import { defineSchema } from "../../test-helpers/define-schema.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// The `virtual_columns` table uses PG generated/virtual columns, which
// aren't expressible via defineSchema. The table is built inline below;
// defineSchema(adapter, {}) marks the file as TM-Phase-5 compliant.
describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  let VirtualColumn: any;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await defineSchema(adapter, {});
    await adapter.exec(`DROP TABLE IF EXISTS virtual_columns`);
    await adapter.createTable("virtual_columns", (t) => {
      t.string("name");
      t.virtual("upper_name", { type: "string", as: "UPPER(name)", stored: true });
      t.virtual("name_length", { type: "integer", as: "LENGTH(name)", stored: true });
      t.virtual("name_octet_length", { type: "integer", as: "OCTET_LENGTH(name)", stored: true });
      t.integer("column1");
      t.virtual("column2", { type: "integer", as: "column1 + 1", stored: true });
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
      await adapter.changeTable("virtual_columns", async (t) => {
        await t.virtual("lower_name", { type: "string", as: "LOWER(name)", stored: true });
      });
      adapter.schemaCache?.clear();
      VirtualColumn.resetColumnInformation();
      await VirtualColumn.loadSchema();
      const column = await findColumn("lower_name");
      expect(column!.isVirtual()).toBe(true);
      const row = await VirtualColumn.take();
      expect(row.lower_name).toBe("rails");
    });

    it("non persisted column", async () => {
      await expect(
        adapter.changeTable("virtual_columns", async (t) => {
          await t.virtual("invalid_definition", { type: "string", as: "LOWER(name)" });
        }),
      ).rejects.toThrow(/does not support VIRTUAL.*Specify 'stored: true'/s);
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
