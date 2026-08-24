import { describe, it, expect } from "vitest";
import { Column } from "./column.js";

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
