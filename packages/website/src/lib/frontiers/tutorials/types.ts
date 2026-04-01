export interface DiffHunk {
  anchor: string;
  position: "after" | "before" | "replace";
  deleteCount?: number;
  insertLines: string[];
}

export interface FileDiff {
  path: string;
  operation: "create" | "modify" | "delete";
  content?: string;
  language?: string;
  hunks?: DiffHunk[];
}

export interface DiffResult {
  success: boolean;
  error?: string;
}

export type CheckType =
  | "table_exists"
  | "file_exists"
  | "file_contains"
  | "query_returns"
  | "route_responds";

export interface CheckSpec {
  type: CheckType;
  /** Table name for table_exists, file path for file_exists/file_contains */
  target?: string;
  /** Expected content substring for file_contains, SQL for query_returns, HTTP method for route_responds */
  value?: string;
  /** Expected result for query_returns (row count or specific values) */
  expected?: unknown;
}

export interface CheckResult {
  check: CheckSpec;
  passed: boolean;
  error?: string;
}

export interface CheckpointResult {
  allPassed: boolean;
  results: CheckResult[];
}

export interface HighlightRange {
  startLine: number;
  endLine: number;
}

export interface TutorialStep {
  title: string;
  panes: string[];
  description: string[];
  diagram?: string;
  diagramLabel?: string;
  actions: Array<FileDiff | { command: string }>;
  checkpoint: CheckSpec[];
}
