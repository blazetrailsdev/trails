import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assertEmpty,
  assertNoChanges,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import { StatementInvalid } from "../errors.js";
import type { ReferentialAction } from "../connection-adapters/abstract/schema-definitions.js";
import { fixtures } from "../test-fixtures.js";
import { newSqlitePool } from "../support/pooled-sqlite-adapter.js";
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
import { supportsRenameIndex } from "../support/mysql-server-version.js";
import { dumpTableSchema } from "../support/schema-dumping-helper.js";
import type { SchemaSource } from "../schema-dumper.js";
import { Base } from "../base.js";
import { Migration } from "../migration.js";
import { SchemaDumper } from "../schema-dumper.js";

const unlessSqlite3Adapter = adapterType !== "sqlite";

function validating(conn: AbstractAdapter): PostgreSQLAdapter {
  return conn as PostgreSQLAdapter;
}

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

    await this.removeForeignKey("houses", "cities");
    await this.addForeignKey("houses", "cities", { column: "city_id", onDelete: "cascade" });
  }
}

class CreateSchoolsAndClassesMigration extends SilentMigration {
  async change(): Promise<void> {
    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("schools");

    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("classes", (t) => {
      t.references("school");
    });
    await this.addForeignKey("classes", "schools", { validate: true });
  }
}

