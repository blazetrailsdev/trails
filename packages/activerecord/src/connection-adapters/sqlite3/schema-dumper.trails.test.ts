import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";
import { Column } from "./column.js";

function col(
  name: string,
  type: string,
  options: { defaultFunction?: string; generatedType?: "stored" | "virtual" } = {},
): Column {
  return new Column(name, null, { sqlType: type, type }, true, {
    defaultFunction: options.defaultFunction ?? null,
    generatedType: options.generatedType ?? null,
  });
}

const dumper = SchemaDumper.create({
  tables: () => [],
  columns: () => [],
  indexes: () => [],
} as any);

describe("SQLite3::SchemaDumper", () => {
  it("isDefaultPrimaryKey: true for integer columns", () => {
    expect((dumper as any).isDefaultPrimaryKey(col("id", "integer"))).toBe(true);
  });

  it("isDefaultPrimaryKey: false for bigint columns", () => {
    expect((dumper as any).isDefaultPrimaryKey(col("id", "bigint"))).toBe(false);
  });

  it("isExplicitPrimaryKeyDefault: true for bigint columns", () => {
    expect((dumper as any).isExplicitPrimaryKeyDefault(col("id", "bigint"))).toBe(true);
  });

  it("prepareColumnOptions adds as/stored for virtual columns", async () => {
    const column = col("x", "string", { defaultFunction: "a + b", generatedType: "virtual" });
    const spec = await (dumper as any).prepareColumnOptions(column);
    expect(spec["as"]).toBe('"a + b"');
    expect(spec["stored"]).toBe(false);
  });

  it("extractExpressionForVirtualColumn returns JSON.stringify of defaultFunction", () => {
    expect(
      (dumper as any).extractExpressionForVirtualColumn(
        col("x", "string", { defaultFunction: "a + b" }),
      ),
    ).toBe('"a + b"');
  });
});
