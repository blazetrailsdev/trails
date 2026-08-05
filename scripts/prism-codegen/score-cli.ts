import * as fs from "fs/promises";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// The wide exclude tree is api-compare's baseline, so its walker stays there
// rather than moving to a shared scripts/ module (as naming.ts/catalog.ts do).
import { listJsonFiles } from "../api-compare/baseline-json.js";
import { portMethodNames } from "./port-symbols.js";
import { generateFromSource } from "./index.js";
import { asyncMethodsForRailsFile, buildAsyncManifest } from "./async-source.js";
import { TOPLEVEL } from "./codegen.js";
import { unresolvedMixinReport } from "./rails-scope.js";
import {
  TARGET_FILES,
  TRAILS_AR_SRC,
  portTreeFiles,
  railsLibRoot,
  rubyAbsPath,
  rubyAbsPathFor,
} from "./files.js";
import {
  checkCompositionPoint,
  compositionFailureMessage,
  indexSuperPositions,
  parseCompositionMarkers,
  rubyPathCandidatesForModule,
  unresolvedAncestryMessage,
} from "./composition.js";
import { buildLinearization, parseIncludeOrder } from "./linearization.js";
import {
  inheritedDelegationsFor,
  outNameFor,
  runtimeImportPathFor,
  targetLinearization,
} from "./golden.js";
import { rubyFileToTs } from "./naming.js";
import { buildPortOwnership, scoreFile, indexPortTree, type ScoreEntry } from "./score.js";
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
import {
  overlapFailureMessage,
  overlappingSignOffs,
  parseSignOffs,
  partitionSignedOff,
  staleSignOffMessage,
  staleSignOffs,
} from "./signoff.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_COMPARE = path.join(HERE, "..", "api-compare");
const BASELINE_PATH = path.join(HERE, "convergence-baseline.json");
const SIGNOFF_PATH = path.join(HERE, "convergence-signoff.json");

/** Every Rails AR source, keyed `active_record/<rel>` — the ownership index's input. */
async function railsLibFiles(): Promise<{ path: string; source: string }[]> {
  const root = railsLibRoot();
  const out: { path: string; source: string }[] = [];
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith(".rb")) {
        out.push({
          path: path.join("active_record", path.relative(root, full)),
          source: await fs.readFile(full, "utf8"),
        });
      }
    }
  };
  await walk(root);
  return out;
}

