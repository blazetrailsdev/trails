/**
 * CLI: generate JS for all 10 target files into a gitignored out dir and print
 * per-file + rollup coverage. Run via `pnpm codegen:generate`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { TARGET_FILES, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import type { Coverage } from "./types.js";

const OUT_DIR = "scripts/prism-codegen/out";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const covs: Coverage[] = [];
  const deepCovs: Coverage[] = [];
  const rows: string[] = [];

  for (const f of TARGET_FILES) {
    const src = readFileSync(rubyAbsPath(f), "utf8");
    const { code, coverage } = await generateFromSource(src, asyncMethodsForRailsFile(f.ruby));
    const outName = rubyFileToTs(f.ruby.replace(/^active_record\//, "")).replace(/\.ts$/, ".js");
    const outPath = path.join(OUT_DIR, outName);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, code);
    covs.push(coverage);
    if (f.deepDrill) deepCovs.push(coverage);

    const s = summarizeCoverage(coverage);
    const top = s.topPassthrough
      .slice(0, 3)
      .map((p) => `${p.kind}:${p.count}`)
      .join(", ");
    // Tag: [t]/[p] tractability, with `*` marking a deepest-drill target.
    const tag = `${f.tractability[0]}${f.deepDrill ? "*" : " "}`;
    rows.push(
      `  ${f.ruby.replace(/^active_record\//, "").padEnd(34)} ` +
        `${pct(s.handledPct)}  nodes=${String(s.total).padStart(5)}  ` +
        `[${tag}] top-todo: ${top}`,
    );
  }

  const rollup = mergeCoverages(covs);
  const deep = mergeCoverages(deepCovs);
  console.log(`\nPrism → JS codegen coverage (handled = node instances with a real handler)\n`);
  console.log(`  ${"file".padEnd(34)} handled  nodes         passthrough leaders`);
  console.log("  " + "-".repeat(90));
  console.log(rows.join("\n"));
  console.log("  " + "-".repeat(90));
  console.log(
    `  ${"ROLLUP (all 10)".padEnd(34)} ${pct(rollup.handledPct)}  ` +
      `nodes=${String(rollup.total).padStart(5)}  handled=${rollup.handled} passthrough=${rollup.passthrough}`,
  );
  console.log(`\n  Dominant passthrough node kinds (rollup):`);
  for (const p of rollup.topPassthrough.slice(0, 12)) {
    console.log(`    ${p.kind.padEnd(30)} ${p.count}`);
  }

  // Verdict line — cites the numbers, not vibes (the [t*] deep-drill targets are
  // the honest ceiling of what deterministic codegen reaches on tractable input).
  console.log(
    `\n  VERDICT: ${rollup.handledPct.toFixed(1)}% of ${rollup.total} AST node ` +
      `instances handled (${rollup.passthrough} passthrough). ` +
      `Deep-drill tractable targets: ${deep.handledPct.toFixed(1)}% of ${deep.total}. ` +
      `\n  Node-handler coverage != semantic correctness — see ` +
      `docs/infrastructure/prism-codegen-spike.md (Honest limits).`,
  );
  console.log(`\n  Output written to ${OUT_DIR}/ (gitignored).\n`);
}

function pct(n: number): string {
  return (n.toFixed(1) + "%").padStart(6);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
