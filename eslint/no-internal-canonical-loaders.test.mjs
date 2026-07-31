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
import { canonicalLoaderModules, canonicalLoaderScanRoots } from "./test-infra-scope.mjs";

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

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Modules outside the loader set that legitimately export a BANNED name,
 * repo-relative. `model-schema.ts` is Rails' own
 * `ActiveRecord::ModelSchema#load_schema` — unrelated to
 * `support/load-schema-helper.ts`, and the rule already lets it through because
 * it matches on module basename as well as symbol.
 */
const nonLoaderBannedExporters = new Set(["packages/activerecord/src/model-schema.ts"]);

/** Names exported by `source`, covering the export forms used in activerecord. */
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

const SKIPPED_DIRS = new Set(["node_modules", "dist", "vendor", ".git", "coverage"]);

/**
 * Every JS/TS spelling a module could use, not just `.ts`: a loader moved into
 * `scripts/` would be `.mjs`, and pinning the extension set to the one the
 * activerecord tree happens to use would leave a fresh hole of the same shape.
 */
const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/;
const TEST_MODULE = /\.test\.[cm]?[jt]sx?$/;

/**
 * Walks every workspace package and the top-level `scripts/` tree, not just
 * `packages/activerecord/src`: the rule matches on module basename with no
 * package anchoring, so a loader relocated into another package (a new
 * `packages/ar-test-infra/`, say) or into a `scripts/` helper is exactly the
 * silent-reopen case being guarded — the same hole as `support/<subdir>/`, two
 * levels up.
 */
async function* workspaceSources(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* workspaceSources(full);
    } else if (SOURCE_EXTENSION.test(entry.name) && !TEST_MODULE.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * Repo-relative path → the BANNED symbols that module exports, for every module
 * in the workspace including the non-loader exporters. Walked once and shared:
 * the scan covers ~2100 files, so each extra walk costs real time.
 */
const scan = (async () => {
  const byModule = new Map();
  const trees = new Set();
  for (const root of canonicalLoaderScanRoots) {
    for await (const file of workspaceSources(path.join(repoRoot, root))) {
      const rel = path.relative(repoRoot, file).replace(/\\/g, "/");
      trees.add(
        rel
          .split("/")
          .slice(0, root === "packages" ? 2 : 1)
          .join("/"),
      );
      const source = await fs.readFile(file, "utf8");
      const banned = [...exportedNames(source)].filter((name) => BANNED.has(name)).sort();
      if (banned.length > 0) byModule.set(rel, banned);
    }
  }
  return { byModule, trees };
})();

const bannedExportsByModule = scan.then(({ byModule }) => byModule);

/** The same map with the sanctioned non-loader exporters dropped. */
async function loaderCandidates() {
  return [...(await bannedExportsByModule)].filter(([file]) => !nonLoaderBannedExporters.has(file));
}

describe("no-internal-canonical-loaders module matcher", () => {
  it("matches every workspace module that exports a banned loader", async () => {
    const unmatched = [];
    for (const [file, banned] of await loaderCandidates()) {
      if (!isCanonicalSchemaModule(`./${file.replace(SOURCE_EXTENSION, "")}`)) {
        unmatched.push(`${file} exports ${banned.join(", ")}`);
      }
    }
    expect(unmatched).toEqual([]);
  });

  it("lists no module that has stopped exporting a banned loader", async () => {
    const found = new Set(
      (await loaderCandidates()).map(([file]) =>
        moduleBasename(file.replace(SOURCE_EXTENSION, "")),
      ),
    );
    expect(canonicalLoaderModules.filter((module) => !found.has(module))).toEqual([]);
  });

  // The walk is what makes the two tests above guards rather than vacuous
  // truths: if it silently stopped covering a tree, nothing else here would
  // notice. Pin that it reaches past activerecord into a sibling package and
  // into scripts/.
  it("scans every workspace package and the scripts tree", async () => {
    const { trees } = await scan;
    expect([...trees]).toEqual(
      expect.arrayContaining(["packages/activerecord", "packages/activesupport", "scripts"]),
    );
  });

  // Without this the allowlist is a silent hole of its own: if model-schema.ts
  // moves or stops exporting `loadSchema`, the stale entry would keep excusing
  // a path nobody is checking.
  it("allowlists only non-loader modules that still export a banned name", async () => {
    const exporters = await bannedExportsByModule;
    expect([...nonLoaderBannedExporters].filter((file) => !exporters.has(file))).toEqual([]);
  });
});
