import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base, Migration, Migrator } from "../index.js";
import type { MigrationProxy } from "../migration.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { ambientConnection } from "../support/rocket-tables.js";

describe("Migration", () => {
  describe("CompatibilityTest", () => {
    let connection: AbstractAdapter;
    let verboseWas: boolean;

    const migrate = async (migration: Migration) => {
      const pool = Base.connectionPool();
      await new Migrator(
        "up",
        [migration as unknown as MigrationProxy],
        pool.schemaMigration,
        pool.internalMetadata,
      ).migrate();
    };

    beforeEach(async () => {
      connection = await ambientConnection();
      verboseWas = Migration.verbose;
      Migration.verbose = false;

      await connection.createTable("testings", { force: true }, (t) => {
        t.column("foo", "string", { limit: 5 });
        t.column("bar", "string", { limit: 100 });
      });
    });

    afterEach(async () => {
      await connection.dropTable("testings", "more_testings", { ifExists: true });
      Migration.verbose = verboseWas;
      await Base.connectionPool().schemaMigration.deleteAllVersions();
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

      expect(await connection.indexExists("testings", "foo", { name: "custom_index_name" })).toBe(
        true,
      );
      await expect(migrate(migration)).rejects.toThrow(Error);
      expect(await connection.indexExists("testings", "foo", { name: "custom_index_name" })).toBe(
        true,
      );
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

      expect(await connection.indexExists("testings", "bar")).toBe(true);
      await migrate(migration);
      expect(await connection.indexExists("testings", "bar")).toBe(false);
    });

    it("references does not add index by default", async () => {
      const migration = new (class extends Migration.get(4.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings", (t) => {
            t.references("foo");
            t.belongsTo("bar", { index: false });
          });
        }
      })();

      await migrate(migration);

      expect(await connection.indexExists("more_testings", "foo_id")).toBe(false);
      expect(await connection.indexExists("more_testings", "bar_id")).toBe(false);
    });

    it("timestamps have null constraints if not present in migration of create table", async () => {
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
      ).toBe(true);
      expect(
        await connection.columnExists("more_testings", "updated_at", null, { null: true }),
      ).toBe(true);
    });

    it("timestamps have null constraints if not present in migration for adding timestamps to existing table", async () => {
      const migration = new (class extends Migration.get(4.2) {
        override async migrate(_x: unknown): Promise<void> {
          await this.addTimestamps("testings");
        }
      })();

      await migrate(migration);

      expect(await connection.columnExists("testings", "created_at", null, { null: true })).toBe(
        true,
      );
      expect(await connection.columnExists("testings", "updated_at", null, { null: true })).toBe(
        true,
      );
    });

    it("legacy primary key is integer", async () => {
      const migration = new (class extends Migration.get(5.0) {
        override async migrate(_x: unknown): Promise<void> {
          await this.createTable("more_testings");
        }
      })();

      await migrate(migration);

      const column = (await connection.columns("more_testings")).find((c) => c.name === "id");
      expect(column?.type).toBe("integer");
    });
  });
});
