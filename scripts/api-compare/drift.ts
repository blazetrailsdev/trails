#!/usr/bin/env -S npx tsx
/**
 * Cross-version Rails API drift report (upgrade worklist): `pnpm api:drift
 * --ref <tag>`. Scopes a future bump off our v8.0.2 pin: fetches the ref
 * reproducibly (own lock entry in output/drift.lock.json — the canonical pin
 * stays the single active source), extracts its Ruby API to
 * output/rails-api@<ref>.json, diffs it against output/rails-api.json via the
 * pure version-diff.ts core, annotates against the ported surface
 * (output/ts-api.json), and writes output/version-drift.json. Prereq: api:compare.
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SOURCES } from "../../vendor/sources.js";
import { diffGemList, gemNamesFromPaths } from "./gem-list.js";
import type { ApiManifest } from "./types.js";
import { annotateAgainstTs, diffManifests } from "./version-diff.js";

const execFileAsync = promisify(execFile);

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DIR, "../..");
const OUTPUT_DIR = join(DIR, "output");
const DRIFT_LOCK = join(OUTPUT_DIR, "drift.lock.json");

// The drift report scopes the Rails bump, so it tracks the `rails` source only.
const RAILS = SOURCES.find((s) => s.name === "rails");
if (!RAILS) throw new Error("vendor/sources.ts: no `rails` source — drift report cannot run");

type DriftLock = { refs: Record<string, { ref: string; sha: string }> };

async function gitSha(cwd: string): Promise<string> {
  return (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
}

/** Clone (or reuse) the rails repo at `ref` under output/, reconcile its own
 *  lock entry (output/drift.lock.json — separate from the canonical pin), and
 *  return the clone root + resolved sha. A clone disagreeing with the lock is discarded. */
async function fetchRef(ref: string): Promise<{ dest: string; sha: string }> {
  const dest = join(OUTPUT_DIR, `drift-src-${ref.replace(/[^A-Za-z0-9._-]/g, "_")}`);
  const lock: DriftLock = existsSync(DRIFT_LOCK)
    ? JSON.parse(await readFile(DRIFT_LOCK, "utf8"))
    : { refs: {} };
  const pinned = lock.refs[ref];

  let sha: string;
  if (existsSync(join(dest, ".git"))) {
    sha = await gitSha(dest);
    if (pinned && pinned.sha !== sha) {
      console.log(`[drift] ${ref} drifted from lock (${sha.slice(0, 12)}); re-cloning`);
      await rm(dest, { recursive: true, force: true });
    } else {
      console.log(`[drift] reusing ${ref} at ${sha.slice(0, 12)}`);
    }
  }
  if (!existsSync(join(dest, ".git"))) {
    console.log(`[drift] cloning ${RAILS!.origin.url}@${ref}...`);
    await mkdir(OUTPUT_DIR, { recursive: true });
    await execFileAsync("git", ["clone", "--depth=1", "--branch", ref, RAILS!.origin.url, dest]);
    sha = await gitSha(dest);
    if (pinned && pinned.sha !== sha) {
      await rm(dest, { recursive: true, force: true });
      throw new Error(
        `[drift] ${ref} resolved ${sha} but drift.lock pins ${pinned.sha}; upstream re-tagged?`,
      );
    }
    console.log(`[drift] cloned at ${sha.slice(0, 12)}`);
  }
  lock.refs[ref] = { ref, sha: sha! };
  const sorted: DriftLock = { refs: {} };
  for (const k of Object.keys(lock.refs).sort()) sorted.refs[k] = lock.refs[k];
  await writeFile(DRIFT_LOCK, JSON.stringify(sorted, null, 2) + "\n");
  return { dest, sha: sha! };
}

