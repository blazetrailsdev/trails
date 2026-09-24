import { describe, it, expect } from "vitest";
import { SchemaCache } from "../schema-cache.js";
import { Column } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";

function dumpAndLoad(col: Column): Column {
  const cache = new SchemaCache();
  cache.initWith({ columns: { t: [col] } });
  const coder: Record<string, unknown> = {};
  cache.encodeWith(coder);
  const back = new SchemaCache();
  back.initWith(JSON.parse(JSON.stringify(coder)));
  return (back as unknown as { _columns: Map<string, Column[]> })._columns.get("t")![0];
}

describe("PostgreSQL::Column JSON round-trip", () => {
  it("preserves the subclass and its state through the schema-cache dump", () => {
    const col = new Column(
      "tags",
      null,
      new TypeMetadata({ sqlType: "character varying[]", type: "string" }, { oid: 1015, fmod: -1 }),
      true,
      { serial: false, identity: "a", generated: "s" },
    );

    const coder: Record<string, unknown> = {};
    col.encodeWith(coder);
    const back = dumpAndLoad(col);

    expect(Object.keys(coder).sort()).toEqual(
      [
        "collation",
        "comment",
        "default",
        "default_function",
        "generated",
        "identity",
        "name",
        "null",
        "serial",
        "sql_type_metadata",
      ].sort(),
    );
    expect(back).toBeInstanceOf(Column);
    expect(back.isArray()).toBe(true);
    expect(back.oid).toBe(1015);
    expect(back.fmod).toBe(-1);
    expect(back.isIdentity()).toBe(true);
    expect(back.isVirtual()).toBe(true);
    expect(back).toEqual(col);
  });
});

describe("PostgreSQL::TypeMetadata JSON round-trip", () => {
  it("recovers its own class and ivars from the sql_type_metadata payload", () => {
    const meta = new TypeMetadata(
      { sqlType: "numeric(10,2)", type: "decimal", precision: 10, scale: 2 },
      { oid: 1700, fmod: 655366 },
    );
    const back = dumpAndLoad(new Column("n", null, meta)).sqlTypeMetadata!;

    expect(back).toBeInstanceOf(TypeMetadata);
    expect((back as TypeMetadata).oid).toBe(1700);
    expect((back as TypeMetadata).fmod).toBe(655366);
    expect(back.sqlType).toBe("numeric(10,2)");
    expect(back.equals(meta)).toBe(true);
  });

  it("delegates the Column readers to the metadata object", () => {
    const col = new Column(
      "n",
      null,
      new TypeMetadata({ sqlType: "int4", type: "integer" }, { oid: 23, fmod: -1 }),
    );
    expect(col.sqlTypeMetadata).toBeInstanceOf(TypeMetadata);
    expect(col.oid).toBe(23);
    expect(col.fmod).toBe(-1);
  });
});
