import type { SqlJsAdapter } from "./sql-js-adapter.js";

export interface VfsFile {
  path: string;
  content: string;
  language: string;
  created_at: string;
  updated_at: string;
}

/**
 * Virtual filesystem backed by a SQLite table.
 * All files are stored as rows in `_vfs_files`.
 */
export class VirtualFS {
  private adapter: SqlJsAdapter;
  private _listeners: Array<() => void> = [];

  constructor(adapter: SqlJsAdapter) {
    this.adapter = adapter;
    this._ensureTable();
  }

  private _ensureTable() {
    this.adapter.execRaw(`
      CREATE TABLE IF NOT EXISTS "_vfs_files" (
        "path" TEXT PRIMARY KEY NOT NULL,
        "content" TEXT NOT NULL DEFAULT '',
        "language" TEXT NOT NULL DEFAULT 'typescript',
        "created_at" TEXT NOT NULL DEFAULT (datetime('now')),
        "updated_at" TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  onChange(fn: () => void) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn);
    };
  }

  private _notify() {
    for (const fn of this._listeners) fn();
  }

  list(): VfsFile[] {
    const results = this.adapter.execRaw(
      `SELECT "path", "content", "language", "created_at", "updated_at" FROM "_vfs_files" ORDER BY "path"`,
    );
    if (!results.length) return [];
    return results[0].values.map((row) => ({
      path: row[0] as string,
      content: row[1] as string,
      language: row[2] as string,
      created_at: row[3] as string,
      updated_at: row[4] as string,
    }));
  }

  read(path: string): VfsFile | null {
    const results = this.adapter.query(
      `SELECT "path", "content", "language", "created_at", "updated_at" FROM "_vfs_files" WHERE "path" = ?`,
      [path],
    );
    if (!results.length || !results[0].values.length) return null;
    const row = results[0].values[0];
    return {
      path: row[0] as string,
      content: row[1] as string,
      language: row[2] as string,
      created_at: row[3] as string,
      updated_at: row[4] as string,
    };
  }

  write(path: string, content: string, language?: string): void {
    const existing = this.read(path);
    const lang = language ?? existing?.language ?? this._inferLanguage(path);
    if (existing) {
      this.adapter.runSql(
        `UPDATE "_vfs_files" SET "content" = ?, "language" = ?, "updated_at" = datetime('now') WHERE "path" = ?`,
        [content, lang, path],
      );
    } else {
      this.adapter.runSql(
        `INSERT INTO "_vfs_files" ("path", "content", "language") VALUES (?, ?, ?)`,
        [path, content, lang],
      );
    }
    this._notify();
  }

  delete(path: string): boolean {
    const existing = this.read(path);
    if (!existing) return false;
    this.adapter.runSql(`DELETE FROM "_vfs_files" WHERE "path" = ?`, [path]);
    this._notify();
    return true;
  }

  rename(oldPath: string, newPath: string): boolean {
    const existing = this.read(oldPath);
    if (!existing) return false;
    if (this.exists(newPath)) return false;
    this.adapter.runSql(
      `UPDATE "_vfs_files" SET "path" = ?, "language" = ?, "updated_at" = datetime('now') WHERE "path" = ?`,
      [newPath, this._inferLanguage(newPath), oldPath],
    );
    this._notify();
    return true;
  }

  exists(path: string): boolean {
    return this.read(path) !== null;
  }

  clear(): void {
    this.adapter.runSql('DELETE FROM "_vfs_files"');
    this._notify();
  }

  /** Seed default files if the VFS is empty */
  seedDefaults(files: Array<{ path: string; content: string }>) {
    if (this.list().length > 0) return;
    for (const f of files) {
      this.write(f.path, f.content);
    }
  }

  private _inferLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
        return "typescript";
      case "js":
        return "javascript";
      case "sql":
        return "sql";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "css":
        return "css";
      case "html":
        return "html";
      default:
        return "typescript";
    }
  }
}
