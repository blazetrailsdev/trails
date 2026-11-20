import { SQLite3 } from "./namespaces.js";
export class Database {
  static quote(string: string): string {
    return string.replace(/'/g, "''");
  }
}

SQLite3.Database = Database;
