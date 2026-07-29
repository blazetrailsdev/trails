/**
 * Port of `ActiveRecord::Migration::ChangeSchemaTest` and
 * `ActiveRecord::Migration::ChangeSchemaWithDependentObjectsTest`
 * (vendor/rails/activerecord/test/cases/migration/change_schema_test.rb).
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. `testings` is created
 * and dropped by the test in Rails too, so it is not a canonical-schema table.
 *
 * Four cases are still unported — the bigint/timestamp/datetime `sql_type`
 * assertions. Each needs `type_to_sql` to source its base names from
 * `native_database_types` rather than a hardcoded uppercase switch; tracked by
 * the `converge-type-to-sql-base-names-on-native-database-types` story.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { Migration } from "../migration.js";
import { NotNullViolation, StatementInvalid } from "../errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { ambientConnection } from "../support/rocket-tables.js";
import { withPostgresqlDatetimeType } from "../support/with-postgresql-datetime-type.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { adapterType } from "../test-adapter.js";
import { describeIfSupports } from "../support/supports.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { Column } from "../connection-adapters/column.js";

class SilentMigration extends Migration {
  write(): void {}
}

class NotnullMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.changeColumnNull("testings", "foo", false);
  }
}

async function testingTableWithOnlyFooAttribute(
  connection: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await connection.createTable("testings", { id: false }, (t) => {
    t.column("foo", "string");
  });

  await body();
}

function detect(columns: readonly Column[], name: string): Column {
  return columns.find((c) => c.name === name)!;
}

// MySQL doesn't allow defaults on TEXT or BLOB columns.
const mysql = currentAdapter("Mysql2Adapter", "TrilogyAdapter");

describe("Migration", () => {
  describe("ChangeSchemaTest", () => {
    afterEach(async () => {
      const connection = await ambientConnection();
      await connection.dropTable("testings", { ifExists: true });
      Base.primaryKeyPrefixType = null;
      Base.clearCacheBang();
    });

    it("create table without id", async () => {
      const connection = await ambientConnection();
      await testingTableWithOnlyFooAttribute(connection, async () => {
        expect((await connection.columns("testings")).length).toBe(1);
      });
    });

    it("add column with primary key attribute", async () => {
      const connection = await ambientConnection();
      await testingTableWithOnlyFooAttribute(connection, async () => {
        await connection.addColumn("testings", "id", "primary_key");
        expect((await connection.columns("testings")).length).toBe(2);
      });
    });

    it("create table adds id", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });

      expect((await connection.columns("testings")).map((c) => c.name)).toEqual(["id", "foo"]);
    });

    it("create table with not null column", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string", { null: false });
      });

      await expect(connection.execute("insert into testings (foo) values (NULL)")).rejects.toThrow(
        NotNullViolation,
      );
    });

    it("create table with defaults", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("one", "string", { default: "hello" });
        t.column("two", "boolean", { default: true });
        t.column("three", "boolean", { default: false });
        t.column("four", "integer", { default: 1 });
        if (!mysql) t.column("five", "text", { default: "hello" });
      });

      const columns = await connection.columns("testings");
      const one = detect(columns, "one");
      const two = detect(columns, "two");
      const three = detect(columns, "three");
      const four = detect(columns, "four");
      const five = mysql ? undefined : detect(columns, "five");

      expect(one.default).toBe("hello");
      expect((await connection.lookupCastTypeFromColumn(two))!.deserialize(two.default)).toBe(true);
      expect((await connection.lookupCastTypeFromColumn(three))!.deserialize(three.default)).toBe(
        false,
      );
      expect(four.default).toBe("1");
      // eslint-disable-next-line vitest/no-conditional-in-test
      if (!mysql) expect(five!.default).toBe("hello");
    });

    it.skipIf(adapterType !== "postgres")("add column with array", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings");
      await connection.addColumn("testings", "foo", "string", { array: true });

      const columns = await connection.columns("testings");
      const arrayColumn = detect(columns, "foo");

      expect((arrayColumn as unknown as { isArray(): boolean }).isArray()).toBe(true);
    });

    it.skipIf(adapterType !== "postgres")("create table with array column", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.string("foo", { array: true });
      });

      const columns = await connection.columns("testings");
      const arrayColumn = detect(columns, "foo");

      expect((arrayColumn as unknown as { isArray(): boolean }).isArray()).toBe(true);
    });

    it("create table with limits", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string", { limit: 255 });

        t.column("default_int", "integer");

        t.column("one_int", "integer", { limit: 1 });
        t.column("four_int", "integer", { limit: 4 });
        t.column("eight_int", "integer", { limit: 8 });
      });

      const columns = await connection.columns("testings");
      const foo = detect(columns, "foo");
      expect(foo.limit).toBe(255);

      const defaultInt = detect(columns, "default_int");
      const one = detect(columns, "one_int");
      const four = detect(columns, "four_int");
      const eight = detect(columns, "eight_int");

      // eslint-disable-next-line vitest/no-conditional-in-test
      if (currentAdapter("PostgreSQLAdapter")) {
        expect(defaultInt.sqlType).toBe("integer");
        expect(one.sqlType).toBe("smallint");
        expect(four.sqlType).toBe("integer");
        expect(eight.sqlType).toBe("bigint");
      } else if (mysql) {
        expect(defaultInt.sqlType).toMatch(/^int/);
        expect(one.sqlType).toMatch(/^tinyint/);
        expect(four.sqlType).toMatch(/^int/);
        expect(eight.sqlType).toMatch(/^bigint/);
      }
    });

    it("create table with primary key prefix as table name with underscore", async () => {
      Base.primaryKeyPrefixType = "table_name_with_underscore";
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });

      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "testing_id",
        "foo",
      ]);
    });

    it("create table with primary key prefix as table name", async () => {
      Base.primaryKeyPrefixType = "table_name";
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });

      expect((await connection.columns("testings")).map((c) => c.name)).toEqual([
        "testingid",
        "foo",
      ]);
    });

    it("create table raises when redefining primary key column", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.createTable("testings", (t) => {
          t.column("id", "string");
        }),
      ).rejects.toThrow(
        new ArgumentError(
          "you can't redefine the primary key column 'id' on 'testings'. To define a custom primary key, pass { id: false } to create_table.",
        ),
      );
    });

    it("create table raises when redefining custom primary key column", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.createTable("testings", { primaryKey: "testing_id" }, (t) => {
          t.column("testing_id", "string");
        }),
      ).rejects.toThrow(
        new ArgumentError(
          "you can't redefine the primary key column 'testing_id' on 'testings'. To define a custom primary key, pass { id: false } to create_table.",
        ),
      );
    });

    it("create table raises when defining existing column", async () => {
      const connection = await ambientConnection();
      await expect(
        connection.createTable("testings", (t) => {
          t.column("testing_column", "string");
          t.column("testing_column", "integer");
        }),
      ).rejects.toThrow(
        new ArgumentError(
          "you can't define an already defined column 'testing_column' on 'testings'.",
        ),
      );
    });

    it("create table with timestamps should create datetime columns", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.timestamps();
      });
      const createdColumns = await connection.columns("testings");

      expect(detect(createdColumns, "created_at").null).toBeFalsy();
      expect(detect(createdColumns, "updated_at").null).toBeFalsy();
    });

    it("create table with timestamps should create datetime columns with options", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.timestamps({ null: true });
      });
      const createdColumns = await connection.columns("testings");

      expect(detect(createdColumns, "created_at").null).toBeTruthy();
      expect(detect(createdColumns, "updated_at").null).toBeTruthy();
    });

    it("create table without a block", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings");
      expect(await connection.tableExists("testings")).toBeTruthy();
    });

    // SQLite3 will not allow you to add a NOT NULL
    // column to a table without a default value.
    it.skipIf(adapterType === "sqlite")("add column not null without default", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });
      await connection.addColumn("testings", "bar", "string", { null: false });

      await expect(
        connection.execute("insert into testings (foo, bar) values ('hello', NULL)"),
      ).rejects.toThrow(NotNullViolation);
    });

    it("add column not null with default", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });

      const quotedId = connection.quoteColumnName("id");
      const quotedFoo = connection.quoteColumnName("foo");
      const quotedBar = connection.quoteColumnName("bar");
      await connection.execute(
        `insert into testings (${quotedId}, ${quotedFoo}) values (1, 'hello')`,
      );
      await connection.addColumn("testings", "bar", "string", { null: false, default: "default" });

      await expect(
        connection.execute(
          `insert into testings (${quotedId}, ${quotedFoo}, ${quotedBar}) values (2, 'hello', NULL)`,
        ),
      ).rejects.toThrow(NotNullViolation);
    });

    it.skipIf(adapterType !== "postgres")(
      "add column with datetime in timestamptz mode",
      async () => {
        await withPostgresqlDatetimeType("timestamptz", async () => {
          const connection = await ambientConnection();
          await connection.createTable("testings", (t) => {
            t.column("foo", "datetime");
          });

          const column = detect(await connection.columns("testings"), "foo");
          expect(column.type).toBe("datetime");
          expect(column.sqlType).toBe("timestamp(6) with time zone");
        });
      },
    );

    it("change column quotes column names", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("select", "string");
      });

      await connection.changeColumn("testings", "select", "string", { limit: 10 });

      await connection.execute(
        `insert into testings (${connection.quoteColumnName("select")}) values ('7 chars')`,
      );

      expect(Number(await connection.selectValue("SELECT COUNT(*) FROM testings"))).toBe(1);
    });

    it("keeping default and notnull constraints on change", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("title", "string");
      });
      class PersonKlass extends Base {}
      PersonKlass.tableName = "testings";
      const personConnection = await PersonKlass.leaseConnection();

      await personConnection.addColumn("testings", "wealth", "integer", {
        null: false,
        default: 99,
      });
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnDefaults["wealth"]).toBe(99);
      expect(PersonKlass.columnsHash()["wealth"].null).toBe(false);
      await personConnection.execute("insert into testings (title) values ('tester')");

      // change column default to see that column doesn't lose its not null definition
      await personConnection.changeColumnDefault("testings", "wealth", 100);
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnDefaults["wealth"]).toBe(100);
      expect(PersonKlass.columnsHash()["wealth"].null).toBe(false);

      // rename column to see that column doesn't lose its not null and/or default definition
      await personConnection.renameColumn("testings", "wealth", "money");
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnsHash()["wealth"]).toBeUndefined();
      expect(PersonKlass.columnDefaults["money"]).toBe(100);
      expect(PersonKlass.columnsHash()["money"].null).toBe(false);

      // change column
      await personConnection.changeColumn("testings", "money", "integer", {
        null: false,
        default: 1000,
      });
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnDefaults["money"]).toBe(1000);
      expect(PersonKlass.columnsHash()["money"].null).toBe(false);

      // change column, make it nullable and clear default
      await personConnection.changeColumn("testings", "money", "integer", {
        null: true,
        default: null,
      });
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnsHash()["money"].default).toBeNull();
      expect(PersonKlass.columnsHash()["money"].null).toBe(true);

      // change_column_null, make it not nullable and set null values to a default value
      await personConnection.execute("UPDATE testings SET money = NULL");
      await personConnection.changeColumnNull("testings", "money", false, 2000);
      PersonKlass.resetColumnInformation();
      await PersonKlass.loadSchema();
      expect(PersonKlass.columnsHash()["money"].default).toBeNull();
      expect(PersonKlass.columnsHash()["money"].null).toBe(false);
      expect(Number((await connection.selectValues("SELECT money FROM testings"))[0])).toBe(2000);
    });

    it("change column null", async () => {
      const connection = await ambientConnection();
      await testingTableWithOnlyFooAttribute(connection, async () => {
        const notnullMigration = new NotnullMigration();
        await notnullMigration.migrate("up");
        expect(detect(await connection.columns("testings"), "foo").null).toBe(false);
        await notnullMigration.migrate("down");
        expect(detect(await connection.columns("testings"), "foo").null).toBe(true);
      });
    });

    it("column exists", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
      });

      expect(await connection.columnExists("testings", "foo")).toBeTruthy();
      expect(await connection.columnExists("testings", "bar")).toBeFalsy();
    });

    it("column exists with type", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string");
        t.column("bar", "decimal", { precision: 8, scale: 2 });
      });

      expect(await connection.columnExists("testings", "foo", "string")).toBeTruthy();
      expect(await connection.columnExists("testings", "foo", "integer")).toBeFalsy();

      expect(await connection.columnExists("testings", "bar", "decimal")).toBeTruthy();
      expect(await connection.columnExists("testings", "bar", "integer")).toBeFalsy();
    });

    it("column exists with definition", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.column("foo", "string", { limit: 100 });
        t.column("bar", "decimal", { precision: 8, scale: 2 });
        t.column("taggable_id", "integer", { null: false });
        t.column("taggable_type", "string", { default: "Photo" });
      });

      expect(
        await connection.columnExists("testings", "foo", "string", { limit: 100 }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "foo", "string", { limit: null }),
      ).toBeFalsy();
      expect(
        await connection.columnExists("testings", "bar", "decimal", { precision: 8, scale: 2 }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "bar", "decimal", {
          precision: null,
          scale: null,
        }),
      ).toBeFalsy();
      expect(
        await connection.columnExists("testings", "taggable_id", "integer", { null: false }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "taggable_id", "integer", { null: true }),
      ).toBeFalsy();
      expect(
        await connection.columnExists("testings", "taggable_type", "string", { default: "Photo" }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "taggable_type", "string", { default: null }),
      ).toBeFalsy();
    });

    it("column exists on table with no options parameter supplied", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings", (t) => {
        t.string("foo");
      });
      await connection.changeTable("testings", async (t) => {
        expect(await t.isColumnExists("foo")).toBeTruthy();
        expect(await t.isColumnExists("bar")).toBeFalsy();
      });
    });

    it("drop table if exists", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings");
      expect(await connection.tableExists("testings")).toBeTruthy();
      await connection.dropTable("testings", { ifExists: true });
      expect(await connection.tableExists("testings")).toBeFalsy();
    });

    it("drop tables if exists", async () => {
      const connection = await ambientConnection();
      await connection.createTable("testings");
      await connection.createTable("sobrinho");
      expect(await connection.tableExists("testings")).toBeTruthy();
      expect(await connection.tableExists("sobrinho")).toBeTruthy();
      await connection.dropTable("testings", "sobrinho", { ifExists: true });
      expect(await connection.tableExists("testings")).toBeFalsy();
      expect(await connection.tableExists("sobrinho")).toBeFalsy();
    });

    it("drop table if exists nothing raised", async () => {
      const connection = await ambientConnection();
      await connection.dropTable("nonexistent", { ifExists: true });
    });

    it("drop tables if exists nothing raised", async () => {
      const connection = await ambientConnection();
      await connection.dropTable("nonexistent", "nonexistent_sobrinho", { ifExists: true });
    });
  });

  describeIfSupports("foreign_keys", "ChangeSchemaWithDependentObjectsTest", () => {
    beforeEach(async () => {
      const connection = await ambientConnection();
      // eslint-disable-next-line blazetrails/require-table-teardown
      await connection.createTable("trains");
      // eslint-disable-next-line blazetrails/require-table-teardown
      await connection.createTable("wagons", (t) => {
        t.references("train");
      });
      await connection.addForeignKey("wagons", "trains");
    });

    afterEach(async () => {
      const connection = await ambientConnection();
      for (const table of ["wagons", "trains"]) {
        await connection.dropTable(table, { ifExists: true });
      }
    });

    it.skipIf(adapterType !== "postgres")(
      "create table with force cascade drops dependent objects",
      async () => {
        const connection = await ambientConnection();
        // can't re-create table referenced by foreign key
        await expect(connection.createTable("trains", { force: true })).rejects.toThrow(
          StatementInvalid,
        );

        // can recreate referenced table with force: :cascade
        await connection.createTable("trains", { force: "cascade" });
        expect(await connection.foreignKeys("wagons")).toEqual([]);
      },
    );
  });
});
