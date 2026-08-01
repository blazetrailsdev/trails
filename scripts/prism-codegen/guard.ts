/**
 * Convergence-guard ratchet over the codegen scorer's uncatalogued residue
 * (RFC 0086; RFC 0065 zero-deviation guard, spike doc item 7).
 *
 * catalog.ts subtracts the reviewed deviations; what remains is residue nobody
 * signed off on. This module ratchets it against a checked-in baseline:
 * pre-existing rows are tolerated, a NEW row fails, and rows that disappear
 * (a method converged, or a deviation got a catalog entry) are accepted — the
 * baseline only ever shrinks without an explicit `--write`.
 *
 * Hard rules: no node:* imports, no process.* (the CLI owns the entry guard),
 * async fs only — this module is pure; score-cli.ts reads and writes the file.
 */

export interface ResidueRow {
  /** Rails source path, e.g. `active_record/persistence.rb`. */
  rubyFile: string;
  /** Generated def name (TS spelling). */
  name: string;
  status: "divergent" | "missing";
}

export interface BaselineDiff {
  added: ResidueRow[];
  removed: ResidueRow[];
}

export function rowId(row: ResidueRow): string {
  return `${row.rubyFile}::${row.name}::${row.status}`;
}

/** Stable, diff-friendly ordering: file, then name, then status. */
export function sortRows(rows: readonly ResidueRow[]): ResidueRow[] {
  return [...rows].sort((a, b) => rowId(a).localeCompare(rowId(b)));
}

/**
 * 2-space JSON with a trailing newline, matching the api-compare baselines. Rows
 * serialize as their `rowId` string rather than an object: the id is the whole
 * key, so a one-line-per-row file keeps the review diff readable.
 */
export function serializeBaseline(rows: readonly ResidueRow[]): string {
  return `${JSON.stringify(sortRows(rows).map(rowId), null, 2)}\n`;
}

export function parseBaseline(source: string): ResidueRow[] {
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("prism-codegen convergence baseline: expected a JSON array of row ids.");
  }
  return parsed.map((id) => {
    const parts = String(id).split("::");
    if (parts.length !== 3 || (parts[2] !== "divergent" && parts[2] !== "missing")) {
      throw new Error(
        `prism-codegen convergence baseline: malformed row id ${JSON.stringify(id)} ` +
          "(expected <rubyFile>::<name>::<divergent|missing>).",
      );
    }
    return { rubyFile: parts[0], name: parts[1], status: parts[2] };
  });
}

export function diffBaseline(
  rows: readonly ResidueRow[],
  baseline: readonly ResidueRow[],
): BaselineDiff {
  const baselineIds = new Set(baseline.map(rowId));
  const currentIds = new Set(rows.map(rowId));
  return {
    added: sortRows(rows.filter((r) => !baselineIds.has(rowId(r)))),
    removed: sortRows(baseline.filter((r) => !currentIds.has(rowId(r)))),
  };
}

/**
 * The failure report for new residue, or undefined when the guard passes.
 * Removals never fail — they are convergence.
 */
export function guardFailureMessage(diff: BaselineDiff): string | undefined {
  if (diff.added.length === 0) return undefined;
  const lines = [
    `prism-codegen convergence guard: ${diff.added.length} uncatalogued divergence(s) ` +
      "not in the baseline.",
    "",
    "Each row is a clean generated def whose body skeleton no longer matches the",
    "port (divergent) or that has no port symbol at all (missing), with no entry in",
    "the deviation catalog (api-compare SKIP / SCOPED_SKIP, call-mismatches-exclude",
    "or the wide exclude tree) to explain it.",
    "",
    ...diff.added.map((r) => `  ${r.status.padEnd(9)} ${r.rubyFile} :: ${r.name}`),
    "",
    "Converge the port, or catalog the deviation with a reason in the api-compare",
    "exclude lists. `pnpm codegen:score --guard --write` re-seeds the baseline and",
    "is for burndown/regeneration only, never for hiding a new divergence.",
  ];
  return lines.join("\n");
}
