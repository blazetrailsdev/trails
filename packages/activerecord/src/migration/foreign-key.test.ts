/**
 * Port of the `add_foreign_key` half of
 * `ActiveRecord::Migration::ForeignKeyTest`
 * (vendor/rails/activerecord/test/cases/migration/foreign_key_test.rb:209-330).
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. The rockets/astronauts
 * setup/teardown is shared with schema-statements-on-adapter.test.ts via
 * `withRocketTables`.
 */
import { describe, it, expect } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { StatementInvalid } from "../errors.js";
import type { ReferentialAction } from "../connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { ambientConnection, withRocketTables } from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";

// Rails' `unless current_adapter?(:SQLite3Adapter)` guard on the `fk.name`
// assertions: PRAGMA foreign_key_list exposes no constraint name, so SQLite
// has no name to compare.
const unlessSqlite3Adapter = adapterType !== "sqlite";

describe("ActiveRecord::Migration::ForeignKeyTest", () => {
  // DDL can't run inside the transactional-fixtures wrapper (PG aborts the
  // outer transaction on a failed statement), matching the schema-statements
  // suite's setup.
  fixtures([], { useTransactionalTests: false });

  it("add foreign key inferes column", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets");

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      expect(fk.fromTable).toBe("astronauts");
      expect(fk.toTable).toBe("rockets");
      expect(fk.column).toBe("rocket_id");
      expect(fk.primaryKey).toBe("id");
      if (unlessSqlite3Adapter) expect(fk.name).toBe("fk_rails_78146ddd2e");
    });
  });

  it("add foreign key with column", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      expect(fk.fromTable).toBe("astronauts");
      expect(fk.toTable).toBe("rockets");
      expect(fk.column).toBe("rocket_id");
      expect(fk.primaryKey).toBe("id");
      if (unlessSqlite3Adapter) expect(fk.name).toBe("fk_rails_78146ddd2e");
    });
  });

  it("add foreign key with if not exists to already referenced table", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets");
      await conn.addForeignKey("astronauts", "rockets", {
        column: "favorite_rocket_id",
        ifNotExists: true,
      });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(2);
      expect(foreignKeys.every((fk) => fk.toTable === "rockets")).toBe(true);
      expect(foreignKeys.map((fk) => fk.column).sort()).toEqual([
        "favorite_rocket_id",
        "rocket_id",
      ]);
    });
  });

  it("add foreign key with non standard primary key", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.createTable("space_shuttles", { id: false, force: true }, (t) => {
        t.bigint("pk", { primaryKey: true });
      });

      try {
        await conn.addForeignKey("astronauts", "space_shuttles", {
          column: "rocket_id",
          primaryKey: "pk",
          name: "custom_pk",
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.fromTable).toBe("astronauts");
        expect(fk.toTable).toBe("space_shuttles");
        expect(fk.primaryKey).toBe("pk");
      } finally {
        await conn.removeForeignKey("astronauts", {
          name: "custom_pk",
          toTable: "space_shuttles",
        });
        await conn.dropTable("space_shuttles");
      }
    });
  });

  it("add on delete restrict foreign key", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        onDelete: "restrict",
      });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      if (adapterType === "mysql") {
        // ON DELETE RESTRICT is the default on MySQL
        expect(fk.onDelete).toBeUndefined();
      } else {
        expect(fk.onDelete).toBe("restrict");
      }
    });
  });

  it("add on delete cascade foreign key", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        onDelete: "cascade",
      });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);
      expect(foreignKeys[0].onDelete).toBe("cascade");
    });
  });

  it("add on delete nullify foreign key", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        onDelete: "nullify",
      });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);
      expect(foreignKeys[0].onDelete).toBe("nullify");
    });
  });

  it("on update and on delete raises with invalid values", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await expect(
        conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onDelete: "invalid" as unknown as ReferentialAction,
        }),
      ).rejects.toThrow(ArgumentError);

      await expect(
        conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onUpdate: "invalid" as unknown as ReferentialAction,
        }),
      ).rejects.toThrow(ArgumentError);
    });
  });

  it("add foreign key with on update", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        onUpdate: "nullify",
      });

      const foreignKeys = await conn.foreignKeys("astronauts");
      expect(foreignKeys.length).toBe(1);
      expect(foreignKeys[0].onUpdate).toBe("nullify");
    });
  });

  it("add foreign key with non existent from table raises", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      // Rails asserts twice on ONE raise (`e = assert_raises ...`), so the
      // error is captured rather than the call repeated.
      const e = await conn.addForeignKey("missions", "rockets").then(
        () => undefined,
        (err: unknown) => err,
      );
      expect(e).toBeInstanceOf(StatementInvalid);
      expect((e as Error).message).toMatch(/missions/);
    });
  });

  it("add foreign key with non existent to table raises", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      // Rails asserts twice on ONE raise (`e = assert_raises ...`), so the
      // error is captured rather than the call repeated.
      const e = await conn.addForeignKey("missions", "rockets").then(
        () => undefined,
        (err: unknown) => err,
      );
      expect(e).toBeInstanceOf(StatementInvalid);
      expect((e as Error).message).toMatch(/missions/);
    });
  });
});
