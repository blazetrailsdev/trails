/**
 * Snapshot tests for the D-1 migration codemod.
 *
 * Validation strategy: for each reference PR, check that the pre-merge file
 * (via git show) feeds through the codemod into a result that is functionally
 * equivalent to the merged file. "Functionally equivalent" allows
 * whitespace and import-order differences (normalized below).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { migrateText } from "./d1-migrate.js";

const ROOT = resolve(import.meta.dirname, "..");

function gitShow(sha: string, path: string): string {
  return execFileSync("git", ["show", `${sha}:${path}`], {
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

// Normalize: strip blank lines, sort named-import members alphabetically per import,
// and sort top-of-file import groups by module specifier. This focuses comparison
// on functional equivalence rather than formatter taste.
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
  // Sort the leading run of import statements (and any folded multi-line imports
  // that prettier merged into a single line by this point).
  let start = 0;
  while (start < lines.length && !/^import\s/.test(lines[start])) start++;
  let end = start;
  while (end < lines.length && /^import\s/.test(lines[end])) end++;
  const head = lines.slice(start, end).sort();
  return [...lines.slice(0, start), ...head, ...lines.slice(end)].join("\n");
}

const REFERENCES: { name: string; sha: string; repoPath: string }[] = [
  // PR #2286 (relation-scoping) — complex variant; included for completeness.
  // {
  //   name: "relation-scoping",
  //   sha: "<prMergeSha>",
  //   repoPath: "packages/activerecord/src/scoping/relation-scoping.test.ts",
  // },
  {
    name: "clone (PR #2292)",
    sha: "271599c7f",
    repoPath: "packages/activerecord/src/clone.test.ts",
  },
  {
    name: "delegate (PR #2293)",
    sha: "37e2035b1",
    repoPath: "packages/activerecord/src/delegate.test.ts",
  },
];

describe("d1-migrate codemod", () => {
  for (const ref of REFERENCES) {
    it(`reproduces merged result for ${ref.name}`, () => {
      const before = gitShow(`${ref.sha}^`, ref.repoPath);
      const after = gitShow(ref.sha, ref.repoPath);
      const abs = resolve(ROOT, ref.repoPath);
      const out = migrateText(before, abs);
      if (typeof out !== "string") {
        throw new Error(`codemod skipped: ${out.skip}`);
      }
      const prettyOut = prettify(out);
      expect(normalize(prettyOut)).toBe(normalize(after));
    });
  }

  it("is idempotent — running on already-migrated file is a no-op", () => {
    const after = gitShow("271599c7f", "packages/activerecord/src/clone.test.ts");
    const abs = resolve(ROOT, "packages/activerecord/src/clone.test.ts");
    const out = migrateText(after, abs);
    expect(out).toEqual({ skip: "already-migrated" });
  });

  it("skips files using createSidecarTestAdapter", () => {
    const text = `
      import { createSidecarTestAdapter } from "../test-adapter.js";
      import { defineSchema } from "../test-helpers/define-schema.js";
      let adapter: any;
      beforeAll(async () => { ({ adapter } = createSidecarTestAdapter()); });
    `;
    const out = migrateText(text, resolve(ROOT, "packages/activerecord/src/x.test.ts"));
    expect(out).toEqual({ skip: expect.stringMatching(/Sidecar|Pooled/i) });
  });

  it("skips files that call defineSchema inside it()", () => {
    const text = `
      import { createTestAdapter } from "./test-adapter.js";
      import { defineSchema } from "./test-helpers/define-schema.js";
      import type { DatabaseAdapter } from "./adapter.js";
      let adapter: DatabaseAdapter;
      beforeAll(async () => {
        adapter = createTestAdapter();
        await defineSchema(adapter, { posts: { title: "string" } });
      });
      describe("x", () => {
        it("y", async () => {
          await defineSchema(adapter, { extra: { name: "string" } });
        });
      });
    `;
    const out = migrateText(text, resolve(ROOT, "packages/activerecord/src/x.test.ts"));
    expect(out).toEqual({ skip: expect.stringMatching(/outside beforeAll/) });
  });
});
