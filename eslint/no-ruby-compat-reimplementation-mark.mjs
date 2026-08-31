/**
 * The only-shrink guard for `no-ruby-compat-reimplementation-exclude.json`
 * (RFC 0129).
 *
 * The exclude register is declared only-shrink in the rule header and in
 * `packages/ruby-compat/README.md`, but until this guard nothing enforced it:
 * the file is a plain JSON array the rule reads, so a PR that appended a row to
 * silence a fresh flag was green everywhere. Every other only-shrink register in
 * the repo has a mechanical guard behind the convention — the call baselines
 * have their reseed-drift check, `parity:api:extra` has
 * `extra-surface-mark.json` and `parity:api:extra:gate` — and this is that
 * guard, on the same terms as `extra-surface-mark.json`: a committed high-water
 * mark, compared rather than trusted.
 *
 * Two properties are pinned:
 *
 * - **Row count never rises** above the committed mark. A new flag converges by
 *   calling the primitive; it is NEVER covered by a new row.
 * - **Rows stay sorted**, because an appended row is the exact shape the call
 *   baselines already suffer: it passes the gate that reads the file and reds a
 *   separate drift check.
 *
 * There is no reseed, for the reason the call baselines forbid one — a reseed
 * could only ever widen the register. The rows burn down through the move
 * stories filed under RFC 0129 (`move-regexp-escape-to-ruby-compat`,
 * `ruby-compat-comparable`, `ruby-compat-hash-fetch-and-key-error`,
 * `ruby-compat-symbol-conventions`, `move-rational-to-ruby-compat`), each
 * deleting the rows it converges, so the mark tightens repeatedly:
 * {@link tightenedMark} writes it DOWN and never up.
 */
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXCLUDE_PATH = path.resolve(__dirname, "no-ruby-compat-reimplementation-exclude.json");
export const MARK_PATH = path.resolve(__dirname, "no-ruby-compat-reimplementation-mark.json");

/**
 * Ascending UTF-16 code-unit order, the order `compareKeys` in
 * `scripts/api-compare/call-mismatch-baseline.ts` settled on for the same job:
 * ICU collation is locale- and ICU-version-dependent and treats punctuation as
 * secondary, so `localeCompare` would order a row differently depending on who
 * ran the sort.
 */
export function isSorted(rows) {
  for (let i = 1; i < rows.length; i++) {
    if (!(rows[i - 1] < rows[i])) return false;
  }
  return true;
}

/**
 * The guard itself. `errors` is empty when the register is at or under its
 * mark and sorted; `tightenedMark` is the value the mark should be rewritten
 * to, and is `null` unless the register has shrunk below it.
 */
export function checkMark(rows, mark) {
  const errors = [];
  if (rows.length > mark) {
    errors.push(
      `no-ruby-compat-reimplementation-exclude.json holds ${rows.length} row(s), over its ` +
        `committed mark of ${mark}. The register is ONLY-SHRINK: a new flag converges by ` +
        "calling the @blazetrails/ruby-compat primitive, never by covering the copy with a " +
        "row. Delete the row you added; do not raise the mark.",
    );
  }
  if (!isSorted(rows)) {
    errors.push(
      "no-ruby-compat-reimplementation-exclude.json is not sorted ascending. An appended row " +
        "reads correctly to the rule, so nothing but this guard says where it belongs — sort " +
        "the array.",
    );
  }
  return { errors, tightenedMark: errors.length === 0 && rows.length < mark ? rows.length : null };
}

/** The committed register and its mark. */
export async function readCommitted() {
  const rows = JSON.parse(await fs.readFile(EXCLUDE_PATH, "utf8"));
  const { rows: mark } = JSON.parse(await fs.readFile(MARK_PATH, "utf8"));
  return { rows, mark };
}

/** Write the mark DOWN. There is no path that writes it up. */
export async function tighten(mark, markPath = MARK_PATH) {
  const { rows: current } = JSON.parse(await fs.readFile(markPath, "utf8"));
  if (mark >= current) return current;
  await fs.writeFile(markPath, `${JSON.stringify({ rows: mark }, null, 2)}\n`);
  return mark;
}
