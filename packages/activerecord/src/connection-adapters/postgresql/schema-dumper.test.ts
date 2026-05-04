import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";
import { Column } from "./column.js";
import type { SchemaSource } from "../../schema-dumper.js";

const emptySource: SchemaSource = {
  tables: () => [],
  columns: () => [],
  indexes: () => [],
};

function makeColumn(
  options: {
    name?: string;
    type?: string;
    sqlType?: string;
    serial?: boolean;
    array?: boolean;
    bigint?: boolean;
    generated?: string | null;
  } = {},
): Column {
  return new Column(
    options.name ?? "id",
    null,
    { sqlType: options.sqlType ?? options.type ?? "bigint", type: options.type ?? "integer" },
    true,
    { serial: options.serial, array: options.array, generated: options.generated },
  );
}

describe("PostgreSQL::SchemaDumper", () => {
  it("create returns a PG SchemaDumper instance", () => {
    const dumper = SchemaDumper.create(emptySource);
    expect(dumper).toBeInstanceOf(SchemaDumper);
  });

  it("defaultPrimaryKeyType returns bigserial", () => {
    const dumper = SchemaDumper.create(emptySource);
    expect(dumper.defaultPrimaryKeyType()).toBe("bigserial");
  });

  describe("schemaType", () => {
    it("returns bigserial for a serial bigint column", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "bigint", type: "integer", serial: true });
      // serial bigint → bigserial
      expect(dumper.schemaType(col)).toBe("bigserial");
    });

    it("returns serial for a serial non-bigint column", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "integer", type: "integer", serial: true });
      expect(dumper.schemaType(col)).toBe("serial");
    });

    it("returns semantic type for non-serial non-bigint columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      // sqlType = "character varying", but sqlTypeMetadata.type = "string" (semantic)
      const col = makeColumn({ sqlType: "character varying", type: "string" });
      expect(dumper.schemaType(col)).toBe("string");
    });
  });

  describe("isDefaultPrimaryKey", () => {
    it("returns true when schemaType is bigserial", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "bigint", type: "integer", serial: true });
      expect(dumper.isDefaultPrimaryKey(col)).toBe(true);
    });

    it("returns false for serial (non-bigserial)", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "integer", type: "integer", serial: true });
      expect(dumper.isDefaultPrimaryKey(col)).toBe(false);
    });
  });

  describe("isExplicitPrimaryKeyDefault", () => {
    it("returns true for uuid type", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "uuid", sqlType: "uuid" });
      expect(dumper.isExplicitPrimaryKeyDefault(col)).toBe(true);
    });

    it("returns true for integer without serial", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "integer", sqlType: "integer", serial: false });
      expect(dumper.isExplicitPrimaryKeyDefault(col)).toBe(true);
    });

    it("returns false for serial integer", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "integer", sqlType: "integer", serial: true });
      expect(dumper.isExplicitPrimaryKeyDefault(col)).toBe(false);
    });
  });

  describe("schemaExpression", () => {
    it("returns undefined for serial columns (suppresses default)", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "integer", serial: true });
      expect(dumper.schemaExpression(col)).toBeUndefined();
    });
  });

  describe("prepareColumnOptions", () => {
    it("adds array: true for array columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "string", sqlType: "character varying[]", array: true });
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["array"]).toBe("true");
    });

    it("does not add array for non-array columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ type: "string", sqlType: "character varying" });
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["array"]).toBeUndefined();
    });

    it("adds virtual column options when adapter supports virtual columns", () => {
      // Mirrors createSchemaDumper(adapter) — raw adapter passed as source
      const mockAdapter = {
        tables: () => [],
        columns: () => [],
        indexes: () => [],
        supportsVirtualColumns: () => true,
      };
      const dumper = new (SchemaDumper as any)(mockAdapter) as any;
      const col = new Column("computed", null, { sqlType: "integer", type: "integer" }, true, {
        defaultFunction: "(a + b)",
        generated: "s",
      });
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["as"]).toBe(JSON.stringify("(a + b)"));
      expect(spec["stored"]).toBe(true);
      expect(spec["type"]).toBe(":integer");
    });

    it("skips virtual options when adapter does not support virtual columns", () => {
      const mockAdapter = {
        tables: () => [],
        columns: () => [],
        indexes: () => [],
        supportsVirtualColumns: () => false,
      };
      const dumper = new (SchemaDumper as any)(mockAdapter) as any;
      const col = new Column("computed", null, { sqlType: "integer", type: "integer" }, true, {
        defaultFunction: "(a + b)",
        generated: "s",
      });
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["as"]).toBeUndefined();
    });

    it("adds enum_type for enum columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      // isEnum checks sqlTypeMetadata.type === "enum"
      const col = new Column("status", null, { sqlType: "mood", type: "enum" }, true, {});
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["enum_type"]).toBe(JSON.stringify("mood"));
    });
  });

  describe("schemaTypeWithVirtual", () => {
    it("returns virtual for generated (stored) PG columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = new Column("computed", null, { sqlType: "integer", type: "integer" }, true, {
        generated: "s",
      });
      expect(dumper.schemaTypeWithVirtual(col)).toBe("virtual");
    });

    it("returns schemaType for non-virtual columns", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "integer", type: "integer", serial: true });
      expect(dumper.schemaTypeWithVirtual(col)).toBe("serial");
    });
  });

  describe("extractExpressionForVirtualColumn", () => {
    it("returns JSON-stringified defaultFunction", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = new Column("full_name", null, { sqlType: "text", type: "string" }, true, {
        defaultFunction: "concat(first_name, ' ', last_name)",
        generated: "s",
      });
      expect(dumper.extractExpressionForVirtualColumn(col)).toBe(
        JSON.stringify("concat(first_name, ' ', last_name)"),
      );
    });
  });
});
