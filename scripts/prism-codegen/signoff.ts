/**
 * Per-row sign-off for the codegen convergence guard (RFC 0086).
 *
 * catalog.ts explains a divergence only when EVERY differing skeleton token is
 * an individually excluded call (`call-mismatches-exclude.json` and the wide
 * tree are keyed at the call grain). Most real divergences differ by several
 * tokens at once — a dropped `if` plus two renamed calls — so a reviewer who
 * has confirmed a whole method's divergence as equivalent has no way to record
 * that verdict at the call grain: the row can only leave the residue by
 * converging, or stay in the baseline forever indistinguishable from
 * unreviewed debt.
 *
 * This is the missing grain, modeled on api-compare's `body-pins.json`: a
 * per-row, reason-carrying sign-off. `convergence-signoff.json` holds entries
 * keyed `<rubyFile>::<name>`; a matching row leaves the guarded residue and
 * lands in its own bucket, distinct from the baseline of unreviewed debt.
 *
 * Deliberately keyed WITHOUT the status: a row is `divergent` or `missing`,
 * never both, and a reviewer signing off on "this method's port is equivalent"
 * has not signed off on it silently becoming unported. Status changes are rare
 * enough that carrying the verdict across one is the safer default than
 * splitting the key.
 *
 * Sign-offs are OPT-IN and only grow by review — there is no `--write` that
 * seeds them (unlike the baseline). A sign-off whose row no longer appears at
 * all (the method converged) is STALE and fails the lint, mirroring the wide
 * gate's stale-entry half, so the manifest stays a live record.
 *
 * Hard rules: no node:* imports, no process.* (the CLI owns the entry guard),
 * async fs only — this module is pure; score-cli.ts reads the file.
 */

import { sortRows, type ResidueRow } from "./guard.js";

/** One reviewed row. `reason` records the verdict that justified the sign-off. */
export interface SignOff {
  rubyFile: string;
  name: string;
  reason: string;
}

/** Identity of a sign-off: the row minus its status. See the module header. */
export function signOffKey(row: { rubyFile: string; name: string }): string {
  return `${row.rubyFile}::${row.name}`;
}

/**
 * Total order by UTF-16 code unit over `signOffKey`, NOT `localeCompare`: ICU
 * collation is locale- and ICU-version-dependent and treats punctuation as
 * secondary, so keys differing only in `_`/`?` would sort differently per
 * machine and emit symmetric manifest churn. (Same fix as `comparePinKeys` in
 * api-compare/body-pins.ts.)
 */
export function sortSignOffs(entries: readonly SignOff[]): SignOff[] {
  return [...entries].sort((a, b) => {
    const ka = signOffKey(a);
    const kb = signOffKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

export function serializeSignOffs(entries: readonly SignOff[]): string {
  return `${JSON.stringify(sortSignOffs(entries), null, 2)}\n`;
}

/**
 * Parse the manifest. `reason` is mandatory and must be non-empty: a sign-off
 * without one is exactly the unreviewed debt the baseline already holds, and
 * admitting it would let a row leave the residue with no verdict attached.
 */
export function parseSignOffs(source: string): SignOff[] {
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("prism-codegen convergence sign-off: expected a JSON array of entries.");
  }
  const seen = new Set<string>();
  return parsed.map((raw) => {
    const entry = raw as Partial<SignOff>;
    if (!entry || typeof entry.rubyFile !== "string" || typeof entry.name !== "string") {
      throw new Error(
        `prism-codegen convergence sign-off: malformed entry ${JSON.stringify(raw)} ` +
          "(expected { rubyFile, name, reason }).",
      );
    }
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") {
      throw new Error(
        `prism-codegen convergence sign-off: ${signOffKey(entry as SignOff)} has no reason. ` +
          "Every sign-off must record the verdict that justified it.",
      );
    }
    const key = signOffKey(entry as SignOff);
    if (seen.has(key)) {
      throw new Error(`prism-codegen convergence sign-off: duplicate entry ${key}.`);
    }
    seen.add(key);
    return { rubyFile: entry.rubyFile, name: entry.name, reason: entry.reason };
  });
}

export interface SignOffPartition {
  /** Rows a reviewer signed off on, with the recorded verdict. */
  signedOff: { row: ResidueRow; reason: string }[];
  /** What is left: unreviewed residue, the set the baseline ratchets. */
  residue: ResidueRow[];
}

export function partitionSignedOff(
  rows: readonly ResidueRow[],
  entries: readonly SignOff[],
): SignOffPartition {
  const byKey = new Map(entries.map((e) => [signOffKey(e), e.reason]));
  const signedOff: { row: ResidueRow; reason: string }[] = [];
  const residue: ResidueRow[] = [];
  for (const row of rows) {
    const reason = byKey.get(signOffKey(row));
    if (reason === undefined) residue.push(row);
    else signedOff.push({ row, reason });
  }
  return { signedOff, residue };
}

/**
 * Sign-offs whose row no longer appears among the scored divergent+missing
 * rows — the method converged (or was renamed away), so the verdict is dead.
 *
 * `rows` must be EVERY divergent+missing row, catalogued ones included: a row
 * the call-grain catalog also explains is redundant, not stale, and failing on
 * it would make cataloguing a call break unrelated sign-offs.
 */
export function staleSignOffs(rows: readonly ResidueRow[], entries: readonly SignOff[]): SignOff[] {
  const live = new Set(rows.map(signOffKey));
  return sortSignOffs(entries.filter((e) => !live.has(signOffKey(e))));
}

export function staleSignOffMessage(stale: readonly SignOff[]): string | undefined {
  if (stale.length === 0) return undefined;
  return [
    `prism-codegen convergence sign-off: ${stale.length} stale entr(y/ies) — no such ` +
      "divergent or missing row.",
    "",
    "The method converged (or was renamed), so the recorded verdict no longer",
    "explains anything. Delete the entry from convergence-signoff.json.",
    "",
    ...stale.map((e) => `  ${e.rubyFile} :: ${e.name}`),
  ].join("\n");
}

/**
 * Rows present in BOTH the sign-off manifest and the unreviewed baseline. The
 * two files are disjoint by construction (sign-off is subtracted before the
 * baseline diff), so an overlap means the baseline was hand-edited or seeded
 * from a stale run — and the row would read as unreviewed debt despite being
 * signed off.
 */
export function overlappingSignOffs(
  baseline: readonly ResidueRow[],
  entries: readonly SignOff[],
): ResidueRow[] {
  const signed = new Set(entries.map(signOffKey));
  return sortRows(baseline.filter((row) => signed.has(signOffKey(row))));
}

export function overlapFailureMessage(overlap: readonly ResidueRow[]): string | undefined {
  if (overlap.length === 0) return undefined;
  return [
    `prism-codegen convergence sign-off: ${overlap.length} row(s) are in BOTH ` +
      "convergence-signoff.json and convergence-baseline.json.",
    "",
    "A signed-off row must not also sit in the baseline of unreviewed debt.",
    "Re-seed with `pnpm codegen:score --guard --write` to drop them.",
    "",
    ...overlap.map((r) => `  ${r.status.padEnd(9)} ${r.rubyFile} :: ${r.name}`),
  ].join("\n");
}
