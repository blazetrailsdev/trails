import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { writeJsonManifest } from "./write-json-manifest.js";

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

  it("round-trips to the same data", () => {
    const out = tmpManifest();
    writeJsonManifest(out, SAMPLE);
    expect(JSON.parse(fs.readFileSync(out, "utf8"))).toEqual(SAMPLE);
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
    ];
    for (const name of emitters) {
      const src = fs.readFileSync(path.join(REPO_ROOT, "scripts", name), "utf8");
      expect(src, `${name} must emit via writeJsonManifest`).not.toMatch(
        /write(File|FileSync)\s*\(\s*[A-Z_]*OUT[A-Z_]*\s*,/,
      );
    }
  });
});
