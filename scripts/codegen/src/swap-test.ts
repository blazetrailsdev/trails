/**
 * Behavioral replaceability: for generated files that swap in with zero type
 * errors (swap-check.json), copy each over its hand-written twin in the real
 * tree, run that file's own test files (`<name>.test.ts`, `<name>.trails.test.ts`)
 * with vitest, and restore the hand file. Sequential; the hand file is restored
 * in `finally`, and a leftover `.codegen-backup` aborts the run.
 *
 *   pnpm tsx scripts/codegen/src/swap-test.ts [--limit N]
 *
 * Writes packages/activerecord/codegen-out/swap-test.json.
 */
import { execFile } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { GEN_DIR, PKG_DIR, ROOT } from "./gem.js";
import { promisify } from "node:util";

const run = promisify(execFile);
const PKG = PKG_DIR;
const GEN = path.join(GEN_DIR, "src");

async function main() {
  const li = process.argv.indexOf("--limit");
  const limit = li >= 0 ? Number(process.argv[li + 1]) : Infinity;
  const swap = JSON.parse(readFileSync(path.join(PKG, "codegen-out/swap-check.json"), "utf8"));
  const clean: string[] = swap.summary.clean;
  const results: {
    file: string;
    tests: string[];
    passed?: number;
    failed?: number;
    error?: string;
  }[] = [];
  for (const f of clean.slice(0, limit)) {
    const dir = path.join(PKG, "src", path.dirname(f));
    const base = path.basename(f, ".ts");
    const tests = readdirSync(dir)
      .filter((e) => e === `${base}.test.ts` || e === `${base}.trails.test.ts`)
      .map((e) => path.join(path.relative(ROOT, PKG), "src", path.dirname(f), e));
    if (!tests.length) {
      results.push({ file: f, tests: [] });
      continue;
    }
    const target = path.join(PKG, "src", f);
    const backup = target + ".codegen-backup";
    if (existsSync(backup)) throw new Error(`leftover backup ${backup}; restore it by hand`);
    renameSync(target, backup);
    const helpers = ["codegen-runtime.ts", "codegen-declined.ts"].map((h) =>
      path.join(PKG, "src", h),
    );
    try {
      copyFileSync(path.join(GEN, f), target);
      for (const h of helpers) copyFileSync(path.join(GEN, path.basename(h)), h);
      let out = "";
      try {
        const r = await run("pnpm", ["vitest", "run", ...tests], {
          cwd: ROOT,
          maxBuffer: 64 << 20,
        });
        out = r.stdout + r.stderr;
      } catch (e) {
        out = ((e as { stdout?: string }).stdout ?? "") + ((e as { stderr?: string }).stderr ?? "");
      }
      const passed = Number(out.match(/Tests\s+(?:\d+ failed \| )?(\d+) passed/)?.[1] ?? 0);
      const failed = Number(out.match(/Tests\s+(\d+) failed/)?.[1] ?? 0);
      const error =
        !passed && !failed
          ? out
              .split("\n")
              .find((l) => /Error|error/.test(l))
              ?.slice(0, 200)
          : undefined;
      results.push({ file: f, tests, passed, failed, ...(error ? { error } : {}) });
      console.log(`${f}: ${passed} passed, ${failed} failed${error ? " — " + error : ""}`);
    } finally {
      renameSync(backup, target);
      for (const h of helpers) if (existsSync(h)) (await import("node:fs")).rmSync(h);
    }
  }
  const withTests = results.filter((r) => r.tests.length);
  const allPass = withTests.filter((r) => (r.passed ?? 0) > 0 && !r.failed && !r.error);
  const summary = {
    clean: clean.length,
    withTests: withTests.length,
    allTestsPass: allPass.length,
    files: allPass.map((r) => r.file),
  };
  writeFileSync(
    path.join(PKG, "codegen-out/swap-test.json"),
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}

void main();
