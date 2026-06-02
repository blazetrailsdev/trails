import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
const BIN_PATH = join(SCRIPT_DIR, "trails-models-dump-bin.ts");
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

// In-process variant: call the exported `run()` directly instead of spawning
// tsx. The `--schema` path is side-effect-free (pure file read + codegen, no
// Base.establishConnection / global connection state), so it's safe to run in
// the test worker — and it avoids a blocking `spawnSync` per case. That matters
// because vitest's path filter sweeps this file into the large
// `vitest run packages/activerecord` run; ~dozen sequential 2-4s subprocess
// spawns there block the worker long enough to starve vitest's reporter RPC
// ("Timeout calling onTaskUpdate"). Subprocess `runDump` is kept only for cases
// that genuinely exercise the live-DB path (e.g. the live-vs-schema parity).
async function runDumpInProcess(
  args: string[],
  env: Record<string, string> = {},
): Promise<RunResult> {
  // Dynamic import (not top-level) so the beforeAll dep-build still runs first;
  // a static import would pull @blazetrails/activerecord at file-load time.
  const { run } = await import("./trails-models-dump.js");
  const outChunks: string[] = [];
  const errChunks: string[] = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const envBackup: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) envBackup[k] = process.env[k];
  Object.assign(process.env, env);
  process.stdout.write = ((s: string | Uint8Array): boolean => {
    outChunks.push(s.toString());
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((s: string | Uint8Array): boolean => {
    errChunks.push(s.toString());
    return true;
  }) as typeof process.stderr.write;
  let code: number;
  try {
    code = await run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    for (const k of Object.keys(env)) {
      if (envBackup[k] === undefined) delete process.env[k];
      else process.env[k] = envBackup[k]!;
    }
  }
  return { code, stdout: outChunks.join(""), stderr: errChunks.join("") };
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
  const depsInOrder = [
    "nokogiri",
    "activesupport",
    "activemodel",
    "arel",
    "did-you-mean",
    "globalid",
    "tse-compiler",
    "trails-tsc",
    "activerecord",
  ];
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

describe("trails-models-dump CLI", { timeout: 30_000 }, () => {
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

  // --schema path: parse a committed db/schema.ts offline, no DB connection.
  function writeSchema(source: string): string {
    const schemaPath = join(tmp, "schema.ts");
    writeFileSync(schemaPath, source);
    return schemaPath;
  }

  it("generates a model module from a db/schema.ts with no database connection", async () => {
    // DATABASE_URL points at a path that does not exist and no DB is running:
    // if the --schema path reached Base.establishConnection() it would fail.
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("authors", { force: "cascade" }, (t) => {
          t.string("name");
        });
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.string("title");
          t.bigint("author_id", { null: false });
        });
        await ctx.addForeignKey("books", "authors", { column: "author_id" });
      }
    `);
    const { code, stdout, stderr } = await runDumpInProcess(["--schema", schemaPath], {
      DATABASE_URL: "sqlite3:///nonexistent/should-never-connect.db",
    });
    expect(code, `stderr: ${stderr}\nstdout: ${stdout}`).toBe(0);
    expect(stdout).toMatch(/export class Author extends Base \{/);
    expect(stdout).toMatch(/export class Book extends Base \{/);
    expect(stdout).toMatch(/this\.belongsTo\("author"\)/);
    expect(stdout).toMatch(/this\.hasMany\("books"\)/);
  });

  it("emits the same class/association structure on the --schema path as the live-DB path", () => {
    // Same logical schema expressed two ways: a SQLite DB (live introspection)
    // and a db/schema.ts (offline parse). The generated bodies must match.
    applySchema(
      dbPath,
      `
      CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE books (
        id INTEGER PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES authors(id),
        title TEXT
      );
      `,
    );
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("authors", { force: "cascade" }, (t) => {
          t.string("name");
        });
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.bigint("author_id", { null: false });
          t.string("title");
        });
        await ctx.addForeignKey("books", "authors", { column: "author_id" });
      }
    `);

    const live = runDump(["--database-url", `sqlite3://${dbPath}`, "--no-header"]);
    const offline = runDump(["--schema", schemaPath, "--no-header"]);
    expect(live.code, `stderr: ${live.stderr}`).toBe(0);
    expect(offline.code, `stderr: ${offline.stderr}`).toBe(0);
    expect(offline.stdout).toBe(live.stdout);
  });

  it("models a composite-primary-key table from --schema", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("memberships", { primaryKey: ["user_id", "group_id"], id: false }, (t) => {
          t.bigint("user_id", { null: false });
          t.bigint("group_id", { null: false });
        });
      }
    `);
    const { code, stdout, stderr } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--no-header",
    ]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toMatch(/export class Membership extends Base \{/);
    expect(stdout).toMatch(/this\._primaryKey = \["user_id","group_id"\]/);
  });

  it("models a UUID-primary-key table from --schema", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("widgets", { id: "uuid" }, (t) => {
          t.string("label");
        });
      }
    `);
    const { code, stdout, stderr } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--no-header",
    ]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toMatch(/export class Widget extends Base \{/);
  });

  it("skips an id:false table with no primary key on the --schema path", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("logs", { id: false }, (t) => {
          t.string("message");
        });
        await ctx.createTable("users", { force: "cascade" }, (t) => {
          t.string("email");
        });
      }
    `);
    const { code, stdout, stderr } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--no-header",
    ]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toMatch(/export class User extends Base/);
    expect(stdout).not.toMatch(/class Log /);
  });

  it("applies --only/--ignore filtering on the --schema path", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("authors", { force: "cascade" }, (t) => {
          t.string("name");
        });
        await ctx.createTable("books", { force: "cascade" }, (t) => {
          t.string("title");
        });
      }
    `);
    const { code, stdout } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--only",
      "books",
      "--no-header",
    ]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class Book extends Base/);
    expect(stdout).not.toMatch(/export class Author extends Base/);
  });

  it("exits 1 with a pointed error when the --schema file cannot be read", async () => {
    const { code, stderr } = await runDumpInProcess(["--schema", join(tmp, "does-not-exist.ts")]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/cannot read schema file/);
  });

  it("exits 1 with a file-pointed error when --schema has no createTable calls", async () => {
    // A readable file that isn't a real schema.ts: the error must point at the
    // file, not misdirect the user to --only/--ignore.
    const schemaPath = writeSchema(`export default async function defineSchema() {}`);
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no createTable found/);
    expect(stderr).not.toMatch(/--only\/--ignore/);
  });

  it("exits 1 when --schema= is passed an empty value", async () => {
    // Empty would be falsy and silently misroute to the live-DB branch.
    const { code, stderr } = await runDumpInProcess(["--schema="]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/--schema expects a value/);
  });

  it("warns and ignores --database-url when --schema is also given", async () => {
    // --schema wins per documented precedence; the explicit conflicting flag
    // is surfaced. DATABASE_URL points at an unconnectable path to prove the
    // DB branch is never taken.
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `);
    const { code, stdout, stderr } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--database-url",
      "sqlite3:///nonexistent/should-never-connect.db",
      "--no-header",
    ]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stderr).toMatch(/--schema given; ignoring --database-url/);
    expect(stdout).toMatch(/export class Item extends Base/);
  });

  it("does not warn about an ambient DATABASE_URL on the --schema path", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `);
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath, "--no-header"], {
      DATABASE_URL: "sqlite3:///nonexistent/should-never-connect.db",
    });
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stderr).not.toMatch(/ignoring --database-url/);
  });

  it("writes to --out on the --schema path", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `);
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath, "--out", outPath]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(readFileSync(outPath, "utf8")).toMatch(/export class Item extends Base/);
  });

  it("uses the resolved schema path as the header sourceHint", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `);
    const { code, stdout } = await runDumpInProcess(["--schema", schemaPath]);
    expect(code).toBe(0);
    expect(stdout).toMatch(new RegExp(`from ${schemaPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  // Convention default: auto-discover db/schema.ts relative to CWD.
  async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const orig = process.cwd();
    process.chdir(dir);
    try {
      return await fn();
    } finally {
      process.chdir(orig);
    }
  }

  function writeConventionSchema(dir: string, source: string): void {
    const dbDir = join(dir, "db");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "schema.ts"), source);
  }

  it("auto-discovers db/schema.ts relative to CWD when no --schema or DB URL given", async () => {
    writeConventionSchema(
      tmp,
      `
      export default async function defineSchema(ctx) {
        await ctx.createTable("posts", { force: "cascade" }, (t) => {
          t.string("title");
        });
      }
    `,
    );
    const { code, stdout, stderr } = await withCwd(tmp, () =>
      runDumpInProcess(["--no-header"], { DATABASE_URL: "" }),
    );
    expect(code, `stderr: ${stderr}\nstdout: ${stdout}`).toBe(0);
    expect(stdout).toMatch(/export class Post extends Base/);
    expect(stderr).not.toMatch(/warning:/);
  });

  it("emits a deprecation warning when falling through to the live-DB path", () => {
    // REPO_ROOT has no db/schema.ts → auto-discovery misses → live-DB path with warning.
    applySchema(dbPath, `CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);`);
    const { code, stdout, stderr } = runDump(["--no-header"], {
      DATABASE_URL: `sqlite3://${dbPath}`,
    });
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stdout).toMatch(/export class Item extends Base/);
    expect(stderr).toMatch(
      /warning: generating from a live DB connection; consider committing db\/schema\.ts/,
    );
  });

  it("does not emit a deprecation warning on the auto-discovered schema path", async () => {
    writeConventionSchema(
      tmp,
      `
      export default async function defineSchema(ctx) {
        await ctx.createTable("items", { force: "cascade" }, (t) => {
          t.string("name");
        });
      }
    `,
    );
    const { code, stderr } = await withCwd(tmp, () =>
      runDumpInProcess(["--no-header"], { DATABASE_URL: "" }),
    );
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(stderr).not.toMatch(/warning:/);
  });
});
