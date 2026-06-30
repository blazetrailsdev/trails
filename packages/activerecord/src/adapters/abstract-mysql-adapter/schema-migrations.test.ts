/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/schema_migrations_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaMigration } from "../../schema-migration.js";
import { InternalMetadata } from "../../internal-metadata.js";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("SchemaMigrationsTest", () => {
    it("renaming index on foreign key", async () => {
      // Fixture tables — mirrors Rails engines/cars fixtures, renamed off canonical names
      await adapter.executeMutation("DROP TABLE IF EXISTS `ca_engines`");
      await adapter.executeMutation("DROP TABLE IF EXISTS `ca_cars`");
      await adapter.executeMutation(
        "CREATE TABLE `ca_cars` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB",
      );
      await adapter.executeMutation(
        "CREATE TABLE `ca_engines` (`id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, `car_id` BIGINT) ENGINE=InnoDB",
      );
      try {
        await adapter.addIndex("ca_engines", "car_id");
        // Explicit column: addForeignKey would otherwise infer the FK column from
        // the to-table singular (`ca_car_id`), which doesn't exist on ca_engines.
        await adapter.addForeignKey("ca_engines", "ca_cars", {
          name: "fk_engines_cars",
          column: "car_id",
        });

        await adapter.renameIndex("ca_engines", "index_ca_engines_on_car_id", "idx_renamed");
        const idxNames = (await adapter.indexes("ca_engines")).map((i: { name: string }) => i.name);
        expect(idxNames).toContain("idx_renamed");
        expect(idxNames).not.toContain("index_ca_engines_on_car_id");

        await adapter.removeForeignKey("ca_engines", { name: "fk_engines_cars" });
      } finally {
        await adapter.executeMutation("DROP TABLE IF EXISTS `ca_engines`");
        await adapter.executeMutation("DROP TABLE IF EXISTS `ca_cars`");
      }
    });

    it("initializes schema migrations for encoding utf8mb4", async () => {
      await withEncodingUtf8mb4(adapter, async () => {
        const schemaMigration = new SchemaMigration(adapter);
        const tableName = schemaMigration.tableName;
        await adapter.dropTable(tableName, { ifExists: true });
        await schemaMigration.createTable();
        expect(await adapter.columnExists(tableName, "version")).toBe(true);
      });
    });

    it("initializes internal metadata for encoding utf8mb4", async () => {
      await withEncodingUtf8mb4(adapter, async () => {
        const internalMetadata = new InternalMetadata(adapter);
        const tableName = internalMetadata.tableName;
        await adapter.dropTable(tableName, { ifExists: true });
        await internalMetadata.createTable();
        expect(await adapter.columnExists(tableName, "key")).toBe(true);
        // Restore environment entry so other tests don't see a missing metadata row
        await internalMetadata.createTableAndSetFlags("test");
      });
    });
  });
});

/**
 * Mirrors Rails' `with_encoding_utf8mb4` helper — changes the test database's default
 * character set to utf8mb4, runs the block, then restores the original charset/collation.
 */
async function withEncodingUtf8mb4(adapter: Mysql2Adapter, fn: () => Promise<void>): Promise<void> {
  const rows = (await adapter.execute(
    "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME " +
      "FROM information_schema.schemata WHERE schema_name = DATABASE()",
  )) as Array<Record<string, string>>;
  if (!rows[0]) throw new Error("Could not read database charset from information_schema.schemata");
  const originalCharset = rows[0].DEFAULT_CHARACTER_SET_NAME;
  const originalCollation = rows[0].DEFAULT_COLLATION_NAME;

  await adapter.executeMutation("ALTER DATABASE DEFAULT CHARACTER SET utf8mb4");
  try {
    await fn();
  } finally {
    await adapter.executeMutation(
      `ALTER DATABASE DEFAULT CHARACTER SET ${originalCharset} COLLATE ${originalCollation}`,
    );
  }
}
