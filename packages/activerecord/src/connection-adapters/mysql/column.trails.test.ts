import { describe, it, expect } from "vitest";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { Column as MysqlColumn } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";

describe("MysqlColumn", () => {
  // mysql/column.rb defines no `encode_with` / `init_with`: every predicate it
  // adds derives from `sql_type` / `collation` / `sql_type_metadata.extra`, all
  // of which the BASE coder persists. So the round-trip carries no MySQL keys
  // and the predicates still answer.
  it("round-trips autoIncrement / unsigned / virtual through encodeWith/initWith", () => {
    const original = new MysqlColumn(
      "id",
      null,
      { sqlType: "bigint(20) unsigned", type: "integer", limit: 8, extra: "auto_increment" },
      false,
    );
    const coder: Record<string, unknown> = {};
    original.encodeWith(coder);
    expect(Object.keys(coder)).not.toContain("unsigned");
    expect(Object.keys(coder)).not.toContain("auto_increment");
    expect(Object.keys(coder)).not.toContain("virtual");

    const restored = Object.create(MysqlColumn.prototype) as MysqlColumn;
    restored.initWith(JSON.parse(JSON.stringify(coder)));
    expect(restored.isAutoIncrement()).toBe(true);
    expect(restored.isUnsigned()).toBe(true);
    expect(restored.isVirtual()).toBe(false);
    expect(restored.sqlType).toBe("bigint(20) unsigned");
  });
});

describe("MySQL::TypeMetadata JSON round-trip", () => {
  it("recovers its own class and ivars from the sql_type_metadata payload", () => {
    const meta = new TypeMetadata(
      { sqlType: "bigint(20)", type: "integer", limit: 8 },
      { extra: "auto_increment" },
    );
    const back = SqlTypeMetadata.fromJSON(JSON.parse(JSON.stringify(meta.toJSON())));

    expect(back).toBeInstanceOf(TypeMetadata);
    expect((back as TypeMetadata).extra).toBe("auto_increment");
    expect(back.limit).toBe(8);
    expect(back.equals(meta)).toBe(true);
  });

  it("delegates the Column reader to the metadata object", () => {
    const col = new MysqlColumn("id", null, {
      sqlType: "bigint(20)",
      type: "integer",
      extra: "auto_increment",
    });
    expect(col.sqlTypeMetadata).toBeInstanceOf(TypeMetadata);
    expect(col.extra).toBe("auto_increment");

    const coder: Record<string, unknown> = {};
    col.encodeWith(coder);
    const restored = Object.create(MysqlColumn.prototype) as MysqlColumn;
    restored.initWith(JSON.parse(JSON.stringify(coder)));
    expect(restored.extra).toBe("auto_increment");
  });

  it("is null when no extra was given, mirroring `extra: nil` / `allow_nil: true`", () => {
    const meta = new TypeMetadata({ sqlType: "varchar(255)", type: "string", limit: 255 });
    expect(meta.extra).toBeNull();

    const col = new MysqlColumn("name", null, { sqlType: "varchar(255)", type: "string" });
    expect(col.extra).toBeNull();
    expect(col.isAutoIncrement()).toBe(false);
    expect(col.isVirtual()).toBe(false);
  });
});
