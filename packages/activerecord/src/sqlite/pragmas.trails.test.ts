import { describe, expect, it } from "vitest";

import { betterSqlite3Driver } from "./better-sqlite3.js";
import { Pragmas } from "./pragmas.js";

describe("SQLite3::Pragmas readers", () => {
  it("read back what the setters write, through the raw connection's getFirstValue", async () => {
    const db = betterSqlite3Driver.openSync!({ database: ":memory:" });
    try {
      Pragmas.setUserVersion.call(db, 7);
      Pragmas.setForeignKeys.call(db, "on");
      Pragmas.setJournalMode.call(db, "memory");

      expect(await Pragmas.userVersion.call(db)).toBe(7);
      expect(await Pragmas.foreignKeys.call(db)).toBe(true);
      expect(Pragmas.journalMode.call(db)).toBe("memory");
      expect(Pragmas.indexList.call(db, "sqlite_master")).toEqual([]);

      const names: unknown[] = [];
      expect(
        Pragmas.collationList.call(db, (row) => names.push((row as { name: string }).name)),
      ).toBeNull();
      expect(names).toContain("BINARY");
      const checked: unknown[] = [];
      expect(Pragmas.integrityCheck.call(db, (row: unknown) => checked.push(row))).toBeNull();
      expect(checked).toEqual([{ integrity_check: "ok" }]);
    } finally {
      db.close();
    }
  });
});

describe("SQLite3::Pragmas getters on an async host", () => {
  it("resolve to the same values the sync host returns", async () => {
    const db = betterSqlite3Driver.openSync!({ database: ":memory:" });
    const host = {
      execute: async (sql: string, bindVars?: never[], block?: (row: unknown) => void) =>
        db.execute(sql, bindVars, block),
      getFirstValue: async (sql: string) => db.getFirstValue(sql),
    };
    try {
      Pragmas.setUserVersion.call(db, 3);
      Pragmas.setJournalMode.call(db, "memory");

      expect(await Pragmas.userVersion.call(host)).toBe(3);
      expect(await Pragmas.readUncommitted.call(host)).toBe(false);
      expect(await Pragmas.journalMode.call(host)).toBe("memory");
      expect(await Pragmas.indexList.call(host, "sqlite_master")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
