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
    collation?: string | null;
    bigint?: boolean;
    virtual?: boolean;
    unsigned?: boolean;
    autoIncrement?: boolean;
    extra?: string;
  } = {},
) => ({ name: "col", type: "string", sqlType: "varchar(255)", ...o });

describe("MySQL::SchemaDumper", () => {
  it("defaultPrimaryKeyType returns bigint", () =>
    expect(make().defaultPrimaryKeyType()).toBe("bigint"));

  describe("schemaType", () => {
    it("timestamp → 'timestamp'", () =>
      expect((make() as any).schemaType(col({ sqlType: "timestamp" }))).toBe("timestamp"));
    it("enum → full sql_type", () =>
      expect((make() as any).schemaType(col({ sqlType: "enum('a','b')" }))).toBe("enum('a','b')"));
    it("set → full sql_type", () =>
      expect((make() as any).schemaType(col({ sqlType: "set('x')" }))).toBe("set('x')"));
    it("standard → delegates to super", () =>
      expect((make() as any).schemaType(col({ type: "string" }))).toBe("string"));
  });

  describe("schemaLimit", () => {
    it("suppresses limit for text/blob family", () => {
      for (const t of ["tinytext", "text", "longblob", "mediumblob"]) {
        expect((make() as any).schemaLimit(col({ sqlType: t }))).toBeUndefined();
      }
    });
    it("returns limit for varchar", () =>
      expect((make() as any).schemaLimit(col({ sqlType: "varchar(100)", limit: 100 }))).toBe(
        "100",
      ));
  });

  describe("schemaPrecision", () => {
    it("time/timestamp precision 0 → undefined", () => {
      for (const t of ["time", "timestamp"])
        expect(
          (make() as any).schemaPrecision(col({ type: "datetime", sqlType: t, precision: 0 })),
        ).toBeUndefined();
    });
    it("datetime precision 0 → 'nil'", () =>
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime", precision: 0 }),
        ),
      ).toBe("nil"));
    it("datetime precision 3 → '3'", () =>
      expect(
        (make() as any).schemaPrecision(
          col({ type: "datetime", sqlType: "datetime(3)", precision: 3 }),
        ),
      ).toBe("3"));
  });

  describe("schemaCollation", () => {
    it("returns undefined when no collation", () =>
      expect((make() as any).schemaCollation(col({ collation: null }))).toBeUndefined());
    it("returns JSON collation with no connection", () =>
      expect((make() as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBe(
        '"utf8mb4_unicode_ci"',
      ));
    it("omits when matching table default", () => {
      const d = make();
      d.connection = {};
      d.tableCollationCache["users"] = "utf8mb4_unicode_ci";
      d.tableName = "users";
      expect((d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBeUndefined();
    });
    it("emits when differing from table default", () => {
      const d = make();
      d.connection = {};
      d.tableCollationCache["users"] = "utf8mb4_general_ci";
      d.tableName = "users";
      expect((d as any).schemaCollation(col({ collation: "utf8mb4_unicode_ci" }))).toBe(
        '"utf8mb4_unicode_ci"',
      );
    });
  });

  describe("isDefaultPrimaryKey", () => {
    it("true: bigint + autoIncrement + non-unsigned", () =>
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true, autoIncrement: true }))).toBe(
        true,
      ));
    it("false: unsigned", () =>
      expect(
        (make() as any).isDefaultPrimaryKey(
          col({ bigint: true, autoIncrement: true, unsigned: true }),
        ),
      ).toBe(false));
    it("false: no autoIncrement", () =>
      expect((make() as any).isDefaultPrimaryKey(col({ bigint: true }))).toBe(false));
  });

  it("isExplicitPrimaryKeyDefault: true for integer, false with autoIncrement", () => {
    expect((make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer" }))).toBe(true);
    expect(
      (make() as any).isExplicitPrimaryKeyDefault(col({ type: "integer", autoIncrement: true })),
    ).toBe(false);
  });

  describe("prepareColumnOptions", () => {
    it("adds unsigned", () =>
      expect((make() as any).prepareColumnOptions(col({ unsigned: true }))["unsigned"]).toBe(
        "true",
      ));
    it("adds autoIncrement", () =>
      expect(
        (make() as any).prepareColumnOptions(col({ autoIncrement: true }))["autoIncrement"],
      ).toBe("true"));
    it("prepends size key for tinytext", () => {
      const opts = (make() as any).prepareColumnOptions(col({ sqlType: "tinytext" }));
      expect(Object.keys(opts)[0]).toBe("size");
      expect(opts["size"]).toBe(":tiny");
    });
  });

  describe("columnSpecForPrimaryKey", () => {
    it("removes autoIncrement for integer pk", () => {
      expect(
        (make() as any).columnSpecForPrimaryKey(col({ type: "integer", autoIncrement: true }))[
          "autoIncrement"
        ],
      ).toBeUndefined();
    });
  });

  it("extractExpressionForVirtualColumn returns cached expression", () => {
    const d = make();
    d.tableName = "t";
    d.virtualExpressionCache["t"] = { col: '"e"' };
    expect((d as any).extractExpressionForVirtualColumn(col({ name: "col", virtual: true }))).toBe(
      '"e"',
    );
  });
});
