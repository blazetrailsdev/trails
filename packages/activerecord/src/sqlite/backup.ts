import { ArgumentError } from "@blazetrails/ruby-compat";
import { SQLite3Constants, type SqliteConnection } from "../sqlite-adapter.js";
import { Database } from "./database.js";
import { Exception } from "./errors.js";

export class Backup {
  #p: { dstdb: SqliteConnection; srcdb: SqliteConnection; srcname: string } | null = null;

  constructor(dstdb: SqliteConnection, dstname: string, srcdb: SqliteConnection, srcname: string) {
    if (!srcdb.isOpen()) {
      throw new ArgumentError("cannot backup from a closed database");
    }
    if (!dstdb.isOpen()) {
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

    await dstdb.exec(`ATTACH DATABASE '${Database.quote(file)}' AS sqlite3_backup`);
    try {
      const objects = (
        await dstdb.execute(
          "SELECT type, name, sql FROM sqlite3_backup.sqlite_master " +
            "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'",
        )
      ).map((row) => Object.values(row as object) as [string, string, string]);
      for (const [, , sql] of objects) await dstdb.exec(sql);
      for (const [type, name] of objects) {
        if (type !== "table") continue;
        const table = `"${name.replace(/"/g, '""')}"`;
        const columns = (
          await dstdb.execute(
            // eslint-disable-next-line blazetrails/no-raw-sql
            `SELECT name FROM pragma_table_info('${Database.quote(name)}', 'sqlite3_backup')`,
          )
        ).map((row) => `"${String(Object.values(row as object)[0]).replace(/"/g, '""')}"`);
        if (columns.length === 0) continue;
        await dstdb.exec(
          `INSERT INTO main.${table} (${columns.join(", ")}) ` +
            `SELECT ${columns.join(", ")} FROM sqlite3_backup.${table}`,
        );
      }
      const sequences = await dstdb.getFirstValue(
        "SELECT count(*) FROM sqlite3_backup.sqlite_master WHERE name = 'sqlite_sequence'",
      );
      if (Number(sequences) > 0) {
        // eslint-disable-next-line blazetrails/no-raw-sql
        await dstdb.exec("DELETE FROM main.sqlite_sequence");
        await dstdb.exec(
          "INSERT INTO main.sqlite_sequence (name, seq) " +
            "SELECT name, seq FROM sqlite3_backup.sqlite_sequence",
        );
      }
    } finally {
      await dstdb.exec("DETACH DATABASE sqlite3_backup");
    }
    return SQLite3Constants.ErrorCode.DONE;
  }

  finish(): null {
    if (!this.#p) throw new Exception("cannot use a closed backup");
    this.#p = null;
    return null;
  }
}
