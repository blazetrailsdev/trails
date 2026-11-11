#!/usr/bin/env -S npx tsx
/**
 * `pnpm parity:bump:dry-run --source <name> --ref <tag>` (RFC 0191 § 2, § 7):
 * every gating step of ci.yml's `rails-comparison` job, run against a
 * candidate ref fetched beside the active version, without moving it.
 *
 * 1. Fetch the candidate (`vendor:fetch --ref`'s `fetchCandidate`).
 * 2. Active pass: `parity:api`, Ruby tests, then every step, against the
 *    active manifests; the outputs are kept as `active/`.
 * 3. Extract the candidate's Ruby API (`parity:api:drift`'s extraction) and
 *    tests, merge the source's packages over the active manifests, and run
 *    every step again; the outputs are kept as `candidate/`. Each gating lint
 *    runs with `--no-regen`, so nothing rewrites the merged manifest. First
 *    `parity:api:inlined:fix` re-cites every `@inlinedFrom` tag at the
 *    candidate's spans, as the flip PR will, and the build and TS API are
 *    refreshed, so `compare.ts` reads the candidate bodies.
 * 4. Restore the active outputs and every tracked file from HEAD, rebuild, and
 *    refuse a run that left any tracked file changed. The run needs a clean
 *    tracked tree to start.
 * 5. Write the ledger seed, the attribution of every new gate row and RFC
 *    § 2's tables to scripts/parity/output/bump-dry-run/<source>@<ref>/.
 *
 * `vendor/` and `scripts/api-compare` resolve as CommonJS while
 * `scripts/parity` is ESM, so their modules are loaded by dynamic import, as
 * `scripts/parity/pipeline/schema/ruby/build-gemfile.ts` does.
 *
 * Hard rules: no node:* imports; process.* only in the entry guard.
 */

import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";

import {
  attribute,
  gateRows,
  mergeManifest,
  newRows,
  pairKey,
  pairSeed,
  table,
  testDelta,
  testSeed,
  type GateRow,
  type HashRecord,
  type Pin,
  type RubyTestManifest,
} from "./ledger.js";

const { fetchCandidate } = await import("../../../vendor/fetch.js");
const { SOURCES, testPathsManifest, vendoredRoot } = await import("../../../vendor/sources.js");
const { extractTargetApi } = await import("../../api-compare/drift.js");
const { compareArms } = await import("../../api-compare/report-arms.js");
const { buildReport, loadConcernHooks } = await import("../../api-compare/extra-surface.js");

type Env = Record<string, string | undefined>;
const run = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const API_OUT = path.join(ROOT, "scripts/api-compare/output");
const TEST_OUT = path.join(ROOT, "scripts/test-compare/output");
const TSX = ["exec", "tsx"];

/** The gating steps of ci.yml's `rails-comparison` job, in its order. */
const STEPS: { name: string; args: string[] }[] = [
  ["API comparison", "scripts/api-compare/compare.ts"],
  ["API comparison (privates)", "scripts/api-compare/compare.ts --privates"],
  ["Extra-surface tag gates", "scripts/api-compare/extra-surface.ts"],
  ["Body-pins gate", "scripts/api-compare/lint-body-pins.ts"],
  ["API comparison (calls)", "scripts/api-compare/compare.ts --calls"],
  ["Call-mismatches ratchet", "scripts/api-compare/lint-call-mismatches.ts --no-regen"],
  ["Call-argument ratchet", "scripts/api-compare/lint-call-args.ts --no-regen"],
  ...["activerecord", "activemodel"].map((pkg) => [
    `Receipt audit (${pkg})`,
    `scripts/api-compare/receipt-audit.ts --package ${pkg} --gate`,
  ]),
  ["Ruby-compat call ratchet", "scripts/api-compare/lint-ruby-compat-calls.ts --no-regen"],
  ["Arm-parity report", "scripts/api-compare/report-arms.ts --report"],
  ["Missing-throw arm ratchet", "scripts/api-compare/lint-arm-throws.ts"],
  ["Extra-surface ratchet", "scripts/api-compare/lint-extra-surface-ratchet.ts"],
  ["Parameter-name ratchet", "scripts/api-compare/lint-param-names.ts"],
  ["Block-parameter ratchet", "scripts/api-compare/lint-block-params.ts"],
  ["Predicate-kind ratchet", "scripts/api-compare/lint-predicate-kinds.ts"],
  ["Inlined-from staleness gate", "scripts/api-compare/lint-inlined-from.ts"],
  ["Class-path table gate", "scripts/api-compare/class-paths.ts --check"],
  ["Ambiguous-parent ratchet", "scripts/api-compare/lint-ambiguous-parents.ts"],
  ["Dependency lint", "scripts/api-compare/lint-deps.ts"],
  ["Test comparison (TS extract)", "scripts/test-compare/extract-ts-tests.ts"],
  ["Test comparison", "scripts/test-compare/compare.ts --gates --check"],
  ["Assertion-mismatch ratchet", "scripts/test-compare/lint-assertion-mismatches.ts --no-regen"],
  ["AR-closure test manifest guard", "scripts/test-compare/closure-cli.ts --check"],
].map(([name, cmd]) => ({ name, args: [...TSX, ...cmd.split(" ")] }));

