import { describe, expect, it } from "vitest";
import { Dir, File, Tempfile } from "@blazetrails/ruby-compat";
import { SQLite3 } from "../lib/index.js";
import { engine } from "../lib/engine/node-sqlite.js";

describe("TestDatabaseURI", () => {
  it("open absolute file uri", async () => {
    await Tempfile.open("test.db", undefined, async (file) => {
      const db = new SQLite3.Database(`file:${file.path()}`, { engine });
      expect(db).toBeTruthy();
      await db.close();
    });
  });

  it("open relative file uri", async () => {
    await Dir.mktmpdir(null, null, {}, async (dir: string) => {
      await Dir.chdir(dir, async () => {
        const db = new SQLite3.Database("file:test.db", { engine });
        expect(db).toBeTruthy();
        expect(File.isExist("test.db")).toBeTruthy();
        await db.close();
      });
    });
  });

  it("open file uri readonly", async () => {
    await Tempfile.open("test.db", undefined, async (file) => {
      const db = new SQLite3.Database(`file:${file.path()}?mode=ro`, { engine });

      await expect(db.execute("CREATE TABLE foos (id integer)")).rejects.toThrow(
        SQLite3.ReadOnlyException,
      );

      await db.close();
    });
  });
});
