import { describe, it, expect } from "vitest";
import { Column as MysqlColumn } from "./column.js";

describe("MysqlColumn", () => {
  it("round-trips autoIncrement / unsigned / virtual through encodeWith/initWith", () => {
    const original = new MysqlColumn(
      "id",
      null,
      { sqlType: "bigint(20) unsigned", type: "integer", limit: 8 },
      false,
      { primaryKey: true, autoIncrement: true, unsigned: true, virtual: false },
    );
    const coder: Record<string, unknown> = {};
    original.encodeWith(coder);
    const restored = Object.create(MysqlColumn.prototype) as MysqlColumn;
    restored.initWith(JSON.parse(JSON.stringify(coder)));
    expect(restored.autoIncrement).toBe(true);
    expect(restored.unsigned).toBe(true);
    expect(restored.virtual).toBe(false);
    expect(coder).not.toHaveProperty("primary_key");
    expect(restored.sqlType).toBe("bigint(20) unsigned");
  });
});
