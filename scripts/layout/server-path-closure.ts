/**
 * The server path is free of testing code (RFC 0223, owner ruling 2026-11-05).
 *
 * Testing code ships in `lib/` behind a package's testing subpath exports, as
 * Rails ships `active_support/testing/*` behind an opt-in `require`. A
 * production import of a package's `.` or any non-testing subpath export must
 * not reach, through the BUILT `dist/` import graph (static and dynamic
 * imports, across `@blazetrails/*` packages), a module that is:
 *
 * - the target of a testing export (a key with a `test` / `testing` / `tests`
 *   segment: `./testing/assertions`, `./log-subscriber/test-helper`);
 * - under a `testing/`, `test-helpers/` or `test/` directory, or a `.test.js`;
 * - or one that imports `vitest` or `@blazetrails/vitest-matchers` (a package
 *   that is test-only as a whole, so its own exports are not entries).
 *
 * Today's violations are `server-path-closure-exclude.json`, only-shrink: a new
 * violation reds, and so does a listed one that no longer occurs.
 *
 * Hard rules: no node:* imports, no process.* references, async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { moduleSpecifiers } from "../ruby-compat-leaf.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const EXCLUDE_JSON = path.join(ROOT_DIR, "scripts/layout/server-path-closure-exclude.json");

const SCOPE = "@blazetrails/";
const TEST_RUNNER_IMPORTS = new Set(["vitest", "@blazetrails/vitest-matchers"]);

type ExportTarget =
  | null
  | string
  | { import?: ExportTarget; default?: ExportTarget; node?: ExportTarget };

export interface PackageExports {
  name: string;
  dir: string;
  exports: Record<string, string>;
}

/**
 * Export keys whose `test` token names production code the gem loads at boot,
 * not a testing entry: `Mail::TestMailer` is a delivery method autoloaded by
 * `mail/network.rb` (vendor/mail/2.8.1/lib/mail/network.rb:11) and named by
 * `Configuration#lookup_delivery_method` (mail/configuration.rb:44), and
 * `Rails::TestUnitRailtie` is required by `rails/all.rb`
 * (vendor/rails/v8.0.2/railties/lib/rails/all.rb), loading no test framework.
 */
const SERVER_EXPORTS = new Set(["./network/delivery-methods/test-mailer", "./test-unit/trailtie"]);

/** True for an export key naming a testing entry. */
export function isTestingExport(key: string): boolean {
  if (SERVER_EXPORTS.has(key.replace(/\.js$/, ""))) return false;
  return key.split(/[/.*-]/).some((token) => ["test", "testing", "tests"].includes(token));
}

/** True for a built module path that is testing code by where it lives. */
export function isTestingPath(rel: string): boolean {
  return /(^|\/)(testing|test-helpers|test)\//.test(rel) || rel.endsWith(".test.js");
}

function runtimeTarget(target: ExportTarget | undefined): string | null {
  if (target === undefined || target === null) return null;
  if (typeof target === "string") return target.endsWith(".js") ? target : null;
  return runtimeTarget(target.import ?? target.node ?? target.default);
}

