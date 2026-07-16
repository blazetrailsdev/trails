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
import { summarizeCoverage } from "./coverage.js";
import { tsToRubyFile } from "./naming.js";

const AR_LIB = "vendor/rails/activerecord/lib";
const AR_ROOT = path.join(AR_LIB, "active_record");

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
  const { code, coverage } = await generateFromSource(readFileSync(rb, "utf8"));
  const s = summarizeCoverage(coverage);
  process.stderr.write(
    `// source: ${rb}\n// handler coverage: ${s.handledPct.toFixed(1)}% ` +
      `(${s.handled}/${s.total} node instances)\n`,
  );
  process.stdout.write(code);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