/** Read only to size the test seed; not a gate. */
const MISSING_REPORT = [...TSX, "scripts/test-compare/compare.ts", "--missing", "--json"];

interface ConventionComparison {
  results?: {
    package: string;
    files?: { rubyFile: string; tsFileExists: boolean; missingTests?: string[] }[];
  }[];
}

interface ApiComparison {
  results: { package: string; matched: number; totalMethods: number }[];
}

const cols = (header: string) => header.split("|");

interface StepResult {
  name: string;
  status: "green" | "red";
  summary: string;
}

async function sh(cmd: string, args: string[], env: Env, cwd = ROOT) {
  try {
    const { stdout, stderr } = await run(cmd, args, { cwd, env, maxBuffer: 512 * 1024 * 1024 });
    return { code: 0, out: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof err.code === "number" ? err.code : 1,
      out: (err.stdout ?? "") + (err.stderr ?? ""),
    };
  }
}

function summarize(out: string): string {
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/DeprecationWarning|trace-deprecation|^at /.test(l));
  const counted = lines.filter(
    (l) => /\d/.test(l) && /OK|DRIFT|STALE|new|grow|exceed|mismatch|row|fail|error/i.test(l),
  );
  return (counted.length > 0 ? counted.slice(0, 4) : lines.slice(-2)).join(" / ").slice(0, 400);
}

async function runSteps(env: Env, label: string): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const step of STEPS) {
    const { code, out } = await sh("pnpm", step.args, env);
    const result: StepResult = {
      name: step.name,
      status: code === 0 ? "green" : "red",
      summary: summarize(out),
    };
    console.log(`[bump:${label}] ${result.status.padEnd(5)} ${step.name}: ${result.summary}`);
    results.push(result);
  }
  await sh("pnpm", MISSING_REPORT, env);
  return results;
}

/** Every extra-surface name `lint-extra-surface-ratchet.ts` measures, as a gate row. */
async function extraRows(dir: string): Promise<GateRow[]> {
  const ruby = await readJson<Parameters<typeof buildReport>[0]>(path.join(dir, "rails-api.json"));
  const ts = await readJson<Parameters<typeof buildReport>[1]>(path.join(dir, "ts-api.json"));
  const report = buildReport(ruby, ts, {
    filterPkg: null,
    excludeGlobs: [],
    novelOnly: false,
    topN: Infinity,
    concernHooks: await loadConcernHooks(ruby, null),
  });
  return report.topN.flatMap((f) =>
    f.extras.map((e) => ({ package: f.package, tsFile: f.tsFile, tsName: e.name, kind: e.kind })),
  );
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, "utf8")) as T;
}

