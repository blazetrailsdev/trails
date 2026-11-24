import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const APP = "examples/serverless-lambda";
const APP_ENTRY = `${APP}/config/environment.ts`;
const RC_DIST = join(ROOT, "packages/ruby-compat/dist");
const BASELINE = join(HERE, "baseline.json");
const SCC_MAP = join(HERE, "scc-map.json");
const MIN_NODE = 24;

interface Measurement {
  entry: string;
  total: number;
  medianMs: number;
  packages: Record<string, { loaded: number; shipped: number | null }>;
  files: string[];
}

async function walkJs(dir: string, out: string[] = []): Promise<string[]> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkJs(p, out);
    else if (e.name.endsWith(".js")) out.push(p);
  }
  return out;
}

function owner(path: string): string {
  const rel = relative(ROOT, path);
  let m = /(?:^|\/)node_modules\/@blazetrails\/([^/]+)\//.exec(rel);
  if (m) return m[1];
  m = /^packages\/([^/]+)\//.exec(rel);
  if (m) return m[1];
  m = /.*node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(rel);
  if (m) return m[1];
  return "(entry)";
}

async function shipped(pkg: string): Promise<number | null> {
  const files = await walkJs(join(ROOT, "packages", pkg, "dist"));
  return files.length || null;
}

async function probe(entry: string, cwd: string): Promise<{ urls: string[]; ms: number }> {
  const dir = await mkdtemp(join(tmpdir(), "boot-graph-"));
  const out = join(dir, "urls.json");
  try {
    const { stdout } = await run(
      "node",
      ["--import", join(HERE, "register.mjs"), join(HERE, "probe.mjs"), entry],
      { cwd, env: { ...process.env, BOOT_GRAPH_OUT: out }, maxBuffer: 64 << 20 },
    );
    const ms = JSON.parse(stdout.trim().split("\n").at(-1)!).ms as number;
    return { urls: JSON.parse(await readFile(out, "utf8")), ms };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function measure(entry: string, runs: number, cwd = ROOT): Promise<Measurement> {
  const target = entry.startsWith("@") ? entry : pathToFileURL(resolve(ROOT, entry)).href;
  const first = await probe(target, cwd);
  const times: number[] = [];
  for (let i = 0; i < runs; i++) times.push((await probe(target, cwd)).ms);
  times.sort((a, b) => a - b);
  const files = await Promise.all(
    first.urls.filter((u) => u.startsWith("file:")).map((u) => realpath(fileURLToPath(u))),
  );
  const counts = new Map<string, number>();
  for (const f of new Set(files)) counts.set(owner(f), (counts.get(owner(f)) ?? 0) + 1);
  const packages: Measurement["packages"] = {};
  const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [pkg, loaded] of sorted) packages[pkg] = { loaded, shipped: await shipped(pkg) };
  return {
    entry,
    total: new Set(files).size,
    medianMs: Math.round(times[Math.floor(times.length / 2)]),
    packages,
    files: [...new Set(files)],
  };
}

function table(m: Measurement): string {
  const lines = [`${m.entry}: ${m.total} modules, median ${m.medianMs}ms`];
  lines.push(`  ${"package".padEnd(28)}${"loaded".padStart(8)}${"shipped".padStart(9)}  ratio`);
  for (const [pkg, { loaded, shipped }] of Object.entries(m.packages)) {
    const ratio = shipped ? `${((100 * loaded) / shipped).toFixed(1)}%` : "-";
    lines.push(
      `  ${pkg.padEnd(28)}${String(loaded).padStart(8)}${String(shipped ?? "-").padStart(9)}  ${ratio}`,
    );
  }
  return lines.join("\n");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const VALUE_EDGE = /(?:^|\n)\s*(?:import|export)\s*(?:[^'"`;]*?\sfrom\s*)?["'](\.[^"']+)["']/g;

async function rcGraph(): Promise<Map<string, string[]>> {
  const graph = new Map<string, string[]>();
  for (const file of await walkJs(RC_DIST)) {
    const src = stripComments(await readFile(file, "utf8"));
    const deps = [...src.matchAll(VALUE_EDGE)].map((m) =>
      relative(RC_DIST, resolve(dirname(file), m[1])),
    );
    graph.set(relative(RC_DIST, file), deps);
  }
  return graph;
}

function sccs(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const visit = (v: string): void => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue;
      if (!idx.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp.sort());
    }
  };
  for (const v of [...graph.keys()].sort()) if (!idx.has(v)) visit(v);
  return out.sort((a, b) => b.length - a.length);
}

async function sccMap() {
  const graph = await rcGraph();
  const groups = sccs(graph);
  const sccOf = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((m) => sccOf.set(m, i)));
  const barrel = stripComments(await readFile(join(RC_DIST, "index.js"), "utf8"));
  const unclassified = barrel
    .split(/;\s*\n?/)
    .map((st) => st.trim())
    .filter((st) => st.startsWith("export") && !/^export\s*\{[^}]*\}\s*from\s*["']\./.test(st));
  if (unclassified.length) {
    throw new Error(`ruby-compat barrel export scc-map cannot classify: ${unclassified[0]}`);
  }
  const bindings: Record<string, { module: string; scc: number | null }> = {};
  for (const m of barrel.matchAll(/export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
    const module = relative(RC_DIST, resolve(RC_DIST, m[2]));
    for (const spec of m[1].split(",")) {
      const name = spec
        .trim()
        .split(/\s+as\s+/)
        .at(-1);
      if (name) bindings[name] = { module, scc: sccOf.get(module) ?? null };
    }
  }
  return {
    sccs: groups.map((g) => ({ size: g.length, modules: g })),
    bindings: Object.fromEntries(Object.entries(bindings).sort(([a], [b]) => a.localeCompare(b))),
  };
}

async function rcLoaded(modules: Set<string>): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "boot-graph-union-"));
  const entry = join(dir, "union.mjs");
  try {
    const body = [...modules]
      .sort()
      .map((m) => `import ${JSON.stringify(pathToFileURL(join(RC_DIST, m)).href)};`);
    await writeFile(entry, body.join("\n") + "\n");
    const { urls } = await probe(pathToFileURL(entry).href, ROOT);
    const files = new Set(
      await Promise.all(
        urls.filter((u) => u.startsWith("file:")).map((u) => realpath(fileURLToPath(u))),
      ),
    );
    return [...files].filter((f) => owner(f) === "ruby-compat").length;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const RC_IMPORT =
  /(?:import|export)\s*(?:(?:\w+\s*,\s*)?(\*\s*as\s+\w+|\{[^}]*\})\s*from\s*)?["']@blazetrails\/ruby-compat(\/[^"']+)?["']/g;

async function unionTarget(app: Measurement, map: Awaited<ReturnType<typeof sccMap>>) {
  const modules = new Set<string>();
  const wholeBarrel = new Set<string>();
  const exportsMap = JSON.parse(await readFile(join(RC_DIST, "../package.json"), "utf8")).exports;
  for (const file of app.files) {
    if (owner(file) === "ruby-compat" || !file.endsWith(".js")) continue;
    const src = stripComments(await readFile(file, "utf8"));
    for (const m of src.matchAll(RC_IMPORT)) {
      if (m[2]) {
        const target =
          exportsMap[`.${m[2]}`]?.default ?? exportsMap["./*"].default.replace("*", m[2].slice(1));
        const module = relative(RC_DIST, resolve(RC_DIST, "..", target));
        if (!(await stat(join(RC_DIST, module)).catch(() => null))) {
          throw new Error(
            `${relative(ROOT, file)}: @blazetrails/ruby-compat${m[2]} resolves to missing dist/${module}`,
          );
        }
        modules.add(module);
      } else if (!m[1] || m[1].startsWith("*")) {
        wholeBarrel.add(relative(ROOT, file));
      } else {
        for (const spec of m[1].slice(1, -1).split(",")) {
          const name = spec.trim().split(/\s+as\s+/)[0];
          const owning = map.bindings[name]?.module;
          if (owning) modules.add(owning);
        }
      }
    }
  }
  return {
    target: await rcLoaded(modules),
    withWholeBarrelImports: await rcLoaded(new Set([...modules, "index.js"])),
    wholeBarrelImports: [...wholeBarrel].sort(),
  };
}

async function main(): Promise<void> {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < MIN_NODE) {
    throw new Error(
      `boot-graph needs Node ${MIN_NODE}+ (have ${process.versions.node}): older Node truncates the app graph`,
    );
  }
  const args = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i === -1 ? undefined : args[i + 1];
  };
  const runs = Number(option("--runs") ?? 3);
  const entry = option("--entry");
  if (entry) {
    console.log(table(await measure(entry, runs)));
    return;
  }

  const app = await measure(APP_ENTRY, runs, join(ROOT, APP));
  console.log(table(app));
  const map = await sccMap();
  const union = await unionTarget(app, map);
  const rcTarget = union.target;
  const rcLoaded = app.packages["ruby-compat"]?.loaded ?? 0;
  const baseline = {
    app: APP_ENTRY,
    total: app.total,
    packages: Object.fromEntries(Object.entries(app.packages).map(([p, v]) => [p, v.loaded])),
    rubyCompatTarget: rcTarget,
    rubyCompatTargetWithWholeBarrelImports: union.withWholeBarrelImports,
    wholeBarrelImports: union.wholeBarrelImports,
    appTarget: app.total - (rcLoaded - rcTarget),
  };
  console.log(
    `\nruby-compat target (union of owning modules the app's consumers import): ${rcTarget}` +
      `; derived full-app target: ${baseline.appTarget}` +
      `\nwith the whole-barrel importers left as they are: ${union.withWholeBarrelImports}` +
      union.wholeBarrelImports.map((f) => `\n  whole barrel: ${f}`).join(""),
  );

  if (flag("--write")) {
    await writeFile(BASELINE, JSON.stringify(baseline, null, 2) + "\n");
    await writeFile(SCC_MAP, JSON.stringify(map, null, 2) + "\n");
    return;
  }

  const committed = JSON.parse(await readFile(BASELINE, "utf8")) as typeof baseline;
  const diffs: string[] = [];
  for (const pkg of new Set([
    ...Object.keys(committed.packages),
    ...Object.keys(baseline.packages),
  ])) {
    const was = committed.packages[pkg] ?? 0;
    const now = baseline.packages[pkg] ?? 0;
    if (was !== now) diffs.push(`  ${pkg}: ${was} → ${now}`);
  }
  if (committed.total !== baseline.total)
    diffs.push(`  total: ${committed.total} → ${baseline.total}`);
  console.log(
    diffs.length
      ? `\nDiff against baseline.json:\n${diffs.join("\n")}`
      : "\nMatches baseline.json.",
  );
  const committedMap = await readFile(SCC_MAP, "utf8");
  if (JSON.stringify(JSON.parse(committedMap)) !== JSON.stringify(map)) {
    console.error("scc-map.json is stale: rerun with --write.");
    process.exitCode = 1;
  }
  const allowed = committed.packages["ruby-compat"] ?? 0;
  if (rcLoaded > allowed) {
    console.error(
      `\nruby-compat loads ${rcLoaded} modules at app boot, above the baseline's ${allowed}. ` +
        "A new eager import reaches more of ruby-compat: import the subpath that owns the binding " +
        "(scripts/boot-graph/scc-map.json), or rerun with --write if the rise is intended.",
    );
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
