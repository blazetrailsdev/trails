import { block as rbBlock } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  assertDifference,
  assertMatch,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import { rbInspect, StandardError } from "@blazetrails/ruby-compat";
import { Time as RubyTime } from "@blazetrails/date";
import { Base, Migration, Migrator, NotNullViolation } from "../index.js";
import type { MigrationProxy } from "../migration.js";
import type { SchemaMigration } from "../schema-migration.js";
import type { InternalMetadata } from "../internal-metadata.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import type { AbstractMysqlAdapter } from "../connection-adapters/abstract-mysql-adapter.js";
import type { Column as MysqlColumn } from "../connection-adapters/mysql/column.js";
import type { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { ambientConnection } from "../support/rocket-tables.js";
import {
  currentAdapter,
  disableExtensionBang,
  enableExtensionBang,
} from "../support/adapter-helper.js";
import { itIfSupports } from "../support/supports.js";
import { fixtures } from "../test-fixtures.js";
import { dumpTableSchema } from "../support/schema-dumping-helper.js";

class TestModel extends Base {}
class Testing extends Base {
  declare foo: string | null;
}
TestModel.tableName = "testings";

const precisionImplicitDefault = () =>
  currentAdapter("Mysql2Adapter", "TrilogyAdapter") ? { precision: 0 } : { precision: null };

describe("Migration", () => {
  describe("CompatibilityTest", () => {
    fixtures({}, { useTransactionalTests: false });
    let connection: AbstractAdapter;
    let pool: ReturnType<typeof Base.connectionPool>;
    let schemaMigration: SchemaMigration;
    let internalMetadata: InternalMetadata;
    let verboseWas: boolean | undefined;

    const migrate = async (migration: Migration) => {
      await new Migrator(
        "up",
        [migration as unknown as MigrationProxy],
        schemaMigration,
        internalMetadata,
      ).migrate();
    };

    beforeEach(async () => {
      connection = await ambientConnection();
      pool = Base.connectionPool();
      schemaMigration = pool.schemaMigration;
      internalMetadata = pool.internalMetadata;
      verboseWas = Migration.verbose;
      Migration.verbose = false;

      await connection.createTable("testings", {}, (t) => {
        t.column("foo", "string", { limit: 5 });
        t.column("bar", "string", { limit: 100 });
      });
    });

    afterEach(async () => {
      await connection.dropTable("testings").catch(() => null);
      Migration.verbose = verboseWas;
      await schemaMigration.deleteAllVersions().catch(() => null);
    });

    it("migration doesnt remove named index", async () => {
      await connection.addIndex("testings", "foo", { name: "custom_index_name" });

      const migration = new (class extends Migration.get(4.2) {
        override get version(): number {
          return 101;
        }

        override async migrate(_x: unknown): Promise<void> {
          await this.removeIndex("testings", "foo");
        }
      })();

      expect(
        await connection.indexExists("testings", "foo", { name: "custom_index_name" }),
      ).toBeTruthy();
      await expect(migrate(migration)).rejects.toThrow(Error);
      expect(
        await connection.indexExists("testings", "foo", { name: "custom_index_name" }),
      ).toBeTruthy();
    });

    it("migration does remove unnamed index", async () => {
      await connection.addIndex("testings", "bar");

      const migration = new (class extends Migration.get(4.2) {
        override get version(): number {
          return 101;
        }

        override async migrate(_x: unknown): Promise<void> {
          await this.removeIndex("testings", "bar");
        }
      })();

      expect(await connection.indexExists("testings", "bar")).toBeTruthy();
      await migrate(migration);
      expect(await connection.indexExists("testings", "bar")).toBeFalsy();
    });

    it("references does not add index by default", async () => {
      try {
        const migration = new (class extends Migration.get(4.2) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.references("foo");
              t.belongsTo("bar", { index: false });
            });
          }
        })();

        await migrate(migration);

        expect(await connection.indexExists("more_testings", "foo_id")).toBeFalsy();
        expect(await connection.indexExists("more_testings", "bar_id")).toBeFalsy();
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("timestamps have null constraints if not present in migration of create table", async () => {
      try {
        const migration = new (class extends Migration.get(4.2) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.timestamps();
            });
          }
        })();

        await migrate(migration);

        expect(
          await connection.columnExists("more_testings", "created_at", null, { null: true }),
        ).toBeTruthy();
        expect(
          await connection.columnExists("more_testings", "updated_at", null, { null: true }),
        ).toBeTruthy();
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("timestamps have null constraints if not present in migration of change table", async () => {
      const migration = new (class extends Migration.get(4.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeTable("testings", {}, async (t) => {
            await t.timestamps();
          });
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "created_at", null, { null: true }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "updated_at", null, { null: true }),
      ).toBeTruthy();
    });

    itIfSupports(
      "bulk_alter",
      "timestamps have null constraints if not present in migration of change table with bulk",
      async () => {
        const migration = new (class extends Migration.get(4.2) {
          override async migrate(_x: unknown): Promise<void> {
            await this.changeTable("testings", { bulk: true }, async (t) => {
              await t.timestamps();
            });
          }
        })();

        await migrate(migration);

        expect(
          await connection.columnExists("testings", "created_at", null, { null: true }),
        ).toBeTruthy();
        expect(
          await connection.columnExists("testings", "updated_at", null, { null: true }),
        ).toBeTruthy();
      },
    );

    it("timestamps have null constraints if not present in migration for adding timestamps to existing table", async () => {
      const migration = new (class extends Migration.get(4.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addTimestamps("testings");
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "created_at", null, { null: true }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "updated_at", null, { null: true }),
      ).toBeTruthy();
    });
    it("legacy migrations raises exception when inherited", async () => {
      const e = await assertRaises([StandardError], {}, () => {
        class LegacyMigration extends Migration {}
        new LegacyMigration();
      });
      assertMatch(/LegacyMigration < ActiveRecord::Migration\[\d\.\d\]/, e.message);
    });

    it("legacy migrations not raise exception on reverting transaction", async () => {
      const migration = new (class extends Migration.get(5.2) {
        async change(): Promise<void> {
          await this.transaction(async () => {
            await this.execute("select 1");
          });
        }
      })();

      await assertNothingRaised(async () => {
        await migration.migrate("down");
      });
    });

    it("timestamps doesnt set precision on create table", async () => {
      try {
        const migration = new (class extends Migration.get(5.2) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.timestamps();
            });
          }
        })();

        await migrate(migration);

        expect(
          await connection.columnExists("more_testings", "created_at", null, {
            null: false,
            ...precisionImplicitDefault(),
          }),
        ).toBeTruthy();
        expect(
          await connection.columnExists("more_testings", "updated_at", null, {
            null: false,
            ...precisionImplicitDefault(),
          }),
        ).toBeTruthy();
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("timestamps doesnt set precision on change table", async () => {
      const migration = new (class extends Migration.get(5.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeTable("testings", {}, async (t) => {
            await t.timestamps({ default: RubyTime.now() });
          });
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "created_at", null, {
          null: false,
          ...precisionImplicitDefault(),
        }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "updated_at", null, {
          null: false,
          ...precisionImplicitDefault(),
        }),
      ).toBeTruthy();
    });

    itIfSupports(
      "bulk_alter",
      "timestamps doesnt set precision on change table with bulk",
      async () => {
        const migration = new (class extends Migration.get(5.2) {
          override async migrate(_x: unknown): Promise<void> {
            await this.changeTable("testings", { bulk: true }, async (t) => {
              await t.timestamps();
            });
          }
        })();

        await migrate(migration);

        expect(
          await connection.columnExists("testings", "created_at", null, {
            null: false,
            ...precisionImplicitDefault(),
          }),
        ).toBeTruthy();
        expect(
          await connection.columnExists("testings", "updated_at", null, {
            null: false,
            ...precisionImplicitDefault(),
          }),
        ).toBeTruthy();
      },
    );

    it("create table allows duplicate column names", async () => {
      const migration = new (class extends Migration.get(5.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("tests", (t) => {
            t.integer("some_id");
            t.string("some_id");
          });
        }
      })();

      try {
        await migrate(migration);

        const column = (await connection.columns("tests")).find((c) => c.name === "some_id");
        expect(column?.type).toBe("string");
      } finally {
        await connection.dropTable("tests", { ifExists: true });
      }
    });

    it("timestamps sets default precision on create table", async () => {
      try {
        const migration = new (class extends Migration.get(6.1) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.timestamps();
            });
          }
        })();

        await migrate(migration);

        expect(
          await connection.columnExists("more_testings", "created_at", null, { precision: 6 }),
        ).toBeTruthy();
        expect(
          await connection.columnExists("more_testings", "updated_at", null, { precision: 6 }),
        ).toBeTruthy();
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("change table allows if exists option on 7 0", async () => {
      const migration = new (class extends Migration.get(7.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeTable("testings", {}, async (t) => {
            await t.remove("foo", { ifExists: true });
          });
        }
      })();

      await migrate(migration);

      expect(await connection.columnExists("testings", "foo")).toBeFalsy();
    });

    it("add reference allows if exists option on 7 0", async () => {
      const migration = new (class extends Migration.get(7.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addReference("testings", "widget", { ifNotExists: true });
        }
      })();

      await migrate(migration);

      expect(await connection.columnExists("testings", "widget_id")).toBeTruthy();
    });

    it("references on create table on 6 0", async () => {
      try {
        const migration = new (class extends Migration.get(6.0) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.references("testings");
            });
          }
        })();

        await migrate(migration);

        const column = (await connection.columns("more_testings")).find(
          (el) => el.name === "testings_id",
        );

        if (currentAdapter("SQLite3Adapter")) {
          expect(column!.sqlType).toMatch(/integer/i);
        } else {
          expect(column!.isBigint()).toBeTruthy();
        }
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
      "change table collation not unset 7 0",
      async () => {
        const migration = new (class extends Migration.get(7.0) {
          override async migrate(_x: unknown): Promise<void> {
            await this.addColumn("testings", "txt_collated", "string", {
              charset: "utf8mb4",
              collation: "utf8mb4_general_ci",
            });
            await this.changeColumn("testings", "txt_collated", "string", {
              default: "hi",
              collation: "utf8mb4_esperanto_ci",
            });
          }
        })();
        await migrate(migration);
        const column = (await connection.columns("testings")).find(
          (c) => c.name === "txt_collated",
        )!;
        expect(column.default).toBe("hi");
        expect(column.collation).toBe("utf8mb4_esperanto_ci");
      },
    );

    it("add reference on 6 0", async () => {
      try {
        const createMigration = new (class extends Migration.get(6.0) {
          override get version(): number {
            return 100;
          }

          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.string("test");
            });
          }
        })();

        const migration = new (class extends Migration.get(6.0) {
          override get version(): number {
            return 101;
          }

          override async migrate(_x: unknown): Promise<void> {
            await this.addReference("more_testings", "testings");
          }
        })();

        const pool = Base.connectionPool();
        await new Migrator(
          "up",
          [createMigration, migration] as unknown as MigrationProxy[],
          pool.schemaMigration,
          pool.internalMetadata,
        ).migrate();

        const column = (await connection.columns("more_testings")).find(
          (el) => el.name === "testings_id",
        );

        if (currentAdapter("SQLite3Adapter")) {
          expect(column!.sqlType).toMatch(/integer/i);
        } else {
          expect(column!.isBigint()).toBeTruthy();
        }
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("add index errors on too long name 7 0", async () => {
      const migration = new (class extends Migration.get(7.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addColumn("testings", "very_long_column_name_to_test_with", "string");
          await this.addIndex("testings", ["foo", "bar", "very_long_column_name_to_test_with"]);
        }
      })();

      const error = await assertRaises([StandardError], {}, () => migrate(migration));

      expect(error.message).toMatch(
        /index_testings_on_foo_and_bar_and_very_long_column_name_to_test_with/i,
      );
      expect(error.message).toMatch(/is too long/i);
    });

    it("create table add index errors on too long name 7 0", async () => {
      try {
        const migration = new (class extends Migration.get(7.0) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("more_testings", (t) => {
              t.integer("foo");
              t.integer("bar");
              t.integer("very_long_column_name_to_test_with");
              t.index(["foo", "bar", "very_long_column_name_to_test_with"]);
            });
          }
        })();

        const error = await assertRaises([StandardError], {}, () => migrate(migration));

        expect(error.message).toMatch(
          /index_more_testings_on_foo_and_bar_and_very_long_column_name_to_test_with/i,
        );
        expect(error.message).toMatch(/is too long/i);
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
      }
    });

    it("invert rename table on 7 0", async () => {
      await connection.createTable("more_testings");

      const migration = new (class extends Migration.get(7.0) {
        async change(): Promise<void> {
          await this.renameTable("more_testings", "new_more_testings");
        }
      })();

      try {
        await migration.migrate("up");
        expect(await connection.tableExists("new_more_testings")).toBeTruthy();
        expect(await connection.tableExists("more_testings")).toBeFalsy();

        await migration.migrate("down");
        expect(await connection.tableExists("new_more_testings")).toBeFalsy();
        expect(await connection.tableExists("more_testings")).toBeTruthy();
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
        await connection.dropTable("new_more_testings").catch(() => null);
      }
    });

    it("timestamps doesnt set precision on add timestamps", async () => {
      const migration = new (class extends Migration.get(5.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addTimestamps("testings", { default: RubyTime.now() });
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "created_at", null, {
          null: false,
          ...precisionImplicitDefault(),
        }),
      ).toBeTruthy();
      expect(
        await connection.columnExists("testings", "updated_at", null, {
          null: false,
          ...precisionImplicitDefault(),
        }),
      ).toBeTruthy();
    });

    itIfSupports("comments", "change column comment can be reverted", async () => {
      const migration = new (class extends Migration.get(5.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.revert(
            rbBlock(async () => {
              await this.changeColumnComment("testings", "foo", "comment");
            }),
          );
        }
      })();

      await migrate(migration);
      expect(
        await connection.columnExists("testings", "foo", null, { comment: "comment" }),
      ).toBeTruthy();
    });

    itIfSupports("comments", "change table comment can be reverted", async () => {
      const migration = new (class extends Migration.get(5.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.revert(
            rbBlock(async () => {
              await this.changeTableComment("testings", "comment");
            }),
          );
        }
      })();

      await migrate(migration);

      expect(await connection.tableComment("testings")).toBe("comment");
    });

    it("datetime doesnt set precision on add column 5 0", async () => {
      const migration = new (class extends Migration.get(5.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addColumn("testings", "published_at", "datetime", { default: RubyTime.now() });
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "published_at", null, precisionImplicitDefault()),
      ).toBeTruthy();
    });

    it("datetime doesnt set precision on add column 6 1", async () => {
      const migration = new (class extends Migration.get(6.1) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addColumn("testings", "published_at", "datetime", { default: RubyTime.now() });
        }
      })();

      await migrate(migration);

      expect(
        await connection.columnExists("testings", "published_at", null, precisionImplicitDefault()),
      ).toBeTruthy();
    });

    it("rename table errors on too long index name 7 0", async () => {
      const longTableName = "a".repeat(connection.tableNameLength());

      const migration = new (class extends Migration.get(7.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addIndex("testings", "foo");
          const longTableName = "a".repeat(connection.tableNameLength());
          await this.renameTable("testings", longTableName);
        }
      })();

      try {
        const error = await assertRaises([StandardError], {}, () => migrate(migration));

        expect(error.message).toMatch(new RegExp(`index_${longTableName}_on_foo`, "i"));
        expect(error.message).toMatch(/is too long/i);
      } finally {
        await connection.dropTable(longTableName, { ifExists: true });
      }
    });

    it("create table on 7 0", async () => {
      const longTableName = "a".repeat(connection.tableNameLength() + 1);
      const migration = new (class extends Migration.get(7.0) {
        override get version(): number {
          return 100;
        }

        override async migrate(_x: unknown): Promise<void> {
          await this.createTable(longTableName);
        }
      })();

      try {
        if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
          const error = await assertRaises([StandardError], {}, () => migrate(migration));
          if (await (connection as AbstractMysqlAdapter).isMariadb()) {
            expect(error.message).toMatch(
              new RegExp(`Incorrect table name '${longTableName}'`, "i"),
            );
          } else {
            expect(error.message).toMatch(
              new RegExp(`Identifier name '${longTableName}' is too long`, "i"),
            );
          }
        } else {
          await migrate(migration);
          expect(await connection.tableExists(longTableName)).toBeTruthy();
        }
      } finally {
        await connection.dropTable(longTableName).catch(() => null);
      }
    });

    it("rename table on 7 0", async () => {
      const longTableName = "a".repeat(connection.tableNameLength() + 1);
      await connection.createTable("more_testings");

      const migration = new (class extends Migration.get(7.0) {
        override get version(): number {
          return 100;
        }

        override async migrate(_x: unknown): Promise<void> {
          await this.renameTable("more_testings", longTableName);
        }
      })();

      try {
        if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
          const error = await assertRaises([StandardError], {}, () => migrate(migration));
          if (await (connection as AbstractMysqlAdapter).isMariadb()) {
            expect(error.message).toMatch(
              new RegExp(`Incorrect table name '${longTableName}'`, "i"),
            );
          } else {
            expect(error.message).toMatch(
              new RegExp(`Identifier name '${longTableName}' is too long`, "i"),
            );
          }
        } else {
          await migrate(migration);
          expect(await connection.tableExists(longTableName)).toBeTruthy();
          expect(await connection.tableExists("more_testings")).toBeFalsy();
          expect(await connection.tableExists(longTableName)).toBeTruthy();
        }
      } finally {
        await connection.dropTable("more_testings").catch(() => null);
        await connection.dropTable(longTableName).catch(() => null);
      }
    });

    it("change column null with non boolean arguments raises in a migration", async () => {
      const migration = class extends Migration.get(7.1) {
        async up(): Promise<void> {
          await this.addColumn("testings", "name", "string");
          await this.changeColumnNull("testings", "name", { ":from": true, ":to": false } as never);
        }
      };
      const e = await assertRaises([StandardError], {}, () =>
        migrate(migration as unknown as Migration),
      );
      expect(e.message).toContain(
        `change_column_null expects a boolean value (true for NULL, false for NOT NULL). Got: ${rbInspect({ ":from": true, ":to": false })}`,
      );
    });

    it("change column null with non boolean arguments does not raise in old rails versions", async () => {
      const migration = class extends Migration.get(7.0) {
        async up(): Promise<void> {
          await this.addColumn("testings", "name", "string");
          await this.changeColumnNull("testings", "name", { ":from": true, ":to": false } as never);
        }
      };
      await assertNothingRaised(() => migrate(migration as unknown as Migration));
      await assertDifference(new Map([[() => TestModel.count(), 1]]), null, async () => {
        await TestModel.createBang({ name: null });
      });
    });

    it("change column null with boolean arguments does not raise in old rails versions", async () => {
      const migration = class extends Migration.get(7.0) {
        async up(): Promise<void> {
          await this.addColumn("testings", "name", "string");
          await this.changeColumnNull("testings", "name", false);
        }
      };
      await assertNothingRaised(() => migrate(migration as unknown as Migration));
      await assertRaises([NotNullViolation], {}, async () => {
        await TestModel.createBang({ name: null });
      });
    });

    it.skipIf(!currentAdapter("PostgreSQLAdapter"))(
      "legacy change column with null executes update",
      async () => {
        const migration = new (class extends Migration.get(5.1) {
          override async migrate(_x: unknown): Promise<void> {
            await this.changeColumn("testings", "foo", "string", {
              limit: 10,
              null: false,
              default: "foobar",
            });
          }
        })();

        try {
          await Testing.createBang();
          await migrate(migration);
          expect((await Testing.all()).map((testing) => testing.foo)).toEqual(["foobar"]);
        } finally {
          Base.clearCacheBang();
        }
      },
    );

    it.skipIf(!currentAdapter("PostgreSQLAdapter"))("disable extension on 7 0", async () => {
      await enableExtensionBang("hstore", connection as PostgreSQLAdapter);
      const migration = class extends Migration.get(7.0) {
        async up(): Promise<void> {
          await this.addColumn("testings", "settings", "hstore");
          await this.disableExtension("hstore");
        }
      };

      try {
        await migrate(migration as unknown as Migration);
        expect(await (connection as PostgreSQLAdapter).extensionEnabled("hstore")).toBeFalsy();
      } finally {
        await disableExtensionBang("hstore", connection as PostgreSQLAdapter);
      }
    });

    it.skipIf(!currentAdapter("PostgreSQLAdapter"))(
      "legacy add foreign key with deferrable true",
      async () => {
        const migration = new (class extends Migration.get(7.0) {
          override async migrate(_x: unknown): Promise<void> {
            await this.createTable("sub_testings", (t) => {
              t.bigint("testing_id");
            });
            await this.addForeignKey("sub_testings", "testings", {
              name: "deferrable_foreign_key",
              deferrable: true as never,
            });
          }
        })();

        try {
          await migrate(migration);
          const foreignKeys = await (await Testing.leaseConnection()).foreignKeys("sub_testings");
          expect(foreignKeys.length).toBe(1);
          expect(foreignKeys[0].deferrable).toBe("immediate");
        } finally {
          await connection.dropTable("sub_testings", { ifExists: true });
          Base.clearCacheBang();
        }
      },
    );

    it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
      "change column on 7 0",
      async () => {
        const migration = class extends Migration.get(7.0) {
          async up(): Promise<void> {
            await this.execute("ALTER TABLE testings CONVERT TO CHARACTER SET utf32");
            await this.changeColumn("testings", "foo", "varchar(255) CHARACTER SET ascii");
          }
        };
        await assertNothingRaised(async () => {
          await new Migrator(
            "up",
            [migration as unknown as MigrationProxy],
            schemaMigration,
            internalMetadata,
          ).migrate();
        });
      },
    );
  });
});

