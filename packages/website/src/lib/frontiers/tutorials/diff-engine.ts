import type { VirtualFS } from "../virtual-fs.js";
import type { SqlJsAdapter } from "../sql-js-adapter.js";
import type {
  FileDiff,
  DiffHunk,
  DiffResult,
  CheckSpec,
  CheckResult,
  CheckpointResult,
  HighlightRange,
} from "./types.js";

export function applyDiff(vfs: VirtualFS, diff: FileDiff): DiffResult {
  if (diff.operation === "create") {
    if (diff.content === undefined) {
      return { success: false, error: `No content provided for create of ${diff.path}` };
    }
    vfs.write(diff.path, diff.content, diff.language);
    return { success: true };
  }

  if (diff.operation === "delete") {
    if (!vfs.exists(diff.path)) {
      return { success: false, error: `File not found: ${diff.path}` };
    }
    vfs.delete(diff.path);
    return { success: true };
  }

  // operation === "modify"
  const file = vfs.read(diff.path);
  if (!file) {
    return { success: false, error: `File not found: ${diff.path}` };
  }

  if (!diff.hunks || diff.hunks.length === 0) {
    return { success: false, error: `No hunks provided for modify of ${diff.path}` };
  }

  let lines = file.content.split("\n");

  for (const hunk of diff.hunks) {
    const result = applyHunk(lines, hunk);
    if (!result.success) {
      return { success: false, error: `In ${diff.path}: ${result.error}` };
    }
    lines = result.lines!;
  }

  vfs.write(diff.path, lines.join("\n"));
  return { success: true };
}

interface HunkResult {
  success: boolean;
  error?: string;
  lines?: string[];
}

function applyHunk(lines: string[], hunk: DiffHunk): HunkResult {
  const matchingIndices: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(hunk.anchor)) matchingIndices.push(index);
  });

  if (matchingIndices.length === 0) {
    return { success: false, error: `Anchor not found: "${hunk.anchor}"` };
  }
  if (matchingIndices.length > 1) {
    return {
      success: false,
      error: `Anchor "${hunk.anchor}" matched ${matchingIndices.length} lines; make the anchor more specific`,
    };
  }

  const anchorIndex = matchingIndices[0];

  if (hunk.position === "after") {
    const newLines = [...lines];
    newLines.splice(anchorIndex + 1, 0, ...hunk.insertLines);
    return { success: true, lines: newLines };
  }

  if (hunk.position === "before") {
    const newLines = [...lines];
    newLines.splice(anchorIndex, 0, ...hunk.insertLines);
    return { success: true, lines: newLines };
  }

  // position === "replace"
  const deleteCount = hunk.deleteCount ?? 1;
  const newLines = [...lines];
  newLines.splice(anchorIndex, deleteCount, ...hunk.insertLines);
  return { success: true, lines: newLines };
}

export function isDiffApplied(vfs: VirtualFS, diff: FileDiff): boolean {
  if (diff.operation === "create") {
    const file = vfs.read(diff.path);
    if (!file) return false;
    if (diff.content === undefined) return false;
    return file.content === diff.content;
  }

  if (diff.operation === "delete") {
    return !vfs.exists(diff.path);
  }

  // operation === "modify"
  const file = vfs.read(diff.path);
  if (!file || !diff.hunks || diff.hunks.length === 0) return false;

  const lines = file.content.split("\n");
  return diff.hunks.every((hunk) => isHunkApplied(lines, hunk));
}

function linesMatch(actual: string, expected: string): boolean {
  const normalize = (line: string) => line.replace(/\s+$/, "");
  return normalize(actual) === normalize(expected);
}

function sequenceExists(lines: string[], sequence: string[]): boolean {
  if (sequence.length === 0) return true;
  const lastStart = lines.length - sequence.length;
  if (lastStart < 0) return false;
  for (let start = 0; start <= lastStart; start++) {
    if (sequence.every((expected, i) => linesMatch(lines[start + i], expected))) return true;
  }
  return false;
}

function checkAtAnchor(lines: string[], hunk: DiffHunk, anchorIndex: number): boolean {
  if (hunk.position === "after") {
    const start = anchorIndex + 1;
    return hunk.insertLines.every(
      (insertLine, i) => start + i < lines.length && linesMatch(lines[start + i], insertLine),
    );
  }

  if (hunk.position === "before") {
    const start = anchorIndex - hunk.insertLines.length;
    if (start < 0) return false;
    return hunk.insertLines.every((insertLine, i) => linesMatch(lines[start + i], insertLine));
  }

  // position === "replace"
  return hunk.insertLines.every(
    (insertLine, i) =>
      anchorIndex + i < lines.length && linesMatch(lines[anchorIndex + i], insertLine),
  );
}

