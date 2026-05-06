import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { RecordNotUnique } from "../errors.js";

// Audit: Sqlite3Adapter uses only explicit BEGIN/COMMIT/ROLLBACK/SAVEPOINT SQL
// via driver.exec() — never the better-sqlite3 db.transaction(fn) helper.
// This keeps the adapter portable to async drivers (node:sqlite, wa-sqlite, expo-sqlite).

describe("SQLite3Adapter transaction control", () => {
  let adapter: SQLite3Adapter;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-sqlite-tx-"));
    adapter = new SQLite3Adapter(path.join(tmpDir, "db.sqlite3"));
    await adapter.executeMutation(
      "CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)",
    );
  });

  afterEach(async () => {
    await adapter.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("BEGIN / COMMIT", () => {
    it("commits inserted rows", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('apple')");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items");
      expect(rows.map((r: any) => r.name)).toEqual(["apple"]);
    });
  });

  describe("BEGIN / ROLLBACK", () => {
    it("discards inserted rows on rollback", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('banana')");
      await adapter.rollbackDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items");
      expect(rows).toHaveLength(0);
    });
  });

  describe("savepoints", () => {
    it("releases savepoint on success, keeping outer changes", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('outer')");
      await adapter.createSavepoint("sp1");
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('inner')");
      await adapter.releaseSavepoint("sp1");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items ORDER BY id");
      expect(rows.map((r: any) => r.name)).toEqual(["outer", "inner"]);
    });

    it("rolls back to savepoint on error, keeping outer changes", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('outer')");
      await adapter.createSavepoint("sp1");
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('inner')");
      await adapter.rollbackToSavepoint("sp1");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items ORDER BY id");
      expect(rows.map((r: any) => r.name)).toEqual(["outer"]);
    });

    it("supports multiple nested savepoints independently", async () => {
      await adapter.beginDbTransaction();
      await adapter.createSavepoint("sp1");
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('a')");
      await adapter.createSavepoint("sp2");
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('b')");
      await adapter.rollbackToSavepoint("sp2");
      await adapter.releaseSavepoint("sp1");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items ORDER BY id");
      expect(rows.map((r: any) => r.name)).toEqual(["a"]);
    });
  });

  describe("error mapping", () => {
    it("maps UNIQUE constraint violation to RecordNotUnique", async () => {
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('dup')");
      await expect(
        adapter.executeMutation("INSERT INTO items (name) VALUES ('dup')"),
      ).rejects.toBeInstanceOf(RecordNotUnique);
    });

    it("rolls back savepoint on constraint error and continues outer transaction", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('safe')");
      await adapter.createSavepoint("sp1");
      await expect(
        adapter.executeMutation("INSERT INTO items (name) VALUES (NULL)"),
      ).rejects.toThrow();
      await adapter.rollbackToSavepoint("sp1");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items");
      expect(rows.map((r: any) => r.name)).toEqual(["safe"]);
    });
  });

  describe("cross-connection isolation", () => {
    it("writer changes are not visible to reader until committed", async () => {
      const reader = new SQLite3Adapter(path.join(tmpDir, "db.sqlite3"), { readonly: true });
      try {
        await adapter.beginDbTransaction();
        await adapter.executeMutation("INSERT INTO items (name) VALUES ('secret')");

        // SQLite default isolation: reader sees committed state only
        const beforeCommit = await reader.execute("SELECT name FROM items");
        expect(beforeCommit).toHaveLength(0);

        await adapter.commitDbTransaction();

        const afterCommit = await reader.execute("SELECT name FROM items");
        expect(afterCommit.map((r: any) => r.name)).toEqual(["secret"]);
      } finally {
        await reader.close();
      }
    });
  });
});