type MigrationClass = () => ReturnType<typeof Migration.get>;

interface BaseCompatibilityTest {
  connection: AbstractAdapter;
  schemaMigration: SchemaMigration;
  internalMetadata: InternalMetadata;
  migrationClass: MigrationClass;
}

function baseCompatibilityTest(migrationClass: MigrationClass): BaseCompatibilityTest {
  fixtures({});
  const state = { migrationClass } as BaseCompatibilityTest;
  let verboseWas: boolean | undefined;

  beforeEach(async () => {
    state.connection = await ambientConnection();
    const pool = Base.connectionPool();
    state.schemaMigration = pool.schemaMigration;
    state.internalMetadata = pool.internalMetadata;

    verboseWas = Migration.verbose;
    Migration.verbose = false;
  });

  afterEach(async () => {
    Migration.verbose = verboseWas;
    await state.schemaMigration.deleteAllVersions().catch(() => null);
  });

  return state;
}

function noOptionValidationTestCases(test: BaseCompatibilityTest): void {
  it("options are not validated", async () => {
    try {
      const migration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("tests", { wrongId: false } as never, (t) => {
            t.references("some_table", { wrongPrimaryKey: true } as never);
            t.integer("some_id", { wrongUnique: true } as never);
            t.string("some_string_column", { wrongNull: false } as never);
          });

          await this.addColumn("tests", "last_name", "string", { wrongPrecision: true } as never);

          await this.changeColumn("tests", "some_id", "float", { wrongIndex: true } as never);

          await this.addReference("tests", "another_table", {
            invalidOption: "something",
          } as never);

          await this.changeTable("tests", {}, async (t) => {
            await t.change("some_id", "float", { null: false, wrongIndex: true } as never);
            await t.integer("another_id", { wrongUnique: true } as never);
            await t.references("yet_another_table", { bad: "option" } as never);
          });
        }
      })();

      await new Migrator(
        "up",
        [migration as unknown as MigrationProxy],
        test.schemaMigration,
        test.internalMetadata,
      ).migrate();

      expect(await test.connection.tableExists("tests")).toBeTruthy();
    } finally {
      await test.connection.dropTable("tests", { ifExists: true });
    }
  });
}

