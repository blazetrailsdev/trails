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

    it("returns bigint for bigint array columns (strips [] before returning)", () => {
      const dumper = SchemaDumper.create(emptySource) as any;
      const col = makeColumn({ sqlType: "bigint[]", type: "integer", array: true });
      expect(dumper.schemaType(col)).toBe("bigint");
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
      expect(spec["array"]).toBe(true);
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

    it("adds enum_type even for virtual enum columns (Rails continues after virtual block)", () => {
      const mockAdapter = {
        tables: () => [],
        columns: () => [],
        indexes: () => [],
        supportsVirtualColumns: () => true,
      };
      const dumper = new (SchemaDumper as any)(mockAdapter) as any;
      const col = new Column("status", null, { sqlType: "mood", type: "enum" }, true, {
        defaultFunction: "('happy'::mood)",
        generated: "s",
      });
      const spec = dumper.prepareColumnOptions(col);
      expect(spec["stored"]).toBe(true);
      expect(spec["enum_type"]).toBe(JSON.stringify("mood"));
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

  describe("extensions", () => {
    it("emits enable_extension lines sorted with header and trailing blank", async () => {
      const adapter = {
        ...emptySource,
        extensions: async () => ["plpgsql", "hstore"],
      };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper.extensions(lines);
      expect(lines[0]).toContain("extensions that must be enabled");
      expect(lines[1]).toBe(`  enable_extension "hstore"`);
      expect(lines[2]).toBe(`  enable_extension "plpgsql"`);
      expect(lines[3]).toBe("");
    });

    it("emits nothing when extensions list is empty", async () => {
      const adapter = { ...emptySource, extensions: async () => [] };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper.extensions(lines);
      expect(lines).toHaveLength(0);
    });
  });

  describe("types", () => {
    it("emits create_enum lines sorted with header and trailing blank", async () => {
      const adapter = {
        ...emptySource,
        enumTypes: async () =>
          [
            ["status", ["active", "inactive"]],
            ["mood", ["happy", "sad"]],
          ] as [string, string[]][],
      };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper.types(lines);
      expect(lines[0]).toBe("  # Custom types defined in this database.");
      expect(lines[2]).toBe(`  create_enum "mood", ["happy","sad"]`);
      expect(lines[3]).toBe(`  create_enum "status", ["active","inactive"]`);
      expect(lines[4]).toBe("");
    });

    it("emits nothing when enum types list is empty", async () => {
      const adapter = { ...emptySource, enumTypes: async () => [] };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper.types(lines);
      expect(lines).toHaveLength(0);
    });
  });

  describe("schemas", () => {
    it("emits create_schema lines sorted, excluding public, with trailing blank", async () => {
      const adapter = {
        ...emptySource,
        schemaNames: async () => ["public", "myschema", "analytics"],
      };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper.schemas(lines);
      expect(lines).toEqual([`  create_schema "analytics"`, `  create_schema "myschema"`, ""]);
    });
  });

  describe("_emitExclusionConstraints", () => {
    it("emits sorted ctx.addExclusionConstraint lines with options", async () => {
      const { ExclusionConstraintDefinition } = await import("./schema-definitions.js");
      const adapter = {
        ...emptySource,
        exclusionConstraints: async () => [
          new ExclusionConstraintDefinition("rooms", "price WITH =", {
            using: "gist",
            where: "(price > 0)",
            name: "excl_rooms_price",
          }),
        ],
      };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper._emitExclusionConstraints("rooms", lines);
      expect(lines[0]).toContain(`await ctx.addExclusionConstraint("rooms", "price WITH ="`);
      expect(lines[0]).toContain(`where: "(price > 0)"`);
      expect(lines[0]).toContain(`using: "gist"`);
      expect(lines[0]).toContain(`name: "excl_rooms_price"`);
    });
  });

  describe("_emitUniqueConstraints", () => {
    it("emits sorted ctx.addUniqueConstraint lines with options", async () => {
      const { UniqueConstraintDefinition } = await import("./schema-definitions.js");
      const adapter = {
        ...emptySource,
        uniqueConstraints: async () => [
          new UniqueConstraintDefinition("users", ["email"], {
            nullsNotDistinct: true,
            name: "uniq_users_email",
          }),
        ],
      };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper._emitUniqueConstraints("users", lines);
      expect(lines[0]).toContain(`await ctx.addUniqueConstraint("users", ["email"]`);
      expect(lines[0]).toContain(`nullsNotDistinct: true`);
      expect(lines[0]).toContain(`name: "uniq_users_email"`);
    });

    it("emits nothing when no unique constraints", async () => {
      const adapter = { ...emptySource, uniqueConstraints: async () => [] };
      const dumper = new (SchemaDumper as any)(adapter) as any;
      const lines: string[] = [];
      await dumper._emitUniqueConstraints("users", lines);
      expect(lines).toHaveLength(0);
    });
  });
});
