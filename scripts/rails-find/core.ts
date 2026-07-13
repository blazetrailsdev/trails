/**
 * Core lookup for `pnpm rails:find` — map a trails test name or method/constant
 * to a vendored Rails `file:line`, so fidelity work needn't hand-grep
 * `vendor/rails/`. Reuses the manifests the existing pipelines emit
 * (test-compare's `rails-tests.json`, api-compare's `rails-api.json`) and falls
 * back to a scoped grep of `vendor/rails/activerecord/` when neither hits.
 *
 * Constraints (mirrors scripts/api-compare/shared-cache.ts): async fs only, no
 * `node:` specifiers, no `process` — pure I/O over the root bin.ts supplies, so
 * it resolves against ANY worktree and stays unit-testable.
 */
import * as fs from "fs/promises";
import * as path from "path";

import type { ApiManifest } from "../api-compare/types.js";
import type { TestCaseInfo, TestManifest } from "../test-compare/types.js";

/** Where each result came from — printed so the caller knows how it matched. */
export type FindMode = "test" | "method" | "constant" | "grep";

export interface FindResult {
  mode: FindMode;
  /** Path relative to the worktree root (POSIX), e.g. `vendor/rails/...`. */
  file: string;
  line: number;
  /** Test path, qualified method name, or the matched source line. */
  label: string;
  /** The name/description equalled the query (vs merely contained it). */
  exact: boolean;
}

// Per-package base dir (relative to the worktree root) for vendored test cases
// and lib source. Mirrors `vendor/sources.ts` (`vendor:fetch --print-{test,lib}
// -paths`); static so the lookup needs no subprocess, and relative so joining
// with the CURRENT root resolves in any worktree. Add a row per new vendored gem.
export const TEST_BASE: Record<string, string> = {
  arel: "vendor/rails/activerecord/test/cases/arel",
  activerecord: "vendor/rails/activerecord/test/cases",
  activemodel: "vendor/rails/activemodel/test/cases",
  activesupport: "vendor/rails/activesupport/test",
  actiondispatch: "vendor/rails/actionpack/test",
  actioncontroller: "vendor/rails/actionpack/test",
  abstractcontroller: "vendor/rails/actionpack/test/abstract",
  actionview: "vendor/rails/actionview/test",
  trailties: "vendor/rails/railties/test",
  rack: "vendor/rack/test",
  "did-you-mean": "vendor/did_you_mean/test",
  globalid: "vendor/globalid/test/cases",
};

export const LIB_BASE: Record<string, string> = {
  arel: "vendor/rails/activerecord/lib/arel",
  activerecord: "vendor/rails/activerecord/lib/active_record",
  activemodel: "vendor/rails/activemodel/lib/active_model",
  activesupport: "vendor/rails/activesupport/lib/active_support",
  actiondispatch: "vendor/rails/actionpack/lib/action_dispatch",
  actioncontroller: "vendor/rails/actionpack/lib/action_controller",
  abstractcontroller: "vendor/rails/actionpack/lib/abstract_controller",
  actionpackversion: "vendor/rails/actionpack/lib/action_pack",
  actionview: "vendor/rails/actionview/lib/action_view",
  trailties: "vendor/rails/railties/lib/rails",
  rack: "vendor/rack/lib/rack",
  "did-you-mean": "vendor/did_you_mean/lib/did_you_mean",
  globalid: "vendor/globalid/lib/global_id",
};

export const TEST_MANIFEST = "scripts/test-compare/output/rails-tests.json";
export const API_MANIFEST = "scripts/api-compare/output/rails-api.json";

// Bumped by `pnpm vendor:fetch` whenever the pinned Rails/gem versions change;
// a manifest older than it was built against a prior vendor tree and may be
// stale. (New trails tests/methods can also stale it, but the vendored version
// is the coarse, always-present signal — cf. api-compare's ts-cache drift.)
export const LOCKFILE = "vendor/sources.lock.json";

