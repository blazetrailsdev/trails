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
