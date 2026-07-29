/**
 * Port of `test_rename_table` from `ActiveRecord::Migration::RenameTableTest`
 * (vendor/rails/activerecord/test/cases/migration/rename_table_test.rb:43-49).
 * The rest of rename_table_test.rb is unported.
 *
 * Driven by the ambient connection, mirroring Rails'
 * `@connection = ActiveRecord::Base.lease_connection`. `test_models` is not a
 * canonical-schema table in Rails either — `Migration::TestHelper`'s setup
 * creates and drops it (migration/helper.rb:20-34) — so this mirrors that
 * rather than reaching for the canonical schema.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";

describe("Migration", () => {
  beforeEach(async () => {
    const connection = await ambientConnection();
    await connection.createTable("test_models", { force: true }, (t) => {
      t.timestamps({ null: true });
    });
    await connection.addColumn("test_models", "url", "string");
    await connection.removeColumn("test_models", "created_at");
    await connection.removeColumn("test_models", "updated_at");
  });

  afterEach(async () => {
    const connection = await ambientConnection();
    if (await connection.tableExists("octopi")) {
      await connection.renameTable("octopi", "test_models");
    }
    await connection.dropTable("test_models", { ifExists: true });
  });

  describe("RenameTableTest", () => {
    it("rename table", async () => {
      const connection = await ambientConnection();
      await connection.renameTable("test_models", "octopi");

      await connection.execute(
        `INSERT INTO octopi (${connection.quoteColumnName("id")}, ${connection.quoteColumnName("url")}) VALUES (1, 'http://www.foreverflying.com/octopus-black7.jpg')`,
      );

      expect(await connection.selectValue("SELECT url FROM octopi WHERE id=1")).toBe(
        "http://www.foreverflying.com/octopus-black7.jpg",
      );
    });
  });
});
