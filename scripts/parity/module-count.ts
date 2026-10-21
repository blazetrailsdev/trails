/**
 * The ruby-compat `Module` ratchet (RFC 0197).
 *
 * Counts, per package outside ruby-compat, the `.ts` lines under its `src`
 * (tests included) that build a `new Module(`, call `.superMethod(`, or import
 * `Module` from `@blazetrails/ruby-compat`, and fails when any count is above
 * its mark in `module-count-mark.json`. The marks only go down: `--tighten`
 * writes each one DOWN to the current count and never up, and there is no
 * reseed. The file is deleted together with the class
 * (`delete-ruby-compat-module-class-final`).
 *
 * Line-based: an import whose `Module` specifier sits on its own line is read
 * through the whole import statement, so a multi-line import still counts once.
 *
 * Hard rules: no node:* imports, no process.*, async fs only, no third-party
 * runtime deps. The entry point throws on failure, which is the exit status.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MARK_FILE = path.join(ROOT_DIR, "scripts/parity/module-count-mark.json");

export const KINDS = ["newModule", "superMethod", "moduleImport"] as const;
export type Kind = (typeof KINDS)[number];
export type Counts = Record<Kind, number>;
export type Marks = Record<string, Counts>;

const NEW_MODULE_RE = /\bnew Module\(/;
const SUPER_METHOD_RE = /\.superMethod\(/;
const IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"@blazetrails\/ruby-compat"/g;
const MODULE_SPECIFIER_RE = /^(?:type\s+)?Module(?:\s+as\s+\w+)?$/;

export function countText(text: string): Counts {
  const counts: Counts = { newModule: 0, superMethod: 0, moduleImport: 0 };
  for (const line of text.split("\n")) {
    if (NEW_MODULE_RE.test(line)) counts.newModule++;
    if (SUPER_METHOD_RE.test(line)) counts.superMethod++;
  }
  for (const [, specifiers] of text.matchAll(IMPORT_RE)) {
    if (specifiers.split(",").some((s) => MODULE_SPECIFIER_RE.test(s.trim()))) {
      counts.moduleImport++;
    }
  }
  return counts;
}

async function listSources(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === "node_modules" || d.name === "dist") continue;
      out.push(...(await listSources(full)));
    } else if (d.isFile() && d.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** The working tree's counts, per package with any non-zero count. */
export async function measure(root = ROOT_DIR): Promise<Marks> {
  const out: Marks = {};
  const packagesDir = path.join(root, "packages");
  for (const pkg of (await fs.readdir(packagesDir)).sort()) {
    if (pkg === "ruby-compat") continue;
    const src = path.join(packagesDir, pkg, "src");
    if (!(await fs.stat(src).catch(() => null))?.isDirectory()) continue;
    const counts: Counts = { newModule: 0, superMethod: 0, moduleImport: 0 };
    for (const file of await listSources(src)) {
      const c = countText(await fs.readFile(file, "utf-8"));
      for (const k of KINDS) counts[k] += c[k];
    }
    if (KINDS.some((k) => counts[k] > 0)) out[pkg] = counts;
  }
  return out;
}

export interface Exceedance {
  pkg: string;
  kind: Kind;
  mark: number;
  current: number;
}

/** Counts above their mark; a package with no mark row has marks of 0. */
export function exceedances(marks: Marks, current: Marks): Exceedance[] {
  const out: Exceedance[] = [];
  for (const pkg of Object.keys(current).sort()) {
    for (const kind of KINDS) {
      const mark = marks[pkg]?.[kind] ?? 0;
      if (current[pkg][kind] > mark) out.push({ pkg, kind, mark, current: current[pkg][kind] });
    }
  }
  return out;
}

/** Each mark lowered to the current count, never raised; an all-zero row is dropped. */
export function tighten(marks: Marks, current: Marks): Marks {
  const out: Marks = {};
  for (const pkg of Object.keys(marks).sort()) {
    const row = {} as Counts;
    for (const kind of KINDS) {
      row[kind] = Math.min(marks[pkg][kind], current[pkg]?.[kind] ?? 0);
    }
    if (KINDS.some((k) => row[k] > 0)) out[pkg] = row;
  }
  return out;
}

export async function main(args: string[] = [], root = ROOT_DIR): Promise<string> {
  const markFile = path.join(root, path.relative(ROOT_DIR, MARK_FILE));
  const marks = JSON.parse(await fs.readFile(markFile, "utf-8")) as Marks;
  const current = await measure(root);
  if (args.includes("--tighten")) {
    await fs.writeFile(markFile, JSON.stringify(tighten(marks, current), null, 2) + "\n");
    return `module-count: marks tightened in ${path.relative(root, markFile)}`;
  }
  const grew = exceedances(marks, current);
  if (grew.length > 0) {
    throw new Error(
      `module-count gate: ${grew.length} count(s) above their mark. Build a plain-object ` +
        `or class module and reach \`super\` through \`rbCallSuper\` (CLAUDE.md § "A Ruby ` +
        `module is a plain object or a class module"); never raise the mark:\n` +
        grew.map((v) => `  ${v.pkg} ${v.kind}: ${v.mark} → ${v.current}`).join("\n"),
    );
  }
  const stale = JSON.stringify(tighten(marks, current)) !== JSON.stringify(marks);
  return (
    `module-count gate: OK` +
    (stale ? " (some marks are above the count: run `pnpm parity:modules:tighten`)" : "")
  );
}
