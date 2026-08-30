import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { Migration as ActiveRecordMigration, Migrator, type MigrationProxy } from "../migration.js";
import { SchemaMigration } from "../schema-migration.js";
import { InternalMetadata } from "../internal-metadata.js";

class MigrationStruct {
  constructor(
    readonly name: string,
    readonly version: number,
  ) {}

  get disableDdlTransaction(): boolean {
    return false;
  }

  async migrate(_direction: "up" | "down"): Promise<void> {}

  migration(): ActiveRecordMigration {
    return this as unknown as ActiveRecordMigration;
  }
}

describe("Migration", () => {
  describe("LoggerTest", () => {
    let schemaMigration: SchemaMigration;
    let internalMetadata: InternalMetadata;

    beforeEach(async () => {
      const pool = Base.connectionPool();
      schemaMigration = new SchemaMigration(pool);
      await schemaMigration.createTable();
      await schemaMigration.deleteAllVersions();
      internalMetadata = new InternalMetadata(pool);
    });

    afterEach(async () => {
      await schemaMigration.deleteAllVersions();
    });

    it("migration should be run without logger", async () => {
      const previousLogger = Base.logger;
      Base.logger = null;
      const migrations: MigrationProxy[] = [
        new MigrationStruct("a", 1),
        new MigrationStruct("b", 2),
        new MigrationStruct("c", 3),
      ];
      try {
        await expect(
          new Migrator("up", migrations, schemaMigration, internalMetadata).migrate(),
        ).resolves.not.toThrow();
      } finally {
        Base.logger = previousLogger;
      }
    });
  });
});