/** Grep fallback is scoped here — the fidelity work that drives this is AR. */
const GREP_SCOPE = "vendor/rails/activerecord";
const MAX_GREP_RESULTS = 40;

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

async function mtimeMs(root: string, rel: string): Promise<number | null> {
  try {
    return (await fs.stat(path.join(root, rel))).mtimeMs;
  } catch {
    return null;
  }
}

async function readJson<T>(root: string, rel: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(root, rel), "utf-8")) as T;
  } catch {
    return null;
  }
}

// ── Test-name lookup (reuses test-compare's rails-tests.json) ──

// A test matches when the query (case-insensitive) equals ("exact") or is a
// substring ("partial") of its description, qualified path, or the Rails method
// name Minitest derives from the description — so a trails description ("has
// primary key") and the Rails method name (`test_has_primary_key`) both hit.
// Rails builds that name as `test_#{name.gsub(/\s+/, '_')}` — collapsing
// whitespace runs ONLY, preserving case and punctuation (activesupport/lib/
// active_support/testing/declarative.rb). Replicate it exactly (lowercased,
// since `needle` is), not a broader sanitize, or punctuation-bearing
// descriptions ("doesn't …", "a != b") would diverge from the real method name.
function testMatch(tc: TestCaseInfo, needle: string): "exact" | "partial" | false {
  const desc = tc.description.toLowerCase();
  const railsName = ("test_" + tc.description.replace(/\s+/g, "_")).toLowerCase();
  if (desc === needle || railsName === needle) return "exact";
  if (desc.includes(needle) || railsName.includes(needle) || tc.path.toLowerCase().includes(needle))
    return "partial";
  return false;
}

export function findTests(manifest: TestManifest, query: string): FindResult[] {
  const needle = query.toLowerCase();
  const results: FindResult[] = [];
  for (const [pkg, info] of Object.entries(manifest.packages)) {
    const base = TEST_BASE[pkg];
    if (!base) continue;
    for (const tf of info.files) {
      for (const tc of tf.testCases) {
        const m = testMatch(tc, needle);
        if (m) {
          results.push({
            mode: "test",
            file: toPosix(path.join(base, tf.file)),
            line: tc.line,
            label: tc.path,
            exact: m === "exact",
          });
        }
      }
    }
  }
  return sortResults(results);
}

// Exact matches first, then alphabetically by label — stable across runs.
function sortResults(results: FindResult[]): FindResult[] {
  return results.sort(
    (a, b) => Number(b.exact) - Number(a.exact) || a.label.localeCompare(b.label),
  );
}

// ── Method / constant lookup (reuses api-compare's rails-api.json) ──

type Method = { name: string; file?: string; line?: number };

export function findMethods(manifest: ApiManifest, query: string): FindResult[] {
  const needle = query.toLowerCase();
  const results: FindResult[] = [];
  for (const [pkg, info] of Object.entries(manifest.packages)) {
    const base = LIB_BASE[pkg];
    if (!base) continue;
    const pushMethod = (owner: string, m: Method, isStatic: boolean) => {
      if (!m.file) return;
      const name = m.name.toLowerCase();
      if (name !== needle && !name.includes(needle)) return;
      results.push({
        mode: "method",
        file: toPosix(path.join(base, m.file)),
        line: m.line ?? 0,
        label: `${owner}${isStatic ? "." : "#"}${m.name}`,
        exact: name === needle,
      });
    };
    for (const group of [info.classes, info.modules]) {
      for (const [owner, ci] of Object.entries(group)) {
        for (const m of ci.instanceMethods) pushMethod(owner, m, false);
        for (const m of ci.classMethods) pushMethod(owner, m, true);
      }
    }
    for (const [file, consts] of Object.entries(info.fileConstants ?? {})) {
      for (const cname of Object.keys(consts)) {
        const name = cname.toLowerCase();
        if (name !== needle && !name.includes(needle)) continue;
        results.push({
          mode: "constant",
          file: toPosix(path.join(base, file)),
          line: 0,
          label: cname,
          exact: name === needle,
        });
      }
    }
  }
  return sortResults(results);
}

