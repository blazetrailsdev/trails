import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import { RecordNotUnique, TransactionIsolationError } from "../errors.js";

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

  describe("BEGIN IMMEDIATE / COMMIT", () => {
    it("commits inserted rows", async () => {
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('apple')");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items");
      expect(rows.map((r: any) => r.name)).toEqual(["apple"]);
    });
  });

  describe("BEGIN DEFERRED / COMMIT", () => {
    it("commits inserted rows via deferred transaction", async () => {
      await adapter.beginDeferredTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('deferred')");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items");
      expect(rows.map((r: any) => r.name)).toEqual(["deferred"]);
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

    it("rolls back savepoint on UNIQUE constraint error and continues outer transaction", async () => {
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('dup')");
      await adapter.beginDbTransaction();
      await adapter.executeMutation("INSERT INTO items (name) VALUES ('safe')");
      await adapter.createSavepoint("sp1");
      await expect(
        adapter.executeMutation("INSERT INTO items (name) VALUES ('dup')"),
      ).rejects.toBeInstanceOf(RecordNotUnique);
      await adapter.rollbackToSavepoint("sp1");
      await adapter.commitDbTransaction();

      const rows = await adapter.execute("SELECT name FROM items ORDER BY id");
      expect(rows.map((r: any) => r.name)).toEqual(["dup", "safe"]);
    });
  });

  describe("isolation level guards", () => {
    it("rejects unsupported isolation levels", async () => {
      await expect(adapter.beginIsolatedDbTransaction("serializable")).rejects.toBeInstanceOf(
        TransactionIsolationError,
      );
    });

    it("rejects read_uncommitted without shared-cache mode", async () => {
      // isSharedCache() returns false for a plain file path (requires ?cache=shared URI).
      // better-sqlite3 cannot open a file:?cache=shared URI, so the full PRAGMA chain
      // (BEGIN → read PRAGMA → set PRAGMA ON → resetIsolationLevel restore) cannot be
      // integration-tested here. The guard itself is covered by this test.
      await expect(adapter.beginIsolatedDbTransaction("read_uncommitted")).rejects.toBeInstanceOf(
        TransactionIsolationError,
      );
    });
  });

  describe("cross-connection isolation", () => {
    it("writer changes are not visible to reader until committed", async () => {
      const reader = new SQLite3Adapter(path.join(tmpDir, "db.sqlite3"), { readonly: true });
      try {
        // Confirm the readonly flag is honored — SQLite rejects writes with
        // "attempt to write a readonly database" (StatementInvalid, not ReadOnlyError,
        // because the adapter's ReadOnlyError gate checks _preventWrites, not _readonly).
        await expect(
          reader.executeMutation("INSERT INTO items (name) VALUES ('x')"),
        ).rejects.toThrow(/readonly/i);

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

  describe("audit: no driver.transaction() callsites", () => {
    it("sqlite3-adapter and sqlite-drivers dirs use only explicit SQL for transactions", () => {
      // Portability invariant: using driver.transaction(fn) would silently break async
      // drivers (node:sqlite, wa-sqlite, expo-sqlite). Grep ensures this stays true.
      const dirs = [
        path.resolve(import.meta.dirname, "."),
        path.resolve(import.meta.dirname, "../../../../activesupport/src/sqlite-drivers"),
      ];
      const pattern = /\bdriver\.transaction\s*\(/;
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs
          .readdirSync(dir)
          .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dir, file), "utf8");
          expect(content, `${file} must not call driver.transaction()`).not.toMatch(pattern);
        }
      }
    });
  });
});
