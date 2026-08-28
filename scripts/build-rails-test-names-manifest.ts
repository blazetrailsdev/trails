/**
 * Builds eslint/rails-test-names.json — the manifest consumed by the
 * `blazetrails/rails-test-name-parity` ESLint rule.
 *
 * Maps each repo-relative TS test path to the normalized descriptions of the
 * Rails tests that `pnpm parity:test` expects to find there, using the same
 * `rubyToConventionTs` mapping and the same `normalize` + ERB→TSE rename the
 * comparer applies, so a name the comparer credits is a name the rule accepts.
 *
 *   pnpm tsx scripts/build-rails-test-names-manifest.ts
 *
 * Reads scripts/test-compare/output/rails-tests.json, which only exists after
 * the Ruby extraction step (`scripts/test-compare/extract-ruby-tests.rb`).
 * Without it the manifest is written empty and the rule leaves itself
 * unregistered — the same contract as rails-file-structure-method-order.
 */
import { readFile } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { writeJsonManifest } from "@blazetrails/parity/write-json-manifest";
import { isTestFileUnported } from "@blazetrails/parity/unported-files";
import { rubyToConventionTs } from "./test-compare/compare.js";
import { normalizeTestName } from "../eslint/rails-test-name-parity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Packages whose Rails test names are published to the rule. Grows with the
// rule's enrollment globs in eslint.config.mjs.
const PACKAGE_DIRS: Record<string, string> = {
  arel: "packages/arel/src",
  date: "packages/date/src",
  "did-you-mean": "packages/did-you-mean/src",
  i18n: "packages/i18n/src",
};

const IN = path.join(ROOT, "scripts/test-compare/output/rails-tests.json");
const OUT = path.join(ROOT, "eslint/rails-test-names.json");

interface RubyTestCase {
  description: string;
}
interface RubyTestFile {
  file: string;
  testCases: RubyTestCase[];
}

async function main() {
  let raw: string;
  try {
    raw = await readFile(IN, "utf8");
  } catch {
    console.warn(
      "[build-rails-test-names-manifest] scripts/test-compare/output/rails-tests.json " +
        "not found; writing an empty manifest. Run scripts/test-compare/extract-ruby-tests.rb.",
    );
    writeJsonManifest(OUT, {});
    return;
  }

  const parsed = JSON.parse(raw) as {
    packages: Record<string, { files: RubyTestFile[] }>;
  };

  const manifest: Record<string, string[]> = {};
  for (const [pkg, dir] of Object.entries(PACKAGE_DIRS)) {
    for (const file of parsed.packages[pkg]?.files ?? []) {
      if (isTestFileUnported(file.file, pkg)) continue;
      const key = path.posix.join(dir, rubyToConventionTs(file.file, pkg));
      const names = (manifest[key] ??= []);
      for (const tc of file.testCases) names.push(normalizeTestName(tc.description));
    }
  }
  for (const key of Object.keys(manifest)) {
    manifest[key] = [...new Set(manifest[key])].sort();
  }

  writeJsonManifest(OUT, manifest);
  console.log(`Wrote ${OUT} — ${Object.keys(manifest).length} test files`);
}

void main();
