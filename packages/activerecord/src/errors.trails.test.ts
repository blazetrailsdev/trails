import { describe, expect, it } from "vitest";

import { MismatchedForeignKey, StatementInvalid } from "./errors.js";

describe("MismatchedForeignKey setQuery (trails-only)", () => {
  it("rebuilds the exception with parsed details when built with a queryParser and no sql", () => {
    const original = new MismatchedForeignKey({
      message: "Cannot add foreign key constraint",
      binds: [],
      connectionPool: "pool-sentinel",
      queryParser: (sql) => {
        expect(sql).toBe("ALTER TABLE `engines` ADD CONSTRAINT fk");
        return {
          table: "engines",
          foreignKey: "car_id",
          targetTable: "cars",
          primaryKey: "id",
          primaryKeySqlType: "bigint",
          primaryKeyType: "bigint",
        };
      },
    });

    const rebuilt = original.setQuery("ALTER TABLE `engines` ADD CONSTRAINT fk", ["b"]);

    expect(rebuilt).not.toBe(original);
    expect(rebuilt).toBeInstanceOf(MismatchedForeignKey);
    expect(rebuilt.sql).toBe("ALTER TABLE `engines` ADD CONSTRAINT fk");
    expect(rebuilt.binds).toEqual(["b"]);
    expect((rebuilt as MismatchedForeignKey).connectionPool).toBe("pool-sentinel");
    expect(rebuilt.message).toContain(
      "Column `car_id` on table `engines` does not match column `id` on `cars`",
    );
    expect(rebuilt.message).toContain("which has type `bigint`");
    expect(rebuilt.stack).toBe(original.stack);
    expect((rebuilt as MismatchedForeignKey).fkDetails).toEqual({
      table: "engines",
      foreignKey: "car_id",
      targetTable: "cars",
      primaryKey: "id",
      primaryKeySqlType: "bigint",
      primaryKeyType: "bigint",
    });
  });

  it("falls back to the plain setQuery assign when sql was supplied at construction", () => {
    const original = new MismatchedForeignKey({
      message: "boom",
      sql: "CREATE TABLE t",
      binds: [],
      queryParser: () => ({ table: "t" }),
    });

    const result = original.setQuery("OTHER SQL", ["x"]);

    expect(result).toBe(original);
    expect(result.sql).toBe("CREATE TABLE t");
  });

  it("falls back to the plain setQuery assign when no queryParser was given", () => {
    const original = new MismatchedForeignKey({ message: "boom" });

    const result = original.setQuery("ALTER TABLE `x`", ["y"]);

    expect(result).toBe(original);
    expect(result).toBeInstanceOf(StatementInvalid);
    expect(result.sql).toBe("ALTER TABLE `x`");
    expect(result.binds).toEqual(["y"]);
  });
});
