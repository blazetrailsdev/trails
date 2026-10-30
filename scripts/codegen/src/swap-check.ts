/**
 * "Could this generated file replace the hand-written one?" — for each generated
 * TS file that has a hand-written twin, copy it over the twin in a private copy
 * of packages/activerecord/src and typecheck the whole package (tests included).
 * Errors are split into ones inside the swapped file and ones it causes in other
 * files (consumers of an API the generated file spells differently).
 *
 *   pnpm tsx scripts/codegen/src/swap-check.ts [--workers 3] [--only substring]
 *
 * Writes packages/activerecord/codegen-out/swap-check.json.
 */
import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { GEN_DIR, PKG_DIR, ROOT } from "./gem.js";
import { promisify } from "node:util";

const run = promisify(execFile);
const PKG = PKG_DIR;
const GEN = path.join(GEN_DIR, "src");
const TSC = path.join(ROOT, "node_modules/.bin/tsc");

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const workers = Number(arg("--workers") ?? 3);
const only = arg("--only");

function list(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...list(p, base));
    else if (p.endsWith(".ts")) out.push(path.relative(base, p));
  }
  return out;
}

const files = list(GEN).filter(
  (f) =>
    !f.startsWith("codegen-") &&
    existsSync(path.join(PKG, "src", f)) &&
    (!only || f.includes(only)),
);

interface Result {
  file: string;
  inFile: number;
  elsewhere: number;
  elsewhereFiles: number;
  codes: Record<string, number>;
  samples: string[];
}

async function check(dir: string, file: string): Promise<Result> {
  const target = path.join(dir, "src", file);
  const orig = readFileSync(target);
  cpSync(path.join(GEN, file), target);
  let out = "";
  try {
    await run(TSC, ["-p", path.join(dir, "tsconfig.json")], { maxBuffer: 64 << 20 });
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? "";
  } finally {
    writeFileSync(target, orig);
  }
  const errs = out.split("\n").filter((l) => l.includes("error TS"));
  const rel = (l: string) => l.split("(")[0].replace(/^.*?src\//, "");
  const inFile = errs.filter((l) => rel(l) === file).length;
  const other = errs.filter((l) => rel(l) !== file);
  const codes: Record<string, number> = {};
  for (const l of errs) {
    const c = l.match(/error (TS\d+)/)?.[1] ?? "?";
    codes[c] = (codes[c] ?? 0) + 1;
  }
  const samples = errs.slice(0, 8).map((l) => l.replace(/^.*?src\//, "").slice(0, 220));
  return {
    file,
    inFile,
    elsewhere: other.length,
    elsewhereFiles: new Set(other.map(rel)).size,
    codes,
    samples,
  };
}

async function main() {
  // Copies live outside the git worktree (commit hooks stash/restore untracked
  // files there); node_modules are symlinked so package imports still resolve.
  const base = process.env.SWAP_DIR ?? path.join(process.env.TMPDIR ?? "/tmp", "codegen-swap");
  mkdirSync(base, { recursive: true });
  const rootNm = path.join(base, "node_modules");
  if (!existsSync(rootNm)) symlinkSync(path.join(ROOT, "node_modules"), rootNm);
  const dirs: string[] = [];
  for (let i = 0; i < workers; i++) {
    const d = path.join(base, `pkg-${i}`);
    rmSync(d, { recursive: true, force: true });
    mkdirSync(d, { recursive: true });
    symlinkSync(path.join(PKG, "node_modules"), path.join(d, "node_modules"));
    cpSync(path.join(PKG, "package.json"), path.join(d, "package.json"));
    cpSync(path.join(PKG, "src"), path.join(d, "src"), { recursive: true });
    for (const f of ["codegen-runtime.ts", "codegen-declined.ts"])
      cpSync(path.join(GEN, f), path.join(d, "src", f));
    writeFileSync(
      path.join(d, "tsconfig.json"),
      JSON.stringify({
        extends: path.join(PKG, "tsconfig.json"),
        compilerOptions: { noEmit: true, composite: false, incremental: false, rootDir: "src" },
        include: ["src"],
        exclude: ["src/test-helpers/fixtures/all/admin/**"],
      }),
    );
    dirs.push(d);
  }
  const queue = [...files];
  const results: Result[] = [];
  let done = 0;
  await Promise.all(
    dirs.map(async (d) => {
      for (let f = queue.shift(); f; f = queue.shift()) {
        results.push(await check(d, f));
        if (++done % 25 === 0) console.error(`${done}/${files.length}`);
      }
    }),
  );
  if (!process.env.KEEP) for (const d of dirs) rmSync(d, { recursive: true, force: true });
  results.sort((a, b) => a.file.localeCompare(b.file));
  const clean = results.filter((r) => r.inFile + r.elsewhere === 0);
  const selfClean = results.filter((r) => r.inFile === 0);
  const summary = {
    checked: results.length,
    dropInClean: clean.length,
    fileItselfClean: selfClean.length,
    totalErrors: results.reduce((a, r) => a + r.inFile + r.elsewhere, 0),
    clean: clean.map((r) => r.file),
  };
  writeFileSync(
    path.join(PKG, "codegen-out/swap-check.json"),
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify({ ...summary, clean: summary.clean.slice(0, 50) }, null, 2));
}

void main();
