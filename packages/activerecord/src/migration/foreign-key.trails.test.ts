/**
 * TS-only regression coverage for `remove_foreign_key`. Rails has no test that
 * pins the generic-option narrowing of `foreign_key_for!` / `defined_for?`
 * (`schema_statements.rb:1214-1224`, `schema_definitions.rb:161-167`), so this
 * lives outside the ported foreign-key.test.ts.
 */
import { describe, it, expect } from "vitest";
import { fixtures } from "../test-fixtures.js";
import { ambientConnection, withRocketTables } from "../support/rocket-tables.js";

describe("removeForeignKey option narrowing", () => {
  fixtures([], { useTransactionalTests: false });

  const addBothRocketForeignKeys = async (conn: Awaited<ReturnType<typeof ambientConnection>>) => {
    await conn.addForeignKey("astronauts", "rockets", {
      column: "rocket_id",
      onDelete: "cascade",
    });
    await conn.addForeignKey("astronauts", "rockets", {
      column: "favorite_rocket_id",
      onDelete: "nullify",
    });
  };

  it("narrows on onDelete: nullify when two foreign keys share from_table and to_table", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await addBothRocketForeignKeys(conn);

      await conn.removeForeignKey("astronauts", "rockets", { onDelete: "nullify" });

      const remaining = await conn.foreignKeys("astronauts");
      expect(remaining.map((fk) => fk.column)).toEqual(["rocket_id"]);
      expect(remaining[0].onDelete).toBe("cascade");
    });
  });

  it("narrows on onDelete: cascade when two foreign keys share from_table and to_table", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await addBothRocketForeignKeys(conn);

      await conn.removeForeignKey("astronauts", "rockets", { onDelete: "cascade" });

      const remaining = await conn.foreignKeys("astronauts");
      expect(remaining.map((fk) => fk.column)).toEqual(["favorite_rocket_id"]);
      expect(remaining[0].onDelete).toBe("nullify");
    });
  });
});
