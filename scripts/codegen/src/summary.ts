/* eslint-disable @typescript-eslint/no-explicit-any -- the IR is untyped JSON from the Ruby front-end */
/**
 * Summarize a parity run of the generated tree against the hand-written one.
 *
 *   pnpm tsx scripts/codegen/src/summary.ts [--json]
 *
 * Reads packages/activerecord/codegen-out/parity-{gen,hand}/ (written by
 * measure-parity.sh) and prints, for each side: methods matched, files,
 * inheritance, arity, param names, call-set parity, call-argument parity; then
 * the agreement between the two trees on every method both define.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { GEM, GEN_DIR } from "./gem.js";

const GEN = GEN_DIR;

function load(side: string, f: string): any {
  const p = path.join(GEN, `parity-${side}`, f);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function overall(side: string) {
  const log = readFileSync(path.join(GEN, `parity-${side}`, "parity.log"), "utf8");
  const m = log.match(
    /Overall: (\d+)\/(\d+) methods.*?files: (\d+)\/(\d+).*?inheritance: (\d+)\/(\d+).*?arity: (\d+)\/(\d+)/,
  );
  const p = log.match(/Parameter names \(advisory\): (\d+)\/(\d+)/);
  const cm = load(side, "call-mismatches.json");
  const ca = load(side, "call-arg-mismatches.json");
  const shape = ca?.mismatches.filter((x: any) => x.class === "shape").length;
  return {
    methods: m ? `${m[1]}/${m[2]} (${((100 * +m[1]) / +m[2]).toFixed(1)}%)` : "?",
    files: m ? `${m[3]}/${m[4]}` : "?",
    inheritance: m ? `${m[5]}/${m[6]}` : "?",
    arity: m ? `${m[7]}/${m[8]}` : "?",
    params: p ? `${p[1]}/${p[2]}` : "?",
    calls: cm
      ? `${cm.compared - cm.mismatched}/${cm.compared} call-sets equal (${cm.mismatched} mismatched)`
      : "?",
    args: ca
      ? `${ca.compared - ca.mismatched}/${ca.compared} arg lists equal (${shape} shape, ${ca.mismatched - shape} naming)`
      : "?",
  };
}

type M = { calls?: string[]; params?: { name: string }[]; skeleton?: string[] };
function methodsOf(side: string): Map<string, M> {
  const t = load(side, `ts-api-${GEM.gem}.json`);
  const out = new Map<string, M>();
  if (!t) return out;
  for (const sec of ["classes", "modules"]) {
    for (const [key, info] of Object.entries<any>(t[sec] ?? {})) {
      const file = key.split(":")[0];
      for (const m of info.instanceMethods ?? []) out.set(`${file}#${info.name}#${m.name}`, m);
      for (const m of info.classMethods ?? []) out.set(`${file}#${info.name}.${m.name}`, m);
    }
  }
  for (const [file, fns] of Object.entries<any[]>(t.fileFunctions ?? {}))
    for (const m of fns) out.set(`${file}#.${m.name}`, m);
  return out;
}

function agreement() {
  const g = methodsOf("gen");
  const h = methodsOf("hand");
  let both = 0;
  let sameCalls = 0;
  let sameParams = 0;
  let sameSkeleton = 0;
  let jac = 0;
  const norm = (c?: string[]) =>
    new Set((c ?? []).filter((x) => !x.startsWith("@") && !x.startsWith(".")));
  for (const [k, gm] of g) {
    const hm = h.get(k);
    if (!hm) continue;
    both++;
    const a = norm(gm.calls);
    const b = norm(hm.calls);
    const inter = [...a].filter((x) => b.has(x)).length;
    const uni = new Set([...a, ...b]).size;
    jac += uni === 0 ? 1 : inter / uni;
    if (inter === uni) sameCalls++;
    if ((gm.params ?? []).map((p) => p.name).join() === (hm.params ?? []).map((p) => p.name).join())
      sameParams++;
    if ((gm.skeleton ?? []).join() === (hm.skeleton ?? []).join()) sameSkeleton++;
  }
  return {
    genMethods: g.size,
    handMethods: h.size,
    inBoth: both,
    identicalCallSet: `${sameCalls} (${((100 * sameCalls) / both).toFixed(1)}%)`,
    meanCallJaccard: (jac / both).toFixed(3),
    identicalParamNames: `${sameParams} (${((100 * sameParams) / both).toFixed(1)}%)`,
    identicalSkeleton: `${sameSkeleton} (${((100 * sameSkeleton) / both).toFixed(1)}%)`,
  };
}

const res = { gen: overall("gen"), hand: overall("hand"), agreement: agreement() };
if (process.argv.includes("--json")) console.log(JSON.stringify(res, null, 2));
else {
  for (const side of ["gen", "hand"] as const) {
    console.log(`── ${side}`);
    for (const [k, v] of Object.entries(res[side])) console.log(`  ${k.padEnd(12)} ${v}`);
  }
  console.log("── generated vs hand (methods both trees define)");
  for (const [k, v] of Object.entries(res.agreement)) console.log(`  ${k.padEnd(20)} ${v}`);
}
