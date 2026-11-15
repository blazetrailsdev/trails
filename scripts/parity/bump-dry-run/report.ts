/**
 * The committed half of a bump dry run (RFC 0191 § 7, "History in the stats
 * DB"): one versioned JSON report per run, at
 * `scripts/parity/bump-ledger/reports/<source>-<from>-<to>.<date>.json`, which
 * `scripts/sync-stats/sync.ts` reads back into `vendor_bump_reports`. A report
 * transcribed from an RFC table instead of a run carries `"method": "manual"`.
 *
 * Hard rules: no node:* imports, no process.*, no I/O.
 */

export const REPORT_VERSION = 1;

export interface BumpReportRef {
  ref: string;
  sha?: string | null;
}

/** One package's row of RFC § 2's tables; a field a measurement lacks is null or absent. */
export interface BumpReportPackage {
  package: string;
  filesChanged?: number | null;
  linesAdded?: number | null;
  linesRemoved?: number | null;
  pinsDrift?: number | null;
  pinsStale?: number | null;
  rubyFiles?: number | null;
  unpinnedChanged?: number | null;
  methodsBefore?: string | null;
  methodsAfter?: string | null;
  testsBefore?: number | null;
  testsAfter?: number | null;
  testsAdded?: number | null;
  testsRemoved?: number | null;
  testsChanged?: number | null;
  testsMoved?: number | null;
}

export type GateStatus = "green" | "red";

export interface BumpReportGate {
  gate: string;
  active: GateStatus | null;
  candidate: GateStatus;
  /** The candidate re-run with the seed as the ledger; null where the gate does not read it. */
  ledgered: GateStatus | null;
  summary: string;
  ledgeredSummary: string | null;
}

export interface BumpReportSeed {
  package: string;
  kind: "drift" | "removed" | "signature" | "constant" | "changed" | "moved";
  rows: number;
}

export interface BumpReport {
  version: number;
  method: "dry-run" | "manual";
  date: string;
  source: string;
  from: BumpReportRef;
  to: BumpReportRef;
  trailsCommit?: string | null;
  /** The burn-down RFC the bump's stories were generated into, once it exists. */
  burnDownRfc?: string;
  packages: BumpReportPackage[];
  gates: BumpReportGate[];
  seed: BumpReportSeed[];
}

export const REPORTS_DIR = "scripts/parity/bump-ledger/reports";

export function reportFileName(r: Pick<BumpReport, "source" | "from" | "to" | "date">): string {
  return `${r.source}-${r.from.ref}-${r.to.ref}.${r.date}.json`;
}

/** Seed rows tallied by package and kind, sorted. */
export function seedCounts(rows: readonly { package: string; kind: BumpReportSeed["kind"] }[]) {
  const tally = new Map<string, BumpReportSeed>();
  for (const r of rows) {
    const k = `${r.package} ${r.kind}`;
    const t = tally.get(k) ?? { package: r.package, kind: r.kind, rows: 0 };
    t.rows++;
    tally.set(k, t);
  }
  return [...tally.values()].sort((a, b) =>
    a.package === b.package ? (a.kind < b.kind ? -1 : 1) : a.package < b.package ? -1 : 1,
  );
}
