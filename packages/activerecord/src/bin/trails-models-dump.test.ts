import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

// Integration tests for trails-models-dump. Each case spins up an in-memory
// SQLite DB (persisted to a tmp file so the adapter can reconnect to it),
// applies a small schema, invokes the bin via tsx, and asserts the
// generated module shape or exit behaviour.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..");
const BIN_PATH = join(SCRIPT_DIR, "trails-models-dump.ts");
const TSX_BIN = resolve(
  REPO_ROOT,
  "node_modules/.bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runDump(args: string[], env: NodeJS.ProcessEnv = {}): RunResult {
  const res = spawnSync(TSX_BIN, [BIN_PATH, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    cwd: REPO_ROOT,
  });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function applySchema(dbPath: string, sql: string): void {
  const db = new Database(dbPath);
  try {
    db.pragma("foreign_keys = ON");
    db.exec(sql);
  } finally {
    db.close();
  }
}

// The CLI imports from @blazetrails/activesupport (via getFsAsync) and
// transitively from @blazetrails/arel / activemodel. pnpm workspace
// resolution points those imports at each package's dist/index.js. The
// unit-test CI job doesn't build workspace packages first, so when any
// expected dist/ is missing we build the three the CLI depends on in
// dependency order (activesupport → activemodel → arel). Building them
// in a single `--filter a --filter b --filter c` call races — pnpm may
// start activemodel/arel before activesupport's dist lands, causing
// "Cannot find module @blazetrails/activesupport". Serial invocation
// is predictable and still fast when already built (tsc incremental).
beforeAll(() => {
  const packagesRoot = resolve(REPO_ROOT, "packages");
  const depsInOrder = ["activesupport", "activemodel", "arel"];
  const anyMissing = depsInOrder.some(
    (p) => !existsSync(join(packagesRoot, p, "dist", "index.js")),
  );
  if (!anyMissing) return;
  for (const pkg of depsInOrder) {
    const res = spawnSync("pnpm", ["--filter", `@blazetrails/${pkg}`, "build"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (res.status !== 0) {
      throw new Error(`failed to build @blazetrails/${pkg} for the test fixture`);
    }
  }
}, 180_000);

describe("trails-models-dump CLI", () => {
  let tmp: string;
  let dbPath: string;
  let outPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tmd-"));
    dbPath = join(tmp, "test.db");
    outPath = join(tmp, "models.ts");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("prints usage and exits 0 on --help", () => {
    const { code, stdout } = runDump(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Usage: trails-models-dump/);
  });

  it("exits 1 with pointed error when no database URL is provided", () => {
    // Strip DATABASE_URL so the env-fallback doesn't kick in.
    const { code, stderr } = runDump([], { DATABASE_URL: "" });
    expect(code).toBe(1);
    expect(stderr).toMatch(/no database URL/);
  });

  it("exits 1 when --only and --ignore are both passed", () => {
    const { code, stderr } = runDump(["--only", "a", "--ignore", "b"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/--only and --ignore are mutually exclusive/);
  });

  it("exits 1 on unknown argument", () => {
    const { code, stderr } = runDump(["--nope"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown argument: --nope/);
  });

  it("generates a valid model module from a three-table SQLite DB", () => {
    applySchema(
      dbPath,
      `
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (
        id INTEGER PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES authors(id),
        title TEXT
      );
      CREATE TABLE reviews (
        id INTEGER PRIMARY KEY,
        book_id INTEGER NOT NULL REFERENCES books(id),
        body TEXT
      );
      `,
    );

    const { code, stdout, stderr } = runDump([
      "--database-url",
      `sqlite3://${dbPath}`,
      "--out",
      outPath,
    ]);
    expect(code, `stderr: ${stderr}\nstdout: ${stdout}`).toBe(0);
    expect(stdout).toMatch(new RegExp(`wrote .*${outPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const generated = readFileSync(outPath, "utf8");
    expect(generated).toMatch(/import \{ Base \} from "@blazetrails\/activerecord";/);
    expect(generated).toMatch(/export class Author extends Base \{/);
    expect(generated).toMatch(/export class Book extends Base \{/);
    expect(generated).toMatch(/export class Review extends Base \{/);
    expect(generated).toMatch(/this\.belongsTo\("author"\)/);
    expect(generated).toMatch(/this\.hasMany\("books"\)/);
    expect(generated).toMatch(/this\.belongsTo\("book"\)/);
    expect(generated).toMatch(/this\.hasMany\("reviews"\)/);
  });

  it("ignores built-in bookkeeping tables by default", () => {
    applySchema(
      dbPath,
      `
      CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
      CREATE TABLE ar_internal_metadata (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
      `,
    );

    const { code, stdout } = runDump(["--database-url", `sqlite3://${dbPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class User extends Base/);
    expect(stdout).not.toMatch(/class SchemaMigration/);
    expect(stdout).not.toMatch(/class ArInternalMetadatum/);
  });

  it("exits 1 when --only matches no tables", () => {
    applySchema(dbPath, `CREATE TABLE users (id INTEGER PRIMARY KEY);`);
    const { code, stderr } = runDump([
      "--database-url",
      `sqlite3://${dbPath}`,
      "--only",
      "does_not_exist",
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no tables to generate/);
  });

  it("writes to stdout when --out is absent", () => {
    applySchema(dbPath, `CREATE TABLE widgets (id INTEGER PRIMARY KEY, label TEXT);`);
    const { code, stdout } = runDump(["--database-url", `sqlite3://${dbPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class Widget extends Base/);
  });

  it("creates --out parent directories that don't exist", () => {
    applySchema(dbPath, `CREATE TABLE widgets (id INTEGER PRIMARY KEY);`);
    const nested = join(tmp, "deep", "nested", "models.ts");
    const { code, stderr } = runDump(["--database-url", `sqlite3://${dbPath}`, "--out", nested]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    // File exists now.
    expect(readFileSync(nested, "utf8")).toMatch(/export class Widget/);
  });

  it("respects --strip-prefix", () => {
    applySchema(
      dbPath,
      `
      CREATE TABLE blog_posts (id INTEGER PRIMARY KEY, title TEXT);
      `,
    );
    const { code, stdout } = runDump([
      "--database-url",
      `sqlite3://${dbPath}`,
      "--strip-prefix",
      "blog_",
      "--no-header",
    ]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class Post extends Base/);
    expect(stdout).toMatch(/this\._tableName = "blog_posts"/);
  });

  it("suppresses the GENERATED header with --no-header", () => {
    applySchema(dbPath, `CREATE TABLE items (id INTEGER PRIMARY KEY);`);
    const { code, stdout } = runDump(["--database-url", `sqlite3://${dbPath}`, "--no-header"]);
    expect(code).toBe(0);
    expect(stdout).not.toMatch(/GENERATED by trails-models-dump/);
  });

  it("falls back to env DATABASE_URL when --database-url is absent", () => {
    applySchema(dbPath, `CREATE TABLE items (id INTEGER PRIMARY KEY);`);
    const { code, stdout } = runDump(["--no-header"], {
      DATABASE_URL: `sqlite3://${dbPath}`,
    });
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class Item extends Base/);
  });

  it("uses DATABASE_URL as sourceHint in the header", () => {
    applySchema(dbPath, `CREATE TABLE items (id INTEGER PRIMARY KEY);`);
    const { code, stdout } = runDump(["--database-url", `sqlite3://${dbPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(
      new RegExp(`from sqlite3://${dbPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
  });
});