function defaultPrecisionImplicitTestCases(test: BaseCompatibilityTest): void {
  const migrate = async (...migrations: Migration[]) => {
    await new Migrator(
      "up",
      migrations as unknown as MigrationProxy[],
      test.schemaMigration,
      test.internalMetadata,
    ).migrate();
  };

  it("datetime doesnt set precision on change table", async () => {
    try {
      const createMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.datetime("published_at");
          });
        }
      })(null, 1);

      const changeMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeTable("more_testings", {}, async (t) => {
            await t.change("published_at", "datetime", { default: RubyTime.now() });
          });
        }
      })(null, 2);

      await migrate(createMigration, changeMigration);

      expect(
        await test.connection.columnExists(
          "more_testings",
          "published_at",
          null,
          precisionImplicitDefault(),
        ),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("datetime doesnt set precision on create table", async () => {
    try {
      const migration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.datetime("published_at");
          });
        }
      })();

      await migrate(migration);

      expect(
        await test.connection.columnExists(
          "more_testings",
          "published_at",
          null,
          precisionImplicitDefault(),
        ),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("datetime doesnt set precision on change column", async () => {
    try {
      const createMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.date("published_at");
          });
        }
      })(null, 0);

      const changeMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeColumn("more_testings", "published_at", "datetime");
        }
      })(null, 1);

      await migrate(createMigration, changeMigration);

      expect(
        await test.connection.columnExists(
          "more_testings",
          "published_at",
          null,
          precisionImplicitDefault(),
        ),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });
}