/** The text a pattern's single `*` stands for in `value`, or null when it does not match. */
export function wildcardMatch(pattern: string, value: string): string | null {
  const [head, tail] = pattern.replace(/^\.\//, "").split("*");
  const v = value.replace(/^\.\//, "");
  if (tail === undefined || !v.startsWith(head) || !v.endsWith(tail)) return null;
  if (v.length < head.length + tail.length) return null;
  return v.slice(head.length, v.length - tail.length);
}

export async function readPackages(root = ROOT_DIR): Promise<Map<string, PackageExports>> {
  const out = new Map<string, PackageExports>();
  for (const entry of await fs.readdir(path.join(root, "packages"))) {
    const dir = path.join(root, "packages", entry);
    let manifest: { name?: string; exports?: ExportTarget | Record<string, ExportTarget> };
    try {
      manifest = JSON.parse(await fs.readFile(path.join(dir, "package.json"), "utf-8"));
    } catch {
      continue;
    }
    const declared = manifest.exports;
    if (!manifest.name?.startsWith(SCOPE) || declared === undefined || declared === null) continue;
    if (TEST_RUNNER_IMPORTS.has(manifest.name)) continue;
    const raw =
      typeof declared === "string" || !Object.keys(declared)[0]?.startsWith(".")
        ? { ".": declared as ExportTarget }
        : (declared as Record<string, ExportTarget>);
    const exports: Record<string, string> = {};
    const patterns: [string, string | null][] = [];
    const blocked = new Set<string>();
    for (const [key, target] of Object.entries(raw)) {
      const file = runtimeTarget(target);
      if (key.includes("*")) patterns.push([key, file]);
      else if (file !== null) exports[key] = path.join(dir, file);
      else blocked.add(key);
    }
    if (patterns.length > 0) {
      const built = (await fs.readdir(path.join(dir, "dist"), { recursive: true }).catch(() => []))
        .filter((rel) => rel.endsWith(".js"))
        .map((rel) => `dist/${rel}`);
      const excluded = patterns.filter(([, file]) => file === null).map(([key]) => key);
      for (const [key, file] of patterns) {
        if (file === null) continue;
        for (const rel of built) {
          const stem = wildcardMatch(file, rel);
          if (stem === null) continue;
          const expanded = key.replace("*", stem);
          if (
            expanded in exports ||
            blocked.has(expanded) ||
            excluded.some((k) => wildcardMatch(k, expanded) !== null)
          ) {
            continue;
          }
          exports[expanded] = path.join(dir, rel);
        }
      }
    }
    out.set(manifest.name, { name: manifest.name, dir, exports });
  }
  return out;
}

function resolveBare(specifier: string, packages: Map<string, PackageExports>): string | null {
  if (!specifier.startsWith(SCOPE)) return null;
  const [scope, name, ...rest] = specifier.split("/");
  const pkg = packages.get(`${scope}/${name}`);
  if (!pkg) return null;
  return pkg.exports[rest.length === 0 ? "." : `./${rest.join("/")}`] ?? null;
}

export interface Violation {
  /** Repo-relative path of the testing module reached. */
  module: string;
  /** The first non-testing export that reaches it, and the import chain. */
  chain: string[];
}

export async function findViolations(root = ROOT_DIR): Promise<Violation[]> {
  const packages = await readPackages(root);
  const testingEntries = new Set<string>();
  for (const pkg of packages.values()) {
    for (const [key, file] of Object.entries(pkg.exports)) {
      if (isTestingExport(key)) testingEntries.add(file);
    }
  }
  const found = new Map<string, Violation>();
  const visited = new Set<string>();
  for (const pkg of [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    for (const [key, entry] of Object.entries(pkg.exports).sort()) {
      if (isTestingExport(key)) continue;
      const label = key === "." ? pkg.name : `${pkg.name}/${key.slice(2)}`;
      const queue: [string, string[]][] = [[entry, [label]]];
      while (queue.length > 0) {
        const [file, chain] = queue.shift()!;
        if (visited.has(file)) continue;
        visited.add(file);
        const rel = path.relative(root, file);
        const source = await fs.readFile(file, "utf-8").catch(() => null);
        if (source === null) continue;
        const specifiers = moduleSpecifiers(source).map((s) => s.specifier);
        const testing =
          testingEntries.has(file) ||
          isTestingPath(path.relative(path.join(file.split("/dist/")[0], "dist"), file)) ||
          specifiers.some((s) => TEST_RUNNER_IMPORTS.has(s));
        if (testing) {
          if (!found.has(rel)) found.set(rel, { module: rel, chain: [...chain, rel] });
          continue;
        }
        for (const specifier of specifiers) {
          const next = specifier.startsWith(".")
            ? path.resolve(path.dirname(file), specifier)
            : resolveBare(specifier, packages);
          if (next !== null) queue.push([next, [...chain, rel]]);
        }
      }
    }
  }
  return [...found.values()].sort((a, b) => a.module.localeCompare(b.module));
}

/** The only-shrink ledger: each story id, and the testing modules on the server path it removes. */
export type ExcludeList = Record<string, string[]>;

export async function main(root = ROOT_DIR): Promise<string> {
  const violations = await findViolations(root);
  const ledger = JSON.parse(await fs.readFile(EXCLUDE_JSON, "utf-8")) as ExcludeList;
  const listed = new Set(Object.values(ledger).flat());
  const added = violations.filter((v) => !listed.has(v.module));
  const current = new Set(violations.map((v) => v.module));
  const stale = [...listed].filter((m) => !current.has(m));
  if (added.length > 0 || stale.length > 0) {
    throw new Error(
      "server-path-closure: " +
        added
          .map((v) => `\n  NEW testing module on the server path: ${v.chain.join(" → ")}`)
          .join("") +
        stale.map((m) => `\n  STALE exclude row (no longer reached; delete it): ${m}`).join("") +
        "\nMove the import behind the package's testing export (RFC 0223).",
    );
  }
  return `server-path-closure: OK (${violations.length} listed violation(s) remain)`;
}
