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
    expect(result).toBe('"2.79"');
  });

  it("null default falls through to schemaExpression", () => {
    const result = makeAdapterDumper(
      { hasDefault: true, default: null, defaultFunction: "uuid()" },
      new StringType(),
    );
    expect(result).toContain("uuid()");
  });
});
