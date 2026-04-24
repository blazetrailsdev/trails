/**
 * Mirrors Rails activerecord/test/cases/adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SQLite3Adapter } from "./connection-adapters/sqlite3-adapter.js";
import { ReadOnlyError } from "./errors.js";

let adapter: SQLite3Adapter;

beforeEach(() => {
  adapter = new SQLite3Adapter(":memory:");
  adapter.exec(`CREATE TABLE "subscribers" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "nick" TEXT)`);
});

afterEach(() => {
  adapter.close();
});

describe("AdapterPreventWritesTest", () => {
  it("preventing writes predicate", async () => {
    expect(adapter.preventingWrites).toBe(false);

    await adapter.withPreventedWrites(async () => {
      expect(adapter.preventingWrites).toBe(true);
    });

    expect(adapter.preventingWrites).toBe(false);
  });

  it("errors when an insert query is called while preventing writes", async () => {
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("errors when an update query is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(
          `UPDATE "subscribers" SET "nick" = 'updated' WHERE "nick" = 'test'`,
        ),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("errors when a delete query is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(`DELETE FROM "subscribers" WHERE "nick" = 'test'`),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("doesnt error when a select query has encoding errors", async () => {
    await adapter.withPreventedWrites(async () => {
      // SQLite returns invalid bytes as-is rather than failing
      await expect(adapter.execute(`SELECT '\xC8'`)).resolves.toBeDefined();
    });
  });

  it("doesnt error when a select query is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await adapter.withPreventedWrites(async () => {
      const result = await adapter.execute(`SELECT * FROM "subscribers" WHERE "nick" = 'test'`);
      expect(result).toHaveLength(1);
    });
  });

  it("doesnt error when a read query with a cte is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await adapter.withPreventedWrites(async () => {
      const result = await adapter.execute(`
        WITH matching AS (SELECT * FROM "subscribers" WHERE "nick" = 'test')
        SELECT * FROM matching
      `);
      expect(result).toHaveLength(1);
    });
  });

  it("doesnt error when a select query starting with a slash star comment is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await adapter.withPreventedWrites(async () => {
      const result = await adapter.execute(
        `/* some comment */ SELECT * FROM "subscribers" WHERE "nick" = 'test'`,
      );
      expect(result).toHaveLength(1);
    });
  });

  it("errors when an insert query prefixed by a slash star comment is called while preventing writes", async () => {
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(
          `/* some comment */ INSERT INTO "subscribers" ("nick") VALUES ('test')`,
        ),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("doesnt error when a select query starting with double dash comments is called while preventing writes", async () => {
    await adapter.executeMutation(`INSERT INTO "subscribers" ("nick") VALUES ('test')`);

    await adapter.withPreventedWrites(async () => {
      const result = await adapter.execute(
        `-- some comment\n-- comment about INSERT\nSELECT * FROM "subscribers" WHERE "nick" = 'test'`,
      );
      expect(result).toHaveLength(1);
    });
  });

  it("errors when an insert query prefixed by a double dash comment is called while preventing writes", async () => {
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(
          `-- some comment\nINSERT INTO "subscribers" ("nick") VALUES ('test')`,
        ),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("errors when an insert query prefixed by a multiline double dash comment is called while preventing writes", async () => {
    const manyComments = "-- comment\n".repeat(50);
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(
          `${manyComments}INSERT INTO "subscribers" ("nick") VALUES ('test')`,
        ),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("errors when an insert query prefixed by a slash star comment containing read command is called while preventing writes", async () => {
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(`/* SELECT */ INSERT INTO "subscribers" ("nick") VALUES ('test')`),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });

  it("errors when an insert query prefixed by a double dash comment containing read command is called while preventing writes", async () => {
    await expect(
      adapter.withPreventedWrites(() =>
        adapter.executeMutation(`-- SELECT\nINSERT INTO "subscribers" ("nick") VALUES ('test')`),
      ),
    ).rejects.toThrow(ReadOnlyError);
  });
});