function defaultPrecisionSixTestCases(test: BaseCompatibilityTest): void {
  const migrate = async (...migrations: Migration[]) => {
    await new Migrator(
      "up",
      migrations as unknown as MigrationProxy[],
      test.schemaMigration,
      test.internalMetadata,
    ).migrate();
  };

  it("datetime sets precision 6 on change table", async () => {
    try {
      const createMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.datetime("published_at");
          });
        }
      })(null, 1);

      const changeMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeTable("more_testings", {}, async (t) => {
            await t.change("published_at", "datetime", { default: RubyTime.now() });
          });
        }
      })(null, 2);

      await migrate(createMigration, changeMigration);

      expect(
        await test.connection.columnExists("more_testings", "published_at", null, { precision: 6 }),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("datetime sets precision 6 on create table", async () => {
    try {
      const migration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.datetime("published_at");
          });
        }
      })();

      await migrate(migration);

      expect(
        await test.connection.columnExists("more_testings", "published_at", null, { precision: 6 }),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("datetime sets precision 6 on change column", async () => {
    try {
      const createMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.date("published_at");
          });
        }
      })(null, 0);

      const changeMigration = new (class extends test.migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.changeColumn("more_testings", "published_at", "datetime");
        }
      })(null, 1);

      await migrate(createMigration, changeMigration);

      expect(
        await test.connection.columnExists("more_testings", "published_at", null, { precision: 6 }),
      ).toBeTruthy();
    } finally {
      await test.connection.dropTable("more_testings").catch(() => null);
    }
  });
}

