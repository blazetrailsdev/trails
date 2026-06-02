import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests for ar models:dump. All tests use db/schema.ts as the
// schema source — no live database connection. Subprocess runDump is kept for
// args-validation cases (help, unknown flags) that don't parse a schema; all
// functional cases use the in-process runDumpInProcess helper.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..");
const AR_BIN_TS = resolve(SCRIPT_DIR, "../bin.ts");
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

function runAr(args: string[], env: NodeJS.ProcessEnv = {}): RunResult {
  const res = spawnSync(TSX_BIN, [AR_BIN_TS, ...args], {
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
// tsx. Pure file read + codegen — no Base.establishConnection, no global
// connection state — safe to run in the test worker without isolation.
async function runDumpInProcess(
  args: string[],
  env: Record<string, string> = {},
): Promise<RunResult> {
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

// The CLI imports from @blazetrails/activesupport and transitively from
// @blazetrails/arel / activemodel / activerecord. Build deps in dependency
// order so workspace resolution finds each dist/ before its consumers start.
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

describe("ar models:dump", { timeout: 30_000 }, () => {
  let tmp: string;
  let outPath: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tmd-"));
    outPath = join(tmp, "models.ts");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- helpers ---

  function writeSchema(source: string): string {
    const schemaPath = join(tmp, "schema.ts");
    writeFileSync(schemaPath, source);
    return schemaPath;
  }

  function writeConventionSchema(source: string): void {
    const dbDir = join(tmp, "db");
    mkdirSync(dbDir, { recursive: true });
    writeFileSync(join(dbDir, "schema.ts"), source);
  }

  async function withCwd<T>(dir: string, fn: () => Promise<T>): Promise<T> {
    const orig = process.cwd();
    process.chdir(dir);
    try {
      return await fn();
    } finally {
      process.chdir(orig);
    }
  }

  const SIMPLE_SCHEMA = `
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
  `;

  // --- args / help ---

  it("prints usage and exits 0 on --help", () => {
    const { code, stdout } = runAr(["models:dump", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/Usage: ar models:dump/);
  });

  it("exits 1 when --only and --ignore are both passed", () => {
    const { code, stderr } = runAr(["models:dump", "--only", "a", "--ignore", "b"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/--only and --ignore are mutually exclusive/);
  });

  it("exits 1 on unknown argument", () => {
    const { code, stderr } = runAr(["models:dump", "--nope"]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/unknown argument: --nope/);
  });

  // --- error: no schema found ---

  it("exits 1 with a pointed error when no schema file is found", async () => {
    // CWD has no db/schema.ts and no --schema is passed.
    const { code, stderr } = await withCwd(tmp, () => runDumpInProcess([]));
    expect(code).toBe(1);
    expect(stderr).toMatch(/no schema file found/);
    expect(stderr).toMatch(/ar db:schema:dump/);
  });

  // --- --schema path ---

  it("generates model classes and associations from --schema", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const { code, stdout, stderr } = await runDumpInProcess(["--schema", schemaPath]);
    expect(code, `stderr: ${stderr}\nstdout: ${stdout}`).toBe(0);
    expect(stdout).toMatch(/export class Author extends Base \{/);
    expect(stdout).toMatch(/export class Book extends Base \{/);
    expect(stdout).toMatch(/this\.belongsTo\("author"\)/);
    expect(stdout).toMatch(/this\.hasMany\("books"\)/);
  });

  it("ignores built-in bookkeeping tables by default", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("schema_migrations", { id: false }, (t) => {
          t.string("version", { null: false });
        });
        await ctx.createTable("ar_internal_metadata", { id: false }, (t) => {
          t.string("key");
          t.string("value");
        });
        await ctx.createTable("users", { force: "cascade" }, (t) => {
          t.string("email");
        });
      }
    `);
    const { code, stdout } = await runDumpInProcess(["--schema", schemaPath, "--no-header"]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class User extends Base/);
    expect(stdout).not.toMatch(/class SchemaMigration/);
    expect(stdout).not.toMatch(/class ArInternalMetadatum/);
  });

  it("models a composite-primary-key table", async () => {
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

  it("models a UUID-primary-key table", async () => {
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

  it("skips a table with id:false and no primary key", async () => {
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

  it("applies --only filtering", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
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

  it("exits 1 when --only matches no tables", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const { code, stderr } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--only",
      "does_not_exist",
    ]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no tables to generate/);
  });

  it("respects --strip-prefix", async () => {
    const schemaPath = writeSchema(`
      export default async function defineSchema(ctx) {
        await ctx.createTable("blog_posts", { force: "cascade" }, (t) => {
          t.string("title");
        });
      }
    `);
    const { code, stdout } = await runDumpInProcess([
      "--schema",
      schemaPath,
      "--strip-prefix",
      "blog_",
      "--no-header",
    ]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/export class Post extends Base/);
    expect(stdout).toMatch(/this\._tableName = "blog_posts"/);
  });

  it("suppresses the GENERATED header with --no-header", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const { code, stdout } = await runDumpInProcess(["--schema", schemaPath, "--no-header"]);
    expect(code).toBe(0);
    expect(stdout).not.toMatch(/GENERATED by/);
  });

  it("writes to --out", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath, "--out", outPath]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(readFileSync(outPath, "utf8")).toMatch(/export class Author extends Base/);
  });

  it("creates --out parent directories that don't exist", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const nested = join(tmp, "deep", "nested", "models.ts");
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath, "--out", nested]);
    expect(code, `stderr: ${stderr}`).toBe(0);
    expect(readFileSync(nested, "utf8")).toMatch(/export class Author extends Base/);
  });

  it("uses the resolved schema path as the header sourceHint", async () => {
    const schemaPath = writeSchema(SIMPLE_SCHEMA);
    const { code, stdout } = await runDumpInProcess(["--schema", schemaPath]);
    expect(code).toBe(0);
    expect(stdout).toMatch(new RegExp(`from ${schemaPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });

  it("exits 1 when --schema file cannot be read", async () => {
    const { code, stderr } = await runDumpInProcess(["--schema", join(tmp, "does-not-exist.ts")]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/cannot read schema file/);
  });

  it("exits 1 when --schema file has no createTable calls", async () => {
    const schemaPath = writeSchema(`export default async function defineSchema() {}`);
    const { code, stderr } = await runDumpInProcess(["--schema", schemaPath]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/no createTable found/);
    expect(stderr).not.toMatch(/--only\/--ignore/);
  });

  it("exits 1 when --schema= is passed an empty value", async () => {
    const { code, stderr } = await runDumpInProcess(["--schema="]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/--schema expects a value/);
  });

  // --- convention auto-discovery ---

  it("auto-discovers db/schema.ts relative to CWD when --schema is absent", async () => {
    writeConventionSchema(SIMPLE_SCHEMA);
    const { code, stdout, stderr } = await withCwd(tmp, () => runDumpInProcess(["--no-header"]));
    expect(code, `stderr: ${stderr}\nstdout: ${stdout}`).toBe(0);
    expect(stdout).toMatch(/export class Author extends Base/);
    expect(stdout).toMatch(/export class Book extends Base/);
  });

  it("uses the convention schema path as the header sourceHint", async () => {
    writeConventionSchema(SIMPLE_SCHEMA);
    const { code, stdout } = await withCwd(tmp, () => runDumpInProcess([]));
    expect(code).toBe(0);
    const expectedPath = join(tmp, "db", "schema.ts").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(stdout).toMatch(new RegExp(`from ${expectedPath}`));
  });
});
