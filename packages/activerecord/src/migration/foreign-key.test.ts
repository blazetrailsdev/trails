/**
 * Port of the `add_foreign_key`, `remove_foreign_key` and `SchemaDumpingHelper`
 * halves of `ActiveRecord::Migration::ForeignKeyTest`
 * (vendor/rails/activerecord/test/cases/migration/foreign_key_test.rb:209-330,
 * :336-391, :393-451, :453-535, :536-619, :621-747, :749-773 and :775-823) plus
 * all of its sibling
 * `ActiveRecord::Migration::CompositeForeignKeyTest` (:824-912), plus
 * `ForeignKeyInCreateTest` (:9-21) and `ForeignKeyChangeColumnTest` (:23-143)
 * with its `WithPrefix`/`WithSuffix` subclasses (:145-163).
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. The rockets/astronauts
 * setup/teardown is shared with schema-statements-on-adapter.test.ts via
 * `withRocketTables`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { StatementInvalid } from "../errors.js";
import type { ReferentialAction } from "../connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "../test-fixtures.js";
import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import {
  ambientConnection,
  withCompositeRocketTables,
  withRocketTables,
} from "../support/rocket-tables.js";
import { adapterType } from "../test-adapter.js";
import { adapterSupports, describeIfSupports, itIfSupports } from "../support/supports.js";
import { assertQueriesMatch } from "../testing/query-assertions.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { supportsRenameIndex } from "../adapters/abstract-mysql-adapter/test-helper.js";
import { dumpTableSchema } from "../support/schema-dumping-helper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { Base } from "../base.js";
import { Migration } from "../migration.js";
import { SchemaDumper } from "../schema-dumper.js";

// Rails' `unless current_adapter?(:SQLite3Adapter)` guard on the `fk.name`
// assertions: PRAGMA foreign_key_list exposes no constraint name, so SQLite
// has no name to compare.
const unlessSqlite3Adapter = adapterType !== "sqlite";

// Rails' `else` arm of `if supports_validate_constraints?`. Held in a const so
// the `it.skipIf(...)` call site carries no feature literal: the gate extractor
// drops the negation, and an inline `adapterSupports("validate_constraints")`
// would tag the else-arm case with the very feature it excludes — colliding
// with the `if` arm, which shares the test name.
const supportsValidateConstraints = adapterSupports("validate_constraints");

/**
 * `validate_foreign_key` / `validate_constraint` live on
 * PostgreSQL::SchemaStatements only, so they are absent from the
 * `AbstractAdapter` type the shared rocket-tables helper hands back. Every
 * caller below is gated on `validate_constraints` (PostgreSQL-only), so the
 * downcast holds wherever it is used.
 */
function validating(conn: AbstractAdapter): PostgreSQLAdapter {
  return conn as PostgreSQLAdapter;
}

/** Rails' `silence_stream($stdout) { migration.migrate(...) }`. */
class SilentMigration extends Migration {
  write(): void {}
}

class CreateCitiesAndHousesMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.createTable("cities", () => {});

    await this.createTable("houses", (t) => {
      t.references("city");
    });
    await this.addForeignKey("houses", "cities", { column: "city_id" });

    // remove and re-add to test that schema is updated and not accidentally cached
    await this.removeForeignKey("houses", "cities");
    await this.addForeignKey("houses", "cities", { column: "city_id", onDelete: "cascade" });
  }
}

class CreateSchoolsAndClassesMigration extends SilentMigration {
  async change(): Promise<void> {
    // Both tables are dropped by the migration's own `migrate("down")` in each
    // case's ensure block, which the rule can't see from here.
    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("schools");

    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("classes", (t) => {
      t.references("school");
    });
    await this.addForeignKey("classes", "schools", { validate: true });
  }
}

