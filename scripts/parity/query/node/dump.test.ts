import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";

// Integration tests for dump.ts — runs the script against real fixtures.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DUMP_SCRIPT = join(SCRIPT_DIR, "dump.ts");
const FIXTURES = resolve(SCRIPT_DIR, "../../fixtures");
const TSX_BIN = resolve(
  SCRIPT_DIR,
  "../../../../node_modules/.bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  outPath: string;
}

function runDump(fixture: string, opts: { frozenAt?: string } = {}): RunResult {
  const outDir = mkdtempSync(join(tmpdir(), "parity-node-test-"));
  const outPath = join(outDir, `${fixture}.json`);
  const args = [DUMP_SCRIPT, join(FIXTURES, fixture), outPath];
  if (opts.frozenAt) args.push("--frozen-at", opts.frozenAt);
  const res = spawnSync(TSX_BIN, args, { encoding: "utf8" });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    outPath,
  };
}

function cleanup(outPath: string): void {
  try {
    rmSync(dirname(outPath), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const DEFAULT_FROZEN_AT = "2000-01-01T00:00:00.000Z";

describe("dump.ts", () => {
  it("dumps arel-01 (Table) with expected CanonicalQuery fields", () => {
    const { code, stdout, stderr, outPath } = runDump("arel-01");
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      expect(result.version).toBe(1);
      expect(result.fixture).toBe("arel-01");
      expect(result.frozenAt).toBe(DEFAULT_FROZEN_AT);
      expect(result.sql).toMatch(/"users"/i);
      expect(result.binds).toEqual([]);
    } finally {
      cleanup(outPath);
    }
  });

  it("dumps arel-06 (eq predicate)", () => {
    const { code, stdout, stderr, outPath } = runDump("arel-06");
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      expect(result.sql).toMatch(/"users"\."name" = /i);
    } finally {
      cleanup(outPath);
    }
  });

  it("dumps arel-09 (lt predicate)", () => {
    const { code, stdout, stderr, outPath } = runDump("arel-09");
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      expect(result.sql).toMatch(/"users"\."age" < /i);
    } finally {
      cleanup(outPath);
    }
  });

  it("dumps arel-21 (SelectManager with WHERE)", () => {
    const { code, stdout, stderr, outPath } = runDump("arel-21");
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      expect(result.sql).toMatch(/SELECT/i);
      expect(result.sql).toMatch(/WHERE/i);
    } finally {
      cleanup(outPath);
    }
  });

  it("preserves --frozen-at string verbatim in frozenAt output", () => {
    const frozen = "2026-01-01T00:00:00.000Z";
    const { code, stdout, stderr, outPath } = runDump("arel-01", { frozenAt: frozen });
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      expect(result.frozenAt).toBe(frozen);
    } finally {
      cleanup(outPath);
    }
  });

  it("exits 1 with stderr when --frozen-at has no value", () => {
    const outDir = mkdtempSync(join(tmpdir(), "parity-node-test-"));
    const outPath = join(outDir, "out.json");
    try {
      const res = spawnSync(
        TSX_BIN,
        [DUMP_SCRIPT, join(FIXTURES, "arel-01"), outPath, "--frozen-at"],
        { encoding: "utf8" },
      );
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/--frozen-at requires a value/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("exits 1 with stderr when --frozen-at has invalid format", () => {
    const { code, stderr, outPath } = runDump("arel-01", { frozenAt: "not-a-timestamp" });
    try {
      expect(code).toBe(1);
      expect(stderr).toMatch(/--frozen-at must be ISO 8601 UTC with trailing Z/);
    } finally {
      cleanup(outPath);
    }
  });

  it("emits output that validates against query.schema.json", () => {
    const schemaPath = resolve(SCRIPT_DIR, "../../canonical/query.schema.json");
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const ajv = new Ajv({ strict: false });
    const validate = ajv.compile(schema);

    const { code, stdout, stderr, outPath } = runDump("arel-06");
    try {
      expect(code, `dump failed\nstdout: ${stdout}\nstderr: ${stderr}`).toBe(0);
      const result = JSON.parse(readFileSync(outPath, "utf8"));
      const ok = validate(result);
      expect(ok, `schema validation failed: ${JSON.stringify(validate.errors, null, 2)}`).toBe(
        true,
      );
    } finally {
      cleanup(outPath);
    }
  });
});
