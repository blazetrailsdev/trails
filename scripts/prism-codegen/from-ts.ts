/**
 * CLI: given a trails `.ts` file path, resolve it to its Rails `.rb` source via
 * the EXISTING `rubyFileToTs` mapping (inverted — we enumerate the Rails tree
 * and match), then print the tool's generated JS for that Rails file on stdout.
 *
 * No new mapping is built: we reuse `rubyFileToTs` from api-compare. Run via
 * `pnpm codegen:from-ts <path/to/trails/file.ts>`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { summarizeCoverage } from "./coverage.js";
import { TOPLEVEL } from "./codegen.js";
import { tsToRubyFile } from "./naming.js";
import { resolvePath } from "../../vendor/sources.js";

// Vendored-source location via the single source of truth (vendor/sources.ts),
// not a parallel hard-coded path — same contract api-compare uses.
const AR_ROOT = resolvePath("activerecord"); // .../active_record
const AR_LIB = path.dirname(AR_ROOT); // .../lib

/** Every Rails .rb under active_record/, as paths relative to the lib root. */
function railsCandidates(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      else if (e.endsWith(".rb")) out.push(path.relative(AR_LIB, full));
    }
  };
  walk(AR_ROOT);
  return out;
}

async function main() {
  const tsPath = process.argv[2];
  if (!tsPath) {
    console.error("usage: pnpm codegen:from-ts <path/to/trails/file.ts>");
    process.exit(2);
  }
  const rel = tsToRubyFile(tsPath, railsCandidates());
  if (!rel) {
    console.error(`Could not resolve a Rails .rb for ${tsPath} via rubyFileToTs.`);
    process.exit(1);
  }
  const rb = path.join(AR_LIB, rel);
  const { code, coverage, perDef, parseErrorCount } = await generateFromSource(
    readFileSync(rb, "utf8"),
    asyncMethodsForRailsFile(rel),
  );
  const s = summarizeCoverage(coverage);
  const defs = [...perDef].filter(([name]) => name !== TOPLEVEL);
  const clean = defs.filter(([, d]) => d.passthrough === 0).length;
  process.stderr.write(
    `// source: ${rb}\n// handler coverage: ${s.handledPct.toFixed(1)}% ` +
      `(${s.handled}/${s.total} node instances); defs fully handled: ` +
      `${clean}/${defs.length}; output parse errors: ${parseErrorCount}\n`,
  );
  process.stdout.write(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
