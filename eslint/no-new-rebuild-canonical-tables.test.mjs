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

// Derived from the baseline rather than hardcoded: RFC 0079 burns these rows
// down to zero, so a named path is a fixture that any burndown PR deletes out
// from under this suite. `LISTED_TWO` is absent once no row allows more than
// one call, and both are absent at the RFC's endpoint — the cases that need
// them drop out rather than fail.
const LISTED_ONE = Object.keys(REBUILD_CALLERS).find((rel) => REBUILD_CALLERS[rel] === 1);
const LISTED_TWO = Object.keys(REBUILD_CALLERS).find((rel) => REBUILD_CALLERS[rel] >= 2);
const LISTED_TWO_ALLOWED = LISTED_TWO === undefined ? 0 : REBUILD_CALLERS[LISTED_TWO];
const UNLISTED = "packages/activerecord/src/relations.test.ts";

const CALL = 'await rebuildCanonicalTables(Base.connection, ["topics"]);';
const calls = (n) => Array.from({ length: n }, () => CALL).join(" ");

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-new-rebuild-canonical-tables", rule, {
  valid: [
    ...(LISTED_ONE === undefined
      ? []
      : [
          {
            name: "a listed file calling exactly its allowance",
            filename: LISTED_ONE,
            code: `async function f() { ${CALL} }`,
          },
        ]),
    ...(LISTED_TWO === undefined
      ? []
      : [
          {
            name: "a listed file with an allowance of two, calling twice",
            filename: LISTED_TWO,
            code: `async function f() { ${calls(LISTED_TWO_ALLOWED)} }`,
          },
        ]),
    {
      name: "an unlisted file that does not call the helper",
      filename: UNLISTED,
      code: 'import { fixtures } from "./test-fixtures.js";\nfixtures(["topics"]);',
    },
    {
      name: "importing the helper without calling it is not a call site",
      filename: UNLISTED,
      code: 'import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";',
    },
    {
      name: "the helper's own module, where the declaration is not a call",
      filename: HELPER_MODULES[0],
      code: "export async function rebuildCanonicalTables() {}",
    },
    {
      name: "the helper's self-coverage tests, which are exempt",
      filename: HELPER_MODULES[1],
      code: `async function f() { ${CALL} ${CALL} ${CALL} }`,
    },
    {
      name: "the bulk-inbound-fk self-coverage test, which is exempt",
      filename: HELPER_MODULES[2],
      code: `async function f() { ${CALL} ${CALL} }`,
    },
    {
      name: "a same-named method on an unrelated object is not the helper",
      filename: UNLISTED,
      code: "async function f() { await this.somethingElse(); }",
    },
  ],
  invalid: [
    {
      name: "an unlisted file may not call the helper at all",
      filename: UNLISTED,
      code: `async function f() { ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }],
    },
    {
      name: "every call in an unlisted file reports, not just the first",
      filename: UNLISTED,
      code: `async function f() { ${CALL} ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }, { messageId: "unlistedCaller" }],
    },
    ...(LISTED_ONE === undefined
      ? []
      : [
          {
            name: "a listed file over its allowance reports only the excess call",
            filename: LISTED_ONE,
            code: `async function f() { ${CALL} ${CALL} }`,
            errors: [{ messageId: "tooManyCalls", data: { allowed: "1", actual: "2" } }],
          },
          {
            name: "a listed file that dropped to zero calls must tighten the baseline",
            filename: LISTED_ONE,
            code: "async function f() { return 1; }",
            errors: [{ messageId: "staleAllowance", data: { allowed: "1", actual: "0" } }],
          },
        ]),
    ...(LISTED_TWO === undefined
      ? []
      : [
          {
            name: "two excess calls over an allowance of two report twice",
            filename: LISTED_TWO,
            code: `async function f() { ${calls(LISTED_TWO_ALLOWED + 2)} }`,
            errors: [{ messageId: "tooManyCalls" }, { messageId: "tooManyCalls" }],
          },
          {
            name: "a listed file that dropped one of two calls must tighten the baseline",
            filename: LISTED_TWO,
            code: `async function f() { ${calls(LISTED_TWO_ALLOWED - 1)} }`,
            errors: [
              {
                messageId: "staleAllowance",
                data: {
                  allowed: String(LISTED_TWO_ALLOWED),
                  actual: String(LISTED_TWO_ALLOWED - 1),
                },
              },
            ],
          },
        ]),
    {
      name: "a file outside packages/ and scripts/ can never be listed, so it reports",
      filename: "tools/scratch.ts",
      code: `async function f() { ${CALL} }`,
      errors: [{ messageId: "unlistedCaller" }],
    },
    {
      name: "a namespaced call is still a call",
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

  it("never exceeds the RFC 0079 baseline of 26 call sites across 22 files", () => {
    const files = Object.keys(REBUILD_CALLERS).length;
    const sites = Object.values(REBUILD_CALLERS).reduce((a, b) => a + b, 0);
    expect(files).toBeLessThanOrEqual(22);
    expect(sites).toBeLessThanOrEqual(26);
  });

  it("agrees with what is actually on disk, for files ESLint may never visit", async () => {
    for (const [rel, allowed] of Object.entries(REBUILD_CALLERS)) {
      const src = await fs.readFile(path.join(REPO_ROOT, rel), "utf8");
      const actual = (src.match(/\brebuildCanonicalTables\s*\(/g) ?? []).length;
      expect(actual, `${rel} has ${actual} call sites, baseline says ${allowed}`).toBe(allowed);
    }
  });
});

describe("scope helpers", () => {
  it("keys the baseline off the repo-relative path, absolute or not", () => {
    // `UNLISTED` here only because repoRel is about path shape, not membership;
    // the membership half below reads a real row while the baseline still has
    // one.
    expect(repoRel(`/home/someone/trails/${UNLISTED}`)).toBe(UNLISTED);
    expect(repoRel(UNLISTED)).toBe(UNLISTED);
    expect(repoRel("tools/scratch.ts")).toBeNull();
    for (const rel of Object.keys(REBUILD_CALLERS)) {
      expect(rebuildCallerAllowance(`/abs/prefix/${rel}`)).toBe(REBUILD_CALLERS[rel]);
    }
  });

  it("reports an unlisted or out-of-scope file as having no allowance", () => {
    expect(rebuildCallerAllowance(UNLISTED)).toBeNull();
    expect(rebuildCallerAllowance("tools/scratch.ts")).toBeNull();
  });

  it("exempts the helper's own module and self-coverage tests", () => {
    for (const rel of HELPER_MODULES) {
      expect(isRebuildHelperModule(`/abs/prefix/${rel}`)).toBe(true);
    }
    expect(isRebuildHelperModule(UNLISTED)).toBe(false);
  });

  it("ignores the JSON contract note rather than treating it as a path", () => {
    expect(Object.keys(REBUILD_CALLERS)).not.toContain("//");
  });
});
