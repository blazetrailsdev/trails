import { describe, expect, it } from "vitest";

import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";
import { Pragmas } from "../lib/pragmas.js";

describe("SQLite3::Pragmas readers", () => {
  it("read back what the setters write, through the raw connection's getFirstValue", async () => {
    const db = new SQLite3.Database(":memory:", { engine, resultsAsHash: true });
    try {
      await Pragmas.setUserVersion.call(db, 7);
      await Pragmas.setForeignKeys.call(db, "on");
      await Pragmas.setJournalMode.call(db, "memory");

      expect(await Pragmas.userVersion.call(db)).toBe(7);
      expect(await Pragmas.foreignKeys.call(db)).toBe(true);
      expect(await Pragmas.journalMode.call(db)).toBe("memory");
      expect(await Pragmas.indexList.call(db, "sqlite_master")).toEqual([]);

      const names: unknown[] = [];
      await Pragmas.collationList.call(db, (row) => names.push((row as { name: string }).name));
      expect(names).toContain("BINARY");
      const checked: unknown[] = [];
      await Pragmas.integrityCheck.call(db, (row: unknown) => checked.push(row));
      expect(checked).toEqual([{ integrity_check: "ok" }]);
    } finally {
      await db.close();
    }
  });
});

describe("SQLite3::Pragmas setters", () => {
  it("interpolates an Array-arm match as Ruby's Array#to_s does", () => {
    const statements: string[] = [];
    const host = { execute: (sql: string) => statements.push(sql), getFirstValue: () => null };
    Pragmas.setEnumPragma.call(host, "synchronous", "FULL", [["full", 2]]);
    expect(statements).toEqual([`PRAGMA synchronous='["full", 2]'`]);
  });
});
