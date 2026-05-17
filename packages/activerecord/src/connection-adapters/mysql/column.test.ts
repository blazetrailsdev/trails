import { describe, it, expect } from "vitest";
import { Column as MysqlColumn } from "./column.js";

describe("MysqlColumn", () => {
  it("round-trips autoIncrement / unsigned / virtual through toJSON/fromJSON", () => {
    const original = new MysqlColumn(
      "id",
      null,
      { sqlType: "bigint(20) unsigned", type: "integer", limit: 8 },
      false,
      { primaryKey: true, autoIncrement: true, unsigned: true, virtual: false },
    );
    const json = JSON.parse(JSON.stringify(original.toJSON()));
    const restored = MysqlColumn.fromJSON(json) as MysqlColumn;
    expect(restored.autoIncrement).toBe(true);
    expect(restored.unsigned).toBe(true);
    expect(restored.virtual).toBe(false);
    expect(restored.primaryKey).toBe(true);
    expect(restored.sqlType).toBe("bigint(20) unsigned");
  });
});
