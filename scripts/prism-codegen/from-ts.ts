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
import { rubyFileToTs } from "./naming.js";

const AR_LIB = "vendor/rails/activerecord/lib";
const AR_ROOT = path.join(AR_LIB, "active_record");

function allRubyFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...allRubyFiles(full));
    else if (e.endsWith(".rb")) out.push(full);
  }
  return out;
}

/** Find the Rails .rb whose rubyFileToTs output matches the tail of `tsPath`. */
function resolveRuby(tsPath: string): string | undefined {
  const tsTail = tsPath.replace(/\\/g, "/").replace(/^.*?\/src\//, "");
  const norm = tsTail.startsWith("active_record/") ? tsTail : tsTail.replace(/^activerecord\//, "");
  for (const rb of allRubyFiles(AR_ROOT)) {
    const rel = path.relative(AR_LIB, rb); // active_record/....rb
    const mappedFull = rubyFileToTs(rel); // active-record/....ts
    const mappedShort = rubyFileToTs(rel.replace(/^active_record\//, ""));
    if (mappedFull.endsWith(norm) || mappedShort.endsWith(norm) || mappedShort === tsTail) {
      return rb;
    }
  }
  return undefined;
}

async function main() {
  const tsPath = process.argv[2];
  if (!tsPath) {
    console.error("usage: pnpm codegen:from-ts <path/to/trails/file.ts>");
    process.exit(2);
  }
  const rb = resolveRuby(tsPath);
  if (!rb) {
    console.error(`Could not resolve a Rails .rb for ${tsPath} via rubyFileToTs.`);
    process.exit(1);
  }
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
