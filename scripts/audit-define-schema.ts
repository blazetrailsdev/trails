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
// Scan every .ts file under src/. In trails, nothing in production code
// extends `Base` directly (Base IS the library class), so any file that
// matches the `extends Base` pattern is by definition test or test-helper
// infrastructure that participates in the schema lifecycle. The shared
// helpers (encryption/test-helpers.ts, test-fixtures.ts, adapters/.../
// schema-ar-models.ts, etc.) get flagged the same way as *.test.ts files.
//
// A helper flagged here doesn't necessarily fail under AR_NO_AUTO_SCHEMA=1
// on its own — it fails when a consuming test runs without setting up
// schema for the helper's models. The audit is intentionally conservative:
// it surfaces every place a model class is declared without a sibling
// defineSchema, leaving wiring decisions to the migrator. The actual
// Phase 5 completion gate is `AR_NO_AUTO_SCHEMA=1 pnpm vitest run` going
// green; this script is a best-effort triage aid, not a soundness proof.
const allTs = execSync(`find ${root} -name '*.ts' -type f`, { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

const files = allTs.filter((f) => {
  // The schema helper and the drop helper legitimately reference these
  // identifiers in their own implementations — skip them.
  if (f.endsWith("/test-helpers/define-schema.ts")) return false;
  if (f.endsWith("/test-helpers/drop-all-tables.ts")) return false;
  // Static fixture files used as compiler inputs by the type-virtualization
  // / tsc-wrapper test rigs aren't consumed as live models by Vitest —
  // they exist to be parsed/emitted, not executed against an adapter.
  if (/\/__fixtures__\//.test(f)) return false;
  if (/\/type-virtualization\/fixtures\//.test(f)) return false;
  // model-codegen.ts emits class strings; its matches are inside templates
  // that the comment/string stripper handles, but excluding it explicitly
  // is cheaper and clearer.
  if (f.endsWith("/model-codegen.ts")) return false;
  return true;
});

/**
 * Strip line comments, block comments, and string literals so a commented-
 * out `defineSchema(...)` or a string mentioning it doesn't make the file
 * look compliant. Cheap regex pass — not a real parser, but adequate for
 * identifier-presence matching.
 */
function stripCommentsAndStrings(src: string): string {
  // Comments first — otherwise an apostrophe inside a `// ...` comment
  // (e.g. "don't") would open a fake string literal that swallows the
  // following lines, including any `defineSchema(` call.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

// Method-call patterns that imply the test actually executes against a live
// adapter (INSERT/SELECT/UPDATE/DELETE round-trips). Tests that only build
// queries and inspect `.toSql()`, or that exercise in-memory model behavior
// (`queryAttribute`, `writeAttribute`, dirty tracking on unsaved instances),
// pass under `AR_NO_AUTO_SCHEMA=1` even with no `defineSchema` call — the
// schema simply never gets loaded because nothing asks the adapter for it.
// Treat those as not-offending. The list mirrors AR's persistence/finder/
// calculation surface. `loadSchemaFromAdapter` is *not* in the list — tests
// that exercise schema loading typically do so against a stubbed adapter
// (e.g. `attribute-methods/time-zone-conversion.test.ts` injects its own
// `columnsHash`), so the real schema lifecycle never runs.
const EXECUTION_MARKERS =
  /\.(save|saveBang|create|createBang|createOrFindBy|update|updateBang|updateAll|updateAttribute|updateAttributes|updateColumn|updateColumns|upsert|upsertAll|insert|insertAll|destroy|destroyBang|destroyAll|destroyBy|delete|deleteAll|deleteBy|reload|touch|touchAll|increment|decrement|incrementCounter|decrementCounter|resetCounters|findBy|findByBang|findOrCreateBy|findOrInitializeBy|findEach|findInBatches|inBatches|pluck|pick|exists|sum|average|minimum|maximum|calculate|loadAsync|toArray)\b/;

const offenders: string[] = [];
for (const f of files) {
  const src = stripCommentsAndStrings(readFileSync(f, "utf8"));
  // Match named declarations (`class Foo extends Base`), anonymous class
  // expressions (`class extends Base` — typically returned from a factory),
  // and qualified / cast forms (`class Foo extends (FreshBase as typeof
  // Base)`, `class Contact extends (targets.Base as any)`). The character
  // class `[^{(]` after the optional `(` keeps us from greedily reaching
  // into a class body if no Base reference exists.
  if (!/class(?:\s+\w+)?\s+extends\s+\(?[^{(]*?\bBase\b/.test(src)) continue;
  if (/\bdefineSchema\s*\(/.test(src)) continue;
  // Files that declare models but never hit the adapter for execution or
  // schema reflection are inherently safe under `AR_NO_AUTO_SCHEMA=1`.
  if (!EXECUTION_MARKERS.test(src)) continue;
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
