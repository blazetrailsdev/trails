import * as fs from "fs/promises";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile } from "./async-source.js";
import { TOPLEVEL } from "./codegen.js";
import { TARGET_FILES, rubyAbsPath } from "./files.js";
import { rubyFileToTs } from "./naming.js";
import { scoreFile, indexPortTree, type ScoreEntry } from "./score.js";
import {
  buildCatalog,
  catalogueDivergent,
  catalogueMissing,
  type ExcludeEntry,
} from "./catalog.js";
import {
  diffBaseline,
  guardFailureMessage,
  parseBaseline,
  serializeBaseline,
  type ResidueRow,
} from "./guard.js";

const TRAILS_AR_SRC = "packages/activerecord/src";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_COMPARE = path.join(HERE, "..", "api-compare");
const BASELINE_PATH = path.join(HERE, "convergence-baseline.json");

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

async function listJsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listJsonFiles(full)));
    else if (d.name.endsWith(".json")) out.push(full);
  }
  return out;
}

// The deviation catalog's call half: the flat exclude list plus every file of
// the split wide exclude tree. Both share the entry shape, so the scorer sees
// one merged list.
async function loadExcludes(): Promise<ExcludeEntry[]> {
  const files = [
    path.join(API_COMPARE, "call-mismatches-exclude.json"),
    ...(await listJsonFiles(path.join(API_COMPARE, "call-mismatches-wide-exclude"))),
  ];
  const out: ExcludeEntry[] = [];
  for (const file of files) {
    let source;
    try {
      source = await fs.readFile(file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw e;
    }
    out.push(...(JSON.parse(source) as ExcludeEntry[]));
  }
  return out;
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const guard = process.argv.includes("--guard");
  const write = process.argv.includes("--write");
  const globalIndex = indexPortTree(portTreeFiles());
  const catalog = buildCatalog(await loadExcludes());
  let totMatched = 0;
  let totReordered = 0;
  let totDivergent = 0;
  let totMissing = 0;
  let totElsewhere = 0;
  let totCatalogued = 0;
  const divergentRows: { file: string; entry: ScoreEntry }[] = [];
  const residue: ResidueRow[] = [];

  console.log(`\nConformance: generated (clean defs only) vs hand-written port\n`);
  console.log(
    `  ${"file".padEnd(34)} matched reordered divergent missing  conformance ((matched+reordered) / present)`,
  );
  console.log("  " + "-".repeat(92));

  for (const f of TARGET_FILES) {
    const short = f.ruby.replace(/^active_record\//, "");
    const tsFile = rubyFileToTs(short);
    const portPath = path.join(TRAILS_AR_SRC, tsFile);
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
      if (entry.status !== "divergent" && entry.status !== "missing") continue;
      const reason =
        entry.status === "missing"
          ? catalogueMissing(catalog, entry.name, f.ruby)
          : catalogueDivergent(
              catalog,
              tsFile,
              entry.name,
              entry.generatedSkeleton ?? "",
              entry.portSkeleton ?? "",
            );
      if (reason) totCatalogued++;
      else residue.push({ rubyFile: f.ruby, name: entry.name, status: entry.status });
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
  console.log(
    `\n  Deviation catalog: ${totCatalogued} of ${totDivergent + totMissing} divergent+missing ` +
      `rows are catalogued\n  (api-compare SKIP / SCOPED_SKIP, call-mismatches excludes); ` +
      `${residue.length} rows are residue.`,
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

  if (!guard) return;
  if (write) {
    await fs.writeFile(BASELINE_PATH, serializeBaseline(residue), "utf8");
    console.log(`  wrote ${residue.length} residue rows to ${path.relative(".", BASELINE_PATH)}\n`);
    return;
  }
  const baseline = parseBaseline(await fs.readFile(BASELINE_PATH, "utf8"));
  const diff = diffBaseline(residue, baseline);
  const failure = guardFailureMessage(diff);
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(
    `  convergence guard: OK — ${residue.length} residue rows, ` +
      `${diff.removed.length} baseline row(s) converged.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
