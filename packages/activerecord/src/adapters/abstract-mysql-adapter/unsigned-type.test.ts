/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/unsigned_type_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";
import { Base } from "../../base.js";
import { RangeError as ActiveRecordRangeError } from "../../errors.js";
import { RangeError as ActiveModelRangeError } from "@blazetrails/activemodel";
import { SchemaDumper } from "../../schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { deprecator } from "../../deprecator.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
    await adapter.createTable("unsigned_types", { force: true }, (t: any) => {
      t.integer("unsigned_integer", { unsigned: true });
      t.bigint("unsigned_bigint", { unsigned: true });
      t.float("unsigned_float", { unsigned: true });
      t.decimal("unsigned_decimal", { unsigned: true, precision: 10, scale: 2 });
      t.column("unsigned_zerofill", "int unsigned zerofill");
    });
  });
  afterEach(async () => {
    await adapter.dropTable("unsigned_types", { ifExists: true });
  });

  async function unsignedTypeModel(): Promise<typeof Base> {
    class UnsignedType extends Base {
      static _tableName = "unsigned_types";
    }
    UnsignedType.adapter = adapter;
    // Reflect the real columns (PK included) up front so the post-INSERT
    // write-back (`_performInsert` → `_writeAttribute("id", insertedId)`)
    // targets a reflected `id` attribute under strict `writeFromUser`, without
    // the internal-write bridge. Explicit warming (as in mysql-boolean's
    // `BooleanType.loadSchema()`) keeps the reflected `unsigned` metadata the
    // range-check assertions rely on — declaring `id` via `attribute()` would
    // instead suppress DB reflection (ensureSchemaLoaded bails on a concrete
    // user attr), hiding the unsigned columns.
    await UnsignedType.loadSchema();
    return UnsignedType;
  }

  describe("UnsignedTypeTest", () => {
    it("unsigned int max value is in range", async () => {
      const UnsignedType = await unsignedTypeModel();
      const expected = await UnsignedType.create({ unsigned_integer: 4294967295 });
      expect(expected).toBeTruthy();
      const found = await UnsignedType.findBy({ unsigned_integer: 4294967295 });
      expect((found as any)?.id).toBe((expected as any).id);
    });

    it("minus value is out of range", async () => {
      const UnsignedType = await unsignedTypeModel();
      await expect(UnsignedType.create({ unsigned_integer: -10 })).rejects.toThrow(
        ActiveModelRangeError,
      );
      await expect(UnsignedType.create({ unsigned_bigint: -10 })).rejects.toThrow(
        ActiveModelRangeError,
      );
      await expect(UnsignedType.create({ unsigned_float: -10.0 })).rejects.toThrow(
        ActiveRecordRangeError,
      );
      await expect(UnsignedType.create({ unsigned_decimal: -10.0 })).rejects.toThrow(
        ActiveRecordRangeError,
      );
    });

    it("schema definition can use unsigned as the type", async () => {
      await adapter.changeTable("unsigned_types", async (t: any) => {
        await t.unsignedInteger("unsigned_integer_t");
        await t.unsignedBigint("unsigned_bigint_t");
      });

      const columns = await adapter.columns("unsigned_types");
      const unsignedColumns = columns.filter((c) => /^unsigned_/.test(c.name));
      for (const column of unsignedColumns) {
        expect((column as any).isUnsigned()).toBe(true);
      }
    });

    it("deprecate unsigned_float and unsigned_decimal", async () => {
      const warnings: string[] = [];
      const dep = deprecator();
      const prev = dep.behavior;
      dep.behavior = (msg: unknown) => {
        warnings.push(String(msg));
      };
      try {
        await adapter.changeTable("unsigned_types", async (t: any) => {
          await t.unsignedFloat("unsigned_float_t");
          await t.unsignedDecimal("unsigned_decimal_t");
        });
      } finally {
        dep.behavior = prev;
      }
      expect(warnings.some((w) => /unsigned_float/.test(w))).toBe(true);
      expect(warnings.some((w) => /unsigned_decimal/.test(w))).toBe(true);
    });

    it("schema dump includes unsigned option", async () => {
      const schema = await SchemaDumper.dumpTableSchema(
        adapter as unknown as SchemaSource,
        "unsigned_types",
      );
      expect(schema).toMatch(/t\.integer\("unsigned_integer", \{ unsigned: true \}\)/);
      expect(schema).toMatch(/t\.bigint\("unsigned_bigint", \{ unsigned: true \}\)/);
      expect(schema).toMatch(/t\.float\("unsigned_float", \{ unsigned: true \}\)/);
      expect(schema).toMatch(
        /t\.decimal\("unsigned_decimal", \{ precision: 10, scale: 2, unsigned: true \}\)/,
      );
    });
  });
});
