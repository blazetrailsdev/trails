/**
 * Port of the `add_foreign_key` and `remove_foreign_key` halves of
 * `ActiveRecord::Migration::ForeignKeyTest`
 * (vendor/rails/activerecord/test/cases/migration/foreign_key_test.rb:209-330
 * and :393-451, :749-773). The `SchemaDumpingHelper`-driven dumper cases in the
 * same Rails class are still unported.
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
import { describeIfSupports } from "../support/supports.js";

// Rails' `unless current_adapter?(:SQLite3Adapter)` guard on the `fk.name`
// assertions: PRAGMA foreign_key_list exposes no constraint name, so SQLite
// has no name to compare.
const unlessSqlite3Adapter = adapterType !== "sqlite";

const mysqlRestrictActionReflectsNil = adapterType === "mysql";

describeIfSupports("foreign_keys", "Migration", () => {
  describe("ForeignKeyTest", () => {
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

    it("remove foreign key inferes column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign key by column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { column: "rocket_id" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign key by symbol column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { column: "rocket_id" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it.skipIf(adapterType === "sqlite")("remove foreign key by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
        });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", { name: "fancy_named_fk" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("remove foreign non existing foreign key raises", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const e = await conn.removeForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toBe("Table 'astronauts' has no foreign key for rockets");
      });
    });

    it("remove foreign key by the select one on the same table", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        await conn.addReference("astronauts", "myrocket", {
          foreignKey: { toTable: "rockets" },
        });

        expect((await conn.foreignKeys("astronauts")).length).toBe(2);

        await conn.removeForeignKey("astronauts", "rockets", { column: "myrocket_id" });

        const remaining = await conn.foreignKeys("astronauts");
        expect(remaining.map((fk) => [fk.fromTable, fk.toTable, fk.column])).toEqual([
          ["astronauts", "rockets", "rocket_id"],
        ]);
      });
    });

    // Unreachable on the MySQL family: `extract_foreign_key_action` is overridden
    // with `super unless specifier == "RESTRICT"` (mysql/schema_statements.rb:224-226),
    // so the reflected fk stores `on_delete` as nil — the same fact Rails asserts in
    // test_add_on_delete_restrict_foreign_key. `defined_for?` then compares
    // `Array(nil)` against `["restrict"]` and never matches, so the removal raises.
    // Rails leaves the case ungated because its own suite does not run it here,
    // so the skip is ours, not a ported gate — held in a named boolean so
    // test-compare records it as an incomparable guard rather than as an adapter
    // restriction Rails never had.
    it.skipIf(mysqlRestrictActionReflectsNil)(
      "remove foreign key with restrict action",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addForeignKey("astronauts", "rockets", { onDelete: "restrict" });
          expect((await conn.foreignKeys("astronauts")).length).toBe(1);
          await conn.removeForeignKey("astronauts", "rockets", { onDelete: "restrict" });
          expect(await conn.foreignKeys("astronauts")).toEqual([]);
        });
      },
    );

    it("remove foreign key with if exists not set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        const error = await conn.removeForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        expect((error as Error).message).toBe("Table 'astronauts' has no foreign key for rockets");
      });
    });

    it("remove foreign key with if exists set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets", { ifExists: true });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        await conn.removeForeignKey("astronauts", "rockets", { ifExists: true });
      });
    });
  });
});
