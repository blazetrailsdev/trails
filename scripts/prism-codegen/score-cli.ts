import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { TOPLEVEL } from "./codegen.js";
import { TARGET_FILES, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import { scoreFile, indexPortTree, type ScoreEntry } from "./score.js";

const TRAILS_AR_SRC = "packages/activerecord/src";

function portTreeFiles(): { path: string; source: string }[] {
  const out: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) {
        if (e === "test-helpers" || e === "support") continue;
        walk(full);
      } else if (e.endsWith(".ts") && !e.endsWith(".test.ts")) {
        out.push({ path: path.relative(TRAILS_AR_SRC, full), source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(TRAILS_AR_SRC);
  return out;
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const globalIndex = indexPortTree(portTreeFiles());
  let totMatched = 0;
  let totReordered = 0;
  let totDivergent = 0;
  let totMissing = 0;
  let totElsewhere = 0;
  const divergentRows: { file: string; entry: ScoreEntry }[] = [];

  console.log(`\nConformance: generated (clean defs only) vs hand-written port\n`);
  console.log(
    `  ${"file".padEnd(34)} matched reordered divergent missing  conformance ((matched+reordered) / present)`,
  );
  console.log("  " + "-".repeat(92));

  for (const f of TARGET_FILES) {
    const short = f.ruby.replace(/^active_record\//, "");
    const portPath = path.join(TRAILS_AR_SRC, rubyFileToTs(short));
    if (!existsSync(portPath)) {
      console.log(`  ${short.padEnd(34)} (no port file: ${portPath})`);
      continue;
    }
    const { code, perDef } = await generateFromSource(
      readFileSync(rubyAbsPath(f), "utf8"),
      asyncMethodsForRailsFile(f.ruby),
    );
    const cleanDefs = new Set(
      [...perDef].filter(([n, d]) => n !== TOPLEVEL && d.passthrough === 0).map(([n]) => n),
    );
    const score = scoreFile(code, readFileSync(portPath, "utf8"), cleanDefs, globalIndex);
    totMatched += score.matched;
    totReordered += score.reordered;
    totDivergent += score.divergent;
    totMissing += score.missing;
    for (const entry of score.entries) {
      if (entry.portFile) totElsewhere++;
      if (entry.status === "divergent") divergentRows.push({ file: short, entry });
    }
    console.log(
      `  ${short.padEnd(34)} ${String(score.matched).padStart(7)} ${String(score.reordered).padStart(9)} ` +
        `${String(score.divergent).padStart(9)} ${String(score.missing).padStart(7)}  ` +
        `${score.conformancePct.toFixed(1).padStart(6)}%`,
    );
  }

  console.log("  " + "-".repeat(92));
  const present = totMatched + totReordered + totDivergent;
  console.log(
    `  ${"TOTAL".padEnd(34)} ${String(totMatched).padStart(7)} ${String(totReordered).padStart(9)} ` +
      `${String(totDivergent).padStart(9)} ${String(totMissing).padStart(7)}  ` +
      `${(present ? ((totMatched + totReordered) / present) * 100 : 0).toFixed(1).padStart(6)}%`,
  );
  console.log(`\n  ${totElsewhere} defs resolved in a different port file than the Rails twin.`);
  console.log(
    `\n  present-in-both = matched + divergent. "missing" = clean generated def with no` +
      `\n  port symbol under any name candidate — either a genuinely unported method, a` +
      `\n  method ported into a different file, or a naming path the resolver doesn't` +
      `\n  chase yet. Divergent bodies are the convergence-guard review queue.`,
  );
  if (verbose && divergentRows.length) {
    console.log(`\n  Divergent defs (generated vs port skeleton):`);
    for (const { file, entry } of divergentRows) {
      console.log(`\n  ${file} :: ${entry.name}`);
      console.log(`    gen:  ${entry.generatedSkeleton}`);
      console.log(`    port: ${entry.portSkeleton}`);
    }
  } else if (divergentRows.length) {
    console.log(
      `\n  (${divergentRows.length} divergent defs — rerun with --verbose for skeletons)`,
    );
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
