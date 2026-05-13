/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/citext_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Table as ArelTable } from "@blazetrails/arel";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`CREATE EXTENSION IF NOT EXISTS citext`);
    await adapter.exec(`DROP TABLE IF EXISTS citexts`);
    await adapter.exec(`CREATE TABLE citexts (id serial primary key, cival citext)`);
    await adapter.loadAdditionalTypes();
  });

  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS citexts`);
    await adapter.exec(`DROP EXTENSION IF EXISTS citext CASCADE`);
    await adapter.close();
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
      expect((col as any).isArray?.()).toBe(false);
      expect(col.type).not.toBe("binary");
    });

    it.skip("citext default", async () => {
      // BLOCKED: schema-statements — addColumn with citext default not yet verified
      // ROOT-CAUSE: no Rails test covers citext column defaults; this test has no Rails equivalent
      //   in citext_test.rb. Skip until a concrete gap surfaces.
      // SCOPE: none identified
    });

    it.skip("citext type cast", async () => {
      // BLOCKED: type-cast — no Rails test for citext type casting in citext_test.rb
      // ROOT-CAUSE: citext is a SpecializedString; cast is identical to string. No distinct Rails
      //   test covers this — the name was generated from the annotation template, not Rails source.
      // SCOPE: none identified
    });

    it.skip("case insensitive where", async () => {
      // BLOCKED: ActiveRecord query — Model.where(cival: "...") case-insensitive via citext
      // ROOT-CAUSE: no distinct Rails test in citext_test.rb for this name; covered by
      //   "select case insensitive" (test_select_case_insensitive). Annotation template artifact.
      // SCOPE: none identified
    });

    it.skip("case insensitive uniqueness", async () => {
      // BLOCKED: validations — validates_uniqueness_of with citext columns
      // ROOT-CAUSE: requires validatesUniqueness({ caseSensitive: false }) to call
      //   caseInsensitiveComparison, which for citext columns skips LOWER() and relies on
      //   database-level case-insensitivity. The uniqueness validator infrastructure is present
      //   but integration with the citext query path needs an end-to-end test with a model.
      // SCOPE: ~30 LOC test; no impl gap — purely a missing test case
    });

    it("case insensitive comparison", async () => {
      const table = new ArelTable("citexts");
      const attr = table.get("cival");
      const comparison = await adapter.caseInsensitiveComparison(attr, "cased text");
      const sql = adapter.arelVisitor.compile(comparison);
      expect(sql).not.toMatch(/lower/i);
    });

    it("citext schema dump", async () => {
      const output = await SchemaDumper.dumpTableSchema(adapter, "citexts");
      expect(output).toMatch(/t\.citext\s+"cival"/);
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
      const { Base } = await import("../../index.js");
      class Citext extends Base {
        static tableName = "citexts";
        static {
          this.adapter = adapter;
        }
      }
      await Citext.loadSchema();

      const x = await Citext.createBang({ cival: "Some CI Text" } as any);
      const first = (await Citext.first()) as any;
      expect(first.cival).toBe("Some CI Text");

      first.cival = "Some NEW CI Text";
      await first.saveBang();
      await first.reload();
      expect(first.cival).toBe("Some NEW CI Text");
    });

    it("select case insensitive", async () => {
      await adapter.exec(`INSERT INTO citexts (cival) VALUES ('Cased Text')`);
      const { Base } = await import("../../index.js");
      class Citext extends Base {
        static tableName = "citexts";
        static {
          this.adapter = adapter;
        }
      }
      await Citext.loadSchema();

      const result = await (Citext as any).where({ cival: "cased text" }).first();
      expect(result).not.toBeNull();
      expect((result as any).cival).toBe("Cased Text");
    });

    it("case insensitiveness", async () => {
      const table = new ArelTable("citexts");
      const attr = table.get("cival");
      const comparison = await adapter.caseInsensitiveComparison(attr, null);
      const sql = adapter.arelVisitor.compile(comparison);
      expect(sql).not.toMatch(/lower/i);
    });
  });
});
