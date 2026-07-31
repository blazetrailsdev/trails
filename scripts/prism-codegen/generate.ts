import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as path from "node:path";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { summarizeCoverage, mergeCoverages } from "./coverage.js";
import { TOPLEVEL } from "./codegen.js";
import { TARGET_FILES, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import type { Coverage } from "./types.js";
const OUT_DIR = "scripts/prism-codegen/out";
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const covs: Coverage[] = [];
  const deepCovs: Coverage[] = [];
  const rows: string[] = [];
  let totalParseErrors = 0;
  let defsTotal = 0;
  let defsClean = 0;
  for (const f of TARGET_FILES) {
    const src = readFileSync(rubyAbsPath(f), "utf8");
    const { code, coverage, perDef, parseErrorCount } = await generateFromSource(
      src,
      asyncMethodsForRailsFile(f.ruby),
    );
    const outName = rubyFileToTs(f.ruby.replace(/^active_record\//, "")).replace(/\.ts$/, ".js");
    const outPath = path.join(OUT_DIR, outName);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, code);
    covs.push(coverage);
    if (f.deepDrill) deepCovs.push(coverage);
    totalParseErrors += parseErrorCount;
    const defs = [...perDef].filter(([name]) => name !== TOPLEVEL);
    const clean = defs.filter(([, d]) => d.passthrough === 0);
    defsTotal += defs.length;
    defsClean += clean.length;
    const s = summarizeCoverage(coverage);
    const top = s.topPassthrough
      .slice(0, 3)
      .map((p) => `${p.kind}:${p.count}`)
      .join(", ");
    const tag = `${f.tractability[0]}${f.deepDrill ? "*" : " "}`;
    rows.push(
      `  ${f.ruby.replace(/^active_record\//, "").padEnd(34)} ` +
        `${pct(s.handledPct)}  nodes=${String(s.total).padStart(5)}  ` +
        `defs=${String(clean.length).padStart(3)}/${String(defs.length).padEnd(3)} ` +
        `[${tag}] top-todo: ${top}`,
    );
  }
  const rollup = mergeCoverages(covs);
  const deep = mergeCoverages(deepCovs);
  console.log(`\nPrism → JS codegen coverage (handled = node instances with a real handler)\n`);
  console.log(`  ${"file".padEnd(34)} handled  nodes        defs=clean/all  passthrough leaders`);
  console.log("  " + "-".repeat(96));
  console.log(rows.join("\n"));
  console.log("  " + "-".repeat(96));
  console.log(
    `  ${"ROLLUP (all 10)".padEnd(34)} ${pct(rollup.handledPct)}  ` +
      `nodes=${String(rollup.total).padStart(5)}  handled=${rollup.handled} passthrough=${rollup.passthrough}`,
  );
  console.log(`\n  Dominant passthrough node kinds (rollup):`);
  for (const p of rollup.topPassthrough.slice(0, 12)) {
    console.log(`    ${p.kind.padEnd(30)} ${p.count}`);
  }
  console.log(
    `\n  VERDICT: ${rollup.handledPct.toFixed(1)}% of ${rollup.total} AST node ` +
      `instances handled (${rollup.passthrough} passthrough); ` +
      `${defsClean}/${defsTotal} defs fully handled ` +
      `(${((defsClean / defsTotal) * 100).toFixed(1)}%). ` +
      `Deep-drill tractable targets: ${deep.handledPct.toFixed(1)}% of ${deep.total}. ` +
      `\n  Output parse errors: ${totalParseErrors} (0 by construction). ` +
      `Node-handler coverage != semantic correctness — see ` +
      `docs/infrastructure/prism-codegen-spike.md (Honest limits).`,
  );
  console.log(`\n  Output written to ${OUT_DIR}/ (gitignored).\n`);
  if (totalParseErrors > 0) {
    console.error(`FAIL: generated output has ${totalParseErrors} parse errors.`);
    process.exit(1);
  }
}
function pct(n: number): string {
  return (n.toFixed(1) + "%").padStart(6);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
