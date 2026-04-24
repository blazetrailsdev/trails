import { describe, it, expect, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests for the AR query runner. Same harness shape as
// dump.test.ts (arel runner tests) but exercises ar-* fixtures through
// ar_dump.ts, which loads models.ts before evaluating query.ts.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../../..");
const AR_DUMP = join(SCRIPT_DIR, "ar_dump.ts");
const FIXTURES = resolve(SCRIPT_DIR, "../../fixtures");
const TSX_BIN = resolve(
  REPO_ROOT,
  "node_modules/.bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

// Build the four packages the runner's imports pull in. activerecord is
// included here (not just activesupport/activemodel/arel) because the
// runner itself and fixture models.ts both import from it.
beforeAll(() => {
  const packagesRoot = join(REPO_ROOT, "packages");
  const deps = ["activesupport", "activemodel", "arel", "activerecord"];
  const anyMissing = deps.some((p) => !existsSync(join(packagesRoot, p, "dist", "index.js")));
  if (!anyMissing) return;
  for (const pkg of deps) {
    const res = spawnSync("pnpm", ["--filter", `@blazetrails/${pkg}`, "build"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (res.status !== 0) {
      throw new Error(`failed to build @blazetrails/${pkg} for ar_dump tests`);
    }
  }
}, 240_000);

function runDumpReadJson(fixture: string): {
  code: number;
  stdout: string;
  stderr: string;
  json: Record<string, unknown>;
} {
  const outDir = mkdtempSync(join(tmpdir(), "parity-ar-test-"));
  const outPath = join(outDir, `${fixture}.json`);
  const res = spawnSync(TSX_BIN, [AR_DUMP, join(FIXTURES, fixture), outPath], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(readFileSync(outPath, "utf8")) as Record<string, unknown>;
  } catch {
    /* leave json={} on failure — test asserts code first */
  }
  rmSync(outDir, { recursive: true, force: true });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    json,
  };
}

describe("ar_dump.ts", () => {
  it("dumps ar-00 (Book.all) to the expected SQL", () => {
    const { code, stdout, stderr, json } = runDumpReadJson("ar-00");
    expect(code, `stdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
    expect(json.version).toBe(1);
    expect(json.fixture).toBe("ar-00");
    expect(json.sql).toBe('SELECT "books".* FROM "books"');
    expect(json.binds).toEqual([]);
    expect(json.frozenAt).toBe("2000-01-01T00:00:00.000Z");
  });

  it("exits 1 with a useful message on --frozen-at without a value", () => {
    // tmpdir() rather than a hard-coded /tmp path — portable on Windows
    // and in restricted CI sandboxes.
    const outDir = mkdtempSync(join(tmpdir(), "parity-ar-test-"));
    try {
      const res = spawnSync(
        TSX_BIN,
        [AR_DUMP, join(FIXTURES, "ar-00"), join(outDir, "unused.json"), "--frozen-at"],
        { encoding: "utf8", cwd: REPO_ROOT },
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/--frozen-at requires a value/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("exits 1 with a useful message on invalid --frozen-at", () => {
    const outDir = mkdtempSync(join(tmpdir(), "parity-ar-test-"));
    try {
      const res = spawnSync(
        TSX_BIN,
        [
          AR_DUMP,
          join(FIXTURES, "ar-00"),
          join(outDir, "unused.json"),
          "--frozen-at",
          "not-a-date",
        ],
        { encoding: "utf8", cwd: REPO_ROOT },
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/--frozen-at must be ISO 8601 UTC/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("exits non-zero on an unknown fixture directory", () => {
    // Typo'd or missing fixture dir — the most common operator error.
    // We want it to fail fast with a readable errno, not deep inside AR.
    const outDir = mkdtempSync(join(tmpdir(), "parity-ar-test-"));
    const outPath = join(outDir, "out.json");
    const res = spawnSync(TSX_BIN, [AR_DUMP, join(FIXTURES, "ar-does-not-exist"), outPath], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    rmSync(outDir, { recursive: true, force: true });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/ENOENT|no such file/i);
  });
});
