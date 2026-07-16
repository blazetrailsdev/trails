/**
 * CLI: generate JS for all 10 target files into a gitignored out dir and print
 * per-file + rollup coverage. Run via `pnpm codegen:generate`.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { TARGET_FILES, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import type { Coverage } from "./types.js";

const OUT_DIR = "scripts/prism-codegen/out";

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const covs: Coverage[] = [];
  const rows: string[] = [];

  for (const f of TARGET_FILES) {
    const src = readFileSync(rubyAbsPath(f), "utf8");
    const { code, coverage } = await generateFromSource(src);
    const outName = rubyFileToTs(f.ruby.replace(/^active_record\//, "")).replace(/\.ts$/, ".js");
    const outPath = path.join(OUT_DIR, outName);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, code);
    covs.push(coverage);

    const s = summarizeCoverage(coverage);
    const top = s.topPassthrough
      .slice(0, 3)
      .map((p) => `${p.kind}:${p.count}`)
      .join(", ");
    rows.push(
      `  ${f.ruby.replace(/^active_record\//, "").padEnd(34)} ` +
        `${pct(s.handledPct)}  nodes=${String(s.total).padStart(5)}  ` +
        `[${f.tractability[0]}] top-todo: ${top}`,
    );
  }

  const rollup = mergeCoverages(covs);
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
  console.log(`\n  Output written to ${OUT_DIR}/ (gitignored).\n`);
}

function pct(n: number): string {
  return (n.toFixed(1) + "%").padStart(6);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
