import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { RuleTester } from "eslint";
import { describe, it, expect } from "vitest";
import rule, {
  BANNED,
  isCanonicalSchemaModule,
  moduleBasename,
} from "./no-internal-canonical-loaders.mjs";
import { canonicalLoaderModules } from "./test-infra-scope.mjs";

const FILENAME = "packages/activerecord/src/dirty.test.ts";
const OWN_TEST = "packages/activerecord/src/support/canonical-schema.test.ts";
const OWN_REBUILD_TEST = "packages/activerecord/src/support/canonical-table-rebuild.test.ts";

const tester = new RuleTester({
  languageOptions: {
    parser: (await import("typescript-eslint")).parser,
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

tester.run("no-internal-canonical-loaders", rule, {
  valid: [
    // The sanctioned surface — fixtures({}) — is never flagged.
    {
      filename: FILENAME,
      code: 'import { fixtures } from "./test-fixtures.js";',
    },
    // rebuildCanonicalTables is the documented anti-contamination shield — allowed.
    {
      filename: FILENAME,
      code: 'import { rebuildCanonicalTables } from "./support/canonical-table-rebuild.js";',
    },
    // The loaders' own unit test may import them directly — via the real
    // same-directory specifier it actually uses.
    {
      filename: OWN_TEST,
      code: 'import { loadCanonicalSchema } from "./canonical-schema.js";',
    },
    // Same for the drop/rebuild half's own unit test, which owns
    // ensureCanonicalTables since the split.
    {
      filename: OWN_REBUILD_TEST,
      code: 'import { ensureCanonicalTables } from "./canonical-table-rebuild.js";',
    },
    // load-schema-helper's own unit test may import loadSchema directly.
    {
      filename: "packages/activerecord/src/support/load-schema-helper.test.ts",
      code: 'import { loadSchema } from "./load-schema-helper.js";',
    },
    // A banned symbol imported from an unrelated module is not the loader.
    {
      filename: FILENAME,
      code: 'import { loadCanonicalSchema } from "./some-other-module.js";',
    },
  ],
  invalid: [
    {
      filename: FILENAME,
      code: 'import { ensureCanonicalTables } from "./support/canonical-table-rebuild.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    {
      filename: FILENAME,
      code: 'import { loadCanonicalSchema } from "./support/canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "loadCanonicalSchema" } }],
    },
    // `loadSchema` wraps `loadCanonicalSchema`, so the Rails-named entry point
    // is banned in test files too.
    {
      filename: FILENAME,
      code: 'import { loadSchema } from "./support/load-schema-helper.js";',
      errors: [{ messageId: "banned", data: { name: "loadSchema" } }],
    },
    // Deeper relative path (adapters/mysql2/*.test.ts reaching up two levels).
    {
      filename: "packages/activerecord/src/adapters/mysql2/mysql2-adapter.test.ts",
      code: 'import { ensureCanonicalTables } from "../../support/canonical-table-rebuild.js";',
      errors: [{ messageId: "banned", data: { name: "ensureCanonicalTables" } }],
    },
    // Same-directory sibling test inside test-helpers/ (not the allowlisted own
    // test) — the most likely place to reach for the loaders via
    // `./canonical-schema.js`. Must still be caught.
    {
      filename: "packages/activerecord/src/support/schema-file-generator.test.ts",
      code: 'import { loadCanonicalSchema } from "./canonical-schema.js";',
      errors: [{ messageId: "banned", data: { name: "loadCanonicalSchema" } }],
    },
    // Both banned symbols in one import → one report each.
    {
      filename: FILENAME,
      code: 'import { ensureCanonicalTables, loadCanonicalSchema } from "./support/canonical-table-rebuild.js";',
      errors: [
        { messageId: "banned", data: { name: "ensureCanonicalTables" } },
        { messageId: "banned", data: { name: "loadCanonicalSchema" } },
      ],
    },
  ],
});

const supportDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "packages",
  "activerecord",
  "src",
  "support",
);

/** Names exported by `source`, covering the export forms used in `support/`. */
function exportedNames(source) {
  const names = new Set();
  for (const [, name] of source.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(name);
  }
  for (const [, clause] of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const entry of clause.split(",")) {
      const parts = entry.trim().split(/\s+as\s+/);
      const name = (parts.at(-1) ?? "").trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Walks the whole `support/` tree, not just its top level: the rule matches on
 * basename regardless of directory depth, so a loader moved into a
 * `support/<subdir>/` module is exactly the silent-reopen case being guarded.
 */
async function* supportSources(dir = supportDir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "dist") yield* supportSources(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      yield full;
    }
  }
}

/** Repo-relative path → the BANNED symbols that module exports. */
async function bannedExportsBySupportModule() {
  const byModule = new Map();
  for await (const file of supportSources()) {
    const source = await fs.readFile(file, "utf8");
    const banned = [...exportedNames(source)].filter((name) => BANNED.has(name)).sort();
    if (banned.length > 0) byModule.set(path.relative(supportDir, file), banned);
  }
  return byModule;
}

describe("no-internal-canonical-loaders module matcher", () => {
  it("matches every support/ module that exports a banned loader", async () => {
    const unmatched = [];
    for (const [file, banned] of await bannedExportsBySupportModule()) {
      if (!isCanonicalSchemaModule(`./${file.replace(/\.ts$/, ".js")}`)) {
        unmatched.push(`${file} exports ${banned.join(", ")}`);
      }
    }
    expect(unmatched).toEqual([]);
  });

  it("lists no module that has stopped exporting a banned loader", async () => {
    const found = new Set(
      [...(await bannedExportsBySupportModule()).keys()].map((file) =>
        moduleBasename(file.replace(/\.ts$/, "")),
      ),
    );
    expect(canonicalLoaderModules.filter((module) => !found.has(module))).toEqual([]);
  });
});
