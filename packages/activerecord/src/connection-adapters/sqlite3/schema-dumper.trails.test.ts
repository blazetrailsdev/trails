import { describe, it, expect } from "vitest";
import { SchemaDumper } from "./schema-dumper.js";

const dumper = SchemaDumper.create({
  tables: () => [],
  columns: () => [],
  indexes: () => [],
} as any);

describe("SQLite3::SchemaDumper", () => {
  it("isDefaultPrimaryKey: true for integer columns", () => {
    expect((dumper as any).isDefaultPrimaryKey({ name: "id", type: "integer" })).toBe(true);
  });

  it("isDefaultPrimaryKey: false for bigint columns", () => {
    expect((dumper as any).isDefaultPrimaryKey({ name: "id", type: "bigint", bigint: true })).toBe(
      false,
    );
  });

  it("isExplicitPrimaryKeyDefault: true for bigint columns", () => {
    expect(
      (dumper as any).isExplicitPrimaryKeyDefault({ name: "id", type: "bigint", bigint: true }),
    ).toBe(true);
  });

  it("prepareColumnOptions adds as/stored for virtual columns", () => {
    const col = {
      name: "x",
      type: "string",
      virtual: true,
      virtualStored: false,
      defaultFunction: "a + b",
    };
    const spec = (dumper as any).prepareColumnOptions(col);
    expect(spec["as"]).toBe('"a + b"');
    expect(spec["stored"]).toBe(false);
  });

  it("extractExpressionForVirtualColumn returns JSON.stringify of defaultFunction", () => {
    expect((dumper as any).extractExpressionForVirtualColumn({ defaultFunction: "a + b" })).toBe(
      '"a + b"',
    );
  });
});