/** Map of `rails` package → absolute lib dir inside the target clone. */
function libPathsFor(cloneRoot: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pkg of RAILS!.packages) {
    if (pkg.compareApi === false) continue;
    out[pkg.name] = join(cloneRoot, pkg.libPath);
  }
  return out;
}
async function extractTargetApi(cloneRoot: string, ref: string): Promise<string> {
  const outPath = join(OUTPUT_DIR, `rails-api@${ref}.json`);
  console.log(`[drift] extracting Ruby API @ ${ref}...`);
  const { stdout, stderr } = await execFileAsync("ruby", [join(DIR, "extract-ruby-api.rb")], {
    env: {
      ...process.env,
      LIB_PATHS_JSON: JSON.stringify(libPathsFor(cloneRoot)),
      LOCKFILE_PATH: join(ROOT, "vendor/sources.lock.json"),
      RUBY_API_OUTPUT_PATH: outPath,
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return outPath;
}
/** Collect monorepo gemspec paths (relative to the clone root): the root
 *  `rails.gemspec` plus each top-level subgem's `<gem>/<gem>.gemspec`. */
async function gemspecPaths(cloneRoot: string): Promise<string[]> {
  const paths: string[] = [];
  const entries = await readdir(cloneRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".gemspec")) paths.push(entry.name);
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const sub = await readdir(join(cloneRoot, entry.name), { withFileTypes: true });
    for (const child of sub) {
      if (child.isFile() && child.name.endsWith(".gemspec")) {
        paths.push(`${entry.name}/${child.name}`);
      }
    }
  }
  return paths;
}

/** Gem-level add/remove between the base pin and the target ref, derived from
 *  each ref's monorepo subgem list. Surfaces whole-gem drift that
 *  `diffManifests` can't see (it only diffs gems present in both manifests).
 *  The base list comes from the vendored source `api:compare` already fetched
 *  (`vendor/rails`, the exact pin `rails-api.json` was extracted from) — not a
 *  re-clone — so it can't disagree with the base manifest. */
async function gemListDelta(targetClone: string) {
  const baseSource = join(ROOT, "vendor", RAILS!.name);
  if (!existsSync(baseSource)) {
    throw new Error(`missing ${baseSource} — run \`pnpm api:compare\` first`);
  }
  const [baseGems, targetGems] = await Promise.all([
    gemspecPaths(baseSource).then(gemNamesFromPaths),
    gemspecPaths(targetClone).then(gemNamesFromPaths),
  ]);
  return diffGemList(baseGems, targetGems);
}

async function readManifest(path: string): Promise<ApiManifest> {
  if (!existsSync(path)) throw new Error(`missing ${path} — run \`pnpm api:compare\` first`);
  return JSON.parse(await readFile(path, "utf8")) as ApiManifest;
}

export async function runDrift(ref: string): Promise<string> {
  const base = await readManifest(join(OUTPUT_DIR, "rails-api.json"));
  const ts = await readManifest(join(OUTPUT_DIR, "ts-api.json"));
  const { dest, sha } = await fetchRef(ref);
  const target = await readManifest(await extractTargetApi(dest, ref));
  // diffManifests only diffs packages both manifests carry, so the extra
  // non-rails gems in the base/ts manifests (rack, globalid, …) drop out.
  const drift = annotateAgainstTs(diffManifests(base, target), ts);
  // Whole-gem add/remove is invisible to diffManifests; derive it from the
  // monorepo subgem list at each ref so a bump that adds or drops a gem shows up.
  const gemDelta = await gemListDelta(dest);
  const report = {
    baseRef: RAILS!.origin.ref,
    targetRef: ref,
    targetSha: sha,
    generatedAt: new Date().toISOString(),
    addedPackages: gemDelta.addedPackages,
    removedPackages: gemDelta.removedPackages,
    ...drift,
  };
  const outPath = join(OUTPUT_DIR, "version-drift.json");
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n");
  const s = drift.summary;
  console.log(
    `\n[drift] ${RAILS!.origin.ref} → ${ref}: +${s.addedClasses}/-${s.removedClasses} classes, ` +
      `${s.signatureChanges} signature, ${s.visibilityChanges} visibility, ${s.callSetChanges} ` +
      `call-set changes (${s.portedAffected} affect ported surface); ` +
      `+${gemDelta.addedPackages.length}/-${gemDelta.removedPackages.length} gems` +
      `\n[drift] written to ${outPath}`,
  );
  return outPath;
}

function parseRef(argv: string[]): string {
  const i = argv.indexOf("--ref");
  if (i === -1 || !argv[i + 1]) {
    throw new Error("usage: pnpm api:drift --ref <tag>   (e.g. --ref v8.1.3)");
  }
  return argv[i + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDrift(parseRef(process.argv.slice(2))).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
