/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/citext_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Table as ArelTable } from "@blazetrails/arel";
import { defineSchema } from "../../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../../test-helpers/use-handler-transactional-fixtures.js";
import { Base } from "../../index.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// The `citexts` table uses the PG-specific `citext` type, which isn't
// expressible via defineSchema. The table is created via raw DDL below;
// defineSchema({}) marks the file as TM-Phase-5 compliant.
setupHandlerSuite();
useHandlerTransactionalFixtures();

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeAll(async () => {
    adapter = Base.connection as PostgreSQLAdapter;
    await defineSchema({});
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS citext`);
    await adapter.exec(`DROP TABLE IF EXISTS citexts`);
    await adapter.exec(`CREATE TABLE citexts (id serial primary key, cival citext)`);
    await adapter.loadAdditionalTypes();
  });

  afterAll(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS citexts`);
    await adapter.exec(`DROP EXTENSION IF EXISTS citext CASCADE`);
  });
  describe("PostgresqlCitextTest", () => {
    it("citext enabled", async () => {
      expect(await adapter.extensionEnabled("citext")).toBe(true);
    });

    it("citext column", async () => {
      const cols = await adapter.columns("citexts");
      const col = cols.find((c) => c.name === "cival")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("citext");
      expect(col.sqlType).toBe("citext");
      expect((col as any).isArray()).toBe(false);
      expect(col.type).not.toBe("binary");
    });

    it("change table supports json", async () => {
      await adapter.changeTable("citexts", async (t) => {
        await t.column("username", "citext");
      });
      const cols = await adapter.columns("citexts");
      const col = cols.find((c) => c.name === "username")!;
      expect(col).toBeDefined();
      expect(col.type).toBe("citext");
    });

    it("write", async () => {
      class Citext extends Base {
        static tableName = "citexts";
      }
      await Citext.loadSchema();

      await Citext.createBang({ cival: "Some CI Text" } as any);
      const citext = (await Citext.first()) as any;
      expect(citext.cival).toBe("Some CI Text");

      citext.cival = "Some NEW CI Text";
      await citext.saveBang();
      await citext.reload();
      expect(citext.cival).toBe("Some NEW CI Text");
    });

    it("select case insensitive", async () => {
      await adapter.exec(`INSERT INTO citexts (cival) VALUES ('Cased Text')`);
      class Citext extends Base {
        static tableName = "citexts";
      }
      await Citext.loadSchema();

      const result = await (Citext as any).where({ cival: "cased text" }).first();
      expect(result).not.toBeNull();
      expect((result as any).cival).toBe("Cased Text");
    });

    it("case insensitiveness", async () => {
      const cols = await adapter.columns("citexts");
      adapter.schemaCache.setColumns("citexts", cols); // warm cache so columnForAttribute doesn't need pool
      const table = new ArelTable("citexts");
      const attr = table.get("cival");
      const comparison = await adapter.caseInsensitiveComparison(attr, null);
      const sql = adapter.arelVisitor.compile(comparison);
      expect(sql).not.toMatch(/lower/i);
    });

    it("schema dump with shorthand", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "citexts");
      expect(output).toMatch(/t\.citext\("cival"\)/);
    });
  });
});