function isHunkApplied(lines: string[], hunk: DiffHunk): boolean {
  const matchingIndices: number[] = [];
  lines.forEach((line, index) => {
    if (line.includes(hunk.anchor)) matchingIndices.push(index);
  });

  if (hunk.position === "replace") {
    for (const anchorIndex of matchingIndices) {
      if (checkAtAnchor(lines, hunk, anchorIndex)) return true;
    }
    return sequenceExists(lines, hunk.insertLines);
  }

  // For before/after, require exactly one anchor match
  if (matchingIndices.length !== 1) return false;
  return checkAtAnchor(lines, hunk, matchingIndices[0]);
}

export function runCheck(vfs: VirtualFS, adapter: SqlJsAdapter, check: CheckSpec): CheckResult {
  switch (check.type) {
    case "table_exists": {
      if (!check.target) {
        return { check, passed: false, error: "No target table name provided" };
      }
      const tables = adapter.getTables();
      const passed = tables.includes(check.target);
      return {
        check,
        passed,
        error: passed ? undefined : `Table "${check.target}" does not exist`,
      };
    }

    case "file_exists": {
      if (!check.target) {
        return { check, passed: false, error: "No target file path provided" };
      }
      const passed = vfs.exists(check.target);
      return {
        check,
        passed,
        error: passed ? undefined : `File "${check.target}" does not exist`,
      };
    }

    case "file_contains": {
      if (!check.target) {
        return { check, passed: false, error: "No target file path provided" };
      }
      if (check.value === undefined) {
        return { check, passed: false, error: "No expected content provided" };
      }
      const file = vfs.read(check.target);
      if (!file) {
        return { check, passed: false, error: `File "${check.target}" does not exist` };
      }
      const passed = file.content.includes(check.value);
      return {
        check,
        passed,
        error: passed ? undefined : `File "${check.target}" does not contain "${check.value}"`,
      };
    }

    case "query_returns": {
      if (!check.value) {
        return { check, passed: false, error: "No SQL query provided" };
      }
      try {
        const results = adapter.execRaw(check.value);
        if (typeof check.expected === "number") {
          const rowCount = results.length > 0 ? results[0].values.length : 0;
          const passed = rowCount === check.expected;
          return {
            check,
            passed,
            error: passed ? undefined : `Expected ${check.expected} rows, got ${rowCount}`,
          };
        }
        const passed = results.length > 0 && results[0].values.length > 0;
        return {
          check,
          passed,
          error: passed ? undefined : "Query returned no results",
        };
      } catch (e) {
        return { check, passed: false, error: `SQL error: ${(e as Error).message}` };
      }
    }

    case "route_responds": {
      // Deferred until app server is available — always fails gracefully
      return {
        check,
        passed: false,
        error: "route_responds checks require an app server (not yet available)",
      };
    }

    default: {
      return {
        check,
        passed: false,
        error: `Unknown check type: ${String((check as CheckSpec).type)}`,
      };
    }
  }
}

export function runCheckpoint(
  vfs: VirtualFS,
  adapter: SqlJsAdapter,
  checks: CheckSpec[],
): CheckpointResult {
  const results = checks.map((check) => runCheck(vfs, adapter, check));
  return {
    allPassed: results.every((r) => r.passed),
    results,
  };
}

export function computeHighlightRanges(fileContent: string, diff: FileDiff): HighlightRange[] {
  if (diff.operation !== "modify" || !diff.hunks) return [];

  const lines = fileContent.split("\n");
  const ranges: HighlightRange[] = [];

  for (const hunk of diff.hunks) {
    if (hunk.insertLines.length === 0) continue;

    const anchorIndex = lines.findIndex((line) => line.includes(hunk.anchor));

    if (hunk.position === "after") {
      if (anchorIndex === -1) continue;
      const startLine = anchorIndex + 2; // 1-based, after anchor
      ranges.push({
        startLine,
        endLine: startLine + hunk.insertLines.length - 1,
      });
    } else if (hunk.position === "before") {
      if (anchorIndex === -1) continue;
      const anchorLine = anchorIndex + 1; // 1-based, the anchor shifts down
      const rawStart = anchorLine - hunk.insertLines.length;
      const rawEnd = anchorLine - 1;
      const clampedStart = Math.max(1, rawStart);
      if (rawEnd >= clampedStart) {
        ranges.push({ startLine: clampedStart, endLine: rawEnd });
      }
    } else {
      // replace — find inserted lines by anchor or by sequence search
      if (anchorIndex !== -1) {
        const startLine = anchorIndex + 1; // 1-based
        ranges.push({
          startLine,
          endLine: startLine + hunk.insertLines.length - 1,
        });
      } else {
        // Anchor was removed by replacement — find the inserted sequence
        for (let i = 0; i <= lines.length - hunk.insertLines.length; i++) {
          if (hunk.insertLines.every((expected, j) => linesMatch(lines[i + j], expected))) {
            ranges.push({ startLine: i + 1, endLine: i + hunk.insertLines.length });
            break;
          }
        }
      }
    }
  }

  return ranges;
}
