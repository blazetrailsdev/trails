import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";

const stubSource: SchemaSource = { tables: () => [], columns: () => [], indexes: () => [] };
const make = () => SchemaDumper.create(stubSource) as SchemaDumper;
const col = (
  o: {
    name?: string;
    type?: string;
    sqlType?: string;
    limit?: number | null;
    precision?: number | null;
    null?: boolean;
    collation?: string | null;
    bigint?: boolean;
    virtual?: boolean;
    unsigned?: boolean;
    autoIncrement?: boolean;
    extra?: string;
  } = {},
) => ({ name: "col", type: "string", sqlType: "varchar(255)", ...o });

describe("MySQL::SchemaDumper", () => {
  it("defaultPrimaryKeyType returns bigint", () => {
    expect(make().defaultPrimaryKeyType()).toBe("bigint");
  });

  describe("schemaType", () => {
    it("timestamp sql_type → 'timestamp'", () => {
      expect((make() as any).schemaType(col({ sqlType: "timestamp" }))).toBe("timestamp");
    });
    it("enum sql_type → full sql_type string", () => {
      expect((make() as any).schemaType(col({ sqlType: "enum('a','b')" }))).toBe("enum('a','b')");
    });
    it("set sql_type → full sql_type string", () => {
      expect((make() as any).schemaType(col({ sqlType: "set('x')" }))).toBe("set('x')");
    });
    it("standard type delegates to super", () => {
      expect((make() as any).schemaType(col({ type: "string" }))).toBe("string");
    });
  });

  describe("schemaLimit", () => {
    it("suppresses limit for tinytext/text/longblob", () => {
      for (const sqlType of ["tinytext", "text", "longblob", "mediumtext"]) {
        expect((make() as any).schemaLimit(col({ sqlType }))).toBeUndefined();
      }
    });
    it("returns limit for varchar", () => {
      expect((make() as any).schemaLimit(col({ sqlType: "varchar(100)", limit: 100 }))).toBe("100");
    });
  });

  describe("schemaPrecision", () => {
    it("returns undefined for time/timestamp with precision 0", () => {
      for (const sqlType of ["time", "timestamp"]) {
        expect(
          (make() as any).schemaPrecision(col({ type: "datetime", sqlType, precision: 0 })),
        ).toBeUndefined();
      }
    });
    it("returns 'nil' for datetime with precision 0", () => {
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime", precision: 0 }),
        ),
      ).toBe("nil");
    });
    it("returns precision string for datetime with non-default precision", () => {
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime(3)", precision: 3 }),
        ),
      ).toBe("3");
    });
  });

  describe("schemaCollation", () => {
    it("returns undefined when no collation", () => {
      expect((make() as any).schemaCollation(col({ collation: null }))).toBeUndefined();
    });
    it("returns JSON collation when no connection", () => {
      expect((make() as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBe(
        '"utf8mb4_unicode_ci"',
      );
    });
    it("omits collation when matching table default", () => {
      const d = make();
      (d as any).connection = {};
      d.tableCollationCache["users"] = "utf8mb4_unicode_ci";
      d.tableName = "users";
      expect((d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBeUndefined();
    });
    it("emits collation when differing from table default", () => {
      const d = make();
      (d as any).connection = {};
      d.tableCollationCache["users"] = "utf8mb4_general_ci";
      d.tableName = "users";
      expect((d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBe(
        '"utf8mb4_unicode_ci"',
      );
    });
  });

  describe("isDefaultPrimaryKey", () => {
    it("true for bigint + autoIncrement + non-unsigned", () => {
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true, autoIncrement: true }))).toBe(
        true,
      );
    });
    it("false when unsigned", () => {
      expect(
        (make() as any).isDefaultPrimaryKey(
          col({ bigint: true, autoIncrement: true, unsigned: true }),
        ),
      ).toBe(false);
    });
    it("false when not autoIncrement", () => {
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true }))).toBe(false);
    });
  });

  describe("isExplicitPrimaryKeyDefault", () => {
    it("true for integer without autoIncrement", () => {
      expect((make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer" }))).toBe(true);
    });
    it("false for integer with autoIncrement", () => {
      expect(
        (make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer", autoIncrement: true })),
      ).toBe(false);
    });
  });

  describe("prepareColumnOptions", () => {
    it("adds unsigned flag", () => {
      expect((make() as any).prepareColumnOptions(col({ unsigned: true }))["unsigned"]).toBe(
        "true",
      );
    });
    it("adds autoIncrement flag", () => {
      expect(
        (make() as any).prepareColumnOptions(col({ autoIncrement: true }))["autoIncrement"],
      ).toBe("true");
    });
    it("prepends size key for tinytext", () => {
      const opts = (make() as any).prepareColumnOptions(col({ sqlType: "tinytext" }));
      expect(Object.keys(opts)[0]).toBe("size");
      expect(opts["size"]).toBe(":tiny");
    });
  });

  describe("columnSpecForPrimaryKey", () => {
    it("removes autoIncrement for integer+autoIncrement pk", () => {
      const spec = (make() as any).columnSpecForPrimaryKey(
        col({ type: "integer", autoIncrement: true }),
      );
      expect(spec["autoIncrement"]).toBeUndefined();
    });
  });

  describe("extractExpressionForVirtualColumn", () => {
    it("returns undefined with no tableName", () => {
      expect(
        (make() as any).extractExpressionForVirtualColumn(col({ virtual: true })),
      ).toBeUndefined();
    });
    it("returns cached expression", () => {
      const d = make();
      d.tableName = "users";
      d.virtualExpressionCache["users"] = { col: '"first + last"' };
      expect(
        (d as any).extractExpressionForVirtualColumn(col({ name: "col", virtual: true })),
      ).toBe('"first + last"');
    });
  });
});