// The deviation catalog's call half: every file of the split wide exclude tree.
async function loadExcludes(): Promise<ExcludeEntry[]> {
  const files = await listJsonFiles(path.join(API_COMPARE, "call-mismatches-wide-exclude"));
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

async function readSignOffSource(): Promise<string> {
  try {
    return await fs.readFile(SIGNOFF_PATH, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    throw new Error(
      `Missing ${path.relative(".", SIGNOFF_PATH)} — the per-row sign-off manifest is ` +
        "checked in and drives the guard; restore it rather than letting the scorer " +
        "treat every signed-off row as unreviewed residue.",
      { cause: e },
    );
  }
}

/** The first of `candidates` that exists under the vendored ActiveRecord tree. */
async function firstReadable(candidates: readonly string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    try {
      return await fs.readFile(rubyAbsPathFor(candidate), "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  return undefined;
}

/**
 * Every `prism-mro:` marker in the port tree, checked against the ancestry of
 * `ActiveRecord::Base`. Built from the ancestry's own sources rather than the
 * codegen target set: a chain's definers (e.g. `Scoping`) are often not
 * targets, and a missing body would silently drop a contribution.
 */
async function compositionCheck(): Promise<{ points: number; failure?: string }> {
  const baseSource = await fs.readFile(rubyAbsPathFor("active_record/base.rb"), "utf8");
  const sources = [baseSource];
  const unresolved: string[] = [];
  for (const module of parseIncludeOrder(baseSource)) {
    const source = await firstReadable(rubyPathCandidatesForModule(module));
    if (source === undefined) unresolved.push(module);
    else sources.push(source);
  }
  const unresolvedFailure = unresolvedAncestryMessage(unresolved);
  if (unresolvedFailure) return { points: 0, failure: unresolvedFailure };
  const linearization = await buildLinearization(baseSource, sources);
  const positions = await indexSuperPositions(sources);
  const failures: string[] = [];
  let points = 0;
  for (const { path: file, source } of portTreeFiles()) {
    for (const marker of parseCompositionMarkers(file, source)) {
      points++;
      const failure = checkCompositionPoint(marker, source, linearization, positions);
      if (failure) failures.push(failure);
    }
  }
  return { points, failure: compositionFailureMessage(failures) };
}

/**
 * Mixin constants no file in the corpus defines. Each one is a module missing
 * from the await scope of the file that includes it, so the count is printed
 * even without `--verbose` — a silent miss is what this reporting exists to
 * prevent. Most are legitimately outside the corpus (`Enumerable`,
 * `ActiveModel::*`), which is why it is a report and not a failure.
 */
function reportUnresolvedMixins(verbose: boolean): void {
  const unresolved = unresolvedMixinReport();
  if (!unresolved.length) return;
  console.log(`\n  ${unresolved.length} mixin constants resolved to no file in the corpus.`);
  if (!verbose) return;
  for (const { fromRel, moduleName } of unresolved) console.log(`    ${fromRel} :: ${moduleName}`);
}

async function main() {
  const verbose = process.argv.includes("--verbose");
  const write = process.argv.includes("--write");
  const guard = process.argv.includes("--guard") || write;
  const portFiles = portTreeFiles();
  const globalIndex = indexPortTree(portFiles);
  const ownership = buildPortOwnership(await railsLibFiles());
  const asyncManifest = buildAsyncManifest(portFiles);
  const catalog = buildCatalog(await loadExcludes(), "activerecord");
  let totMatched = 0;
  let totReordered = 0;
  let totDivergent = 0;
  let totMissing = 0;
  let totElsewhere = 0;
  const signOffs = parseSignOffs(await readSignOffSource());
  const catalogued: { row: ResidueRow; reason: string }[] = [];
  const divergentRows: { file: string; entry: ScoreEntry }[] = [];
  const uncatalogued: ResidueRow[] = [];

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
      await asyncMethodsForRailsFile(f.ruby, asyncManifest),
      runtimeImportPathFor(outNameFor(f)),
      await inheritedDelegationsFor(f),
      await targetLinearization(),
      portMethodNames(),
    );
    const cleanDefs = new Set(
      [...perDef].filter(([n, d]) => n !== TOPLEVEL && d.passthrough === 0).map(([n]) => n),
    );
    const score = scoreFile(
      code,
      readFileSync(portPath, "utf8"),
      cleanDefs,
      globalIndex,
      ownership,
    );
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
      const row: ResidueRow = { rubyFile: f.ruby, name: entry.name, status: entry.status };
      if (reason) catalogued.push({ row, reason });
      else uncatalogued.push(row);
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
  reportUnresolvedMixins(verbose);
  console.log(
    `\n  present-in-both = matched + divergent. "missing" = clean generated def with no` +
      `\n  port symbol under any name candidate — either a genuinely unported method, a` +
      `\n  method ported into a different file, or a naming path the resolver doesn't` +
      `\n  chase yet. Divergent bodies are the convergence-guard review queue.`,
  );
  const { signedOff, residue } = partitionSignedOff(uncatalogued, signOffs);
  console.log(
    `\n  Deviation catalog: ${catalogued.length} of ${totDivergent + totMissing} divergent+missing ` +
      `rows are catalogued\n  (api-compare SKIP / SCOPED_SKIP, call-mismatches excludes); ` +
      `${signedOff.length} rows are signed off per-row\n  (convergence-signoff.json); ` +
      `${residue.length} rows are unreviewed residue.`,
  );

  if (verbose && catalogued.length) {
    console.log(`\n  Catalogued rows (subtracted from the guarded residue):`);
    for (const { row, reason } of catalogued) {
      console.log(`\n  ${row.rubyFile} :: ${row.name} (${row.status})`);
      console.log(`    ${reason}`);
    }
  }
  if (verbose && signedOff.length) {
    console.log(`\n  Signed-off rows (reviewed per-row, subtracted from the guarded residue):`);
    for (const { row, reason } of signedOff) {
      console.log(`\n  ${row.rubyFile} :: ${row.name} (${row.status})`);
      console.log(`    ${reason}`);
    }
  }
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

  const composition = await compositionCheck();
  if (composition.failure) {
    console.error(composition.failure);
    process.exitCode = 1;
    return;
  }
  console.log(`  composition points: ${composition.points} checked against Base's MRO — OK\n`);

  const stale = staleSignOffs([...catalogued.map((c) => c.row), ...uncatalogued], signOffs);
  const staleFailure = staleSignOffMessage(stale);
  if (staleFailure) {
    console.error(staleFailure);
    process.exitCode = 1;
    return;
  }

  if (!guard) return;
  if (write) {
    await fs.writeFile(BASELINE_PATH, serializeBaseline(residue), "utf8");
    console.log(`  wrote ${residue.length} residue rows to ${path.relative(".", BASELINE_PATH)}\n`);
    return;
  }
  const baseline = parseBaseline(await fs.readFile(BASELINE_PATH, "utf8"));
  const overlapFailure = overlapFailureMessage(overlappingSignOffs(baseline, signOffs));
  if (overlapFailure) {
    console.error(overlapFailure);
    process.exitCode = 1;
    return;
  }
  const diff = diffBaseline(residue, baseline);
  const failure = guardFailureMessage(diff);
  if (failure) {
    console.error(failure);
    process.exitCode = 1;
    return;
  }
  console.log(
    `  convergence guard: OK — ${residue.length} residue rows, ` +
      `${diff.removed.length} baseline row(s) converged, ` +
      `${signedOff.length} signed off.\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
