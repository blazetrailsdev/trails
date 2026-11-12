export class Database {
  static quote(string: string): string {
    return string.replace(/'/g, "''");
  }
}
