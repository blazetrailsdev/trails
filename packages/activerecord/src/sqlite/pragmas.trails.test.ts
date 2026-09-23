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
    } finally {
      db.close();
    }
  });
});
