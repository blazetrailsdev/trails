import { describe, it, expect } from "vitest";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { Column } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";

describe("PostgreSQL::Column JSON round-trip", () => {
  it("preserves the subclass and its state through the schema-cache dump", () => {
    const col = new Column(
      "tags",
      null,
      { sqlType: "character varying[]", type: "string", oid: 1015, fmod: -1 },
      true,
      { serial: false, identity: "a", generated: "s" },
    );

    const coder: Record<string, unknown> = {};
    col.encodeWith(coder);
    const back = Object.create(Column.prototype) as Column;
    back.initWith(JSON.parse(JSON.stringify(coder)));

    expect(back).toBeInstanceOf(Column);
    expect(back.isArray()).toBe(true);
    expect(back.oid).toBe(1015);
    expect(back.fmod).toBe(-1);
    expect(back.isIdentity).toBe(true);
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
    const back = SqlTypeMetadata.fromJSON(JSON.parse(JSON.stringify(meta.toJSON())));

    expect(back).toBeInstanceOf(TypeMetadata);
    expect((back as TypeMetadata).oid).toBe(1700);
    expect((back as TypeMetadata).fmod).toBe(655366);
    expect(back.sqlType).toBe("numeric(10,2)");
    expect(back.equals(meta)).toBe(true);
  });

  it("delegates the Column readers to the metadata object", () => {
    const col = new Column("n", null, { sqlType: "int4", type: "integer", oid: 23, fmod: -1 });
    expect(col.sqlTypeMetadata).toBeInstanceOf(TypeMetadata);
    expect(col.oid).toBe(23);
    expect(col.fmod).toBe(-1);
  });
});
