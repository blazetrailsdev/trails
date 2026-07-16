/**
 * Coverage metric: the feasibility evidence. Per file (and rolled up), what
 * fraction of AST node *instances* had a real handler vs. fell to the marked
 * passthrough — plus which node kinds dominate the passthrough bucket, which
 * makes follow-up handler work self-prioritizing.
 */
import type { Coverage } from "./types.js";

export interface CoverageSummary {
  total: number;
  handled: number;
  passthrough: number;
  handledPct: number;
  /** Node kinds sorted by passthrough-instance count, descending. */
  topPassthrough: { kind: string; count: number }[];
}

export function summarizeCoverage(cov: Coverage): CoverageSummary {
  let handled = 0;
  let passthrough = 0;
  const pass: { kind: string; count: number }[] = [];
  for (const [kind, c] of cov.counts) {
    handled += c.handled;
    passthrough += c.passthrough;
    if (c.passthrough > 0) pass.push({ kind, count: c.passthrough });
  }
  pass.sort((a, b) => b.count - a.count);
  const total = handled + passthrough;
  return {
    total,
    handled,
    passthrough,
    handledPct: total === 0 ? 0 : (handled / total) * 100,
    topPassthrough: pass,
  };
}

/** Merge many per-file tallies into one rollup summary. */
export function mergeCoverages(covs: Coverage[]): CoverageSummary {
  const merged = new Map<string, { handled: number; passthrough: number }>();
  for (const cov of covs) {
    for (const [kind, c] of cov.counts) {
      const m = merged.get(kind) ?? { handled: 0, passthrough: 0 };
      m.handled += c.handled;
      m.passthrough += c.passthrough;
      merged.set(kind, m);
    }
  }
  return summarizeCoverage({ counts: merged, record() {} });
}