class CreateRocketsMigration extends SilentMigration {
  async change(): Promise<void> {
    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("rockets", (t) => {
      t.string("name");
    });

    // eslint-disable-next-line blazetrails/require-table-teardown
    await this.createTable("astronauts", (t) => {
      t.string("name");
      t.references("rocket", { foreignKey: true });
    });
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
    fixtures([], { useTransactionalTests: false });

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
        expect(foreignKeys.every((fk) => fk.toTable === "rockets")).toBeTruthy();
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
        const e = await assertRaises([StatementInvalid], {}, () =>
          conn.addForeignKey("missions", "rockets"),
        );
        expect(e.message).toMatch(/missions/);
      });
    });

    it("add foreign key with non existent to table raises", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const e = await assertRaises([StatementInvalid], {}, () =>
          conn.addForeignKey("missions", "rockets"),
        );
        expect(e.message).toMatch(/missions/);
      });
    });

    it("foreign key exists", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");

        expect(await conn.foreignKeyExists("astronauts", "rockets")).toBeTruthy();
        expect(await conn.foreignKeyExists("astronauts", "stars")).toBeFalsy();
      });
    });

    it("foreign key exists referencing table having keyword as name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.createTable("user", { force: true });
        await conn.addColumn("rockets", "user_id", "bigint");
        try {
          await conn.addForeignKey("rockets", "user");
          expect(await conn.foreignKeyExists("rockets", "user")).toBeTruthy();
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

        expect(await conn.foreignKeyExists("astronauts", { column: "rocket_id" })).toBeTruthy();
        expect(await conn.foreignKeyExists("astronauts", { column: "star_id" })).toBeFalsy();
      });
    });

    it.skipIf(adapterType === "sqlite")("foreign key exists by name", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          name: "fancy_named_fk",
        });

        expect(await conn.foreignKeyExists("astronauts", { name: "fancy_named_fk" })).toBeTruthy();
        expect(
          await conn.foreignKeyExists("astronauts", { name: "other_fancy_named_fk" }),
        ).toBeFalsy();
      });
    });

    it("foreign key exists in change table", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.changeTable("astronauts", async (t) => {
          await t.foreignKey("rockets", { column: "rocket_id", name: "fancy_named_fk" });

          expect(await t.foreignKeyExists({ column: "rocket_id" })).toBeTruthy();
          expect(await t.foreignKeyExists({ column: "star_id" })).toBeFalsy();

          if (unlessSqlite3Adapter) {
            expect(await t.foreignKeyExists({ name: "fancy_named_fk" })).toBeTruthy();
            expect(await t.foreignKeyExists({ name: "other_fancy_named_fk" })).toBeFalsy();
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
        const e = await assertRaises([ArgumentError], {}, () =>
          conn.removeForeignKey("astronauts", "rockets"),
        );
        expect(e.message).toBe("Table 'astronauts' has no foreign key for rockets");
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
        assertEmpty(await conn.foreignKeys("astronauts"));
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
        expect(fk.isValidated).toBeFalsy();
      });
    });

    itIfSupports("validate_constraints", "validate foreign key infers column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { validate: false });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeFalsy();

        await validating(conn).validateForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeTruthy();
      });
    });

    itIfSupports("validate_constraints", "validate foreign key by column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeFalsy();

        await validating(conn).validateForeignKey("astronauts", undefined, {
          column: "rocket_id",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeTruthy();
      });
    });

    itIfSupports("validate_constraints", "validate foreign key by symbol column", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeFalsy();

        await validating(conn).validateForeignKey("astronauts", undefined, {
          column: "rocket_id",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeTruthy();
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
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeFalsy();

        await validating(conn).validateForeignKey("astronauts", undefined, {
          name: "fancy_named_fk",
        });
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeTruthy();
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
        expect((await conn.foreignKeys("astronauts"))[0].isValidated).toBeTruthy();
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

    it.skipIf(adapterSupports("validate_constraints"))("add invalid foreign key", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", {
          column: "rocket_id",
          validate: false,
        });

        const foreignKeys = await conn.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(1);

        const fk = foreignKeys[0];
        expect(fk.isValidated).toBeTruthy();
      });
    });

    it("remove foreign key with if exists not set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        const error = await assertRaises([Error], {}, () =>
          conn.removeForeignKey("astronauts", "rockets"),
        );

        expect(error.message).toBe("Table 'astronauts' has no foreign key for rockets");
      });
    });

    it("remove foreign key with if exists set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets", { ifExists: true });
        expect(await conn.foreignKeys("astronauts")).toEqual([]);

        await assertNothingRaised(() =>
          conn.removeForeignKey("astronauts", "rockets", { ifExists: true }),
        );
      });
    });

    it("does not create foreign keys when bypassed by config", async () => {
      const pool = newSqlitePool(":memory:", { foreignKeys: false });
      const connection = await pool.checkout();

      try {
        // eslint-disable-next-line blazetrails/require-table-teardown -- throwaway :memory: pool, disconnected in the finally
        await connection.createTable("rockets", { force: true }, (t) => {
          t.string("name");
        });

        // eslint-disable-next-line blazetrails/require-table-teardown -- throwaway :memory: pool, disconnected in the finally
        await connection.createTable("astronauts", { force: true }, (t) => {
          t.string("name");
          t.references("rocket");
        });

        await connection.addForeignKey("astronauts", "rockets");

        const foreignKeys = await connection.foreignKeys("astronauts");
        expect(foreignKeys.length).toBe(0);
      } finally {
        await pool.disconnect();
      }
    });

    it("add foreign key with if not exists not set", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets");
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        if (adapterType === "sqlite") {
          await assertNothingRaised(() => conn.addForeignKey("astronauts", "rockets"));
          return;
        }

        const error = await assertRaises([Error], {}, () =>
          conn.addForeignKey("astronauts", "rockets"),
        );
        const message = error.message;

        if (adapterType === "mysql") {
          const mysqlConn = conn as unknown as {
            isMariadb?: () => Promise<boolean>;
            databaseVersion: unknown;
          };
          if ((await mysqlConn.isMariadb?.()) === true) {
            expect(message).toMatch(/Duplicate key on write or update/);
          } else if (String(await mysqlConn.databaseVersion) < "8.0") {
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

        await assertNothingRaised(() =>
          conn.addForeignKey("astronauts", "rockets", { ifNotExists: true }),
        );
      });
    });

    it("add foreign key preserves existing column types", async () => {
      const conn = await ambientConnection();
      await withRocketTables(conn, async () => {
        const columnFor = async (tableName: string, columnName: string) =>
          (await conn.columns(tableName)).find((column) => column.name === columnName);

        await assertNoChanges(
          async () => (await columnFor("astronauts", "rocket_id"))?.isBigint(),
          null,
          { from: true },
          () => conn.addForeignKey("astronauts", "rockets"),
        );
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
        const output = await dumpTableSchema(conn as unknown as SchemaSource, "fk_test_has_fk");
        if (adapterType === "sqlite") {
          expect(output).toMatch(
            /\s+await ctx\.addForeignKey\("fk_test_has_fk", "fk_test_has_pk", \{ column: "fk_id", primaryKey: "pk_id" \}\);$/m,
          );
        } else {
          expect(output).toMatch(
            /\s+await ctx\.addForeignKey\("fk_test_has_fk", "fk_test_has_pk", \{ column: "fk_id", primaryKey: "pk_id", name: "fk_name" \}\);$/m,
          );
        }
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

        await assertQueriesMatch(deferrableClause, undefined, false, addTheKey);

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

  function changeColumnTables(prefix: string, suffix: string) {
    const rockets = `${prefix}rockets${suffix}`;
    const astronauts = `${prefix}astronauts${suffix}`;

    return {
      rockets,
      astronauts,
      withChangeColumnTables: async (body: (conn: AbstractAdapter) => Promise<void>) => {
        const conn = await ambientConnection();
        await conn.dropTable(astronauts, rockets, { ifExists: true });
        const migration = new CreateRocketsMigration();
        await migration.migrate("up");
        try {
          await body(conn);
        } finally {
          await migration.migrate("down");
          await conn.dropTable(astronauts, rockets, { ifExists: true });
        }
      },
      createRocketWithAstronaut: async (conn: AbstractAdapter) => {
        await conn.executeMutation(
          `INSERT INTO ${conn.quoteTableName(rockets)} (name) VALUES ('myrocket')`,
        );
        const rows = (await conn.execute(
          `SELECT id FROM ${conn.quoteTableName(rockets)}`,
        )) as Array<{ id: number }>;
        await conn.executeMutation(
          `INSERT INTO ${conn.quoteTableName(astronauts)} (rocket_id) VALUES (${rows[0].id})`,
        );
      },
      rocketName: async (conn: AbstractAdapter): Promise<string> => {
        const rows = (await conn.execute(
          `SELECT name FROM ${conn.quoteTableName(rockets)} ORDER BY id`,
        )) as Array<{ name: string }>;
        return rows[0].name;
      },
    };
  }

  describe("ForeignKeyChangeColumnTest", () => {
    fixtures([], { useTransactionalTests: false });

    const { rockets, astronauts, withChangeColumnTables, createRocketWithAstronaut, rocketName } =
      changeColumnTables("", "");

    beforeEach(() => {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
    });

    afterEach(() => {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
    });

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

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.removeForeignKey(astronauts, { column: "rocket_id" });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column in change table", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.changeTable(astronauts, async (t) => {
          await t.removeForeignKey({ column: "rocket_id" });
        });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });
  });

  describe("ForeignKeyChangeColumnWithPrefixTest", () => {
    fixtures([], { useTransactionalTests: false });

    const { rockets, astronauts, withChangeColumnTables, createRocketWithAstronaut, rocketName } =
      changeColumnTables("p_", "");

    beforeEach(() => {
      Base.tableNamePrefix = "p_";
      Base.tableNameSuffix = "";
    });

    afterEach(() => {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
    });

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

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.removeForeignKey(astronauts, { column: "rocket_id" });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column in change table", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.changeTable(astronauts, async (t) => {
          await t.removeForeignKey({ column: "rocket_id" });
        });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });
  });

  describe("ForeignKeyChangeColumnWithSuffixTest", () => {
    fixtures([], { useTransactionalTests: false });

    const { rockets, astronauts, withChangeColumnTables, createRocketWithAstronaut, rocketName } =
      changeColumnTables("", "_s");

    beforeEach(() => {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "_s";
    });

    afterEach(() => {
      Base.tableNamePrefix = "";
      Base.tableNameSuffix = "";
    });

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

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.removeForeignKey(astronauts, { column: "rocket_id" });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });

    it("remove foreign key by column in change table", async () => {
      await withChangeColumnTables(async (conn) => {
        await createRocketWithAstronaut(conn);

        await conn.changeTable(astronauts, async (t) => {
          await t.removeForeignKey({ column: "rocket_id" });
        });

        assertEmpty(await conn.foreignKeys(astronauts));
      });
    });
  });

  describe("CompositeForeignKeyTest", () => {
    fixtures([], { useTransactionalTests: false });

    it("add composite foreign key raises without options", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        const error = await assertRaises([StatementInvalid], {}, () =>
          conn.addForeignKey("astronauts", "rockets"),
        );

        const message = error.message;
        if (adapterType === "postgres") {
          expect(message).toMatch(
            /there is no unique constraint matching given keys for referenced table "rockets"/,
          );
        } else if (adapterType === "sqlite") {
          expect(message).toMatch(/foreign key mismatch - "astronauts" referencing "rockets"/);
        }
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
        await assertRaises(
          [ArgumentError],
          { match: ":column must reference all the :primary_key columns" },
          () =>
            conn.addForeignKey("astronauts", "rockets", {
              column: "rocket_id",
              primaryKey: ["tenant_id", "id"],
            }),
        );
      });
    });

    it("foreign key exists", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        expect(await conn.foreignKeyExists("astronauts", "rockets")).toBeTruthy();
        expect(await conn.foreignKeyExists("astronauts", "stars")).toBeFalsy();
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
        ).toBeTruthy();
        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            column: ["rocket_tenant_id", "rocket_id"],
            primaryKey: ["tenant_id", "id"],
          }),
        ).toBeTruthy();

        expect(
          await conn.foreignKeyExists("astronauts", "rockets", {
            primaryKey: ["id", "tenant_id"],
          }),
        ).toBeFalsy();
        expect(
          await conn.foreignKeyExists("astronauts", "rockets", { primaryKey: "id" }),
        ).toBeFalsy();
        expect(
          await conn.foreignKeyExists("astronauts", "rockets", { column: "rocket_id" }),
        ).toBeFalsy();
      });
    });

    it("remove foreign key", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });
        expect((await conn.foreignKeys("astronauts")).length).toBe(1);

        await conn.removeForeignKey("astronauts", "rockets");
        assertEmpty(await conn.foreignKeys("astronauts"));
      });
    });

    it("schema dumping", async () => {
      const conn = await ambientConnection();
      await withCompositeRocketTables(conn, async () => {
        await conn.addForeignKey("astronauts", "rockets", { primaryKey: ["tenant_id", "id"] });

        const output = await dumpTableSchema(conn as unknown as SchemaSource, "astronauts");

        expect(output).toMatch(
          /\s+await ctx\.addForeignKey\("astronauts", "rockets", \{ column: \["rocket_tenant_id","rocket_id"\], primaryKey: \["tenant_id","id"\] \}\);$/m,
        );
      });
    });
  });
});
