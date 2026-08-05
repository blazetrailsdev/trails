/**
 * The one canonical on-disk form for the hand-editable JSON baselines the
 * api-compare gates own (the split
 * call-mismatches-exclude/ tree, body-pins.json): 2-space
 * `JSON.stringify` plus a trailing newline, with non-ASCII written LITERALLY
 * as UTF-8 — never as `\uXXXX` escapes.
 *
 * `JSON.stringify` already emits non-ASCII literally, so this is what the
 * writers have always produced; the rule is written down (and enforced by
 * reportNonCanonicalBaselines) because the two encodings round-trip to the
 * same DATA but not the same BYTES. Three files had landed with escaped
 * em-dashes in their `reason` prose, so every `--write` reseed silently
 * re-encoded them: the reseeding agent's diff touched unrelated packages'
 * baselines and buried the real signal (the removed entries) in line noise.
 *
 * Baselines written through `writeJsonManifest` (schema-compare) are excluded:
 * prettier owns their formatting, and prettier likewise leaves non-ASCII
 * literal.
 *
 * Hard rules: no node:* imports, no process.*, async fs.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { ROOT_DIR } from "./config.js";

export function serializeBaseline(value: unknown): string {
  return JSON.stringify(value, null, 2) + "\n";
}

/**
 * Recursively list *.json files under `dir` as absolute paths (empty if the
 * directory does not exist yet). Shared by every SPLIT baseline that mirrors
 * the source tree — the exclude entries and the unreviewed marks — so
 * the two trees are walked by one implementation and cannot drift apart.
 */
export async function listJsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const d of dirents) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) out.push(...(await listJsonFiles(full)));
    else if (d.name.endsWith(".json")) out.push(full);
  }
  return out;
}

/**
 * Recursively remove empty subdirectories under `dir` (keeps `dir` itself), so
 * a split tree that lost its last file for a source leaves no empty chain
 * behind. Returns whether `dir` itself ended up empty.
 */
export async function pruneEmptyDirs(dir: string): Promise<boolean> {
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw e;
  }
  let empty = true;
  for (const d of dirents) {
    if (d.isDirectory()) {
      const sub = path.join(dir, d.name);
      if (await pruneEmptyDirs(sub)) await fs.rmdir(sub);
      else empty = false;
    } else {
      empty = false;
    }
  }
  return empty;
}

// Baseline files whose bytes are not the canonical serialization of their own
// contents — i.e. exactly the files a no-op `--write` would rewrite.
export async function findNonCanonicalBaselines(files: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const f of files) {
    const text = await fs.readFile(f, "utf-8");
    if (serializeBaseline(JSON.parse(text)) !== text) out.push(f);
  }
  return out;
}

// Shared gate arm: fails when any baseline file is non-canonical, so escaped
// non-ASCII (or stray indentation) cannot re-enter and re-arm the churn trap.
// Returns whether the caller should fail.
export async function reportNonCanonicalBaselines(
  files: string[],
  label: string,
): Promise<boolean> {
  const bad = await findNonCanonicalBaselines(files);
  if (bad.length === 0) return false;
  console.error(
    `\n${label}: ${bad.length} baseline file(s) not in canonical JSON form ` +
      "(2-space indent, trailing newline, non-ASCII written literally rather " +
      "than as \\uXXXX escapes). Left as-is, every reseed would rewrite them " +
      "and bury the real diff in unrelated churn. Run `--write` to normalize:\n",
  );
  for (const f of [...bad].sort()) console.error(`  ! ${path.relative(ROOT_DIR, f)}`);
  return true;
}
