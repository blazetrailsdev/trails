/**
 * Reasoned suppression file for the inheritance check (RFC 0072), shaped like
 * `arity-exclude.ts`: a mandatory `reason` per entry, and only-shrink by
 * construction — an entry that no longer suppresses a live mismatch is STALE
 * and fails the gate.
 *
 * `RUBY_ONLY_CLASSES` (compare.ts) answers "this Ruby class is not ported at
 * all"; this file answers the different question "this class IS ported, but its
 * TS superclass deliberately differs, for a reviewed reason". A super-mismatch
 * with no register of any kind reads as outstanding work forever.
 *
 * Keyed on the RUBY side of the pair (`package + rubyFile + rubyFqn`), matching
 * arity-exclude's rationale: that is what a burndown story names, and the TS
 * side can move files without invalidating a reason about the Ruby class.
 *
 * Hard rules: no node:* imports, no process.*, async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { PACKAGES } from "./config.js";

export const INHERITANCE_EXCLUDE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "inheritance-exclude.json",
);

export interface InheritanceExcludeKey {
  package: string;
  rubyFile: string;
  rubyFqn: string;
}

export interface InheritanceExcludeEntry extends InheritanceExcludeKey {
  reason: string;
}

export function inheritanceExcludeKeyOf(k: InheritanceExcludeKey): string {
  return `${k.package} ${k.rubyFile} ${k.rubyFqn}`;
}

/** Every structural problem is a hard error rather than a skipped row: a
 *  malformed entry that silently did nothing would read as "suppressed" to
 *  whoever added it while the class kept flagging. */
export function parseInheritanceExcludes(text: string): InheritanceExcludeEntry[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) {
    throw new Error("inheritance-exclude.json: expected a top-level array");
  }

  const entries: InheritanceExcludeEntry[] = [];
  const seen = new Set<string>();
  raw.forEach((row, i) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`inheritance-exclude.json[${i}]: expected an object`);
    }
    const e = row as Partial<InheritanceExcludeEntry>;
    for (const field of ["package", "rubyFile", "rubyFqn"] as const) {
      if (typeof e[field] !== "string" || e[field].length === 0) {
        throw new Error(`inheritance-exclude.json[${i}]: "${field}" must be a non-empty string`);
      }
    }
    if (typeof e.reason !== "string" || e.reason.trim().length === 0) {
      throw new Error(
        `inheritance-exclude.json[${i}] (${inheritanceExcludeKeyOf(e as InheritanceExcludeKey)}): ` +
          '"reason" must be a non-empty string — every deviation carries its justification',
      );
    }
    if (!PACKAGES.includes(e.package!)) {
      throw new Error(
        `inheritance-exclude.json[${i}]: unknown package "${e.package}" — expected one of ${PACKAGES.join(", ")}`,
      );
    }
    const entry = e as InheritanceExcludeEntry;
    const key = inheritanceExcludeKeyOf(entry);
    if (seen.has(key)) {
      throw new Error(`inheritance-exclude.json: duplicate entry for ${key}`);
    }
    seen.add(key);
    entries.push(entry);
  });
  return entries;
}

export async function loadInheritanceExcludes(
  file: string = INHERITANCE_EXCLUDE_PATH,
): Promise<InheritanceExcludeEntry[]> {
  return parseInheritanceExcludes(await fs.readFile(file, "utf-8"));
}

/** Entries that suppressed nothing in the run that produced `appliedKeys` —
 *  the class converged, was renamed, or never mismatched at all. */
export function findStaleInheritanceExcludes(
  entries: readonly InheritanceExcludeEntry[],
  appliedKeys: Iterable<string>,
): InheritanceExcludeEntry[] {
  const applied = new Set(appliedKeys);
  return entries.filter((e) => !applied.has(inheritanceExcludeKeyOf(e)));
}

/** Compare-time lookup set. Only the key matters there — the `reason` is for
 *  the human reading the file, not for the run. */
export function inheritanceExcludeKeys(entries: readonly InheritanceExcludeEntry[]): Set<string> {
  return new Set(entries.map(inheritanceExcludeKeyOf));
}
