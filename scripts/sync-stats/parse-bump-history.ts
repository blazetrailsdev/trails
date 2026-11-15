/**
 * The bump history the stats DB keeps (RFC 0191 § 7). Two inputs, both
 * derivable from the repo and CI, so a rebuilt DB recovers the same history:
 *
 * - the ledger gate's per-source summary line in the `rails-comparison` log
 *   (`lint-bump-ledger.ts`, via `bump-ledger.ts#summaryLine`):
 *
 *     bump-ledger rows: rails activerecord:drift=3 activerecord:removed=1
 *     bump-ledger rows: rack none
 *
 *   A `none` source yields one row of package `all`, kind `none`, rows 0, so
 *   the commit the ledger emptied is a row and not an absence;
 * - a committed dry-run report, `scripts/parity/bump-ledger/reports/*.json`
 *   (`scripts/parity/bump-dry-run/report.ts`).
 *
 * Hard rules: no node:* imports, no process.*, no I/O.
 */

import type { BumpReport } from "../parity/bump-dry-run/report.js";

export interface BumpLedgerStat {
  source: string;
  package: string;
  kind: string;
  rows: number;
}

export function parseBumpLedgerSummaries(logs: string): BumpLedgerStat[] {
  const out = new Map<string, BumpLedgerStat>();
  for (const m of logs.matchAll(/bump-ledger rows: (\S+) (.+)$/gm)) {
    const source = m[1];
    const rest = m[2].trim();
    if (rest === "none") {
      out.set(`${source} all none`, { source, package: "all", kind: "none", rows: 0 });
      continue;
    }
    for (const cell of rest.split(/\s+/)) {
      const c = /^(\S+):(\w+)=(\d+)$/.exec(cell);
      if (c)
        out.set(`${source} ${c[1]} ${c[2]}`, {
          source,
          package: c[1],
          kind: c[2],
          rows: Number(c[3]),
        });
    }
  }
  return [...out.values()];
}

/** A report file's JSON, or null for a shape this sync does not know. */
export function parseBumpReport(text: string): BumpReport | null {
  let r: unknown;
  try {
    r = JSON.parse(text);
  } catch {
    return null;
  }
  const o = r as Partial<BumpReport>;
  if (o?.version !== 1 || typeof o.source !== "string" || !o.from?.ref || !o.to?.ref) return null;
  if (!Array.isArray(o.packages) || !Array.isArray(o.gates) || !Array.isArray(o.seed)) return null;
  return o as BumpReport;
}
