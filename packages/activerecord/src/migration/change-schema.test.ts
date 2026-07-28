/**
 * Port of `test_change_column_null` from `ActiveRecord::Migration::
 * ChangeSchemaTest` (vendor/rails/activerecord/test/cases/migration/
 * change_schema_test.rb:397-411). The rest of change_schema_test.rb is
 * unported.
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. `testings` is created
 * and dropped by the test in Rails too, so it is not a canonical-schema table.
 */
import { describe, it, expect, afterEach } from "vitest";
import { Migration } from "../migration.js";
import { ambientConnection } from "../support/rocket-tables.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";

/** Rails' `suppress_messages { migration.migrate(...) }`. */
class SilentMigration extends Migration {
  write(): void {}
}

class NotnullMigration extends SilentMigration {
  async change(): Promise<void> {
    await this.changeColumnNull("testings", "foo", false);
  }
}

/** change_schema_test.rb:489-495. */
async function testingTableWithOnlyFooAttribute(
  connection: AbstractAdapter,
  body: () => Promise<void>,
): Promise<void> {
  await connection.createTable("testings", { id: false }, (t) => {
    t.column("foo", "string");
  });

  await body();
}

describe("Migration", () => {
  afterEach(async () => {
    const connection = await ambientConnection();
    await connection.dropTable("testings", { ifExists: true });
  });

  describe("ChangeSchemaTest", () => {
    it("change column null", async () => {
      const connection = await ambientConnection();
      await testingTableWithOnlyFooAttribute(connection, async () => {
        const notnullMigration = new NotnullMigration();
        await notnullMigration.migrate("up");
        expect((await connection.columns("testings")).find((c) => c.name === "foo")!.null).toBe(
          false,
        );
        await notnullMigration.migrate("down");
        expect((await connection.columns("testings")).find((c) => c.name === "foo")!.null).toBe(
          true,
        );
      });
    });
  });
});
