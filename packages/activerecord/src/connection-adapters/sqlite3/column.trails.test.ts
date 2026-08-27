import { describe, it, expect } from "vitest";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "../sql-type-metadata.js";

function makeColumn(options: {
  defaultValue?: unknown;
  generatedType?: "stored" | "virtual" | null;
}): Column {
  return new Column(
    "col",
    options.defaultValue ?? null,
    new SqlTypeMetadata({ sqlType: "text" }),
    true,
    {
      generatedType: options.generatedType,
    },
  );
}

describe("SQLite3::Column#hasDefault", () => {
  it("returns true for a regular column with a default value", () => {
    const col = makeColumn({ defaultValue: "hello" });
    expect(col.hasDefault).toBe(true);
  });

  it("returns false for a STORED generated column even with a default", () => {
    const col = makeColumn({ defaultValue: "hello", generatedType: "stored" });
    expect(col.isVirtual()).toBe(true);
    expect(col.hasDefault).toBe(false);
  });

  it("returns false for a VIRTUAL generated column", () => {
    const col = makeColumn({ generatedType: "virtual" });
    expect(col.isVirtual()).toBe(true);
    expect(col.hasDefault).toBe(false);
  });

  it("returns false for a non-virtual column with no default", () => {
    const col = makeColumn({ defaultValue: null });
    expect(col.hasDefault).toBe(false);
  });
});

describe("SQLite3::Column JSON round-trip", () => {
  it("preserves the subclass and its state through the schema-cache dump", () => {
    const col = new Column("id", null, { sqlType: "INTEGER", type: "integer" }, false, {
      autoIncrement: true,
      rowid: true,
      generatedType: "stored",
    });

    const coder: Record<string, unknown> = {};
    col.encodeWith(coder);
    const back = Object.create(Column.prototype) as Column;
    back.initWith(JSON.parse(JSON.stringify(coder)));

    expect(Object.keys(coder).sort()).toEqual(
      [
        "auto_increment",
        "class",
        "collation",
        "comment",
        "default",
        "default_function",
        "name",
        "null",
        "sql_type_metadata",
      ].sort(),
    );
    expect(back).toBeInstanceOf(Column);
    expect(back.isAutoIncrement()).toBe(true);
    expect(back.rowid).toBeUndefined();
    expect(back.isVirtual()).toBe(false);
    expect(back.isVirtualStored()).toBe(false);
  });
});