// ── Grep fallback (pure fs walk of vendor/rails/activerecord) ──

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(full)));
    } else if (e.name.endsWith(".rb")) {
      out.push(full);
    }
  }
  return out;
}

export async function grepVendor(root: string, query: string): Promise<FindResult[]> {
  const scope = path.join(root, GREP_SCOPE);
  const files = await walk(scope);
  const needle = query.toLowerCase();
  const results: FindResult[] = [];
  for (const file of files) {
    let text;
    try {
      text = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        results.push({
          mode: "grep",
          file: toPosix(path.relative(root, file)),
          line: i + 1,
          label: lines[i].trim(),
          exact: false,
        });
        if (results.length >= MAX_GREP_RESULTS) return results;
      }
    }
  }
  return results;
}

// ── Orchestration ──

/** Per-mode cap on displayed matches; excess is counted in `suppressed`. */
export const MAX_PER_MODE = 25;

export interface FindOutput {
  results: FindResult[];
  /** Which mode(s) actually produced results, in priority order. */
  modes: FindMode[];
  /** True when substring hits were dropped because exact hits existed. */
  exactOnly: boolean;
  /** How many matches were dropped by the exact filter + per-mode cap. */
  suppressed: number;
  /**
   * Manifest paths that predate `vendor/sources.lock.json` — i.e. built against
   * an older vendor tree, so their `file:line` may be stale. Empty when fresh
   * or when the manifest fell back to grep. Rebuild via `run.sh --refresh`.
   */
  stale: string[];
}

export interface FindOptions {
  /** Keep substring hits even when exact ones exist, and lift the per-mode cap. */
  all?: boolean;
}

// Index hits (test + method/constant) win; grep runs only when neither hits. A
// missing manifest simply skips that mode. When exact hits exist we drop the
// substring noise (e.g. a `find_by` query buried under 100 test descriptions
// that merely contain "find_by") unless `all` is set. Each mode is then capped.
export async function railsFind(
  root: string,
  query: string,
  opts: FindOptions = {},
): Promise<FindOutput> {
  const [testManifest, apiManifest] = await Promise.all([
    readJson<TestManifest>(root, TEST_MANIFEST),
    readJson<ApiManifest>(root, API_MANIFEST),
  ]);

  let results: FindResult[] = [];
  if (testManifest) results.push(...findTests(testManifest, query));
  if (apiManifest) results.push(...findMethods(apiManifest, query));
  if (results.length === 0) results = await grepVendor(root, query);

  // Flag any USED manifest whose mtime predates the vendor lockfile — its
  // file:line may point into a since-changed Rails tree.
  const lockMs = await mtimeMs(root, LOCKFILE);
  const stale: string[] = [];
  for (const [manifest, present, used] of [
    [TEST_MANIFEST, testManifest, results.some((r) => r.mode === "test")],
    [API_MANIFEST, apiManifest, results.some((r) => r.mode === "method" || r.mode === "constant")],
  ] as const) {
    if (lockMs === null || !present || !used) continue;
    const m = await mtimeMs(root, manifest);
    if (m !== null && m < lockMs) stale.push(manifest);
  }

  const total = results.length;
  const exactOnly = !opts.all && results.some((r) => r.exact);
  if (exactOnly) results = results.filter((r) => r.exact);

  if (!opts.all) {
    const perMode = new Map<FindMode, number>();
    results = results.filter((r) => {
      const n = (perMode.get(r.mode) ?? 0) + 1;
      perMode.set(r.mode, n);
      return n <= MAX_PER_MODE;
    });
  }

  const modes = [...new Set(results.map((r) => r.mode))];
  return { results, modes, exactOnly, suppressed: total - results.length, stale };
}
