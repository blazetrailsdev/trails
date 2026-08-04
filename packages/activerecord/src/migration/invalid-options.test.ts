/**
 * Port of `ActiveRecord::Migration::InvalidOptionsTest`
 * (vendor/rails/activerecord/test/cases/migration/invalid_options_test.rb).
 *
 * Only the `create_table` arm is ported here; the `add_column`,
 * `add_reference` and `add_index` arms land with their own convergence.
 */
import { describe, it, expect, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { currentAdapter } from "../support/adapter-helper.js";

function invalidCreateTableOptionExceptionMessage(key: string): string {
  const tableKeys = [
    ":temporary",
    ":ifNotExists",
    ":options",
    ":as",
    ":comment",
    ":charset",
    ":collation",
  ];
  const primaryKeys = [":limit", ":default", ":precision"];

  if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    primaryKeys.push(":unsigned", ":autoIncrement");
  } else if (currentAdapter("SQLite3Adapter")) {
    tableKeys.push(":rename");
  }

  return `Unknown key: :${key}. Valid keys are: ${[...tableKeys, ...primaryKeys].join(", ")}`;
}

describe("Migration", () => {
  // Rails leaves no teardown here — the raise means `my_table` is never
  // created — but a leaked table would collide with sibling files under
  // parallel forks, so drop it defensively.
  afterEach(async () => {
    const connection = await ambientConnection();
    await connection.dropTable("my_table", { ifExists: true });
  });

  describe("InvalidOptionsTest", () => {
    it("create table with invalid options", async () => {
      const connection = await ambientConnection();

      const exception = await connection
        .createTable("my_table", { idd: false } as Record<string, unknown>, () => {})
        .then(
          () => null,
          (error: Error) => error,
        );

      expect(exception?.name).toBe("ArgumentError");
      expect(exception?.message).toBe(invalidCreateTableOptionExceptionMessage("idd"));
    });
  });
});
