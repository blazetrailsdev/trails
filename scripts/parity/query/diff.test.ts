import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Integration tests for diff.ts classification (PASS / KNOWN-GAP / FAIL /
// UNEXPECTED-PASS). diff.ts reads the known-gaps path from
// PARITY_KNOWN_GAPS_PATH when set, so these tests can inject arbitrary
// gap lists without touching the committed file.

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../../..");
const DIFF_SCRIPT = join(SCRIPT_DIR, "diff.ts");
const TSX_BIN = resolve(
  REPO_ROOT,
  "node_modules/.bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);

const EXAMPLE = {
  version: 1,
  fixture: "arel-xx",
  frozenAt: "2000-01-01T00:00:00.000Z",
  sql: "SELECT 1",
  binds: [] as string[],
};

function fixtureJson(overrides: Partial<typeof EXAMPLE> = {}): string {
  return JSON.stringify({ ...EXAMPLE, ...overrides }, null, 2) + "\n";
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runDiff(
  railsDir: string,
  trailsDir: string,
  gapsPath: string,
  fixturesDir?: string,
): RunResult {
  const res = spawnSync(
    TSX_BIN,
    [DIFF_SCRIPT, "--rails-dir", railsDir, "--trails-dir", trailsDir],
    {
      encoding: "utf8",
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PARITY_KNOWN_GAPS_PATH: gapsPath,
        // Point at a throwaway fixtures dir when specified so tests don't
        // accidentally pick up real fixtures committed under scripts/parity/fixtures.
        ...(fixturesDir ? { PARITY_FIXTURES_DIR: fixturesDir } : {}),
      },
    },
  );
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

describe("diff.ts classification", () => {
  let tmp: string;
  let railsDir: string;
  let trailsDir: string;
  let gapsPath: string;
  let fixturesDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "parity-query-diff-test-"));
    railsDir = join(tmp, "rails");
    trailsDir = join(tmp, "trails");
    gapsPath = join(tmp, "gaps.json");
    fixturesDir = join(tmp, "fixtures");
    mkdirSync(railsDir);
    mkdirSync(trailsDir);
    mkdirSync(fixturesDir);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeGaps(gaps: Record<string, { side: string; reason: string }>): void {
    writeFileSync(gapsPath, JSON.stringify(gaps));
  }

  it("PASS when both sides have identical SQL and no gap is listed", () => {
    writeFileSync(join(railsDir, "a.json"), fixtureJson({ fixture: "a" }));
    writeFileSync(join(trailsDir, "a.json"), fixtureJson({ fixture: "a" }));
    writeGaps({});
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/PASS\s+a\b/);
    expect(code).toBe(0);
  });

  it("KNOWN-GAP when SQL diff matches a listed diff gap", () => {
    writeFileSync(join(railsDir, "b.json"), fixtureJson({ fixture: "b", sql: "X" }));
    writeFileSync(join(trailsDir, "b.json"), fixtureJson({ fixture: "b", sql: "Y" }));
    writeGaps({ b: { side: "diff", reason: "stub diff" } });
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/KNOWN-GAP\s+b\b/);
    expect(code).toBe(0);
  });

  it("UNEXPECTED-PASS and exit 1 when a listed gap now passes", () => {
    writeFileSync(join(railsDir, "c.json"), fixtureJson({ fixture: "c" }));
    writeFileSync(join(trailsDir, "c.json"), fixtureJson({ fixture: "c" }));
    writeGaps({ c: { side: "diff", reason: "used to diff" } });
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/UNEXPECTED-PASS\s+c\b/);
    expect(code).toBe(1);
  });

  it("FAIL and exit 1 when an unlisted fixture diverges", () => {
    writeFileSync(join(railsDir, "d.json"), fixtureJson({ fixture: "d", sql: "X" }));
    writeFileSync(join(trailsDir, "d.json"), fixtureJson({ fixture: "d", sql: "Y" }));
    writeGaps({});
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/FAIL\s+d\b/);
    expect(stdout).toMatch(/output differs/);
    expect(code).toBe(1);
  });

  it("KNOWN-GAP when trails output missing and listed as trails-missing", () => {
    writeFileSync(join(railsDir, "e.json"), fixtureJson({ fixture: "e" }));
    writeGaps({ e: { side: "trails-missing", reason: "trails gap" } });
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/KNOWN-GAP\s+e/);
    expect(stdout).toMatch(/trails-missing/);
    expect(code).toBe(0);
  });

  it("FAIL and exit 1 when fixture missing from both sides and unlisted", () => {
    // Simulate a fixture directory containing arel-g even though neither dump
    // side produced output and there's no gap entry. Prior to this check, diff
    // would silently exit 0 because the fixture was absent everywhere.
    mkdirSync(join(fixturesDir, "arel-g"));
    writeGaps({});
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/FAIL\s+arel-g/);
    expect(stdout).toMatch(/both-missing/);
    expect(code).toBe(1);
  });

  it("FAIL when listed gap side doesn't match actual state", () => {
    writeFileSync(join(railsDir, "f.json"), fixtureJson({ fixture: "f" }));
    // trails is missing — but gap claims it's a diff
    writeGaps({ f: { side: "diff", reason: "expected both produce" } });
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(stdout).toMatch(/FAIL\s+f/);
    expect(stdout).toMatch(/expected diff, actual trails-missing/);
    expect(code).toBe(1);
  });

  it("summary includes gap-by-side breakdown across multiple categories", () => {
    // g: both sides differ AND listed as diff → KNOWN-GAP diff
    writeFileSync(join(railsDir, "g.json"), fixtureJson({ fixture: "g", sql: "A" }));
    writeFileSync(join(trailsDir, "g.json"), fixtureJson({ fixture: "g", sql: "B" }));
    // h: trails missing AND listed as trails-missing → KNOWN-GAP trails-missing
    writeFileSync(join(railsDir, "h.json"), fixtureJson({ fixture: "h" }));
    // i: rails missing AND listed as rails-missing → KNOWN-GAP rails-missing
    writeFileSync(join(trailsDir, "i.json"), fixtureJson({ fixture: "i" }));
    writeGaps({
      g: { side: "diff", reason: "g gap" },
      h: { side: "trails-missing", reason: "h gap" },
      i: { side: "rails-missing", reason: "i gap" },
    });
    const { code, stdout } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(code).toBe(0);
    // All three categories appear in the breakdown line, each with count 1.
    expect(stdout).toMatch(/known gaps by side: .*1 rails-missing/);
    expect(stdout).toMatch(/known gaps by side: .*1 trails-missing/);
    expect(stdout).toMatch(/known gaps by side: .*1 diff/);
    expect(stdout).toMatch(/3 known gap\(s\)/);
  });
});

