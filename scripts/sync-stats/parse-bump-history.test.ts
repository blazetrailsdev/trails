import { describe, expect, it } from "vitest";
import { parseBumpLedgerSummaries, parseBumpReport } from "./parse-bump-history.js";
import { summaryLine } from "../api-compare/bump-ledger.js";

// The Bump-ledger gate step of a rails-comparison log, timestamps and all.
const log = `
2026-11-15T10:00:00.0000000Z ${summaryLine("rails", [
  {
    package: "activerecord",
    rubyFile: "a.rb",
    rubyName: "x",
    kind: "drift",
    from: "v8.0.2",
    to: "v8.0.5.2",
  },
  {
    package: "activerecord",
    rubyFile: "a.rb",
    rubyName: "y",
    kind: "drift",
    from: "v8.0.2",
    to: "v8.0.5.2",
  },
  {
    package: "arel",
    rubyFile: "b.rb",
    rubyName: "z",
    kind: "removed",
    from: "v8.0.2",
    to: "v8.0.5.2",
  },
])}
2026-11-15T10:00:00.0000000Z ${summaryLine("rack", [])}
2026-11-15T10:00:01.0000000Z bump-ledger gate: OK (3 ledger row(s))
`;

describe("parseBumpLedgerSummaries", () => {
  it("reads rows remaining by source, package and kind", () => {
    expect(parseBumpLedgerSummaries(log)).toEqual([
      { source: "rails", package: "activerecord", kind: "drift", rows: 2 },
      { source: "rails", package: "arel", kind: "removed", rows: 1 },
      { source: "rack", package: "all", kind: "none", rows: 0 },
    ]);
  });

  it("returns nothing for a log predating the summary line", () => {
    expect(parseBumpLedgerSummaries("bump-ledger gate: OK (0 ledger row(s))")).toEqual([]);
  });
});

describe("parseBumpReport", () => {
  it("reads a version-1 report and refuses any other shape", () => {
    const report = {
      version: 1,
      method: "manual",
      date: "2026-10-13",
      source: "rails",
      from: { ref: "v8.0.2", sha: null },
      to: { ref: "v8.1.4", sha: null },
      trailsCommit: null,
      packages: [],
      gates: [],
      seed: [{ package: "arel", kind: "drift", rows: 42 }],
    };
    expect(parseBumpReport(JSON.stringify(report))?.seed[0].rows).toBe(42);
    expect(parseBumpReport(JSON.stringify({ ...report, version: 2 }))).toBeNull();
    expect(parseBumpReport("{")).toBeNull();
  });
});