describeIfSupports("foreign_keys", "Migration", () => {
  describe("ForeignKeyInCreateTest", () => {
    fixtures([]);

    it("foreign keys", async () => {
      const conn = await ambientConnection();
      const foreignKeys = await conn.foreignKeys("fk_test_has_fk");
      expect(foreignKeys.length).toBe(1);

      const fk = foreignKeys[0];
      expect(fk.fromTable).toBe("fk_test_has_fk");
      expect(fk.toTable).toBe("fk_test_has_pk");
      expect(fk.column).toBe("fk_id");
      expect(fk.primaryKey).toBe("pk_id");
      // eslint-disable-next-line vitest/no-conditional-in-test
      if (unlessSqlite3Adapter) expect(fk.name).toBe("fk_name");
    });
  });

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

    it("foreign key exists", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");

        expect(await conn.foreignKeyExists("astronauts", "rockets")).toBe(true);
        expect(await conn.foreignKeyExists("astronauts", "stars")).toBe(false);
      });
    });

    it("foreign key exists referencing table having keyword as name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.createTable("user", { force: true });
        await conn.addColumn("rockets", "user_id", "bigint");
        try {
          await conn.addForeignKey("rockets", "user");
          expect(await conn.foreignKeyExists("rockets", "user")).toBe(true);
        } finally {
          await conn.removeForeignKey("rockets", "user");
          await conn.dropTable("user");
        }
      });
    });

    it("foreign key exists by column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });

        expect(await conn.foreignKeyExists("astronauts", { column: "rocket_id" })).toBe(true);
        expect(await conn.foreignKeyExists("astronauts", { column: "star_id" })).toBe(false);
      });
    });

    it.skipIf(adapterType === "sqlite")("foreign key exists by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
        });

        expect(await conn.foreignKeyExists("astronauts", { name: "fancy_named_fk" })).toBe(true);
        expect(await conn.foreignKeyExists("astronauts", { name: "other_fancy_named_fk" })).toBe(
          false,
        );
      });
    });

    it("foreign key exists in change table", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.changeTable("astronauts", async (t) => {
          await t.foreignKey("rockets", { column: "rocket_id", name: "fancy_named_fk" });

          expect(await t.isForeignKeyExists({ column: "rocket_id" })).toBe(true);
          expect(await t.isForeignKeyExists({ column: "star_id" })).toBe(false);

          if (unlessSqlite3Adapter) {
            expect(await t.isForeignKeyExists({ name: "fancy_named_fk" })).toBe(true);
            expect(await t.isForeignKeyExists({ name: "other_fancy_named_fk" })).toBe(false);
          }
        });
      });
    });

    itIfSupports("sql_standard_drop_constraint", "remove constraint", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
        });

        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeConstraint("astronauts", "fancy_named_fk");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
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

    it("remove foreign key with restrict action", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { onDelete: "restrict" });
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);
        await conn.removeForeignKey("astronauts", "rockets", { onDelete: "restrict" });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    itIfSupports("validate_constraints", "add invalid foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.isValidated).toBe(false);
      });
    });

    itIfSupports("validate_constraints", "validate foreign key infers column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { validate: false });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(false);

        await validating(conn).validateForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(true);
      });
    });

    itIfSupports("validate_constraints", "validate foreign key by column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(false);

        await validating(conn).validateForeignKey("astronauts", undefined, {
          column: "rocket_id",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(true);
      });
    });

    // Ruby's `column: :rocket_id` symbol has no TS analogue; the string form of
    // the previous case is the only spelling available here.
    itIfSupports("validate_constraints", "validate foreign key by symbol column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(false);

        await validating(conn).validateForeignKey("astronauts", undefined, {
          column: "rocket_id",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(true);
      });
    });

    itIfSupports("validate_constraints", "validate foreign key by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
          validate: false,
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(false);

        await validating(conn).validateForeignKey("astronauts", undefined, {
          name: "fancy_named_fk",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(true);
      });
    });

    itIfSupports(
      "validate_constraints",
      "validate foreign non existing foreign key raises",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await expect(
            validating(conn).validateForeignKey("astronauts", "rockets"),
          ).rejects.toThrow(ArgumentError);
        });
      },
    );

    itIfSupports("validate_constraints", "validate constraint by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
          validate: false,
        });

        await validating(conn).validateConstraint("astronauts", "fancy_named_fk");
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBe(true);
      });
    });

    itIfSupports("validate_constraints", "schema dumping with validate false", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");

        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ validate: false \}\);$/m,
        );
      });
    });

    itIfSupports("validate_constraints", "schema dumping with validate true", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: true,
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");

        expect(output).toMatch(/\s+await ctx\.addForeignKey\("astronauts", "rockets"\);$/m);
      });
    });

    // Rails' `else` arm: without `supports_validate_constraints?` the foreign
    // key is still created, but is never reported as invalid.
    it.skipIf(supportsValidateConstraints)("add invalid foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.isValidated).toBe(true);
      });
    });

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

    it("does not create foreign keys when bypassed by config", async () => {
      const connection = new BetterSQLite3Adapter(":memory:", { foreignKeys: false });

      try {
        // These live in this test's own `:memory:` connection, disconnected in
        // the finally below — nothing to collide with a sibling fork.
        // eslint-disable-next-line blazetrails/require-table-teardown
        await connection.createTable("rockets", { force: true }, (t) => {
          t.string("name");
        });
        // eslint-disable-next-line blazetrails/require-table-teardown
        await connection.createTable("astronauts", { force: true }, (t) => {
          t.string("name");
          t.references("rocket");
        });

        await connection.addForeignKey("astronauts", "rockets");

        const foreignKeys = await connection.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(0);
      } finally {
        connection.disconnectBang();
      }
    });

    it("add foreign key with if not exists not set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        if (adapterType === "sqlite") {
          await conn.addForeignKey("astronauts", "rockets");
          return;
        }

        const error = await conn.addForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );
        const message = (error as Error).message;

        if (adapterType === "mysql") {
          const mysqlConn = conn as unknown as {
            isMariadb?: () => boolean;
            databaseVersion: unknown;
          };
          if (mysqlConn.isMariadb?.() === true) {
            expect(message).toMatch(/Duplicate key on write or update/);
          } else if (String(mysqlConn.databaseVersion) < "8.0") {
            expect(message).toMatch(/Can't write; duplicate key in table/);
          } else {
            expect(message).toMatch(/Duplicate foreign key constraint name/);
          }
        } else {
          expect(message).toMatch(/for relation "astronauts" already exists/);
        }
      });
    });

    it("add foreign key with if not exists set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.addForeignKey("astronauts", "rockets", { ifNotExists: true });
      });
    });

    it("add foreign key preserves existing column types", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const columnFor = async (tableName: string, columnName: string) =>
          (await conn.columns(tableName)).find((column) => column.name === columnName);

        expect((await columnFor("astronauts", "rocket_id"))?.isBigint()).toBe(true);
        await conn.addForeignKey("astronauts", "rockets");
        expect((await columnFor("astronauts", "rocket_id"))?.isBigint()).toBe(true);
      });
    });

    it("schema dumping", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
        expect(output).toMatch(/\s+await ctx\.addForeignKey\("astronauts", "rockets"\);$/m);
      });
    });

    it("schema dumping with options", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        // Rails' SQLite3 branch expects no `name:` because its `foreign_keys`
        // reads PRAGMA foreign_key_list, which drops the CONSTRAINT name
        // (sqlite3_adapter.rb:417-451). trails' SQLite `foreignKeys` additionally
        // parses the CREATE TABLE DDL and recovers the real name, so the dump
        // carries `name: "fk_name"` on every adapter and the branch collapses.
        const output = await dumpTableSchema(conn as unknown as SchemaSource, "fk_test_has_fk");
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("fk_test_has_fk", "fk_test_has_pk", \{ column: "fk_id", primaryKey: "pk_id", name: "fk_name" \}\);$/m,
        );
      });
    });

    it("schema dumping with custom fk ignore pattern", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const originalPattern = SchemaDumper.fkIgnorePattern;
        SchemaDumper.fkIgnorePattern = /^ignored_/;
        await conn.addForeignKey("astronauts", "rockets", {
          name: "ignored_fk_astronauts_rockets",
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
        expect(output).toMatch(/\s+await ctx\.addForeignKey\("astronauts", "rockets"\);$/m);

        SchemaDumper.fkIgnorePattern = originalPattern;
      });
    });

    it("schema dumping on delete and on update options", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          onDelete: "nullify",
          onUpdate: "cascade",
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts",.+onUpdate: "cascade",.+onDelete: "nullify" \}\);$/m,
        );
      });
    });

    it("add foreign key is reversible", async () => {
      const conn = await ambientConnection();
      await conn.dropTable("cities", "houses", { ifExists: true });

      try {
        const migration = new CreateCitiesAndHousesMigration();
        await migration.migrate("up");
        expect((await conn.foreignKeys("houses")).length).toBe(1);
        await migration.migrate("down");
      } finally {
        await conn.dropTable("cities", "houses", { ifExists: true });
      }
    });

    it("foreign key constraint is not cached incorrectly", async () => {
      const conn = await ambientConnection();
      await conn.dropTable("cities", "houses", { ifExists: true });

      try {
        const migration = new CreateCitiesAndHousesMigration();
        await migration.migrate("up");
        const output = await dumpTableSchema(conn as unknown as SchemaSource, "houses");
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("houses",.+onDelete: "cascade" \}\);$/m,
        );
        await migration.migrate("down");
      } finally {
        await conn.dropTable("cities", "houses", { ifExists: true });
      }
    });

    it("add foreign key with prefix", async () => {
      Base.tableNamePrefix = "p_";
      const migration = new CreateSchoolsAndClassesMigration();
      try {
        await migration.migrate("up");
        const conn = await ambientConnection();
        expect((await conn.foreignKeys("p_classes")).length).toBe(1);
      } finally {
        await migration.migrate("down");
        Base.tableNamePrefix = "";
      }
    });

    it("add foreign key with suffix", async () => {
      Base.tableNameSuffix = "_s";
      const migration = new CreateSchoolsAndClassesMigration();
      try {
        await migration.migrate("up");
        const conn = await ambientConnection();
        expect((await conn.foreignKeys("classes_s")).length).toBe(1);
      } finally {
        await migration.migrate("down");
        Base.tableNameSuffix = "";
      }
    });

    itIfSupports("deferrable_constraints", "deferrable foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const deferrableClause = /\("id"\)\s+DEFERRABLE INITIALLY IMMEDIATE\W*$/i;
        const addTheKey = async (): Promise<void> => {
          await conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            deferrable: "immediate",
          });
        };

        if (adapterType === "sqlite") {
          // SQLite adds the key by rebuilding the table, and trails' rebuild
          // issues its CREATE TABLE straight through the driver
          // (sqlite3-adapter.ts alterTable), so nothing reaches
          // sql.active_record and Rails' assert_queries_match would see an
          // empty log. Match the same clause against the DDL that landed —
          // Rails' end anchor still applies, the FK clause terminating the
          // CREATE TABLE. Story instrument-sqlite-alter-table-rebuild-queries
          // (RFC 0023) removes this branch.
          await addTheKey();
          const ddl = await conn.selectValue(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'astronauts'",
          );
          expect(String(ddl)).toMatch(deferrableClause);
        } else {
          await assertQueriesMatch(deferrableClause, undefined, false, addTheKey);
        }

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.deferrable).toBe("immediate");
      });
    });

    itIfSupports("deferrable_constraints", "not deferrable foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          deferrable: false,
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.deferrable).toBe(false);
      });
    });

    itIfSupports(
      "deferrable_constraints",
      "deferrable initially deferred foreign key",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            deferrable: "deferred",
          });

          const foreignKeys = await conn.foreignKeys("astronauts");
          expect(foreignKeys.length).toBe(1);

          const fk = foreignKeys[0];
          expect(fk.deferrable).toBe("deferred");
        });
      },
    );

    itIfSupports(
      "deferrable_constraints",
      "deferrable initially immediate foreign key",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            deferrable: "immediate",
          });

          const foreignKeys = await conn.foreignKeys("astronauts");
          expect(foreignKeys.length).toBe(1);

          const fk = foreignKeys[0];
          expect(fk.deferrable).toBe("immediate");
        });
      },
    );

    itIfSupports("deferrable_constraints", "schema dumping with defferable", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          deferrable: "immediate",
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ deferrable: "immediate" \}\);$/m,
        );
      });
    });

    itIfSupports("deferrable_constraints", "schema dumping with disabled defferable", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          deferrable: false,
        });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
        expect(output).toMatch(/\s+await ctx\.addForeignKey\("astronauts", "rockets"\);$/m);
      });
    });

    itIfSupports(
      "deferrable_constraints",
      "schema dumping with defferable initially deferred",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            deferrable: "deferred",
          });

          const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
          expect(output).toMatch(
            /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ deferrable: "deferred" \}\);$/m,
          );
        });
      },
    );

    itIfSupports(
      "deferrable_constraints",
      "schema dumping with defferable initially immediate",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            deferrable: "immediate",
          });

          const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
          expect(output).toMatch(
            /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ deferrable: "immediate" \}\);$/m,
          );
        });
      },
    );

    itIfSupports(
      "deferrable_constraints",
      "schema dumping with special chars deferrable",
      async () => {
        const conn = await ambientConnection();
        await withRocketTables(conn, async () => {
          await conn.addReference("astronauts", "røcket", {
            foreignKey: { toTable: "rockets", deferrable: "deferred" },
          });

          const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");
          expect(output).toMatch(
            /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ column: "røcket_id", deferrable: "deferred" \}\);$/m,
          );
        });
      },
    );
  });

  function foreignKeyChangeColumnTest(name: string, prefix: string, suffix: string): void {
    describe(name, () => {
      fixtures([], { useTransactionalTests: false });

      const rockets = `${prefix}rockets${suffix}`;
      const astronauts = `${prefix}astronauts${suffix}`;

      beforeEach(() => {
        Base.tableNamePrefix = prefix;
        Base.tableNameSuffix = suffix;
      });

      afterEach(() => {
        Base.tableNamePrefix = "";
        Base.tableNameSuffix = "";
      });

      const withChangeColumnTables = async (
        body: (conn: AbstractAdapter) => Promise<void>,
      ): Promise<void> => {
        const conn = await ambientConnection();
        await conn.dropTable(astronauts, rockets, { ifExists: true });
        await conn.createTable(rockets, {}, (t) => {
          t.string("name");
        });
        await conn.createTable(astronauts, {}, (t) => {
          t.string("name");
          t.references("rocket", { foreignKey: true });
        });
        try {
          await body(conn);
        } finally {
          await conn.dropTable(astronauts, rockets, { ifExists: true });
        }
      };

      const createRocketWithAstronaut = async (conn: AbstractAdapter): Promise<void> => {
        await conn.executeMutation(
          `INSERT INTO ${conn.quoteTableName(rockets)} (name) VALUES ('myrocket')`,
        );
        const rows = (await conn.execute(
          `SELECT id FROM ${conn.quoteTableName(rockets)}`,
        )) as Array<{
          id: number;
        }>;
        await conn.executeMutation(
          `INSERT INTO ${conn.quoteTableName(astronauts)} (rocket_id) VALUES (${rows[0].id})`,
        );
      };

      const rocketName = async (conn: AbstractAdapter): Promise<string> => {
        const rows = (await conn.execute(
          `SELECT name FROM ${conn.quoteTableName(rockets)} ORDER BY id`,
        )) as Array<{ name: string }>;
        return rows[0].name;
      };

      it("change column of parent table", async () => {
        await withChangeColumnTables(async (conn) => {
          await createRocketWithAstronaut(conn);

          await conn.changeColumnNull(rockets, "name", false);

          const foreignKeys = await conn.foreignKeys(astronauts);
          expect(foreignKeys.length).toBe(1);

          const fk = foreignKeys[0];
          expect(await rocketName(conn)).toBe("myrocket");
          expect(fk.fromTable).toBe(astronauts);
          expect(fk.toTable).toBe(rockets);
        });
      });

      it("rename column of child table", async () => {
        await withChangeColumnTables(async (conn) => {
          await createRocketWithAstronaut(conn);

          await conn.renameColumn(astronauts, "name", "astronaut_name");

          const foreignKeys = await conn.foreignKeys(astronauts);
          expect(foreignKeys.length).toBe(1);

          const fk = foreignKeys[0];
          expect(await rocketName(conn)).toBe("myrocket");
          expect(fk.fromTable).toBe(astronauts);
          expect(fk.toTable).toBe(rockets);
        });
      });

      it.skipIf(adapterType === "mysql" && !supportsRenameIndex)(
        "rename reference column of child table",
        async () => {
          await withChangeColumnTables(async (conn) => {
            await createRocketWithAstronaut(conn);

            await conn.renameColumn(astronauts, "rocket_id", "new_rocket_id");

            const foreignKeys = await conn.foreignKeys(astronauts);
            expect(foreignKeys.length).toBe(1);

            const fk = foreignKeys[0];
            expect(await rocketName(conn)).toBe("myrocket");
            expect(fk.fromTable).toBe(astronauts);
            expect(fk.toTable).toBe(rockets);
            expect(fk.column).toBe("new_rocket_id");
          });
        },
      );

      it("remove reference column of child table", async () => {
        await withChangeColumnTables(async (conn) => {
          await createRocketWithAstronaut(conn);

          await conn.removeColumn(astronauts, "rocket_id");

          expect(await conn.foreignKeys(astronauts)).toEqual([]);
        });
      });

      it("remove foreign key by column", async () => {
        await withChangeColumnTables(async (conn) => {
          await createRocketWithAstronaut(conn);

          await conn.removeForeignKey(astronauts, { column: "rocket_id" });

          expect(await conn.foreignKeys(astronauts)).toEqual([]);
        });
      });

      it("remove foreign key by column in change table", async () => {
        await withChangeColumnTables(async (conn) => {
          await createRocketWithAstronaut(conn);

          await conn.changeTable(astronauts, async (t) => {
            await t.removeForeignKey({ column: "rocket_id" });
          });

          expect(await conn.foreignKeys(astronauts)).toEqual([]);
        });
      });
    });
  }

  foreignKeyChangeColumnTest("ForeignKeyChangeColumnTest", "", "");
  foreignKeyChangeColumnTest("ForeignKeyChangeColumnWithPrefixTest", "p_", "");
  foreignKeyChangeColumnTest("ForeignKeyChangeColumnWithSuffixTest", "", "_s");

  describe("CompositeForeignKeyTest", () => {
    fixtures([], { useTransactionalTests: false });

    it("add composite foreign key raises without options", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        const error = await conn.addForeignKey("astronauts", "rockets").then(
          () => undefined,
          (err: unknown) => err,
        );

        expect(error).toBeInstanceOf(StatementInvalid);
        const message = (error as Error).message;
        if (adapterType === "postgres") {
          expect(message).toMatch(
            /there is no unique constraint matching given keys for referenced table "rockets"/,
          );
        } else if (adapterType === "sqlite") {
          expect(message).toMatch(/foreign key mismatch - "astronauts" referencing "rockets"/);
        }
        // Rails' MySQL/MariaDB branch builds an `.any?` over three message
        // patterns and then discards the result — it is passed to no assertion
        // (foreign_key_test.rb:850-856), deliberately, because "MariaDB and
        // different versions of MySQL generate different error messages". Only
        // the raise itself is asserted there, so there is nothing to port: an
        // `expect` here would be a stronger pass condition than Rails', failing
        // on any MySQL/MariaDB build whose wording is not one of the three.
      });
    });

    it("add composite foreign key infers column", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.column).toEqual(["rocket_tenant_id", "rocket_id"]);
      });
    });

    it("add composite foreign key raises if column and primary key sizes mismatch", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        const error = await conn
          .addForeignKey("astronauts", "rockets", {
            column: "rocket_id",
            primaryKey: ["tenant_id", "id"],
          })
          .then(
            () => undefined,
            (err: unknown) => err,
          );

        expect(error).toBeInstanceOf(ArgumentError);
        expect((error as Error).message).toMatch(
          /:column must reference all the :primary_key columns/,
        );
      });
    });

    it("foreign key exists", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        expect(await conn.foreignKeyExists("astronauts", "rockets")).toBe(true);
        expect(await conn.foreignKeyExists("astronauts", "stars")).toBe(false);
      });
    });

    it("foreign key exists by options", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            primaryKey: ["tenant_id", "id"],
          }),
        ).toBe(true);
        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            column: ["rocket_tenant_id", "rocket_id"],
            primaryKey: ["tenant_id", "id"],
          }),
        ).toBe(true);

        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            primaryKey: ["id", "tenant_id"],
          }),
        ).toBe(false);
        expect(await conn.foreignKeyExists("astronauts", "rockets", { primaryKey: "id" })).toBe(
          false,
        );
        expect(await conn.foreignKeyExists("astronauts", "rockets", { column: "rocket_id" })).toBe(
          false,
        );
      });
    });

    it("remove foreign key", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);
      });
    });

    it("schema dumping", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");

        // Deviation: Rails asserts the Ruby DSL line `add_foreign_key "astronauts",
        // "rockets", column: [...], primary_key: [...]`. The TS dumper emits the
        // equivalent `ctx.addForeignKey(...)` call with JSON-formatted arrays.
        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ column: \["rocket_tenant_id","rocket_id"\], primaryKey: \["tenant_id","id"\] \}\);$/m,
        );
      });
    });
  });
});
