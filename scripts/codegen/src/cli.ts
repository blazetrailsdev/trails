/* eslint-disable @typescript-eslint/no-explicit-any -- the IR is untyped JSON from the Ruby front-end */
/**
 * `pnpm tsx scripts/codegen/src/cli.ts [--out <dir>] [--only <ruby-file-substring>]`
 *
 * Runs the whole pipeline over activerecord: Prism → IR (Ruby subprocess),
 * gem index, export-name registration, lowering, and writes the generated tree
 * plus `report.json` (declines, wanted ruby-compat helpers, unresolved
 * constants, per-file stats).
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { GemIndex, lexicalChain } from "./gem-index.js";
import type { IrFile } from "./ir.js";
import { Emitter } from "./emit.js";
import { Resolver } from "./resolve.js";
import { TypeOracle } from "./types.js";
import { runtimeShim, DECLINED_SHIM } from "./runtime-shim.js";
import { GEM, GEM_LIB, GEN_DIR, ORACLE_PATH, PKG_DIR, ROOT } from "./gem.js";
import { nonNullPass } from "./nonnull-pass.js";
import { typePass } from "./type-pass.js";
import { augmentSeatTypes } from "./seat-types.js";

const LIB = GEM_LIB;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const outDir = path.resolve(arg("--out") ?? path.join(GEN_DIR, "src"));
const only = arg("--only");
const irDir = path.join(
  ROOT,
  GEM.gem === "activerecord" ? "scripts/codegen/.ir" : `scripts/codegen/.ir-${GEM.gem}`,
);

function listJson(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...listJson(p));
    else if (p.endsWith(".json")) out.push(p);
  }
  return out;
}

const t0 = Date.now();
rmSync(irDir, { recursive: true, force: true });
const rubyFiles = execFileSync("bash", [
  "-c",
  `cd ${LIB} && ls ${GEM.rubyRoot}.rb && find ${GEM.rubyRoot} -name '*.rb' | sort`,
])
  .toString()
  .trim()
  .split("\n");
execFileSync(
  "ruby",
  [
    path.join(ROOT, "scripts/codegen/ruby/build-ir.rb"),
    LIB,
    irDir,
    ...rubyFiles.map((f) => path.join(LIB, f)),
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);
const files: IrFile[] = listJson(irDir)
  .map((p) => JSON.parse(readFileSync(p, "utf8")) as IrFile)
  .sort((a, b) => a.file.localeCompare(b.file));

// `--tests cases/callbacks_test.rb,…` (relative to the gem's test/): port those
// test files and, transitively, the fixtures they `require` (`jobs/…`,
// `models/…`, `support/…`). Their IR files are named `test/<path>`.
{
  const want = arg("--tests");
  if (want) {
    const TEST = path.join(GEM_LIB, "..", "test");
    const seen = new Set<string>();
    const queue = want
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    while (queue.length) {
      const rel = queue.shift()!;
      if (seen.has(rel) || !existsSync(path.join(TEST, rel))) continue;
      seen.add(rel);
      const src = readFileSync(path.join(TEST, rel), "utf8");
      if (/^\s*require "helper"/m.test(src)) queue.push("helper.rb");
      // helper.rb's `require "adapters/#{@adapter}"`: each adapter trails runs the
      // suite under (Rakefile:5, less the queue gems it does not port).
      if (GEM.gem === "activejob" && rel === "helper.rb")
        queue.push("adapters/inline.rb", "adapters/async.rb", "adapters/test.rb");
      // helper.rb's requires sit in `ENV` branches; only the default adapter is taken.
      if (rel === "helper.rb") continue;
      for (const m of src.matchAll(/^\s*require "((?:jobs|models|support)\/[^"]+)"/gm))
        queue.push(m[1].endsWith(".rb") ? m[1] : `${m[1]}.rb`);
      // `require_relative "../support/job_buffer"` is relative to the requiring file.
      for (const m of src.matchAll(/^\s*require_relative "([^"]+)"/gm)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
        if (/^(jobs|models|support)\//.test(target))
          queue.push(target.endsWith(".rb") ? target : `${target}.rb`);
      }
    }
    const testIr = path.join(irDir, "..", `.ir-tests-${GEM.gem}`);
    rmSync(testIr, { recursive: true, force: true });
    execFileSync(
      "ruby",
      [
        path.join(ROOT, "scripts/codegen/ruby/build-ir.rb"),
        TEST,
        testIr,
        ...[...seen].map((r) => path.join(TEST, r)),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    for (const p of listJson(testIr)) {
      const f = JSON.parse(readFileSync(p, "utf8")) as IrFile;
      f.file = `test/${f.file}`;
      files.push(f);
    }
  }
}

const index = new GemIndex();
for (const f of files) index.add(f);
// A file that requires a library trails neither ports nor gets from Ruby's
// stdlib (`require "sidekiq"`): loading it would fail, so a test reaches its
// constant only when Ruby's autoload would, at the read.
{
  const RUBY = path.join(ROOT, "vendor/ruby/v3.3.11");
  const stdlib = (r: string) =>
    existsSync(path.join(RUBY, "lib", `${r}.rb`)) ||
    existsSync(path.join(RUBY, "lib", r)) ||
    existsSync(path.join(RUBY, "ext", r.split("/")[0]));
  const ported = (r: string) => /^(active_|action_|global_id|i18n|concurrent|rails)/.test(r);
  for (const f of files) {
    // A test's `require "helper"` names a file on the test load path.
    if (f.file.startsWith("test/")) continue;
    const top = f.body?.k === "seq" ? f.body.body : [f.body];
    if (
      top.some(
        (s: any) =>
          s?.k === "call" &&
          s.recv === null &&
          s.name === "require" &&
          s.args[0]?.k === "str" &&
          !ported(s.args[0].value) &&
          !stdlib(s.args[0].value),
      )
    )
      index.externalFiles.add(f.file);
  }
}
const types = new TypeOracle(ORACLE_PATH);
const resolver = new Resolver(
  index,
  path.join(ROOT, "scripts/codegen/data/pkg-exports.json"),
  types,
);
index.finish((f) => resolver.tsFileOf(f));

// Modules outside the gem that a class includes: the Rails manifest says
// whether each defines `initialize`, and where, so a constructor can inline it
// with the same citation `parity:api:inlined` checks (RFC 0188).
{
  const manifestPath = path.join(ROOT, "scripts/api-compare/output/rails-api.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const modules = new Map<string, any>();
  for (const pkg of Object.values<any>(manifest.packages))
    for (const [fq, m] of Object.entries<any>(pkg.modules ?? {})) modules.set(fq, m);
  for (const pkg of Object.values<any>(manifest.packages))
    for (const scope of [
      ...Object.values<any>(pkg.modules ?? {}),
      ...Object.values<any>(pkg.classes ?? {}),
    ])
      for (const d of [...(scope.instanceMethods ?? []), ...(scope.classMethods ?? [])])
        if (d.takesBlock && d.params?.some((p: any) => p.kind === "rest"))
          index.depRestBlock.add(d.name);
  const wanted = new Map<
    string,
    { written: string; fq: string; vendorFile: string; line: number; endLine: number }
  >();
  for (const sc of index.scopes.values()) {
    const chain = lexicalChain(index, sc.lexicalParent);
    for (const inc of sc.includes) {
      if (index.resolveConst(inc, [...chain, sc.fqn])) continue;
      const written = inc.filter((x) => x).join("::");
      if (!index.depChains.has(written)) {
        const start = [
          ...[...chain, sc.fqn].map((s0) => `${s0}::${written}`).reverse(),
          written,
        ].find((c) => modules.has(c));
        const out: { fqn: string; methods: Set<string>; classMethods: Set<string> }[] = [];
        const seen = new Set<string>();
        const visit = (fq: string) => {
          if (seen.has(fq) || !modules.has(fq)) return;
          seen.add(fq);
          const m = modules.get(fq);
          out.push({
            fqn: fq,
            methods: new Set((m.instanceMethods ?? []).map((x: any) => x.name as string)),
            classMethods: new Set(
              (modules.get(`${fq}::ClassMethods`)?.instanceMethods ?? []).map(
                (x: any) => x.name as string,
              ),
            ),
          });
          for (const inc of [...(m.includes ?? [])].reverse()) visit(inc);
        };
        if (start) visit(start);
        index.depChains.set(written, out);
      }
      // The instance methods a dependency module defines, for a gem module's
      // `super` that reaches past the gem (lower.ts `externalSuperTarget`).
      if (!index.depMethods.has(written)) {
        const cands0 = [...[...chain, sc.fqn].map((s0) => `${s0}::${written}`).reverse(), written];
        const fq0 = cands0.find((c) => modules.has(c));
        if (fq0)
          index.depMethods.set(
            written,
            new Set((modules.get(fq0).instanceMethods ?? []).map((m: any) => m.name as string)),
          );
      }
      if (index.depInits.has(written) || wanted.has(written)) continue;
      // Ruby's lexical lookup, innermost scope first, then the path as written.
      const scopes = [...chain, sc.fqn];
      const cands = [...scopes.map((s0) => `${s0}::${written}`).reverse(), written];
      const fq = cands.find((c) => modules.has(c));
      if (!fq) continue;
      const init = modules.get(fq).instanceMethods?.find((m: any) => m.name === "initialize");
      if (!init) index.depInits.set(written, null);
      else if (init.vendorFile)
        wanted.set(written, {
          written,
          fq,
          vendorFile: init.vendorFile,
          line: init.line,
          endLine: init.endLine,
        });
    }
  }
  const byLib = new Map<string, Set<string>>();
  for (const w of wanted.values()) {
    const m = /^(.*\/lib)\/(.+)$/.exec(w.vendorFile);
    if (!m) continue;
    const lib = path.join(ROOT, "vendor", m[1]);
    if (!byLib.has(lib)) byLib.set(lib, new Set());
    byLib.get(lib)!.add(path.join(lib, m[2]));
  }
  const depIrDir = path.join(irDir, "..", ".ir-deps");
  rmSync(depIrDir, { recursive: true, force: true });
  for (const [lib, fs0] of byLib)
    execFileSync(
      "ruby",
      [path.join(ROOT, "scripts/codegen/ruby/build-ir.rb"), lib, depIrDir, ...fs0],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  const depFiles = existsSync(depIrDir)
    ? listJson(depIrDir).map((p) => JSON.parse(readFileSync(p, "utf8")))
    : [];
  const findDef = (n: any, line: number): any => {
    if (!n || typeof n !== "object") return null;
    if (n.k === "def" && n.name === "initialize" && n.l === line) return n;
    for (const v of Object.values(n)) {
      const r = findDef(v, line);
      if (r) return r;
    }
    return null;
  };
  for (const w of wanted.values()) {
    const rel = w.vendorFile.replace(/^.*\/lib\//, "");
    const ir = depFiles.find((f: any) => f.file === rel);
    const node = ir ? findDef(ir, w.line) : null;
    if (node)
      index.depInits.set(w.written, { node, cite: `${w.vendorFile}:${w.line}-${w.endLine}` });
  }
}

const emitter = new Emitter(index, resolver);
// Register primary files first so a reopened class is exported from its home file.
for (const f of files) emitter.register(f);

// activejob's adapters for queue gems trails does not port (Sidekiq, Resque,
// Delayed Job, …: each requires its gem) are not generated; only the built-in
// adapters are. activerecord's adapters require their drivers, so this is
// activejob's alone.
const skipped = (f: IrFile) => GEM.gem === "activejob" && index.externalFiles.has(f.file);
for (const f of files) if (skipped(f)) resolver.unresolvedFiles.add(resolver.tsFileOf(f.file));

// `include ActiveSupport::Testing::Assertions` (activejob's TestHelper) mixes in
// activesupport's assertions, whose block-taking ones are async there: a gem
// method calling `_assert_nothing_raised_or_warn` awaits it.
for (const m of readFileSync(
  path.join(ROOT, "packages/activesupport/src/testing/assertions.ts"),
  "utf8",
).matchAll(/^export async function (\w+)/gm))
  resolver.asyncDefs.add(
    `ActiveSupport::Testing::Assertions#${m[1].replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}`,
  );

// Async propagates through the gem's own calls: a method that awaits is
// recorded as async while emitting, and its callers await it on the next pass.
// Discard passes until no new method turns async, then emit for real.
for (let pass = 0; pass < 8; pass++) {
  const before = resolver.asyncDefs.size + resolver.asyncYielders.size;
  for (const f of files) {
    if (only && !f.file.includes(only)) continue;
    if (skipped(f)) continue;
    try {
      const res = emitter.emitFile(f);
      // A file that names a constant the generator could not resolve (a
      // third-party gem, `Sidekiq::Worker`) is not loaded eagerly by an
      // `autoload`: Ruby loads it only when the constant is looked up.
      if (res.ctx.declines.some((d) => d.reason === "const-unresolved"))
        resolver.unresolvedFiles.add(res.tsFile);
    } catch {
      // reported by the real pass below
    }
  }
  if (resolver.asyncDefs.size + resolver.asyncYielders.size === before && pass > 0) break;
}
resolver.wanted.clear();
resolver.unresolvedConsts.clear();

rmSync(outDir, { recursive: true, force: true });
const byTs = new Map<string, string[]>();
const report: any = { files: [], declines: {}, wanted: {}, unresolvedConsts: {}, stats: {} };
let totalDefs = 0;
for (const f of files) {
  if (only && !f.file.includes(only)) continue;
  if (skipped(f)) {
    report.files.push({ ruby: f.file, skipped: "requires a gem trails does not port" });
    continue;
  }
  let res;
  try {
    res = emitter.emitFile(f);
  } catch (e) {
    report.files.push({ ruby: f.file, crash: String((e as Error).stack).slice(0, 400) });
    continue;
  }
  totalDefs += res.defs;
  if (!byTs.has(res.tsFile)) byTs.set(res.tsFile, []);
  byTs.get(res.tsFile)!.push(res.text);
  for (const d of res.ctx.declines)
    report.declines[d.reason] = (report.declines[d.reason] ?? 0) + 1;
  for (const [k, v] of Object.entries(res.ctx.stats)) report.stats[k] = (report.stats[k] ?? 0) + v;
  report.files.push({
    ruby: f.file,
    ts: res.tsFile,
    defs: res.defs,
    units: res.units,
    declines: res.ctx.declines,
  });
}
for (const [ts, texts] of byTs) {
  const p = path.join(outDir, ts);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, texts.join("\n"));
}
writeFileSync(path.join(outDir, "codegen-runtime.ts"), runtimeShim(resolver.wanted.keys()));
writeFileSync(path.join(outDir, "codegen-declined.ts"), DECLINED_SHIM);
// The hand port's namespace seats (`namespaces.ts`, CLAUDE.md "Call-time constant
// resolution") have no Ruby file; generated files import the gem namespace from it.
{
  const seats = path.join(PKG_DIR, "src/namespaces.ts");
  if (existsSync(seats))
    writeFileSync(path.join(outDir, "namespaces.ts"), readFileSync(seats, "utf8"));
}
// The seats the hand port's `namespaces.ts` types, extended with what the
// generated files seat on them (seat-types.ts).
report.seatMembers = augmentSeatTypes(outDir);
// The type pass: every `any` the lowering wrote replaced by what the checker
// sees reach it (type-pass.ts). `--no-types` skips it.
if (!process.argv.includes("--no-types"))
  report.typePass = typePass(outDir, path.join(PKG_DIR, "tsconfig.json"));
// The signature index: a nullable argument or receiver meeting a non-null
// parameter or member takes `!` (nonnull-pass.ts). `--no-nonnull` skips it.
if (!process.argv.includes("--no-nonnull"))
  report.nonNullAssertions = nonNullPass(outDir, path.join(PKG_DIR, "tsconfig.json"));
report.unseatedConstants = emitter.unseated;
report.wanted = Object.fromEntries([...resolver.wanted].sort((a, b) => b[1] - a[1]));
report.unresolvedConsts = Object.fromEntries(
  [...resolver.unresolvedConsts].sort((a, b) => b[1] - a[1]),
);
report.summary = {
  rubyFiles: files.length,
  tsFiles: byTs.size,
  defs: totalDefs,
  declines: Object.values(report.declines as Record<string, number>).reduce((a, b) => a + b, 0),
  crashes: report.files.filter((x: any) => x.crash).length,
  ms: Date.now() - t0,
};
writeFileSync(path.join(path.dirname(outDir), "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary));
console.log("declines", report.declines);
console.log("stats", report.stats);
console.log(`oracle member lookups: hit=${types.hits} miss=${types.misses}`);
writeFileSync(
  path.join(path.dirname(outDir), "oracle-misses.json"),
  JSON.stringify(Object.fromEntries([...types.missLog].sort((a, b) => b[1] - a[1])), null, 1),
);
