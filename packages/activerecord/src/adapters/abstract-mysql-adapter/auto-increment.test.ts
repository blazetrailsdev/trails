/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/auto_increment_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("AutoIncrementTest", () => {
    afterEach(async () => {
      await adapter.dropTable("auto_increments", { ifExists: true });
    });

    it("auto increment without primary key", async () => {
      await adapter.createTable("auto_increments", { id: false, force: true }, (t: any) => {
        t.integer("id", { null: false, autoIncrement: true });
        t.index(["id"]);
      });
      const output = await SchemaDumper.dumpTableSchema(
        adapter as unknown as SchemaSource,
        "auto_increments",
      );
      expect(output).toMatch(/t\.integer\("id", \{ null: false, autoIncrement: true \}\)/);
    });

    it("auto increment with composite primary key", async () => {
      await adapter.createTable(
        "auto_increments",
        { primaryKey: ["id", "created_at"], force: true },
        (t: any) => {
          t.integer("id", { null: false, autoIncrement: true });
          t.datetime("created_at", { null: false });
        },
      );
      const output = await SchemaDumper.dumpTableSchema(
        adapter as unknown as SchemaSource,
        "auto_increments",
      );
      expect(output).toMatch(/t\.integer\("id", \{ null: false, autoIncrement: true \}\)/);
    });

    it("auto increment false with custom primary key", async () => {
      await adapter.createTable("auto_increments", { id: false, force: "cascade" }, (t: any) => {
        t.column("id", "primary_key", { autoIncrement: false });
      });
      const columns = await adapter.columns("auto_increments");
      const col = (columns as any[]).find((c) => c.name === "id");
      expect(col.autoIncrement).toBe(false);
    });

    it("auto increment false with create table", async () => {
      await adapter.createTable("auto_increments", { autoIncrement: false, force: "cascade" });
      const columns = await adapter.columns("auto_increments");
      const col = (columns as any[]).find((c) => c.name === "id");
      expect(col.autoIncrement).toBe(false);
    });
  });
});
