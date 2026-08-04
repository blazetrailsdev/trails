/**
 * Port of `ActiveRecord::Migration::InvalidOptionsTest`
 * (vendor/rails/activerecord/test/cases/migration/invalid_options_test.rb).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ambientConnection } from "../support/rocket-tables.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { adapterType } from "../test-adapter.js";

function invalidAddColumnOptionExceptionMessage(key: string): string {
  const defaultKeys = [
    ":limit",
    ":precision",
    ":scale",
    ":default",
    ":null",
    ":collation",
    ":comment",
    ":primaryKey",
    ":ifExists",
    ":ifNotExists",
  ];

  if (currentAdapter("Mysql2Adapter", "TrilogyAdapter")) {
    defaultKeys.push(
      ":autoIncrement",
      ":charset",
      ":as",
      ":size",
      ":unsigned",
      ":first",
      ":after",
      ":type",
      ":stored",
    );
  } else if (currentAdapter("PostgreSQLAdapter")) {
    defaultKeys.push(":array", ":using", ":castAs", ":as", ":type", ":enumType", ":stored");
  } else if (currentAdapter("SQLite3Adapter")) {
    defaultKeys.push(":as", ":type", ":stored");
  }

  return `Unknown key: :${key}. Valid keys are: ${defaultKeys.join(", ")}`;
}

function invalidAddIndexOptionExceptionMessage(key: string): string {
  return `Unknown key: :${key}. Valid keys are: :unique, :length, :order, :opclass, :where, :type, :using, :comment, :algorithm, :include, :nullsNotDistinct`;
}

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
  beforeEach(async () => {
    const connection = await ambientConnection();
    await connection.createTable("test_models", { force: true }, (t) => {
      t.timestamps({ null: true });
    });
  });

  afterEach(async () => {
    const connection = await ambientConnection();
    await connection.dropTable("my_table", "test_models", { ifExists: true });
  });

  describe("InvalidOptionsTest", () => {
    it("add reference with invalid options", async () => {
      const connection = await ambientConnection();

      let work = connection.createTable("my_table", { force: true }, (t) => {
        t.references("some_table", { boringKey: true } as Record<string, unknown>);
      });
      let exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddColumnOptionExceptionMessage("boringKey"));

      work = connection.addReference("some_table", "some_column", {
        boringKey: true,
      } as Record<string, unknown>);
      exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddColumnOptionExceptionMessage("boringKey"));
    });

    it("add column with invalid options", async () => {
      const connection = await ambientConnection();

      let work = connection.addColumn("test_models", "first_name", "string", {
        preccision: true,
      } as Record<string, unknown>);
      let exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddColumnOptionExceptionMessage("preccision"));

      work = connection.createTable("my_table", { force: true }, (t) => {
        t.string("first_name", { index: { nema: "test" } } as Record<string, unknown>);
      });
      exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddIndexOptionExceptionMessage("nema"));
    });

    it("add index with invalid options", async () => {
      const connection = await ambientConnection();

      const work = connection.addIndex("test_models", "first_name", {
        nema: "my_index",
      } as Record<string, unknown>);
      const exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddIndexOptionExceptionMessage("nema"));
    });

    it.skipIf(adapterType === "sqlite")("change column with invalid options", async () => {
      const connection = await ambientConnection();

      const work = connection.changeColumn("posts", "title", "text", {
        liimit: true,
      } as Record<string, unknown>);
      const exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidAddColumnOptionExceptionMessage("liimit"));
    });

    it("create table with invalid options", async () => {
      const connection = await ambientConnection();

      const work = connection.createTable(
        "my_table",
        { idd: false } as Record<string, unknown>,
        () => {},
      );
      const exception = (await work.catch((error: Error) => error)) as Error;
      await expect(work).rejects.toThrow(expect.objectContaining({ name: "ArgumentError" }));

      expect(exception.message).toBe(invalidCreateTableOptionExceptionMessage("idd"));
    });
  });
});
