/**
 * The one canonical on-disk form for the hand-editable JSON baselines the
 * api-compare gates own (call-mismatches-exclude.json, the split
 * call-mismatches-wide-exclude/ tree, body-pins.json): 2-space
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
