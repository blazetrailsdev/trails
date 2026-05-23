/**
 * Snapshot tests for the D-1 sidecar migration codemod.
 *
 * Reads the pre-codemod file from `MIGRATION_SHA^` (the parent of the commit
 * that applied this codemod), runs migrateText, and asserts functional
 * equivalence with the current working-tree file. Pinning a SHA — the same
 * pattern as scripts/d1-migrate.test.ts — keeps the tests stable after merge
 * (merge-base HEAD origin/main == HEAD on main, so the before file would be
 * already-migrated).
 *
 * Two representative files are tested — one from each structural variant:
 *   - coders/json.test.ts   → Group A (module-level adapter/beforeAll)
 *   - validations/absence-validation.test.ts → Group B (describe-scoped)
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrateText } from "./d1-migrate-sidecar.js";

const ROOT = resolve(import.meta.dirname, "..");

// Commit that first applied the sidecar migration across all 11 files (PR #2319).
// Use `^` to read the parent (pre-migration) state of any given file.
const MIGRATION_SHA = "3c16f9db7";

function gitShow(ref: string, path: string): string {
  return execFileSync("git", ["show", `${ref}:${path}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function prettify(text: string): string {
  return execFileSync(
    "pnpm",
    [
      "prettier",
      "--parser",
      "typescript",
      "--config",
      resolve(ROOT, ".prettierrc.json"),
      "--log-level",
      "silent",
    ],
    { cwd: ROOT, encoding: "utf8", input: text },
  );
}

function normalize(text: string): string {
  const sorted = text.replace(
    /import\s*(type\s+)?\{\s*([^}]+)\}\s*from\s*"([^"]+)"\s*;?/g,
    (_m, typePrefix: string | undefined, names: string, mod: string) => {
      const parts = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .sort();
      const prefix = typePrefix ? "type " : "";
      return `import ${prefix}{ ${parts.join(", ")} } from "${mod}";`;
    },
  );
  const lines = sorted
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  let start = 0;
  while (start < lines.length && !/^import\s/.test(lines[start])) start++;
  let end = start;
  while (end < lines.length && /^import\s/.test(lines[end])) end++;
  const head = lines.slice(start, end).sort();
  return [...lines.slice(0, start), ...head, ...lines.slice(end)].join("\n");
}

describe("d1-migrate-sidecar codemod", () => {
  it("Group A: transforms module-level sidecar pattern (json.test.ts)", () => {
    const repoPath = "packages/activerecord/src/coders/json.test.ts";
    const before = gitShow(`${MIGRATION_SHA}^`, repoPath);
    const abs = resolve(ROOT, repoPath);
    const expected = readFileSync(abs, "utf8");
    const out = migrateText(before, abs);
    if (typeof out !== "string") throw new Error(`codemod skipped: ${out.skip}`);
    expect(normalize(prettify(out))).toBe(normalize(expected));
  });

  it("Group B: transforms describe-scoped sidecar pattern (absence-validation.test.ts)", () => {
    const repoPath = "packages/activerecord/src/validations/absence-validation.test.ts";
    const before = gitShow(`${MIGRATION_SHA}^`, repoPath);
    const abs = resolve(ROOT, repoPath);
    const expected = readFileSync(abs, "utf8");
    const out = migrateText(before, abs);
    if (typeof out !== "string") throw new Error(`codemod skipped: ${out.skip}`);
    expect(normalize(prettify(out))).toBe(normalize(expected));
  });

  it("is idempotent — already-migrated files return already-migrated", () => {
    const abs = resolve(ROOT, "packages/activerecord/src/coders/json.test.ts");
    const after = readFileSync(abs, "utf8");
    const out = migrateText(after, abs);
    expect(out).toEqual({ skip: "already-migrated" });
  });

  it("skips inline createSidecarTestAdapter usage (not in beforeAll)", () => {
    const text = `
      import { createSidecarTestAdapter } from "../test-adapter.js";
      describe("IntegerTest", () => {
        it("inline", () => {
          const { adapter } = createSidecarTestAdapter();
        });
      });
    `;
    const out = migrateText(text, resolve(ROOT, "packages/activerecord/src/type/x.test.ts"));
    expect(out).toEqual({ skip: expect.stringMatching(/beforeAll/) });
  });

  it("skips files without createSidecarTestAdapter import", () => {
    const text = `
      import { createTestAdapter } from "./test-adapter.js";
      let adapter: any;
      beforeAll(async () => { adapter = createTestAdapter(); });
    `;
    const out = migrateText(text, resolve(ROOT, "packages/activerecord/src/x.test.ts"));
    expect(out).toEqual({ skip: "no createSidecarTestAdapter import" });
  });
});
