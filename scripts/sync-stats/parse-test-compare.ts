export interface TestComparePackageStats {
  matched: number;
  total: number;
  percent: number;
  skipped: number;
  filesMapped: number;
  filesTotal: number;
  misplaced: number;
}

const SUMMARY_LINE =
  / {2}([\w-]+)[ \t]+—[ \t]+(\d+)\/(\d+) tests \(([\d.]+)%\)(?<details>[^\n|]*?)[ \t]+\|[ \t]+(\d+)\/(\d+) files[ \t]+\|[ \t]+(\d+) misplaced/g;

export function parseTestCompareFromLogs(logs: string): Map<string, TestComparePackageStats> {
  const results = new Map<string, TestComparePackageStats>();

  for (const m of logs.matchAll(SUMMARY_LINE)) {
    if (m[1] === "Overall") continue;
    const skippedMatch = /(\d+)\s+skipped/.exec(m.groups?.details ?? "");
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
