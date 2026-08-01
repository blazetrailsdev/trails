/**
 * TS-only regression coverage for `remove_foreign_key`. Rails has no test that
 * pins the generic-option narrowing of `foreign_key_for!` / `defined_for?`
 * (`schema_statements.rb:1214-1224`, `schema_definitions.rb:161-167`), so this
 * lives outside the ported foreign-key.test.ts. Same for the SQLite3
 * `remove_column` composite-fk case at the bottom (`sqlite3_adapter.rb:349-363`).
 */
import { describe, it, expect } from "vitest";
import { StatementInvalid } from "../errors.js";
import { fixtures } from "../test-fixtures.js";
import {
  ambientConnection,
  withCompositeRocketTables,
  withRocketTables,
} from "../support/rocket-tables.js";
import { Base } from "../base.js";
import { adapterType } from "../test-adapter.js";

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

describe("renameColumn under a table_name_prefix", () => {
  fixtures([], { useTransactionalTests: false });

  it("keeps the foreign key pointing at the prefixed table", async () => {
    const conn = await ambientConnection();
    Base.tableNamePrefix = "p_";
    await conn.createTable("p_rockets", { force: true }, () => {});
    await conn.createTable("p_astronauts", { force: true }, (t) => {
      t.references("rocket", { foreignKey: true });
    });
    try {
      await conn.renameColumn("p_astronauts", "rocket_id", "new_rocket_id");

      const foreignKeys = await conn.foreignKeys("p_astronauts");
      expect(foreignKeys.length).toBe(1);
      expect(foreignKeys[0].toTable).toBe("p_rockets");
      expect(foreignKeys[0].column).toBe("new_rocket_id");
    } finally {
      await conn.dropTable("p_astronauts", "p_rockets", { ifExists: true });
      Base.tableNamePrefix = "";
    }
  });
});

// SQLite3-only: `remove_column` there rebuilds the table from a reflected
// definition, so the FK list is filtered in Ruby (`sqlite3_adapter.rb:349-363`)
// rather than by the server. On PostgreSQL/MySQL the server drops any FK that
// covers a dropped column, so there is no whole-value comparison to pin.
describe.skipIf(adapterType !== "sqlite")("removeColumn against a composite foreign key", () => {
  fixtures([], { useTransactionalTests: false });

  it("keeps the composite foreign key when a member column is removed", async () => {
    const conn = await ambientConnection();
    await withCompositeRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

      // `delete_if { |fk| fk.column == column_name.to_s }` compares the whole
      // value, and a composite fk's `column` is an Array — so the member name
      // never matches and the fk is carried into the rebuilt definition. SQLite
      // then rejects the CREATE TABLE because the child column is gone: the
      // error is the observable proof that the fk was preserved rather than
      // dropped, and is exactly what Rails does here too.
      const error = await conn.removeColumn("astronauts", "rocket_tenant_id").then(
        () => undefined,
        (err: unknown) => err,
      );

      expect(error).toBeInstanceOf(StatementInvalid);
      expect((error as Error).message).toMatch(
        /unknown column "rocket_tenant_id" in foreign key definition/,
      );

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);
      expect(foreignKeys[0].column).toEqual(["rocket_tenant_id", "rocket_id"]);
    });
  });
});
