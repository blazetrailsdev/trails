/**
 * AR/AM require closure.
 *
 * The project's scope for the support gems (activesupport, i18n, globalid,
 * date, did-you-mean) is not the whole gem — it is the set of files
 * ActiveRecord and ActiveModel actually `require`. Rolling up whole packages
 * mixes in hundreds of out-of-scope members (actionpack's share of
 * activesupport, i18n's backends, …) and understates parity for the code the
 * data layer depends on.
 *
 * This module derives that set by walking `require "…"` lines from
 * `vendor/rails/{activerecord,activemodel}/lib` transitively. Umbrella files
 * (`active_support.rb`, `active_support/rails.rb`,
 * `active_support/core_ext/array.rb`, …) are require-lists themselves, so the
 * transitive walk expands them without a hand-written list.
 *
 * The result is written to `output/ar-closure.json` and read by compare.ts to
 * print the "AR closure" rollup. Regenerating from vendor/rails means a moved
 * `require` changes the scope with no code change.
 */

import * as fs from "fs";
import * as path from "path";
import { SOURCES } from "../../vendor/sources.js";
import { OUTPUT_DIR, ROOT_DIR } from "./config.js";

/** Packages measured whole — the data layer itself. */
export const DATA_LAYER_PACKAGES = ["arel", "activemodel", "activerecord"];

/** `require "x"` / `require "x"` with a trailing comment; not require_relative. */
const REQUIRE_RE = /^\s*require\s+["']([^"']+)["']/;

/**
 * Entry points whose requires seed the closure — the data layer's own lib
 * trees. `activerecord/lib/rails` (the generators) is deliberately left out:
 * it pulls railties and actionpack in behind it, which are not data-layer
 * scope.
 */
const SEED_DIRS = [
  "activerecord/lib/active_record",
  "activerecord/lib/arel",
  "activemodel/lib/active_model",
];
const SEED_FILES = [
  "activerecord/lib/active_record.rb",
  "activerecord/lib/arel.rb",
  "activemodel/lib/active_model.rb",
];

interface GemRoot {
  /** api-compare package key, e.g. "activesupport". */
  package: string;
  /** Absolute path of the gem's `lib` dir — what a `require` resolves against. */
  libDir: string;
  /** Absolute path of the package root — what a rubyFile is relative to. */
  packageRoot: string;
}

/**
 * Support gems whose files enter the closure one at a time. The data-layer
 * packages are rolled up whole, and the web-layer gems are out of scope, so a
 * require reaching either resolves to nothing and stops the walk there.
 */
const CLOSURE_PACKAGES = ["activesupport", "date", "i18n", "globalid", "did-you-mean"];

function gemRoots(rootDir: string): GemRoot[] {
  const roots: GemRoot[] = [];
  for (const source of SOURCES) {
    for (const pkg of source.packages) {
      if (!CLOSURE_PACKAGES.includes(pkg.name)) continue;
      const packageRoot = path.join(rootDir, "vendor", source.name, pkg.libPath);
      const segments = pkg.libPath.split("/");
      const libIndex = segments.lastIndexOf("lib");
      if (libIndex === -1) continue;
      const libDir = path.join(rootDir, "vendor", source.name, ...segments.slice(0, libIndex + 1));
      roots.push({ package: pkg.name, libDir, packageRoot });
    }
  }
  return roots;
}

function walkRubyFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkRubyFiles(full, out);
    else if (entry.name.endsWith(".rb")) out.push(full);
  }
  return out;
}

function requiresIn(filePath: string): string[] {
  const out: string[] = [];
  for (const line of fs.readFileSync(filePath, "utf-8").split("\n")) {
    const m = REQUIRE_RE.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Resolve a Ruby require path to a vendored .rb file, or null if unvendored. */
function resolveRequire(req: string, roots: GemRoot[]): string | null {
  for (const root of roots) {
    const candidate = path.join(root.libDir, `${req}.rb`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export interface ArClosure {
  /** package → sorted rubyFile paths (relative to the package root). */
  files: Record<string, string[]>;
}

/**
 * Walk the AR/AM requires transitively and return the support-gem file set.
 *
 * `rootDir` is the repo root the vendored gems hang off; the tests point it at
 * a synthetic vendor tree so the derivation is asserted without a populated
 * `vendor/rails` (the Unit Tests job does not fetch one).
 */
export function deriveArClosure(rootDir: string = ROOT_DIR): ArClosure {
  const roots = gemRoots(rootDir);
  const seeds: string[] = SEED_FILES.map((f) => path.join(rootDir, "vendor/rails", f)).filter((f) =>
    fs.existsSync(f),
  );
  for (const dir of SEED_DIRS) {
    seeds.push(...walkRubyFiles(path.join(rootDir, "vendor/rails", dir)));
  }

  const visited = new Set<string>();
  const queue: string[] = [];
  for (const seed of seeds) {
    for (const req of requiresIn(seed)) {
      const resolved = resolveRequire(req, roots);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }

  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const req of requiresIn(file)) {
      const resolved = resolveRequire(req, roots);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }

  const files: Record<string, string[]> = {};
  for (const file of visited) {
    for (const root of roots) {
      const rel = path.relative(root.packageRoot, file);
      // An umbrella entrypoint like lib/active_support.rb sits above the
      // package root, so it escapes with "..": it seeds the walk but is not
      // itself part of the compared population.
      if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
      (files[root.package] ??= []).push(rel);
      break;
    }
  }
  for (const list of Object.values(files)) list.sort();

  return { files };
}

/** Regenerate the artifact from vendor/rails and return it. */
export function writeArClosure(): ArClosure {
  const closure = deriveArClosure();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "ar-closure.json"),
    `${JSON.stringify(closure, null, 2)}\n`,
  );
  return closure;
}

/**
 * The `--closure` row filter: restrict a package's per-file detail rows to the
 * files in the AR closure.
 *
 * Data-layer packages (arel/activemodel/activerecord) are the closure's own
 * seed — every one of their files is in scope — so they pass through whole and
 * the flag only ever narrows a SUPPORT gem. The input array is never mutated
 * and the summary denominators are computed from it, not from the result: the
 * flag filters rows, never totals.
 */
export function filterFilesToClosure<T extends { rubyFile: string }>(
  files: readonly T[],
  closureFiles: readonly string[] | undefined,
  isDataLayer: boolean,
): T[] {
  if (isDataLayer) return [...files];
  const inClosure = new Set(closureFiles ?? []);
  return files.filter((f) => inClosure.has(f.rubyFile));
}
