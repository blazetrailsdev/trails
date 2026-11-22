import { currentAdapter } from "../../../support/adapter-helper.js";
import { describe, afterEach, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { setTrailsRoot } from "@blazetrails/activesupport";
import { SQLite3Adapter } from "../../../../lib/connection-adapters/sqlite3-adapter.js";

describe.runIf(currentAdapter("SQLite3Adapter"))("SQLite3 Trails.root path resolution", () => {
  afterEach(() => setTrailsRoot(null));

  it("expands a relative database path against Trails.root when set", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-trails-root-"));
    setTrailsRoot(root);
    let conn: SQLite3Adapter | undefined;
    try {
      conn = new SQLite3Adapter({ database: path.join("db", "foo.sqlite3") });
      await conn.connectBang();

      expect(fs.existsSync(path.join(root, "db", "foo.sqlite3"))).toBe(true);
    } finally {
      await conn?.disconnectBang();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("falls back to the working directory when Trails.root is unset", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-trails-cwd-"));
    const original = process.cwd();
    process.chdir(root);
    let conn: SQLite3Adapter | undefined;
    try {
      conn = new SQLite3Adapter({ database: path.join("db", "bar.sqlite3") });
      await conn.connectBang();

      expect(fs.existsSync(path.join(root, "db", "bar.sqlite3"))).toBe(true);
    } finally {
      await conn?.disconnectBang();
      process.chdir(original);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