async function snapshot(into: string): Promise<void> {
  for (const [dir, sub] of [
    [API_OUT, "api"],
    [TEST_OUT, "test"],
  ] as const) {
    await fs.mkdir(path.join(into, sub), { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (f.endsWith(".json") && !f.includes("@"))
        await fs.copyFile(path.join(dir, f), path.join(into, sub, f));
    }
  }
}

async function restore(from: string): Promise<void> {
  for (const [dir, sub] of [
    [API_OUT, "api"],
    [TEST_OUT, "test"],
  ] as const) {
    for (const f of await fs.readdir(path.join(from, sub)))
      await fs.copyFile(path.join(from, sub, f), path.join(dir, f));
  }
}

async function trackedDiff(env: Env): Promise<Map<string, string>> {
  const { out } = await sh("git", ["status", "--porcelain=v1", "--untracked-files=no"], env);
  const state = new Map<string, string>();
  for (const line of out.split("\n").filter(Boolean)) {
    const file = line.slice(3);
    state.set(file, (await sh("git", ["hash-object", file], env)).out.trim());
  }
  return state;
}

/** `git diff --no-index --numstat` between the two trees at `rel`. */
async function numstat(a: string, b: string, rel: string, env: Env) {
  const { out } = await sh(
    "git",
    ["diff", "--no-index", "-M", "--numstat", path.join(a, rel), path.join(b, rel)],
    env,
  );
  const rows = out.split("\n").filter((l) => /^\d+\t\d+\t/.test(l));
  const files = rows.map((r) => r.split("\t")[2]);
  return {
    files,
    added: rows.reduce((n, r) => n + Number(r.split("\t")[0]), 0),
    removed: rows.reduce((n, r) => n + Number(r.split("\t")[1]), 0),
  };
}

function schemaFacts(text: string): Set<string> {
  const facts = new Set<string>();
  let table = "";
  for (const line of text.split("\n")) {
    const t = /create_table\s+:?"?(\w+)/.exec(line);
    if (t) facts.add((table = t[1]));
    const c = /^\s*t\.(\w+)\s+:?"?(\w+)/.exec(line);
    if (c && table) facts.add(`${table}.${c[2]}`);
  }
  return facts;
}

async function schemaParity(active: string, candidate: string, ref: string, env: Env) {
  const rel = "activerecord/test/schema";
  const version = (await fs.readFile(path.join(candidate, "RAILS_VERSION"), "utf8")).trim();
  const gemfile = /^v\d/.test(ref) && version === ref.slice(1);
  const delta: string[] = [];
  const { files } = await numstat(active, candidate, rel, env);
  for (const f of files) {
    const name = path.basename(f.replace(/.*=> /, "").replace(/[{}]/g, ""));
    const read = (root: string) =>
      fs.readFile(path.join(root, rel, name), "utf8").catch(() => null);
    const [before, after] = [await read(active), await read(candidate)];
    if (before === null) delta.push(`${name} (new file)`);
    if (before === null || after === null) continue;
    const old = schemaFacts(before);
    for (const fact of schemaFacts(after)) if (!old.has(fact)) delta.push(fact);
  }
  return { gemfile, gemVersion: version, delta };
}

async function main(argv: string[], env: Env): Promise<number> {
  const arg = (flag: string) => argv[argv.indexOf(flag) + 1];
  const [sourceName, ref] = [arg("--source"), arg("--ref")];
  const source = SOURCES.find((s) => s.name === sourceName);
  if (!source || !argv.includes("--ref") || !ref) {
    console.error("usage: pnpm parity:bump:dry-run --source <name> --ref <tag>");
    return 2;
  }
  const fromRef = source.origin.ref;
  const packages = source.packages.filter((p) => p.compareApi !== false).map((p) => p.name);
  const outDir = path.join(ROOT, "scripts/parity/output/bump-dry-run", `${source.name}@${ref}`);
  const childEnv: Env = { ...env, API_COMPARE_SKIP_REGEN: "1" };
  const activeRoot = vendoredRoot(source.name);
  const candidateRoot = await fetchCandidate(source, ref, { refresh: false });
  if ((await trackedDiff(env)).size > 0) {
    console.error(
      "[bump] the tracked tree must be clean: the run restores what it rewrites from HEAD",
    );
    return 2;
  }

  console.log("[bump] active pass: parity:api --calls");
  await sh("pnpm", ["parity:api", "--calls"], env);
  const testPaths = testPathsManifest();
  await sh(
    "ruby",
    ["extract-ruby-tests.rb"],
    { ...env, TEST_PATHS_JSON: JSON.stringify(testPaths) },
    path.join(ROOT, "scripts/test-compare"),
  );
  const activeSteps = await runSteps(childEnv, "active");
  await snapshot(path.join(outDir, "active"));

  let candidateSteps: StepResult[];
  let citationRewrites: string[];
  try {
    for (const f of await fs.readdir(API_OUT)) {
      if (
        f.endsWith(".json") &&
        !["rails-api.json", "ts-api.json", "inlined-from-pairs.json"].includes(f)
      )
        await fs.rm(path.join(API_OUT, f));
    }
    const candidateApi = await readJson<{ packages: Record<string, unknown> }>(
      await extractTargetApi(candidateRoot, ref, source),
    );
    const activeApi = await readJson<{ packages: Record<string, unknown> }>(
      path.join(outDir, "active/api/rails-api.json"),
    );
    await fs.writeFile(
      path.join(API_OUT, "rails-api.json"),
      JSON.stringify(mergeManifest(activeApi, candidateApi, packages)),
    );
    const candidateTestPaths: Record<string, string> = {};
    for (const pkg of source.packages) {
      if (pkg.testPath && pkg.compareTests !== false)
        candidateTestPaths[pkg.name] = path.join(candidateRoot, pkg.testPath);
    }
    await sh(
      "ruby",
      ["extract-ruby-tests.rb"],
      { ...env, TEST_PATHS_JSON: JSON.stringify(candidateTestPaths) },
      path.join(ROOT, "scripts/test-compare"),
    );
    const candidateTests = await readJson<RubyTestManifest>(
      path.join(TEST_OUT, "rails-tests.json"),
    );
    const activeTests = await readJson<RubyTestManifest>(
      path.join(outDir, "active/test/rails-tests.json"),
    );
    await fs.writeFile(
      path.join(TEST_OUT, "rails-tests.json"),
      JSON.stringify(mergeManifest(activeTests, candidateTests, Object.keys(candidateTestPaths))),
    );
    await sh("pnpm", [...TSX, "scripts/api-compare/lint-inlined-from.ts", "--fix"], childEnv);
    citationRewrites = [...(await trackedDiff(env)).keys()];
    await sh("pnpm", ["build"], env);
    const tsExtract = await sh("pnpm", [...TSX, "scripts/api-compare/extract-ts-api.ts"], {
      ...childEnv,
      API_COMPARE_FORCE: "1",
    });
    if (tsExtract.code !== 0) throw new Error(`[bump] TS re-extraction failed:\n${tsExtract.out}`);
    candidateSteps = await runSteps(childEnv, "candidate");
    await snapshot(path.join(outDir, "candidate"));
  } finally {
    await restore(path.join(outDir, "active"));
    for (const f of (await trackedDiff(env)).keys())
      await sh("git", ["checkout", "HEAD", "--", f], env);
    await sh("pnpm", ["build"], env);
  }
  const touched = [...(await trackedDiff(env)).keys()];

  const a = <T>(f: string) => readJson<T>(path.join(outDir, "active", f));
  const c = <T>(f: string) => readJson<T>(path.join(outDir, "candidate", f));
  const pins = (
    await readJson<Pin[]>(path.join(ROOT, "scripts/api-compare/body-pins.json"))
  ).filter((p) => packages.includes(p.package));
  const activeHashes: HashRecord[] = (await a<{ hashes: HashRecord[] }>("api/body-hashes.json"))
    .hashes;
  const candidateHashes: HashRecord[] = (await c<{ hashes: HashRecord[] }>("api/body-hashes.json"))
    .hashes;
  const seed = pairSeed(pins, candidateHashes, fromRef, ref);

  const missingOf = async (rel: string) => {
    const m = new Map<string, Set<string>>();
    for (const r of (await readJson<ConventionComparison>(rel)).results ?? []) {
      for (const f of r.files ?? [])
        if (f.tsFileExists) m.set(`${r.package} ${f.rubyFile}`, new Set(f.missingTests ?? []));
    }
    return m;
  };
  const activeTests = await a<RubyTestManifest>("test/rails-tests.json");
  const candidateTests = await c<RubyTestManifest>("test/rails-tests.json");
  const missing = await missingOf(path.join(outDir, "active/test/convention-comparison.json"));
  const testRows: ReturnType<typeof testSeed> = [];
  const testTable: (string | number)[][] = [];
  for (const pkg of Object.keys(candidateTests.packages).filter((p) => packages.includes(p))) {
    const d = testDelta(activeTests, candidateTests, pkg);
    testRows.push(...testSeed(pkg, d, activeTests, missing, fromRef, ref));
    testTable.push([pkg, d.before, d.after, d.added, d.removed, d.changed.length, d.moved.length]);
  }

  const artifacts = cols(
    "call-mismatches|call-arg-mismatches|param-name-mismatches|block-param-mismatches|call-skeletons",
  ).map((f) => `${f}.json`);
  const attribution: Record<string, ReturnType<typeof attribute>> = {};
  for (const f of artifacts) {
    const [base, cand] = await Promise.all([
      a<unknown>(`api/${f}`).catch(() => null),
      c<unknown>(`api/${f}`).catch(() => null),
    ]);
    if (cand === null) continue;
    const gated = (rows: GateRow[]) =>
      f === "call-skeletons.json"
        ? rows.filter((r) => {
            const arms = compareArms(r as unknown as Parameters<typeof compareArms>[0]);
            return arms !== undefined && "missing" in arms && arms.missing.includes("throw");
          })
        : rows;
    const fresh = newRows(gated(gateRows(base)), gated(gateRows(cand))).filter((r) =>
      packages.includes(r.package),
    );
    attribution[f] = attribute(fresh, seed, activeHashes, candidateHashes);
  }
  attribution["extra surface"] = attribute(
    newRows(
      await extraRows(path.join(outDir, "active/api")),
      await extraRows(path.join(outDir, "candidate/api")),
    ).filter((r) => packages.includes(r.package)),
    seed,
    activeHashes,
    candidateHashes,
  );
  const residue = Object.entries(attribution).flatMap(([f, rows]) =>
    rows.filter((r) => r.attribution === null).map((r) => ({ artifact: f, ...r.row })),
  );

  const methods = async (rel: string) => {
    const m = new Map<string, string>();
    for (const r of (await readJson<ApiComparison>(path.join(outDir, rel))).results)
      m.set(r.package, `${r.matched}/${r.totalMethods}`);
    return m;
  };
  const [methodsBefore, methodsAfter] = [
    await methods("active/api/api-comparison.json"),
    await methods("candidate/api/api-comparison.json"),
  ];
  const pairTable: (string | number)[][] = [];
  for (const pkg of source.packages.filter((p) => p.compareApi !== false)) {
    const ns = await numstat(activeRoot, candidateRoot, pkg.libPath, env);
    const mine = seed.filter((s) => s.package === pkg.name);
    const unpinned = candidateHashes.filter(
      (h) =>
        h.package === pkg.name &&
        !pins.some((p) => pairKey(p) === pairKey(h)) &&
        activeHashes.some((x) => pairKey(x) === pairKey(h) && x.digest !== h.digest),
    );
    const kinds = ["drift", "removed"].map((k) => mine.filter((s) => s.kind === k).length);
    const files = new Set(mine.map((s) => s.rubyFile)).size;
    const [before, after] = [methodsBefore, methodsAfter].map((m) => m.get(pkg.name) ?? "");
    pairTable.push([
      pkg.name,
      ns.files.length,
      ns.added,
      ns.removed,
      ...kinds,
      files,
      unpinned.length,
      before,
      after,
    ]);
  }

  const changedUnder = async (rel: string) =>
    (await numstat(activeRoot, candidateRoot, rel, env)).files.length;
  const libFiles = pairTable.reduce((n, r) => n + Number(r[1]), 0);
  const tagRe = `@inlinedFrom [^ ]+ ${source.name}/v[0-9.]+/[^:]+`;
  const { out: tags } = await sh("git", ["grep", "-h", "-o", "-E", tagRe, "--", "packages"], env);
  const changedLib = new Set<string>();
  for (const pkg of source.packages)
    for (const f of (await numstat(activeRoot, candidateRoot, pkg.libPath, env)).files)
      changedLib.add(f.slice(f.indexOf(pkg.libPath)));
  const inlinedStale = tags
    .split("\n")
    .filter((t) => [...changedLib].some((f) => t.endsWith(f))).length;
  const schema =
    source.name === "rails" ? await schemaParity(activeRoot, candidateRoot, ref, env) : null;
  const notExercised = [
    ["Rails-private JSDoc lint and runtime artifact", `${libFiles} lib files change`],
    [
      "Rails file-structure method-order lint",
      `${pairTable.filter((r) => ["arel", "activemodel"].includes(String(r[0]))).reduce((n, r) => n + Number(r[1]), 0)} arel/activemodel lib files change`,
    ],
    [
      "Rails test-name parity ratchet",
      `${await changedUnder("actionview/test")} actionview + ${await changedUnder("activerecord/test/cases/arel")} arel test files change`,
    ],
    [
      "Fixtures comparison",
      `${await changedUnder("activerecord/test/fixtures")} fixture files change`,
    ],
    ["Models comparison", `${await changedUnder("activerecord/test/models")} model files change`],
    [
      "Schema Parity / Query Parity",
      schema
        ? `Gemfile ${schema.gemfile ? "generatable" : "NOT generatable"} (activerecord ${schema.gemVersion}); schema delta: ${schema.delta.join(", ") || "none"}`
        : "n/a",
    ],
  ];

  const report = [
    `# Bump dry run: ${source.name} ${fromRef} → ${ref}`,
    "",
    touched.length === 0
      ? "Tracked files byte-identical after the run."
      : `**Tracked files changed by the run (restored where clean before):** ${touched.join(", ")}`,
    "",
    "## Gates",
    table(
      ["Step", "Active", "Candidate", "Candidate counts"],
      STEPS.map((s, i) => [
        s.name,
        activeSteps[i].status,
        candidateSteps[i].status,
        candidateSteps[i].summary.replaceAll("|", "\\|"),
      ]),
    ),
    "",
    "Ratchet baseline reseed drift: follows the call-mismatches ratchet (not run: it writes the baseline).",
    `Inlined-from citation spans: exercised — \`parity:api:inlined:fix\` re-cited ${citationRewrites.length} file(s) (${inlinedStale} tags cite a changed file), restored afterwards.`,
    "",
    "## Not exercised",
    table(["Step", "Upstream count that predicts it"], notExercised),
    "",
    "## Ruby source and body pins",
    table(
      cols(
        "Package|Files changed|+lines|-lines|Pins DRIFT|Pins STALE|Ruby files with either|Unpinned pairs that change|Methods before|Methods after",
      ),
      pairTable,
    ),
    "",
    "## Tests",
    table(
      cols(`Package|Tests ${fromRef}|Tests ${ref}|Added|Removed|Changed in place|Moved`),
      testTable,
    ),
    "",
    `## Ledger seed: ${seed.length} pair rows (${seed.filter((s) => s.kind === "drift").length} drift, ${seed.filter((s) => s.kind === "removed").length} removed), ${testRows.length} test rows`,
    "",
    "## Attribution of new gate rows",
    table(
      ["Artifact", "New rows", "drift", "removed", "unpinned changed", "file seed", "unattributed"],
      Object.entries(attribution).map(([f, rows]) => [
        f,
        rows.length,
        ...(["drift", "removed", "unpinnedChanged", "fileSeed", null] as const).map(
          (k) => rows.filter((r) => r.attribution === k).length,
        ),
      ]),
    ),
    "",
    ...residue.map(
      (r) =>
        `- unattributed: ${r.artifact} ${r.package} ${r.tsFile} ${r.rubyName ?? r.tsName ?? ""}`,
    ),
  ].join("\n");
  const ledger = { source: source.name, from: fromRef, to: ref, pairs: seed, tests: testRows };
  await fs.writeFile(path.join(outDir, "ledger-seed.json"), JSON.stringify(ledger, null, 2) + "\n");
  await fs.writeFile(path.join(outDir, "report.md"), report + "\n");
  console.log(`\n${report}\n\n[bump] written to ${outDir}`);
  return touched.length === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2), process.env).then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error(err instanceof Error ? err.stack : err);
      process.exitCode = 1;
    },
  );
}
