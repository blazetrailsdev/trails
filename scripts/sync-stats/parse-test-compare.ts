export interface TestComparePackageStats {
  matched: number;
  total: number;
  percent: number;
  skipped: number;
  filesMapped: number;
  filesTotal: number;
  misplaced: number;
}

// The per-package summary line emitted by scripts/test-compare/test-compare.ts:
//
//   globalid  —  131/131 tests (100%) (48 extra (TS only))  |  6/6 files  |  0 misplaced
//
// The details parenthetical can itself contain parentheses ("48 extra (TS
// only)", "3 assertion-count-mismatch (see --assertions)"), so it is captured
// lazily up to the pipe-separated columns rather than with a paren-excluding
// character class. Package names may be hyphenated (did-you-mean).
//
// Not line-anchored: raw CI logs prefix every line with an ISO timestamp, and
// this runs against those raw logs as well as cleaned step output.
const SUMMARY_LINE =
  / {2}([\w-]+)\s+—\s+(\d+)\/(\d+) tests \(([\d.]+)%\)(.*?)\s+\|\s+(\d+)\/(\d+) files\s+\|\s+(\d+) misplaced/g;

export function parseTestCompareFromLogs(logs: string): Map<string, TestComparePackageStats> {
  const results = new Map<string, TestComparePackageStats>();

  SUMMARY_LINE.lastIndex = 0;
  let m;
  while ((m = SUMMARY_LINE.exec(logs)) !== null) {
    if (m[1] === "Overall") continue;
    const details = m[5] ?? "";
    const skippedMatch = /(\d+)\s+skipped/.exec(details);
    results.set(m[1], {
      matched: parseInt(m[2]),
      total: parseInt(m[3]),
      percent: parseFloat(m[4]),
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
      filesMapped: parseInt(m[6]),
      filesTotal: parseInt(m[7]),
      misplaced: parseInt(m[8]),
    });
  }
  return results;
}
