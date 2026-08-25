import { describe, it, expect } from "vitest";
import { SqlTypeMetadata } from "../sql-type-metadata.js";
import { Column as MysqlColumn } from "./column.js";
import { TypeMetadata } from "./type-metadata.js";

describe("MysqlColumn", () => {
  it("round-trips autoIncrement / unsigned / virtual through encodeWith/initWith", () => {
    const original = new MysqlColumn(
      "id",
      null,
      { sqlType: "bigint(20) unsigned", type: "integer", limit: 8 },
      false,
      { autoIncrement: true, unsigned: true, virtual: false },
    );
    const coder: Record<string, unknown> = {};
    original.encodeWith(coder);
    const restored = Object.create(MysqlColumn.prototype) as MysqlColumn;
    restored.initWith(JSON.parse(JSON.stringify(coder)));
    expect(restored.autoIncrement).toBe(true);
    expect(restored.unsigned).toBe(true);
    expect(restored.virtual).toBe(false);
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
});
