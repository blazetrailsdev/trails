/**
 * Reasoned suppression file for the advisory arity check (RFC 0072), shaped
 * like the calls check's `call-mismatches-exclude.json`: a mandatory `reason`
 * per entry, and a ratchet — an entry that no longer suppresses a live
 * mismatch is STALE and fails the gate, so the file can only shrink.
 *
 * Keyed on the RUBY side of the pair (`package + rubyFile + rubyName`): that
 * is what a burndown story names, and the TS side can move files without
 * invalidating a reason about the Ruby signature.
 *
 * Hard rules: no node:* imports, no process.* (the CLI entry guard in
 * lint-arity-excludes.ts is the sole exception), async fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { PACKAGES } from "./config.js";

export const ARITY_EXCLUDE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "arity-exclude.json",
);

export interface ArityExcludeKey {
  package: string;
  rubyFile: string;
  rubyName: string;
}

export interface ArityExcludeEntry extends ArityExcludeKey {
  reason: string;
}

export function arityExcludeKeyOf(k: ArityExcludeKey): string {
  return `${k.package} ${k.rubyFile} ${k.rubyName}`;
}

/** Every structural problem is a hard error rather than a skipped row: a
 *  malformed entry that silently did nothing would read as "suppressed" to
 *  whoever added it while the pair kept flagging. */
export function parseArityExcludes(text: string): ArityExcludeEntry[] {
  const raw: unknown = JSON.parse(text);
  if (!Array.isArray(raw)) throw new Error("arity-exclude.json: expected a top-level array");

  const entries: ArityExcludeEntry[] = [];
  const seen = new Set<string>();
  raw.forEach((row, i) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`arity-exclude.json[${i}]: expected an object`);
    }
    const e = row as Partial<ArityExcludeEntry>;
    for (const field of ["package", "rubyFile", "rubyName"] as const) {
      if (typeof e[field] !== "string" || e[field]!.length === 0) {
        throw new Error(`arity-exclude.json[${i}]: "${field}" must be a non-empty string`);
      }
    }
    if (typeof e.reason !== "string" || e.reason.trim().length === 0) {
      throw new Error(
        `arity-exclude.json[${i}] (${arityExcludeKeyOf(e as ArityExcludeKey)}): ` +
          '"reason" must be a non-empty string — every deviation carries its justification',
      );
    }
    // A package outside the compared set can never be applied, so it would sit
    // in the file as a permanently-stale entry; name the typo instead.
    if (!PACKAGES.includes(e.package!)) {
      throw new Error(
        `arity-exclude.json[${i}]: unknown package "${e.package}" — expected one of ${PACKAGES.join(", ")}`,
      );
    }
    const entry = e as ArityExcludeEntry;
    const key = arityExcludeKeyOf(entry);
    if (seen.has(key)) {
      throw new Error(`arity-exclude.json: duplicate entry for ${key}`);
    }
    seen.add(key);
    entries.push(entry);
  });
  return entries;
}

export async function loadArityExcludes(
  file: string = ARITY_EXCLUDE_PATH,
): Promise<ArityExcludeEntry[]> {
  return parseArityExcludes(await fs.readFile(file, "utf-8"));
}

/** Entries that suppressed nothing in the run that produced `appliedKeys` —
 *  the pair converged, was renamed, or never mismatched at all. */
export function findStaleArityExcludes(
  entries: readonly ArityExcludeEntry[],
  appliedKeys: Iterable<string>,
): ArityExcludeEntry[] {
  const applied = new Set(appliedKeys);
  return entries.filter((e) => !applied.has(arityExcludeKeyOf(e)));
}

export function indexArityExcludes(
  entries: readonly ArityExcludeEntry[],
): Map<string, ArityExcludeEntry> {
  return new Map(entries.map((e) => [arityExcludeKeyOf(e), e]));
}
