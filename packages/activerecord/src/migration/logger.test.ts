import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { Migration as ActiveRecordMigration, Migrator, MigrationProxy } from "../migration.js";
import type { SchemaMigration } from "../schema-migration.js";
import type { InternalMetadata } from "../internal-metadata.js";

class MigrationStruct extends MigrationProxy {
  constructor(name: string, version: number) {
    super(name, version, "", "");
  }

  override get disableDdlTransaction(): boolean {
    return false;
  }

  override async migrate(_direction: "up" | "down"): Promise<void> {}

  override migration(): Promise<ActiveRecordMigration> {
    return Promise.resolve(this as unknown as ActiveRecordMigration);
  }
}

describe("Migration", () => {
  describe("LoggerTest", () => {
    let schemaMigration: SchemaMigration;
    let internalMetadata: InternalMetadata;

    beforeEach(async () => {
      schemaMigration = Base.connectionPool().schemaMigration;
      await schemaMigration.createTable();
      await schemaMigration.deleteAllVersions();
      internalMetadata = Base.connectionPool().internalMetadata;
    });

    afterEach(async () => {
      await schemaMigration.deleteAllVersions();
    });

    it("migration should be run without logger", async () => {
      const previousLogger = Base.logger;
      Base.logger = null;
      const migrations = [
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
