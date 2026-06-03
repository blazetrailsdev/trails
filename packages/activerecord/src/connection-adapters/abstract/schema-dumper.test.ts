import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { IntegerType, DecimalType, BooleanType, StringType } from "@blazetrails/activemodel";

const emptySource: SchemaSource = {
  tables: () => [],
  columns: () => [],
  indexes: () => [],
};

describe("SchemaDumper", () => {
  it("create returns a SchemaDumper instance", () => {
    const dumper = SchemaDumper.create(emptySource);
    expect(dumper).toBeInstanceOf(SchemaDumper);
  });

  it("create accepts options", () => {
    const dumper = SchemaDumper.create(emptySource, { tableNamePrefix: "app_" });
    expect(dumper).toBeInstanceOf(SchemaDumper);
  });

  it("DEFAULT_DATETIME_PRECISION is 6", () => {
    expect(SchemaDumper.DEFAULT_DATETIME_PRECISION).toBe(6);
  });
});

describe("SchemaDumper schemaDefault with adapter type deserialize", () => {
  function makeAdapterDumper(
    column: Record<string, unknown>,
    type:
      | InstanceType<typeof IntegerType>
      | InstanceType<typeof DecimalType>
      | InstanceType<typeof BooleanType>
      | InstanceType<typeof StringType>,
  ) {
    const adapter = { lookupCastTypeFromColumn: () => type };
    const dumper = SchemaDumper.create(adapter as any);
    return (dumper as any).schemaDefault(column) as string | undefined;
  }

  it("integer column with raw string default deserializes to number literal", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: "5", type: "integer" },
      new IntegerType(),
    );
    expect(result).toBe("5");
  });

  it("boolean column with raw string default deserializes to true/false literal", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: "1", type: "boolean" },
      new BooleanType(),
    );
    expect(result).toBe("true");
  });

  it("text column with raw string default keeps quoted string", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: "hello", type: "string" },
      new StringType(),
    );
    expect(result).toBe('"hello"');
  });

  it("decimal column with raw string default rounds via type", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: "2.789", type: "decimal" },
      new DecimalType({ precision: 5, scale: 2 }),
    );
    // DecimalType.typeCastForSchema now returns the unquoted numeric string
    // (String(value) not JSON.stringify), matching the schema dump format.
    expect(result).toBe("2.79");
  });

  it("null default falls through to schemaExpression", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: null, defaultFunction: "uuid()" },
      new StringType(),
    );
    expect(result).toContain("uuid()");
  });

  it("pre-deserialized array default uses typeCastForSchema when deserialize returns null", () => {
    // Mirrors the PG OID::Array case: column.default is already [] (deserialized by
    // the adapter) but lookupCastTypeFromColumn returns the scalar element type (e.g.
    // DecimalType) which cannot deserialize an array — deserialize([]) → null.
    // schemaDefault must call typeCastForSchema on the original value directly.
    const rejectingType = {
      deserialize: () => null,
      typeCastForSchema: (v: unknown) => JSON.stringify(v),
    };
    const adapter = { lookupCastTypeFromColumn: () => rejectingType };
    const dumper = SchemaDumper.create(adapter as any);
    const result = (dumper as any).schemaDefault({ hasDefault: true, default: [] }) as
      | string
      | undefined;
    expect(result).toBe("[]");
  });
});

// Story 3.3-U1: columnSpec must emit directly-emittable TypeScript-DSL text
// (not Ruby schema.rb syntax) so a later story (3.3-U3) can route emitTable
// through it via formatColspecRaw. These pin the prerequisite.
describe("SchemaDumper columnSpec emits TS-DSL-emittable text", () => {
  const dumper = SchemaDumper.create(emptySource) as any;

  it("schemaPrecision emits TS `null` (not Ruby `nil`) for datetime without precision", () => {
    expect(dumper.schemaPrecision({ type: "datetime", precision: null })).toBe("null");
  });

  it("schemaExpression emits a TS arrow (not a Ruby lambda) for a default function", () => {
    expect(dumper.schemaExpression({ defaultFunction: "now()" })).toBe('() => "now()"');
  });

  it("columnSpec output round-trips through formatColspecRaw as valid TS-DSL", () => {
    const [type, spec] = dumper.columnSpec({
      type: "datetime",
      precision: null,
      null: false,
      hasDefault: true,
      default: null,
      defaultFunction: "now()",
    });
    expect(type).toBe("datetime");
    const text = dumper.formatColspecRaw(spec);
    expect(text).toContain("precision: null");
    expect(text).toContain("null: false");
    expect(text).toContain('default: () => "now()"');
    // No Ruby-isms leak into the emittable text.
    expect(text).not.toContain("nil");
    expect(text).not.toContain("-> {");
  });
});