describe("diff.ts known-gaps validation", () => {
  let tmp: string;
  let railsDir: string;
  let trailsDir: string;
  let gapsPath: string;
  let fixturesDir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "parity-query-diff-test-"));
    railsDir = join(tmp, "rails");
    trailsDir = join(tmp, "trails");
    gapsPath = join(tmp, "gaps.json");
    fixturesDir = join(tmp, "fixtures");
    mkdirSync(railsDir);
    mkdirSync(trailsDir);
    mkdirSync(fixturesDir);
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("exits 1 with pointed error on invalid `side` value", () => {
    writeFileSync(gapsPath, JSON.stringify({ a: { side: "typo", reason: "x" } }));
    const { code, stderr } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/\[a\]\.side must be one of/);
    expect(stderr).toMatch(/got "typo"/);
  });

  it("exits 1 with pointed error on empty `reason`", () => {
    writeFileSync(gapsPath, JSON.stringify({ a: { side: "diff", reason: "" } }));
    const { code, stderr } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/\[a\]\.reason must be a non-empty string/);
  });

  it("exits 1 on malformed JSON", () => {
    writeFileSync(gapsPath, "{not json");
    const { code, stderr } = runDiff(railsDir, trailsDir, gapsPath, fixturesDir);
    expect(code).toBe(1);
    expect(stderr).toMatch(/failed to parse/);
  });
});
