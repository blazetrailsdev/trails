import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import {
  writeJsonManifest,
  beginManifestBatch,
  flushManifestBatch,
} from "./write-json-manifest.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PRETTIER_BIN = path.join(REPO_ROOT, "node_modules/.bin/prettier");

function tmpManifest(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "write-json-manifest-"));
  return path.join(dir, "manifest.json");
}

function prettierCheck(file: string): boolean {
  try {
    execFileSync(PRETTIER_BIN, ["--check", file], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Short arrays are exactly where JSON.stringify and prettier disagree:
// stringify puts every element on its own line, prettier collapses them.
const SAMPLE = {
  files: {
    "packages/activerecord/src/base.ts": ["a", "b"],
    "packages/activerecord/src/relation.ts": ["c"],
  },
};

describe("writeJsonManifest", () => {
  it("emits output that passes prettier --check", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    expect(prettierCheck(out)).toBe(true);
  });

  it("differs from raw JSON.stringify — the churn this helper exists to prevent", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    expect(fs.readFileSync(out, "utf8")).not.toBe(JSON.stringify(SAMPLE, null, 2) + "\n");
  });

  it("is idempotent across repeated regeneration", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    const first = fs.readFileSync(out, "utf8");
    writeJsonManifest(out, SAMPLE);
    expect(fs.readFileSync(out, "utf8")).toBe(first);
  });

  it("repairs a file an older stringify-based emitter already churned", () => {
    const out = tmpManifest();
    fs.writeFileSync(out, JSON.stringify(SAMPLE, null, 2) + "\n");
    expect(prettierCheck(out)).toBe(false);
    writeJsonManifest(out, SAMPLE);
    expect(prettierCheck(out)).toBe(true);
  });

  it("creates missing parent directories", () => {
    const out = path.join(path.dirname(tmpManifest()), "nested", "deep", "manifest.json");
    writeJsonManifest(out, SAMPLE);
    expect(fs.existsSync(out)).toBe(true);
  });

  // Regression: `prettier --stdin-filepath` consults .gitignore AND
  // .prettierignore, and for a matched path echoes stdin back unformatted with
  // exit 0. Several manifests are gitignored, so a helper that honoured the
  // ignore files would be a silent no-op exactly where the trap lives.
  it("formats even when the target path is ignored by prettier/git", () => {
    const dir = path.dirname(tmpManifest());
    fs.writeFileSync(path.join(dir, ".prettierignore"), "*.json\n");
    fs.writeFileSync(path.join(dir, ".gitignore"), "*.json\n");
    const out = path.join(dir, "ignored.json");
    writeJsonManifest(out, SAMPLE);
    expect(fs.readFileSync(out, "utf8")).not.toBe(JSON.stringify(SAMPLE, null, 2) + "\n");
  });

  it("round-trips to the same data", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual(SAMPLE);
  });

  it("buffers writes in memory until flush, then formats every path", () => {
    const a = tmpManifest();
    const b = tmpManifest();
    beginManifestBatch();
    writeJsonManifest(a, SAMPLE);
    writeJsonManifest(b, SAMPLE);
    // Nothing touches disk until the batch flushes.
    expect(fs.existsSync(a)).toBe(false);
    expect(fs.existsSync(b)).toBe(false);
    flushManifestBatch();
    expect(prettierCheck(a)).toBe(true);
    expect(prettierCheck(b)).toBe(true);
  });

  it("leaves the tracked file untouched when a batch is abandoned before flush", () => {
    const out = tmpManifest();
    fs.writeFileSync(out, "sentinel\n");
    beginManifestBatch();
    writeJsonManifest(out, SAMPLE);
    // A throw between begin and flush must not churn the committed bytes.
    expect(fs.readFileSync(out, "utf8")).toBe("sentinel\n");
    flushManifestBatch();
    expect(prettierCheck(out)).toBe(true);
  });

  it("leaves no temp files beside a committed manifest", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    const strays = fs.readdirSync(path.dirname(out)).filter((f) => f.includes(".tmp."));
    expect(strays).toEqual([]);
  });

  it("batches to output byte-identical to the immediate path", () => {
    const immediate = tmpManifest();
    writeJsonManifest(immediate, SAMPLE);
    const batched = tmpManifest();
    beginManifestBatch();
    writeJsonManifest(batched, SAMPLE);
    flushManifestBatch();
    expect(fs.readFileSync(batched, "utf8")).toBe(fs.readFileSync(immediate, "utf8"));
  });
});

describe("manifest emitters", () => {
  // Guards the actual regression: a new write site that bypasses the helper
  // re-arms the churn trap, and nothing else in CI would catch it.
  it("never write manifests with raw JSON.stringify", () => {
    const emitters = [
      "build-rails-privates-manifest.ts",
      "build-rails-tosql-manifest.ts",
      "build-rails-error-manifest.ts",
      "build-rails-file-structure-manifest.ts",
      "schema-compare/compare.ts",
    ];
    for (const name of emitters) {
      const src = fs.readFileSync(path.join(REPO_ROOT, "scripts", name), "utf8");
      expect(src, `${name} must emit via writeJsonManifest`).not.toMatch(
        /write(File|FileSync)\s*\(\s*(BASELINE|[A-Z_]*OUT[A-Z_]*)\s*,/,
      );
    }
  });

  it("ratchet/exclude generators emit via writeJsonManifest", () => {
    const generators = [
      "generate-no-explicit-any-allowlist.ts",
      "generate-fixture-parity-exclude.ts",
      "generate-standalone-associations-exclude.ts",
      "test-deps/build-fixture-baseline.ts",
    ];
    for (const name of generators) {
      const src = fs.readFileSync(path.join(REPO_ROOT, "scripts", name), "utf8");
      expect(src, `${name} must emit via writeJsonManifest`).toMatch(/\bwriteJsonManifest\b/);
      expect(src, `${name} must not hand-format JSON`).not.toMatch(/JSON\.stringify/);
    }
  });

  // The committed baseline passes `prettier --check` today only by luck — it
  // is a flat array of long paths prettier won't collapse. Round-tripping the
  // real data through the helper proves the emitter now reproduces the tracked
  // bytes exactly, which --check alone cannot show.
  it("reproduces the committed expected-fixtures-exclude.json byte-identically", () => {
    const tracked = path.join(REPO_ROOT, "eslint/expected-fixtures-exclude.json");
    const committed = fs.readFileSync(tracked, "utf8");
    const out = tmpManifest();
    writeJsonManifest(out, JSON.parse(committed));
    expect(fs.readFileSync(out, "utf8")).toBe(committed);
  });
});
