import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/better-sqlite3.js";

describe("IntegrationOpenCloseTestCase", () => {
  it("create close", async () => {
    try {
      const db = new SQLite3.Database("test-create.db", { engine });
      expect(File.isExist("test-create.db")).toBeTruthy();
      await expect(Promise.resolve(db.close())).resolves.not.toThrow();
    } finally {
      try {
        File.delete("test-create.db");
      } catch {}
    }
  });

  it("open close", async () => {
    try {
      File.write("test-open.db", "");
      expect(File.isExist("test-open.db")).toBeTruthy();
      const db = new SQLite3.Database("test-open.db", { engine });
      await expect(Promise.resolve(db.close())).resolves.not.toThrow();
    } finally {
      try {
        File.delete("test-open.db");
      } catch {}
    }
  });

  it("bad open", () => {
    expect(() => new SQLite3.Database(".", { engine })).toThrow(SQLite3.CantOpenException);
  });
});
