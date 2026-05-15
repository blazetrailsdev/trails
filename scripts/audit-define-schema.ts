#!/usr/bin/env tsx
/**
 * Phase 5 audit — list activerecord test files that declare models
 * (via `class X extends Base`) but do not call `defineSchema`. The
 * absence is a strong indicator the file relies on the auto-derived
 * schema in `test-adapter.ts` and will not pass under
 * `AR_NO_AUTO_SCHEMA=1`.
 *
 * Usage: `pnpm tsx scripts/audit-define-schema.ts`
 *
 * Exits non-zero when offenders exist so CI can gate on completion.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const root = "packages/activerecord/src";
const files = execSync(`find ${root} -name '*.test.ts' -type f`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

/**
 * Strip line comments, block comments, and string literals so a commented-
 * out `defineSchema(...)` or a string mentioning it doesn't make the file
 * look compliant. Cheap regex pass — not a real parser, but adequate for
 * identifier-presence matching.
 */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const offenders: string[] = [];
for (const f of files) {
  const src = stripCommentsAndStrings(readFileSync(f, "utf8"));
  // Match both named declarations (`class Foo extends Base`) and anonymous
  // class expressions (`class extends Base` — typically assigned to a const
  // or returned from a factory, as in encryption/test-helpers.ts).
  if (!/class(?:\s+\w+)?\s+extends\s+Base\b/.test(src)) continue;
  if (/\bdefineSchema\s*\(/.test(src)) continue;
  offenders.push(f);
}

if (offenders.length === 0) {
  console.log("OK: every activerecord test file with `extends Base` calls defineSchema().");
  process.exit(0);
}

console.log(
  `Phase 5 offenders: ${offenders.length} test file(s) declare models without defineSchema().`,
);
for (const f of offenders) console.log(`  ${f}`);
process.exit(1);
