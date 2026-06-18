// Regenerates the no-explicit-any burndown allowlists by running ESLint over
// the activerecord package with the rule forced to "error" and collecting the
// files that still violate it. Split into src (non-test) and test lists so the
// two areas ratchet independently (see RFC 0037).
//
// Usage: node scripts/generate-no-explicit-any-allowlist.mjs
//
// The lists are GRANDFATHERED exclusions: clean files are enforced at "error".
// A burndown PR removes entries after fixing them, then re-runs this script to
// confirm the list shrank. NEVER hand-add an entry to silence a new violation —
// fix the `any` instead.
import { ESLint } from "eslint";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RULE = "@typescript-eslint/no-explicit-any";

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfig: { rules: { [RULE]: "error" } },
});

const results = await eslint.lintFiles(["packages/activerecord/src/**/*.ts"]);

const src = [];
const test = [];
for (const r of results) {
  if (!r.messages.some((m) => m.ruleId === RULE)) continue;
  const rel = path.relative(repoRoot, r.filePath);
  (rel.endsWith(".test.ts") ? test : src).push(rel);
}
src.sort();
test.sort();

const write = (name, files) =>
  writeFileSync(path.join(repoRoot, "eslint", name), JSON.stringify(files, null, 2) + "\n");
write("no-explicit-any-src-exclude.json", src);
write("no-explicit-any-test-exclude.json", test);

console.log(`no-explicit-any allowlist: ${src.length} src + ${test.length} test files`);
