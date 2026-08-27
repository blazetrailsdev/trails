import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import rule from "./no-new-rebuild-canonical-tables.mjs";
import {
  REBUILD_CALLERS,
  HELPER_MODULES,
  repoRel,
  rebuildCallerAllowance,
  isRebuildHelperModule,
} from "./rebuild-canonical-tables-scope.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// A file that IS in the baseline, with an allowance of exactly 1.
const LISTED_ONE = "packages/activerecord/src/date.test.ts";
// A file that IS in the baseline, with an allowance of 2.
const LISTED_TWO = "packages/activerecord/src/locking.test.ts";
// A file that is NOT in the baseline.
const UNLISTED = "packages/activerecord/src/relations.test.ts";

const CALL = 'await rebuildCanonicalTables(Base.connection, ["topics"]);';

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-new-rebuild-canonical-tables", rule, {
  valid: [
    // A listed file calling exactly its allowance.
    { filename: LISTED_ONE, code: `async function f() { ${CALL} }` },
    { filename: LISTED_TWO, code: `async function f() { ${CALL} ${CALL} }` },
    // An unlisted file that does not call the helper at all.
    {
      filename: UNLISTED,
      code: 'import { fixtures } from "./test-fixtures.js";\nfixtures(["topics"]);',
    },
    // Merely IMPORTING the helper is not a call — the ratchet counts call
    // sites, and require-canonical-rebuild already governs the import side.
    {
      filename: UNLISTED,
      code: 'import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";',
    },
    // The helper's own module declares it; the declaration is not a call, and
    // the module is exempt besides.
    {
      filename: HELPER_MODULES[0],
      code: "export async function rebuildCanonicalTables() {}",
    },
    // The helper's self-coverage tests call it freely — exempt.
    { filename: HELPER_MODULES[1], code: `async function f() { ${CALL} ${CALL} ${CALL} }` },
    { filename: HELPER_MODULES[2], code: `async function f() { ${CALL} ${CALL} }` },
    // A same-named method on an unrelated object is not the helper. Guarding
    // this keeps the rule from firing on a future adapter method that happens
    // to share the name.
    { filename: UNLISTED, code: "async function f() { await this.somethingElse(); }" },
  ],
  invalid: [
    // An unlisted file may not call the helper at all.
    {
      filename: UNLISTED,
      code: `async function f() { ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }],
    },
    // Every call in an unlisted file reports, not just the first.
    {
      filename: UNLISTED,
      code: `async function f() { ${CALL} ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }, { messageId: "unlistedCaller" }],
    },
    // A listed file exceeding its allowance reports only the excess calls, so
    // its baselined sites are not lit up wholesale by one new one.
    {
      filename: LISTED_ONE,
      code: `async function f() { ${CALL} ${CALL} }`,
      errors: [{ messageId: "tooManyCalls", data: { allowed: "1", actual: "2" } }],
    },
    {
      filename: LISTED_TWO,
      code: `async function f() { ${CALL} ${CALL} ${CALL} ${CALL} }`,
      errors: [{ messageId: "tooManyCalls" }, { messageId: "tooManyCalls" }],
    },
    // A listed file BELOW its allowance must tighten the baseline in the same
    // PR — this is what makes the ratchet actually shrink.
    {
      filename: LISTED_ONE,
      code: "async function f() { return 1; }",
      errors: [{ messageId: "staleAllowance", data: { allowed: "1", actual: "0" } }],
    },
    {
      filename: LISTED_TWO,
      code: `async function f() { ${CALL} }`,
      errors: [{ messageId: "staleAllowance", data: { allowed: "2", actual: "1" } }],
    },
    // A file outside packages/ and scripts/ has no repo-relative baseline key,
    // so it can never BE listed — which makes it an unlisted caller, not an
    // exempt one. Today the config globs keep the rule off such trees entirely;
    // reporting here means widening those globs later actually catches
    // something instead of silently exempting a whole directory.
    {
      filename: "tools/scratch.ts",
      code: `async function f() { ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }],
    },
    // A namespaced call is still a call — re-exporting the helper under an
    // alias must not slip past the ratchet.
    {
      filename: UNLISTED,
      code: 'import * as m from "./support/canonical-table-rebuild.js";\nasync function f() { await m.rebuildCanonicalTables(c, ["topics"]); }',
      errors: [{ messageId: "unlistedCaller" }],
    },
  ],
});

describe("rebuild-canonical-tables-callers.json", () => {
  it("lists only files that exist", async () => {
    for (const rel of Object.keys(REBUILD_CALLERS)) {
      const abs = path.join(REPO_ROOT, rel);
      await expect(
        fs.access(abs).then(
          () => true,
          () => false,
        ),
      ).resolves.toBe(true);
    }
  });

  it("carries a positive integer allowance for every entry", () => {
    for (const [rel, count] of Object.entries(REBUILD_CALLERS)) {
      expect(Number.isInteger(count), `${rel} allowance must be an integer`).toBe(true);
      expect(count, `${rel} allowance must be > 0 — delete the line instead`).toBeGreaterThan(0);
    }
  });

  it("does not list the helper's own module or its self-coverage tests", () => {
    for (const rel of HELPER_MODULES) {
      expect(Object.keys(REBUILD_CALLERS)).not.toContain(rel);
    }
  });

  it("matches the RFC 0079 baseline of 26 call sites across 22 files", () => {
    const files = Object.keys(REBUILD_CALLERS).length;
    const sites = Object.values(REBUILD_CALLERS).reduce((a, b) => a + b, 0);
    // These numbers ONLY go down. A burndown PR that lands a removal updates
    // them here in the same commit that tightens the entry; a PR that raises
    // either one is doing the opposite of what RFC 0079 exists to do.
    expect(files).toBeLessThanOrEqual(22);
    expect(sites).toBeLessThanOrEqual(26);
  });

  it("agrees with what is actually on disk", async () => {
    // The ratchet is only as good as its baseline: if a listed file has drifted
    // from its allowance, lint reports it — but only for files ESLint actually
    // visits. This closes that gap by measuring the tree directly.
    for (const [rel, allowed] of Object.entries(REBUILD_CALLERS)) {
      const src = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      const actual = (src.match(/\brebuildCanonicalTables\s*\(/g) ?? []).length;
      expect(actual, `${rel} has ${actual} call sites, baseline says ${allowed}`).toBe(allowed);
    }
  });
});

describe("scope helpers", () => {
  it("keys the baseline off the repo-relative path, absolute or not", () => {
    expect(repoRel(`/home/someone/trails/${LISTED_ONE}`)).toBe(LISTED_ONE);
    expect(repoRel(LISTED_ONE)).toBe(LISTED_ONE);
    expect(repoRel("tools/scratch.ts")).toBeNull();
    expect(rebuildCallerAllowance(`/abs/prefix/${LISTED_ONE}`)).toBe(REBUILD_CALLERS[LISTED_ONE]);
  });

  it("reports an unlisted or out-of-scope file as having no allowance", () => {
    expect(rebuildCallerAllowance(UNLISTED)).toBeNull();
    expect(rebuildCallerAllowance("tools/scratch.ts")).toBeNull();
  });

  it("exempts the helper's own module and self-coverage tests", () => {
    for (const rel of HELPER_MODULES) {
      expect(isRebuildHelperModule(`/abs/prefix/${rel}`)).toBe(true);
    }
    expect(isRebuildHelperModule(LISTED_ONE)).toBe(false);
  });

  it("ignores the JSON contract note rather than treating it as a path", () => {
    expect(Object.keys(REBUILD_CALLERS)).not.toContain("//");
  });
});
