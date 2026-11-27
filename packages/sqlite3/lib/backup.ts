import { SQLite3 } from "./namespaces.js";
import "./constants.js";
import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { Database } from "./database.js";
import { Exception } from "./errors.js";

export class Backup {
  #p: { dstdb: Database; srcdb: Database; srcname: string } | null = null;

  constructor(dstdb: Database, dstname: string, srcdb: Database, srcname: string) {
    if (srcdb.isClosed()) {
      throw new ArgumentError("cannot backup from a closed database");
    }
    if (dstdb.isClosed()) {
      throw new ArgumentError("cannot backup to a closed database");
    }
    if (dstname !== "main") {
      throw new Exception(`SQLite3::Backup copies into "main", not "${dstname}"`);
    }

    this.#p = { dstdb, srcdb, srcname };
  }

  async step(nPage: number): Promise<number> {
    if (!this.#p) throw new Exception("cannot use a closed backup");
    const { dstdb, srcdb, srcname } = this.#p;
    const file = await srcdb.filename(srcname);
    if (file == null || file === "") {
      throw new Exception("SQLite3::Backup needs a file-backed source database");
    }

    const rows = async (sql: string) =>
      ((await dstdb.execute2(sql)) as unknown[])
        .slice(1)
        .map((row) =>
          Array.isArray(row) ? (row as string[]) : (Object.values(row as object) as string[]),
        );
    const foreignKeys = (await rows("PRAGMA foreign_keys"))[0][0];
    await dstdb.execute(`ATTACH DATABASE '${Database.quote(file)}' AS sqlite3_backup`);
    try {
      await dstdb.execute("PRAGMA foreign_keys = OFF");
      const objects = await rows(
        "SELECT type, name, sql FROM sqlite3_backup.sqlite_master " +
          "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
      );
      for (const [, , sql] of objects) await dstdb.execute(sql);
      for (const [type, name] of objects) {
        if (type !== "table") continue;
        const table = `"${name.replace(/"/g, '""')}"`;
        const columns = (await rows(`PRAGMA sqlite3_backup.table_info(${table})`)).map(
          (column) => `"${String(column[1]).replace(/"/g, '""')}"`,
        );
        await dstdb.execute(
          `INSERT INTO main.${table} (${columns.join(", ")}) ` +
            `SELECT ${columns.join(", ")} FROM sqlite3_backup.${table}`,
        );
      }
      const sequences = await dstdb.getFirstValue(
        "SELECT count(*) FROM sqlite3_backup.sqlite_master WHERE name = 'sqlite_sequence'",
      );
      if (Number(sequences) > 0) {
        await dstdb.execute("DELETE FROM main.sqlite_sequence");
        await dstdb.execute(
          "INSERT INTO main.sqlite_sequence (name, seq) " +
            "SELECT name, seq FROM sqlite3_backup.sqlite_sequence",
        );
      }
    } finally {
      await dstdb.execute("DETACH DATABASE sqlite3_backup");
      await dstdb.execute(`PRAGMA foreign_keys = ${Number(foreignKeys)}`);
    }
    return SQLite3.Constants.ErrorCode.DONE;
  }

  finish(): null {
    if (!this.#p) throw new Exception("cannot use a closed backup");
    this.#p = null;
    return null;
  }
}

SQLite3.Backup = Backup;