describe("CompatibilityTest7_0", () => {
  const test = baseCompatibilityTest(() => Migration.get(7.0));
  defaultPrecisionSixTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest6_1", () => {
  const test = baseCompatibilityTest(() => Migration.get(6.1));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest6_0", () => {
  const test = baseCompatibilityTest(() => Migration.get(6.0));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest5_2", () => {
  const test = baseCompatibilityTest(() => Migration.get(5.2));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest5_1", () => {
  const test = baseCompatibilityTest(() => Migration.get(5.1));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest5_0", () => {
  const test = baseCompatibilityTest(() => Migration.get(5.0));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

describe("CompatibilityTest4_2", () => {
  const test = baseCompatibilityTest(() => Migration.get(4.2));
  defaultPrecisionImplicitTestCases(test);
  noOptionValidationTestCases(test);
});

function legacyPolymorphicReferenceIndexTestCases(migrationClass: MigrationClass): void {
  fixtures({}, { useTransactionalTests: false });
  let connection: AbstractAdapter;
  let schemaMigration: SchemaMigration;
  let internalMetadata: InternalMetadata;
  let verboseWas: boolean | undefined;

  const migrate = async (migration: Migration) => {
    await new Migrator(
      "up",
      [migration as unknown as MigrationProxy],
      schemaMigration,
      internalMetadata,
    ).migrate();
  };

  beforeEach(async () => {
    connection = await ambientConnection();
    const pool = Base.connectionPool();
    schemaMigration = pool.schemaMigration;
    internalMetadata = pool.internalMetadata;
    verboseWas = Migration.verbose;
    Migration.verbose = false;

    await connection.createTable("testings", { ifNotExists: true });
  });

  afterEach(async () => {
    Migration.verbose = verboseWas;
    await schemaMigration.deleteAllVersions().catch(() => null);
    await connection.dropTable("testings").catch(() => null);
  });

  it("create table with polymorphic reference uses all column names in index", async () => {
    try {
      const migration = new (class extends migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.references("widget", { polymorphic: true, index: true });
            t.belongsTo("gizmo", { polymorphic: true, index: true });
          });
        }
      })();

      await migrate(migration);

      expect(
        await connection.indexExists("more_testings", ["widget_type", "widget_id"], {
          name: "index_more_testings_on_widget_type_and_widget_id",
        }),
      ).toBeTruthy();
      expect(
        await connection.indexExists("more_testings", ["gizmo_type", "gizmo_id"], {
          name: "index_more_testings_on_gizmo_type_and_gizmo_id",
        }),
      ).toBeTruthy();
    } finally {
      await connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("change table with polymorphic reference uses all column names in index", async () => {
    const migration = new (class extends migrationClass() {
      override async migrate(_x: unknown): Promise<void> {
        await this.changeTable("testings", {}, async (t) => {
          await t.references("widget", { polymorphic: true, index: true });
          await t.belongsTo("gizmo", { polymorphic: true, index: true });
        });
      }
    })();

    await migrate(migration);

    expect(
      await connection.indexExists("testings", ["widget_type", "widget_id"], {
        name: "index_testings_on_widget_type_and_widget_id",
      }),
    ).toBeTruthy();
    expect(
      await connection.indexExists("testings", ["gizmo_type", "gizmo_id"], {
        name: "index_testings_on_gizmo_type_and_gizmo_id",
      }),
    ).toBeTruthy();
  });

  it("create join table with polymorphic reference uses all column names in index", async () => {
    try {
      const migration = new (class extends migrationClass() {
        override async migrate(_x: unknown): Promise<void> {
          await this.createJoinTable("more", "testings", (t) => {
            t.references("widget", { polymorphic: true, index: true });
            t.belongsTo("gizmo", { polymorphic: true, index: true });
          });
        }
      })();

      await migrate(migration);

      expect(
        await connection.indexExists("more_testings", ["widget_type", "widget_id"], {
          name: "index_more_testings_on_widget_type_and_widget_id",
        }),
      ).toBeTruthy();
      expect(
        await connection.indexExists("more_testings", ["gizmo_type", "gizmo_id"], {
          name: "index_more_testings_on_gizmo_type_and_gizmo_id",
        }),
      ).toBeTruthy();
    } finally {
      await connection.dropTable("more_testings").catch(() => null);
    }
  });

  it("polymorphic add reference uses all column names in index", async () => {
    const migration = new (class extends migrationClass() {
      override async migrate(_x: unknown): Promise<void> {
        await this.addReference("testings", "widget", { polymorphic: true, index: true });
        await this.addBelongsTo("testings", "gizmo", { polymorphic: true, index: true });
      }
    })();

    await migrate(migration);

    expect(
      await connection.indexExists("testings", ["widget_type", "widget_id"], {
        name: "index_testings_on_widget_type_and_widget_id",
      }),
    ).toBeTruthy();
    expect(
      await connection.indexExists("testings", ["gizmo_type", "gizmo_id"], {
        name: "index_testings_on_gizmo_type_and_gizmo_id",
      }),
    ).toBeTruthy();
  });
}

describe("LegacyPolymorphicReferenceIndexTest", () => {
  describe("V6_0", () => {
    legacyPolymorphicReferenceIndexTestCases(() => Migration.get(6.0));
  });

  describe("V5_2", () => {
    legacyPolymorphicReferenceIndexTestCases(() => Migration.get(5.2));
  });

  describe("V5_1", () => {
    legacyPolymorphicReferenceIndexTestCases(() => Migration.get(5.1));
  });

  describe("V5_0", () => {
    legacyPolymorphicReferenceIndexTestCases(() => Migration.get(5.0));
  });

  describe("V4_2", () => {
    legacyPolymorphicReferenceIndexTestCases(() => Migration.get(4.2));
  });
});

class LegacyPrimaryKey extends Base {}

function legacyPrimaryKeyTestCases(migrationClass: () => ReturnType<typeof Migration.get>): void {
  fixtures({}, { useTransactionalTests: false });
  let migration: Migration | null;
  let verboseWas: boolean | undefined;
  const columnsHash = () => LegacyPrimaryKey.columnsHash();
  const dump = async (table: string) => dumpTableSchema(table);

  beforeEach(() => {
    migration = null;
    verboseWas = Migration.verbose;
    Migration.verbose = false;
  });

  afterEach(async () => {
    if (migration) await migration.migrate("down");
    const connection = await ambientConnection();
    await connection.dropTable("legacy_primary_keys", "apples_bananas", { ifExists: true });
    Migration.verbose = verboseWas;
    await Base.connectionPool()
      .schemaMigration.deleteAllVersions()
      .catch(() => null);
    LegacyPrimaryKey.resetColumnInformation();
  });

  const assertLegacyPrimaryKey = async () => {
    await LegacyPrimaryKey.loadSchema();
    expect(LegacyPrimaryKey.primaryKey).toBe("id");

    const legacyPk = columnsHash()["id"];
    expect(legacyPk.type).toBe("integer");
    expect(legacyPk.isBigint()).toBeFalsy();
    expect(legacyPk.null).toBeFalsy();

    if (currentAdapter("Mysql2Adapter", "TrilogyAdapter", "PostgreSQLAdapter")) {
      expect(await dump("legacy_primary_keys")).toMatch(
        /createTable\("legacy_primary_keys", \{ id: "(?:integer|serial)", (?!default: null)/,
      );
    }
  };

  it("legacy primary key should be auto incremented", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createTable("legacy_primary_keys", (t) => {
          t.references("legacy_ref");
        });
      }
    })();

    await migration.migrate("up");
    await assertLegacyPrimaryKey();
    expect(columnsHash()["legacy_ref_id"].isBigint()).toBeFalsy();

    const record1 = await LegacyPrimaryKey.createBang();
    expect(record1.id).not.toBeNull();
    await record1.destroy();
    const record2 = await LegacyPrimaryKey.createBang();
    expect(record2.id).not.toBeNull();
    expect(record2.id).toBeGreaterThan(record1.id as number);
  });

  it.skipIf(currentAdapter("SQLite3Adapter"))(
    "legacy integer primary key should not be auto incremented",
    async () => {
      migration = new (class extends migrationClass() {
        async change(): Promise<void> {
          await this.createTable("legacy_primary_keys", { id: "integer" }, () => {});
        }
      })();

      await migration.migrate("up");
      await assertRaises([NotNullViolation], {}, () => LegacyPrimaryKey.createBang());

      expect(await dump("legacy_primary_keys")).toMatch(
        /createTable\("legacy_primary_keys", \{ id: "integer", default: null/,
      );
    },
  );

  it("legacy primary key in create table should be integer", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createTable("legacy_primary_keys", { id: false }, (t) => {
          t.primaryKey("id");
        });
      }
    })();

    await migration.migrate("up");
    await assertLegacyPrimaryKey();
  });

  it("legacy primary key in change table should be integer", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createTable("legacy_primary_keys", { id: false }, (t) => {
          t.integer("dummy");
        });
        await this.changeTable("legacy_primary_keys", {}, async (t) => {
          await t.primaryKey("id");
        });
      }
    })();

    await migration.migrate("up");
    await assertLegacyPrimaryKey();
  });

  it("add column with legacy primary key should be integer", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createTable("legacy_primary_keys", { id: false }, (t) => {
          t.integer("dummy");
        });
        await this.addColumn("legacy_primary_keys", "id", "primary_key");
      }
    })();

    await migration.migrate("up");
    await assertLegacyPrimaryKey();
  });

  it("legacy join table foreign keys should be integer", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createJoinTable("apples", "bananas", () => {});
      }
    })();

    await migration.migrate("up");
    const schema = await dump("apples_bananas");
    expect(schema).toMatch(/integer\("apple_id", \{ null: false \}/);
    expect(schema).toMatch(/integer\("banana_id", \{ null: false \}/);
  });

  it("legacy join table column options should be overwritten", async () => {
    migration = new (class extends migrationClass() {
      async change(): Promise<void> {
        await this.createJoinTable("apples", "bananas", { columnOptions: { type: "bigint" } });
      }
    })();

    await migration.migrate("up");
    const schema = await dump("apples_bananas");
    expect(schema).toMatch(/bigint\("apple_id", \{ null: false \}/);
    expect(schema).toMatch(/bigint\("banana_id", \{ null: false \}/);
  });

  it.skipIf(!currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "legacy bigint primary key should be auto incremented",
    async () => {
      migration = new (class extends migrationClass() {
        async change(): Promise<void> {
          await this.createTable("legacy_primary_keys", { id: "bigint" });
        }
      })();

      await migration.migrate("up");

      await LegacyPrimaryKey.loadSchema();
      const legacyPk = columnsHash()["id"];
      expect(legacyPk.isBigint()).toBeTruthy();
      expect((legacyPk as MysqlColumn).isAutoIncrement()).toBeTruthy();

      expect(await dump("legacy_primary_keys")).toMatch(
        /createTable\("legacy_primary_keys", (?!\{ id: "bigint", default: null)/,
      );
    },
  );

  it.skipIf(currentAdapter("Mysql2Adapter", "TrilogyAdapter"))(
    "legacy bigint primary key should not be auto incremented",
    async () => {
      migration = new (class extends migrationClass() {
        async change(): Promise<void> {
          await this.createTable("legacy_primary_keys", { id: "bigint" }, () => {});
        }
      })();

      await migration.migrate("up");
      await assertRaises([NotNullViolation], {}, () => LegacyPrimaryKey.createBang());

      expect(await dump("legacy_primary_keys")).toMatch(
        /createTable\("legacy_primary_keys", \{ id: "bigint", default: null/,
      );
    },
  );
}

describe("LegacyPrimaryKeyTest", () => {
  describe("V5_0", () => {
    legacyPrimaryKeyTestCases(() => Migration.get(5.0));
  });

  describe("V4_2", () => {
    legacyPrimaryKeyTestCases(() => Migration.get(4.2));
  });
});
